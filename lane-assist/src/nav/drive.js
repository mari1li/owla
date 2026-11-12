import { ARRIVE_WITHIN_M } from '../config.js';
import { S } from '../state.js';
import { R, segAt, posAt, nextMove } from './route.js';
import { G } from './gps.js';

/* One tick of the car along the route.
   GPS: fixes come about once a second, so between them the car carries on at the measured
   speed and eases toward where the last fix says it should be by now (it glides, not hops).
   Off the route, or before the first match, it shows the raw GPS position instead.
   Simulated: the car accelerates toward OSRM's typical speed for each road segment. */
export function stepDrive(dt, running) {
  if (!S.routed) return null;
  const gps = S.source === 'gps';
  let arrived = false;
  if (gps) {
    S.speed = G.watch != null ? G.speed : 0;
    if (G.s != null && !G.offRoute) {
      const target = Math.min(R.len, G.s + G.speed * Math.min(2, (performance.now() - G.sT) / 1000));
      if (Math.abs(target - S.s) > 150) S.s = target;
      else S.s += (target - S.s) * Math.min(1, dt * 3);
      if (running && R.len - S.s < ARRIVE_WITHIN_M) { S.s = R.len; arrived = true; }
    }
  } else if (running) {
    const target = R.speed[segAt(S.s)];
    S.speed += Math.max(-3 * dt, Math.min(2 * dt, target - S.speed));
    S.s += S.speed * dt;
    if (S.s >= R.len - 2) { S.s = R.len; arrived = true; }
  }

  const loose = gps && !!G.fix && (G.offRoute || G.s == null);
  const p = loose
    ? { lat: G.fix.p[0], lon: G.fix.p[1], heading: G.course != null ? G.course : (S.heading || 0) }
    : posAt(S.s);
  // Smooth the heading so the map turns gently at each polyline vertex.
  if (S.heading == null) S.heading = p.heading;
  const dh = ((p.heading - S.heading + 540) % 360) - 180;
  S.heading = (S.heading + dh * Math.min(1, dt * 2.5) + 360) % 360;

  return {
    lat: p.lat, lon: p.lon, heading: S.heading,
    loose, arrived,
    nx: loose ? null : nextMove(S.s),
    remaining: R.len - S.s,
    speed: gps || running ? S.speed : 0,
  };
}
