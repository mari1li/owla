import { describe, it, expect, beforeEach } from 'vitest';
import { R, loadRoute, buildMoves, posAt, nextMove, currentRoad } from '../src/nav/route.js';
import { straightRoute } from './helpers.js';

const step = (distance, type, modifier, extra = {}) => ({ distance, maneuver: { type, modifier, location: [-122, 37] }, ...extra });

describe('buildMoves', () => {
  it('keeps only lane-relevant maneuvers, with their side', () => {
    const { moves } = buildMoves([
      step(1000, 'depart', undefined, { name: 'Main St' }),
      step(2000, 'turn', 'left', { name: 'Oak Ave' }),
      step(3000, 'continue', 'straight'),
      step(1000, 'off ramp', 'slight right', { exits: '25', destinations: 'San Jose, Downtown', name: '' }),
      step(500, 'turn', 'uturn'),
      step(0, 'arrive'),
    ], 7500);
    expect(moves.map(m => [m.kind, m.side])).toEqual([['turn', 'left'], ['exit', 'right']]);
    expect(moves[0].label).toBe('Turn left onto Oak Ave');
    expect(moves[1].label).toBe('Exit 25 to San Jose');
    expect(moves[0].range).toBe(400);
  });
  it('normalises highway names', () => {
    const { moves, roads } = buildMoves([step(100, 'fork', 'left', { ref: 'I 280;CA 17', name: 'Junipero Serra' })], 100);
    expect(roads[0].name).toBe('I-280');
    expect(moves[0].label).toBe('Keep left toward I-280');
  });
  it('scales OSRM step distances to the polyline length', () => {
    const { moves } = buildMoves([step(1000, 'depart'), step(1000, 'turn', 'right')], 4000);
    expect(moves[0].s).toBe(2000);
  });
});

describe('route geometry', () => {
  beforeEach(() => loadRoute(straightRoute()));

  it('builds cumulative distance', () => {
    expect(R.cum.length).toBe(R.pts.length);
    expect(R.len).toBeGreaterThan(2200);
    expect(R.len).toBeLessThan(2250);
  });
  it('interpolates position and heading along the route', () => {
    const p = posAt(R.len / 2);
    expect(p.lat).toBeCloseTo(37.01, 4);
    expect(p.heading).toBeCloseTo(0, 3);
  });
  it('finds the next maneuver ahead and the current road', () => {
    R.moves = [{ kind: 'turn', side: 'left', s: 500, range: 400 }];
    expect(nextMove(100).dist).toBe(400);
    expect(nextMove(600)).toBeNull();
    expect(currentRoad(10)).toBe('Test Road');
  });
});
