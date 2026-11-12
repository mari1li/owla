import { WATCH_RANGE_M } from '../config.js';

/* Vehicles and people: COCO-SSD runs asynchronously on the newest frame (nothing queues),
   and a simple IoU tracker keeps identities so closing speed can be measured. */
export const REAL = { car: { w: 1.8 }, truck: { w: 2.5 }, bus: { w: 2.55 }, motorcycle: { w: 0.8 }, bicycle: { w: 0.6 }, person: { h: 1.7 } };

export const det = { tracks: [], nextId: 1, busy: false, lastT: -1, count: 0, live: false };

export function resetTracks() {
  det.tracks = []; det.lastT = -1; det.live = false;
}

export function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[2] * a[3] + b[2] * b[3] - inter || 1);
}

// Pinhole: distance = real size × focal length ÷ size in pixels.
export function distanceOf(cls, box, focal) {
  const r = REAL[cls];
  return r.w ? r.w * focal / Math.max(1, box[2]) : r.h * focal / Math.max(1, box[3]);
}

// The frame is split into thirds: left lane, ahead, right lane.
export function zoneOf(box, w) {
  const cx = box[0] + box[2] / 2;
  return cx < w / 3 ? 'left' : cx > 2 * w / 3 ? 'right' : 'ahead';
}

export function updateTrack(tr, p, t, w, focal) {
  tr.box = p.bbox; tr.cls = p.class; tr.hits++; tr.lastT = t; tr.zone = zoneOf(p.bbox, w);
  const raw = distanceOf(p.class, p.bbox, focal);
  tr.dist = tr.dist == null ? raw : tr.dist * 0.6 + raw * 0.4;
  tr.samples.push({ t, d: raw });
  while (tr.samples.length && t - tr.samples[0].t > 1.2) tr.samples.shift();
  const n = tr.samples.length;
  if (n >= 4 && t - tr.samples[0].t >= 0.4) {
    // Closing speed = rate distance shrinks, by least squares over the last ~1.2 s.
    let st = 0, sd = 0, stt = 0, std = 0;
    for (const q of tr.samples) { st += q.t; sd += q.d; stt += q.t * q.t; std += q.t * q.d; }
    const den = n * stt - st * st;
    const closing = den > 1e-9 ? -(n * std - st * sd) / den : 0;
    tr.closing = closing;
    if (closing > 0.4) {
      const tta = Math.min(60, tr.dist / closing);
      tr.tta = tr.tta == null ? tta : tr.tta * 0.65 + tta * 0.35;
    } else {
      tr.tta = null;
    }
  }
}

export function onDetections(preds, t, w, h, focal) {
  det.live = true; det.count++;
  if (t < det.lastT - 0.05) det.tracks = [];   // clock went backwards (camera restarted)
  det.lastT = t;
  const found = preds.filter(p => REAL[p.class] && p.score >= 0.45)
    // ignore our own hood, which sometimes reads as a huge car at the bottom edge
    .filter(p => !(p.bbox[1] + p.bbox[3] > h * 0.97 && p.bbox[2] > w * 0.6));
  const used = new Set();
  for (const p of found) {
    let best = null, bi = 0;
    for (const tr of det.tracks) {
      if (used.has(tr) || (tr.cls === 'person') !== (p.class === 'person')) continue;
      const v = iou(tr.box, p.bbox);
      if (v > bi) { bi = v; best = tr; }
    }
    if (!best || bi < 0.25) {
      best = { id: det.nextId++, hits: 0, samples: [], dist: null, tta: null, closing: 0 };
      det.tracks.push(best);
    }
    used.add(best);
    updateTrack(best, p, t, w, focal);
  }
  det.tracks = det.tracks.filter(tr => t - tr.lastT <= 0.7);
}

// detect() reads the canvas synchronously before its first await, so this captures the
// newest frame; the next run starts only when this one finishes.
export function runDetect(model, canvas, t, focal) {
  det.busy = true;
  const w = canvas.width, h = canvas.height;
  model.detect(canvas, 20, 0.45)
    .then(p => onDetections(p, t, w, h, focal))
    .catch(e => console.error(e))
    .finally(() => { det.busy = false; });
}

// Tracks seen often enough to trust, within watch range.
export function activeTracks() {
  return det.tracks.filter(tr => tr.hits >= (tr.cls === 'person' ? 2 : 3) && tr.dist <= WATCH_RANGE_M);
}
