import { MILE } from '../config.js';
import { haversine, bearing } from '../lib/geo.js';
import { geocode } from '../services/geocode.js';
import { fetchDrivingRoute } from '../services/routing.js';

// The active route: points [lat, lon], cumulative distance (m), per-segment typical speed (m/s),
// lane-relevant maneuvers, road names by distance, and the destination (kept for rerouting).
export const R = { pts: [], cum: [0], len: 0, speed: [], moves: [], roads: [], seg: 0, dest: null };

const sideOf = mod => !mod ? null : mod.includes('left') ? 'left' : mod.includes('right') ? 'right' : null;
const roadName = st => (st.ref ? st.ref.split(';')[0].replace(/^(I|US|CA|SR) /, '$1-') : '') || st.name || '';

// Only maneuvers that need you in a particular lane: exits, forks, ramps, turns.
// `len` is the polyline length; OSRM's step distances are scaled to match it.
export function buildMoves(steps, len) {
  const total = steps.reduce((a, st) => a + st.distance, 0) || 1;
  const k = len / total;
  const moves = [], roads = [];
  let s = 0;
  for (const st of steps) {
    const m = st.maneuver, side = sideOf(m.modifier);
    roads.push({ s0: s * k, name: roadName(st) });
    let kind = null;
    if (m.type === 'off ramp') kind = 'exit';
    else if (m.type === 'fork') kind = 'fork';
    else if (m.type === 'on ramp') kind = 'ramp';
    else if (m.type === 'turn' || m.type === 'end of road') kind = 'turn';
    if (kind && side && m.modifier !== 'uturn') {
      const toward = ((st.destinations || '').split(',')[0].trim() || roadName(st)).replace(/\b(I|US|CA|SR) (\d)/g, '$1-$2');
      const num = st.exits ? st.exits.split(';')[0] + ' ' : '';
      const label = kind === 'exit' ? `Exit ${num}${toward ? 'to ' + toward : ''}`.trim()
        : kind === 'fork' ? `Keep ${side}${toward ? ' toward ' + toward : ''}`
        : kind === 'ramp' ? `Ramp${toward ? ' to ' + toward : ''}`
        : `Turn ${side}${toward ? ' onto ' + toward : ''}`;
      moves.push({ kind, side, label, s: s * k, at: [m.location[1], m.location[0]],
        range: kind === 'turn' || kind === 'ramp' ? 400 : MILE });
    }
    s += st.distance;
  }
  return { moves, roads };
}

// Make an OSRM route the active route.
export function loadRoute(rt) {
  R.pts = rt.geometry.coordinates.map(c => [c[1], c[0]]);
  R.cum = [0];
  for (let i = 1; i < R.pts.length; i++) R.cum.push(R.cum[i - 1] + haversine(R.pts[i - 1], R.pts[i]));
  R.len = R.cum[R.cum.length - 1];
  R.seg = 0;
  const sp = rt.legs.flatMap(l => (l.annotation && l.annotation.speed) || []);
  R.speed = R.pts.slice(1).map((_, i) => Math.min(38, Math.max(5, sp[i] || 13)));
  const built = buildMoves(rt.legs.flatMap(l => l.steps), R.len);
  R.moves = built.moves;
  R.roads = built.roads;
}

// from/to: a place picked from the suggestions ({ lat, lon, name }) or free text.
export async function planRoute(from, to) {
  const a = typeof from === 'object' ? from : await geocode(from);
  const b = typeof to === 'object' ? to : await geocode(to);   // sequential: Nominatim's rate limit
  const rt = await fetchDrivingRoute(a, b);
  loadRoute(rt);
  R.dest = b;
  return { from: a.name, to: b.name, miles: R.len / MILE, mins: rt.duration / 60 };
}

// Segment index containing distance s (starts from the last answer: the car moves forward).
export function segAt(s) {
  let i = Math.min(R.seg, R.pts.length - 2);
  while (i > 0 && R.cum[i] > s) i--;
  while (i < R.pts.length - 2 && R.cum[i + 1] < s) i++;
  R.seg = i;
  return i;
}

export function posAt(s) {
  const i = segAt(s);
  const t = Math.min(1, Math.max(0, (s - R.cum[i]) / ((R.cum[i + 1] - R.cum[i]) || 1)));
  const a = R.pts[i], b = R.pts[i + 1];
  return { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t, seg: i, heading: bearing(a, b) };
}

export function nextMove(s) {
  const mv = R.moves.find(x => x.s > s + 3);
  return mv ? { exit: mv, dist: mv.s - s } : null;
}

export function currentRoad(s) {
  let name = '';
  for (const r of R.roads) { if (r.s0 > s) break; if (r.name) name = r.name; }
  return name;
}
