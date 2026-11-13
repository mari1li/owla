import { describe, it, expect } from 'vitest';
import { laneStates, decide, withPosition } from '../src/guidance/fusion.js';

const track = (zone, extra = {}) => ({ zone, cls: 'car', dist: 30, tta: null, hits: 5, ...extra });
const exit = (side = 'right', dist = 900) => ({ exit: { kind: 'exit', side, s: 5000, range: 1609, label: 'Exit 25 to San Jose' }, dist });
const ctx = { camLive: true, road: 'I-280' };

describe('laneStates', () => {
  it('marks lanes clear, occupied, or closing inside the margin', () => {
    const L = laneStates([track('left'), track('right', { tta: 3 })], { live: true, margin: 6 });
    expect(L.left.state).toBe('occupied');
    expect(L.right.state).toBe('closing');
    expect(L.ahead.state).toBe('clear');
  });
  it('depends on the driver’s margin', () => {
    const tracks = [track('right', { tta: 5 })];
    expect(laneStates(tracks, { live: true, margin: 6 }).right.state).toBe('closing');
    expect(laneStates(tracks, { live: true, margin: 4 }).right.state).toBe('occupied');
  });
  it('has no lane states without a live camera', () => {
    expect(laneStates([track('left')], { live: false, margin: 6 }).left.state).toBe('none');
  });
});

describe('decide', () => {
  const live = (tracks, margin = 6) => laneStates(tracks, { live: true, margin });

  it('puts a person first', () => {
    const ins = decide(live([track('right', { tta: 2 }), track('ahead', { cls: 'person' })]), exit(), 6, ctx);
    expect(ins.pri).toBe(1);
  });
  it('holds when traffic is closing on the maneuver side', () => {
    const ins = decide(live([track('right', { tta: 3 })]), exit(), 6, ctx);
    expect(ins.pri).toBe(2);
    expect(ins.text).toBe('Hold — traffic closing on your right');
  });
  it('suggests the move with a blind-spot check when the lane is clear', () => {
    const ins = decide(live([]), exit(), 6, ctx);
    expect(ins.pri).toBe(3);
    expect(ins.text).toBe('Exit in 0.6 miles — right lane is clear');
    expect(ins.check).toBe('Check your right blind spot, then move over');
    expect(ins.say).toContain('Check your right blind spot');
  });
  it('asks to wait when the lane is occupied', () => {
    const ins = decide(live([track('right')]), exit(), 6, ctx);
    expect(ins.pri).toBe(4);
    expect(ins.text).toBe('Exit ahead — wait for a gap on your right');
  });
  it('is quiet with no maneuver in range', () => {
    expect(decide(live([]), exit('right', 5000), 6, ctx).key).toBe('quiet-clear');
  });
  it('never says a move is safe', () => {
    const all = [decide(live([]), exit(), 6, ctx), decide(live([track('right')]), exit(), 6, ctx), decide(live([]), null, 6, ctx)];
    for (const ins of all) expect(`${ins.text} ${ins.sub} ${ins.say || ''}`.toLowerCase()).not.toContain('safe');
  });
  it('still gives route directions with the camera off', () => {
    const L = laneStates([], { live: false, margin: 6 });
    expect(decide(L, exit(), 6, { camLive: false, road: '' }).text).toBe('Exit in 0.6 miles on your right');
    expect(decide(L, null, 6, { camLive: false, road: 'I-280' }).text).toBe('Continue on I-280');
  });
});

describe('withPosition', () => {
  const route = { pri: 3, key: 'x', text: 'Exit soon' };
  it('reports waiting for GPS and off route, but never over urgent warnings', () => {
    expect(withPosition(route, { source: 'gps', fix: null }).key).toBe('gps-wait');
    expect(withPosition(route, { source: 'gps', fix: {}, offRoute: true }).key).toBe('off-route');
    expect(withPosition({ pri: 2, key: 'closing-right' }, { source: 'gps', fix: null }).key).toBe('closing-right');
    expect(withPosition(route, { source: 'sim', fix: null })).toBe(route);
  });
});

import { planPrice } from '../src/components/PricingPage.js';
import { PLANS } from '../src/config.js';

describe('plan prices', () => {
  const plus = PLANS.find(p => p.id === 'plus');
  it('shows Plus at $3.99 a month', () => {
    expect(planPrice(plus, 'monthly')).toEqual({ big: '$3.99', small: '/month', note: 'or $34.99/year' });
  });
  it('shows the yearly price with its monthly equivalent and saving', () => {
    expect(planPrice(plus, 'yearly')).toEqual({ big: '$34.99', small: '/year', note: '$2.91/month · save 27%' });
  });
  it('keeps Free free', () => {
    expect(planPrice(PLANS[0], 'yearly').big).toBe('$0');
  });
});
