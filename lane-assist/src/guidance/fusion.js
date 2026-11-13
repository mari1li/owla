import { KIND_NOUN } from '../config.js';
import { fmtDist } from '../lib/geo.js';

/* Fusion: map + camera → one instruction. Pure functions, so they can be tested without
   a browser. Priorities: 1 person, 2 traffic closing inside the margin, 3 maneuver with a
   clear lane (plus a blind-spot check), 4 maneuver with that lane occupied, 5 quiet state.
   It never says a move is safe. */

export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const moveId = mv => `${mv.kind}-${Math.round(mv.s)}`;
export function moveIn(mv, d) {
  return mv.kind === 'exit' ? `Exit in ${d}`
    : mv.kind === 'fork' ? `Keep ${mv.side} in ${d}`
    : mv.kind === 'ramp' ? `Ramp on your ${mv.side} in ${d}`
    : `Turn ${mv.side} in ${d}`;
}

// Each third of the frame (left lane, ahead, right lane): none / clear / occupied / closing.
// A lane is closing when something in it would reach us within the driver's margin.
export function laneStates(tracks, { live, margin }) {
  const out = { live, person: false };
  for (const z of ['left', 'ahead', 'right']) out[z] = { state: live ? 'clear' : 'none', tta: null, dist: null, cls: null };
  if (!live) return out;
  for (const tr of tracks) {
    if (tr.cls === 'person') out.person = true;
    const L = out[tr.zone];
    if (L.state === 'clear') L.state = 'occupied';
    if (tr.tta != null && (L.tta == null || tr.tta < L.tta)) { L.tta = tr.tta; L.cls = tr.cls; L.dist = tr.dist; }
    if (L.dist == null || (L.tta == null && tr.dist < L.dist)) { L.dist = tr.dist; L.cls = L.cls || tr.cls; }
    if (tr.tta != null && tr.tta < margin) L.state = 'closing';
  }
  return out;
}

// L: laneStates; nx: next maneuver { exit, dist } or null; ctx: { camLive, road }.
export function decide(L, nx, margin, { camLive, road }) {
  const ex = nx && nx.dist < nx.exit.range ? nx : null;
  const mv = ex ? ex.exit : null, d = ex ? fmtDist(ex.dist) : null;
  const mirror = "You still check your mirror and blind spot — the camera can't see it.";

  if (!L.live) {
    const why = camLive ? 'Starting detection…' : "Camera is off, so the lanes beside you aren't being checked.";
    if (ex) return { pri: 4, key: 'nocam-' + moveId(mv),
      text: mv.kind === 'exit' ? `Exit in ${d} on your ${mv.side}` : moveIn(mv, d), sub: `${mv.label}. ${why}` };
    return { pri: 5, key: 'nocam', text: road ? `Continue on ${road}` : 'Follow the route', sub: why, silent: true };
  }
  if (L.person) return { pri: 1, key: 'person', text: 'Person near the road',
    sub: 'The camera sees a person within 60 m. Slow down and watch the road edge.' };

  const order = ex ? [mv.side, mv.side === 'left' ? 'right' : 'left', 'ahead'] : ['right', 'left', 'ahead'];
  for (const z of order) {
    const Z = L[z];
    if (Z.state !== 'closing') continue;
    const what = Z.cls === 'person' ? 'Something' : cap(Z.cls || 'vehicle');
    return z === 'ahead'
      ? { pri: 2, key: 'closing-ahead', text: 'Traffic closing ahead — leave more room',
          sub: `${what} ${Math.round(Z.dist)} m ahead, gap closing in ${Z.tta.toFixed(1)} s — inside your ${margin} s margin.` }
      : { pri: 2, key: 'closing-' + z, text: `Hold — traffic closing on your ${z}`,
          sub: `${what} in the ${z} lane arriving in ${Z.tta.toFixed(1)} s — inside your ${margin} s margin.` };
  }
  if (ex) {
    const side = mv.side, Z = L[side];
    // The camera only looks forward, so a clear lane always comes with a blind-spot check.
    if (Z.state === 'clear') return { pri: 3, key: 'move-clear-' + moveId(mv),
      text: `${moveIn(mv, d)} — ${side} lane is clear`, check: `Check your ${side} blind spot, then move over`,
      sub: `Signal and check your mirror too. The camera only sees ahead. ${mv.label}.`,
      say: `${moveIn(mv, d)}. ${cap(side)} lane is clear. Check your ${side} blind spot, then move over.` };
    return { pri: 4, key: 'move-wait-' + moveId(mv), text: `${KIND_NOUN[mv.kind]} ahead — wait for a gap on your ${side}`,
      sub: `The ${side} lane is occupied${Z.tta != null ? `, arriving in ${Z.tta.toFixed(1)} s` : ', not closing'}. ${mv.label} in ${d}.` };
  }
  if (L.left.state === 'clear' && L.right.state === 'clear')
    return { pri: 5, key: 'quiet-clear', text: 'Both sides look clear', sub: mirror };
  const occ = ['left', 'right'].filter(z => L[z].state !== 'clear');
  return { pri: 5, key: 'quiet-occ-' + occ.join(), text: occ.length === 2 ? 'Traffic on both sides, keeping its distance' : `Traffic on your ${occ[0]}, keeping its distance`,
    sub: mirror, silent: true };
}

// Position problems outrank route advice, but never a person or closing traffic.
// gps: { source, fix, denied, err, offRoute, coarse, stale }
export function withPosition(ins, gps) {
  if (gps.source !== 'gps' || ins.pri <= 2) return ins;
  // status: the instruction after one of these is spoken even if it's a quiet one.
  if (!gps.fix) return { pri: 3, key: gps.denied ? 'gps-off' : 'gps-wait', text: gps.denied ? 'Location is off' : 'Waiting for GPS…',
    sub: gps.err || 'Finding your position. It can take a minute, and needs a view of the sky.', silent: !gps.denied, status: true };
  if (gps.coarse) return { pri: 3, key: 'gps-coarse', text: 'Location is only approximate',
    sub: 'Turn on Precise Location: Settings → Privacy & Security → Location Services → Safari Websites → Precise Location.', status: true };
  if (gps.stale) return { pri: 3, key: 'gps-lost', text: 'GPS signal lost',
    sub: 'Showing your last known position. Directions continue when the signal comes back.', silent: true, status: true };
  if (gps.offRoute) return { pri: 3, key: 'off-route', text: 'Off route — finding a new route',
    sub: "Keep driving normally. Directions come back as soon as there's a new route.", status: true };
  return ins;
}
