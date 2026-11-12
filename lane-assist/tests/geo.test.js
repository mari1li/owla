import { describe, it, expect } from 'vitest';
import { haversine, bearing, fmtDist, fmtDistShort } from '../src/lib/geo.js';
import { MILE } from '../src/config.js';

describe('geo', () => {
  it('measures one degree of latitude as about 111 km', () => {
    expect(haversine([37, -122], [38, -122])).toBeGreaterThan(110000);
    expect(haversine([37, -122], [38, -122])).toBeLessThan(112000);
  });
  it('gives compass bearings', () => {
    expect(bearing([37, -122], [38, -122])).toBeCloseTo(0, 5);
    expect(bearing([37, -122], [37, -121])).toBeCloseTo(90, 0);
    expect(bearing([37, -122], [36, -122])).toBeCloseTo(180, 5);
  });
  it('formats short distances in feet and long ones in miles', () => {
    expect(fmtDist(30)).toBe('100 feet');
    expect(fmtDist(10)).toBe('50 feet');
    expect(fmtDist(MILE * 0.6)).toBe('0.6 miles');
    expect(fmtDistShort(MILE * 2)).toBe('2.0 mi');
  });
});
