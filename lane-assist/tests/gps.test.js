import { describe, it, expect, beforeEach } from 'vitest';
import { nextSpeed, nextCourse, matchRoute, matchFix, resetMatch, G } from '../src/nav/gps.js';
import { R, loadRoute } from '../src/nav/route.js';
import { straightRoute } from './helpers.js';

const fix = (lat, t, extra = {}) => ({ p: [lat, -122], t, acc: 5, speed: null, heading: null, now: t * 1000, ...extra });

describe('nextSpeed', () => {
  it('prefers the phone’s own speed', () => {
    expect(nextSpeed(null, fix(37, 0, { speed: 20 }), 0)).toBe(20);
  });
  it('falls back to distance over time between fixes', () => {
    const v = nextSpeed(fix(37, 0), fix(37.0001, 1), 0);   // ~11 m in 1 s
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(12);
  });
  it('treats wander smaller than the accuracy as standing still', () => {
    expect(nextSpeed(fix(37, 0), fix(37.00001, 1, { acc: 20 }), 5)).toBe(0);
  });
  it('ignores GPS jumps faster than any car', () => {
    expect(nextSpeed(fix(37, 0), fix(37.01, 1), 15)).toBe(15);   // 1.1 km in 1 s
  });
  it('smooths successive readings', () => {
    expect(nextSpeed(null, fix(37, 0, { speed: 20 }), 10)).toBeCloseTo(16);
  });
});

describe('nextCourse', () => {
  it('uses the phone’s heading when moving, else the bearing between fixes', () => {
    expect(nextCourse(null, fix(37, 0, { heading: 90 }), 10, null)).toBe(90);
    expect(nextCourse(fix(37, 0), fix(37.001, 1), 0, null)).toBeCloseTo(0, 3);
    expect(nextCourse(fix(37, 0), fix(37.00001, 1), 0, 45)).toBe(45);
  });
});

describe('route matching', () => {
  beforeEach(() => { loadRoute(straightRoute()); resetMatch(); G.fix = null; });

  it('projects a point onto the route', () => {
    const m = matchRoute(R, [37.005, -122.0002], null);   // ~18 m east of the line, ~555 m along
    expect(m.d).toBeGreaterThan(15);
    expect(m.d).toBeLessThan(20);
    expect(m.s).toBeGreaterThan(540);
    expect(m.s).toBeLessThan(570);
  });
  it('goes off route only after three fixes clearly away from it', () => {
    G.fix = fix(37.005, 1);
    matchFix(R);
    expect(G.offRoute).toBe(false);
    expect(G.s).toBeGreaterThan(500);
    for (let i = 0; i < 3; i++) { G.fix = fix(37.006, 2 + i, { p: [37.006, -121.998] }); matchFix(R); }   // ~180 m east
    expect(G.offRoute).toBe(true);
  });
  it('ignores small backward steps from GPS noise', () => {
    G.fix = fix(37.005, 1); matchFix(R);
    const s = G.s;
    G.fix = fix(37.00495, 2); matchFix(R);   // ~5 m back
    expect(G.s).toBe(s);
  });
});

describe('the location stream', () => {
  // A fake navigator.geolocation that the test drives by hand.
  const fakeGeo = () => {
    const g = { watches: 0, cleared: 0, ok: null, err: null };
    g.watchPosition = (ok, err) => { g.watches++; g.ok = ok; g.err = err; return g.watches; };
    g.clearWatch = () => { g.cleared++; };
    return g;
  };
  const pos = (lat, acc = 5) => ({ coords: { latitude: lat, longitude: -122, accuracy: acc, speed: null, heading: null }, timestamp: Date.now() });

  let geo;
  beforeEach(async () => {
    const m = await import('../src/nav/gps.js');
    m.stopGps(); m.resetMatch(); G.fix = null; G.denied = false; G.coarse = false;
    geo = fakeGeo(); m.setGeolocation(geo);
  });

  it('asks for updates without a timeout (a timeout can end the stream on iPhones)', async () => {
    const { startGps } = await import('../src/nav/gps.js');
    let opts;
    geo.watchPosition = (ok, err, o) => { opts = o; geo.ok = ok; return 1; };
    startGps(() => {});
    expect(opts.timeout).toBeUndefined();
    expect(opts.enableHighAccuracy).toBe(true);
  });
  it('starts the stream again after a timeout or lost signal', async () => {
    const { startGps } = await import('../src/nav/gps.js');
    startGps(() => {});
    geo.err({ code: 3 });
    expect(geo.watches).toBe(2);
    expect(G.watch).not.toBeNull();
  });
  it('stops for good when location is refused', async () => {
    const { startGps } = await import('../src/nav/gps.js');
    startGps(() => {});
    geo.err({ code: 1 });
    expect(G.denied).toBe(true);
    expect(G.watch).toBeNull();
  });
  it('restarts a stream that has gone quiet', async () => {
    const { startGps, checkGps } = await import('../src/nav/gps.js');
    startGps(() => {});
    geo.ok(pos(37));
    checkGps(G.fix.now + 5000);
    expect(geo.watches).toBe(1);
    checkGps(G.fix.now + 11000);
    expect(geo.watches).toBe(2);
  });
  it('flags approximate location and keeps it out of route matching and speed', async () => {
    const { startGps } = await import('../src/nav/gps.js');
    loadRoute(straightRoute());
    const seen = [];
    startGps(f => seen.push(f));
    geo.ok(pos(37.005, 1500));
    expect(G.coarse).toBe(true);
    expect(G.speed).toBe(0);
    matchFix(R);
    expect(G.s).toBeNull();
    expect(G.offRoute).toBe(false);
    expect(seen).toHaveLength(1);
  });
  it('reports a stale fix in the status', async () => {
    const { startGps, gpsStatus } = await import('../src/nav/gps.js');
    startGps(() => {});
    geo.ok(pos(37, 6));
    expect(gpsStatus('gps', G.fix.now + 1000).text).toBe('GPS ±6 m');
    expect(gpsStatus('gps', G.fix.now + 15000).text).toBe('GPS lost 15 s');
  });
});
