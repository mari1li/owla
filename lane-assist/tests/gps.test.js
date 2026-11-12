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
