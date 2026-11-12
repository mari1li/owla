import { describe, it, expect } from 'vitest';
import { roiSpan, roiMidX, insideRoi, moveRoi, setCorner, isValidRoi, defaultRoi } from '../src/vision/roi.js';
import { fitXofY, roadAreaFromSegments } from '../src/vision/lanes.js';
import { iou, distanceOf, zoneOf, updateTrack } from '../src/vision/detector.js';

describe('road area geometry', () => {
  const r = defaultRoi();
  it('spans from its top edge to its bottom edge', () => {
    expect(roiSpan(r, 100)).toEqual({ yT: 60, yB: 94 });
  });
  it('splits left from right at its own centre line', () => {
    const shifted = { tl: [0.1, 0.1], tr: [0.3, 0.1], br: [0.5, 0.5], bl: [0, 0.5] };
    expect(roiMidX(shifted, 10, 100, 100)).toBeCloseTo(20);
    expect(roiMidX(shifted, 50, 100, 100)).toBeCloseTo(25);
  });
  it('knows what is inside it', () => {
    expect(insideRoi(r, 0.5, 0.8)).toBe(true);
    expect(insideRoi(r, 0.5, 0.3)).toBe(false);
    expect(insideRoi(r, 0.05, 0.62)).toBe(false);
  });
  it('moves as a whole without leaving the frame', () => {
    const up = moveRoi(r, 0, -0.5);
    expect(up.tl[1]).toBeCloseTo(0.1);
    const down = moveRoi(r, 0, 0.5);
    expect(down.br[1]).toBeCloseTo(1);           // stopped at the bottom edge
    expect(down.tl[1] - down.br[1]).toBeCloseTo(r.tl[1] - r.br[1]);
  });
  it('clamps a dragged corner to the frame', () => {
    expect(setCorner(r, 'tl', -1, 2).tl).toEqual([0, 1]);
  });
  it('validates saved shapes', () => {
    expect(isValidRoi(r)).toBe(true);
    expect(isValidRoi({ tl: [0, 0] })).toBe(false);
    expect(isValidRoi({ ...r, br: [NaN, 1] })).toBe(false);
  });
});

describe('lane fitting', () => {
  it('fits x = a·y + b', () => {
    const f = fitXofY([[100, 200], [150, 100], [125, 150]]);
    expect(f.a).toBeCloseTo(-0.5);
    expect(f.b).toBeCloseTo(200);
  });
  it('rejects too few or too short point sets', () => {
    expect(fitXofY([[1, 1]])).toBeNull();
    expect(fitXofY([[1, 100], [2, 102]])).toBeNull();
  });
});

describe('finding the road automatically', () => {
  // Two lane lines meeting at (320, 40) in a 640 × 360 frame: the road is in the top half.
  const w = 640, h = 360, vp = [320, 40];
  const line = (xAtBottom, yBottom) => {
    const a = (xAtBottom - vp[0]) / (yBottom - vp[1]);
    return { a, b: vp[0] - a * vp[1], len: 120, ylo: yBottom };
  };
  const segs = [];
  for (let i = 0; i < 10; i++) { segs.push(line(120 + i, 190)); segs.push(line(520 - i, 190)); }

  it('puts the road area around lines that share a vanishing point', () => {
    const roi = roadAreaFromSegments(segs, w, h);
    expect(roi).not.toBeNull();
    expect(roi.tl[1]).toBeGreaterThan(40 / h);   // below the vanishing point
    expect(roi.bl[1]).toBeLessThan(0.6);         // ends where the markings end, not at the frame bottom
    expect(roi.bl[0]).toBeLessThan(120 / w);
    expect(roi.br[0]).toBeGreaterThan(520 / w);
  });
  it('gives up when only one side has lines', () => {
    expect(roadAreaFromSegments(segs.filter(g => g.a < 0), w, h)).toBeNull();
  });
});

describe('detector tracking', () => {
  it('measures overlap', () => {
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
    expect(iou([0, 0, 10, 10], [20, 20, 5, 5])).toBe(0);
  });
  it('estimates distance with a pinhole model', () => {
    expect(distanceOf('car', [0, 0, 48, 30], 480)).toBeCloseTo(18);
    expect(distanceOf('person', [0, 0, 20, 40], 480)).toBeCloseTo(20.4);
  });
  it('sorts boxes into left / ahead / right thirds', () => {
    expect(zoneOf([0, 0, 50, 50], 600)).toBe('left');
    expect(zoneOf([280, 0, 40, 50], 600)).toBe('ahead');
    expect(zoneOf([500, 0, 50, 50], 600)).toBe('right');
  });
  it('turns a growing box into a time-to-arrival', () => {
    const tr = { hits: 0, samples: [], dist: null, tta: null, closing: 0 };
    // A car 30 m away closing at 5 m/s: box width = 1.8 × 480 / distance.
    for (let i = 0; i <= 10; i++) {
      const d = 30 - 5 * i * 0.1;
      updateTrack(tr, { bbox: [300, 100, 1.8 * 480 / d, 40], class: 'car' }, i * 0.1, 640, 480);
    }
    expect(tr.closing).toBeGreaterThan(4);
    expect(tr.closing).toBeLessThan(6);
    expect(tr.tta).toBeGreaterThan(3);
    expect(tr.tta).toBeLessThan(8);
  });
});
