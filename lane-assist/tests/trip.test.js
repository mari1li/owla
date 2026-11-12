import { describe, it, expect, beforeEach } from 'vitest';
import { trip, recordFix, resetTrip, tripSummary, tripGpx, tripFileName } from '../src/nav/trip.js';

const fix = (lat, t, acc = 5) => ({ p: [lat, -122], t, acc });

describe('trip log', () => {
  beforeEach(() => resetTrip());

  it('adds up distance and top speed', () => {
    for (let i = 0; i <= 60; i++) recordFix(fix(37 + i * 0.0001, 1_700_000_000 + i), 11, 0);   // ~11 m/s for a minute
    expect(trip.pts.length).toBe(61);
    expect(trip.dist).toBeGreaterThan(660);
    expect(trip.dist).toBeLessThan(670);
    expect(trip.top).toBe(11);
    expect(tripSummary()).toBe('Trip: 0.4 mi in 1 min · average 25 mph · top 25 mph.');
  });
  it('skips GPS jumps and inaccurate fixes in the distance', () => {
    recordFix(fix(37, 0), 0, 0);
    recordFix(fix(37.05, 1), 0, 0);      // 5.5 km in 1 s: a jump
    recordFix(fix(37.0501, 2, 80), 0, 0); // poor accuracy
    expect(trip.dist).toBe(0);
    expect(trip.pts.length).toBe(3);
  });
  it('writes GPX with time, speed and course', () => {
    recordFix(fix(37, 1_700_000_000), 12.345, 90);
    recordFix(fix(37.001, 1_700_000_010), 13, null);
    const gpx = tripGpx(trip.pts);
    expect(gpx).toContain('<gpx version="1.0"');
    expect(gpx.match(/<trkpt/g).length).toBe(2);
    expect(gpx).toContain('<speed>12.35</speed>');
    expect(gpx).toContain('<course>90.0</course>');
    expect(gpx).toContain('<time>2023-11-14T22:13:20.000Z</time>');
    expect(tripFileName(trip.pts)).toMatch(/^drive-\d{4}-\d{2}-\d{2}-\d{4}\.gpx$/);
  });
});
