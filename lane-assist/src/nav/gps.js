import { MAX_GPS_SPEED } from '../config.js';
import { haversine, bearing, toRad } from '../lib/geo.js';

// Live position from the phone's GPS. `s` is the matched distance along the route.
export const G = {
  watch: null, fix: null, speed: 0, course: null,
  s: null, sT: 0, off: 0, offRoute: false, lastReroute: -1e9,
  err: null, denied: false,
};

// Speed after a new fix. The phone's own (Doppler) speed is the most accurate when it has one;
// otherwise distance between fixes over the time between them. Movement smaller than the fix's
// uncertainty counts as standing still, so GPS wander doesn't read as 3 mph, and a jump faster
// than any car is a glitch that keeps the last speed.
export function nextSpeed(prev, fix, prevSpeed) {
  let v = fix.speed != null && fix.speed >= 0 ? fix.speed : null;
  if (v == null && prev && fix.t - prev.t >= 0.5) {
    const d = haversine(prev.p, fix.p);
    v = d < Math.max(3, fix.acc * 0.5) ? 0 : d / (fix.t - prev.t);
    if (v > MAX_GPS_SPEED) v = null;
  }
  if (v == null) return prevSpeed;
  return v < 0.5 ? 0 : prevSpeed ? prevSpeed * 0.4 + v * 0.6 : v;
}

// Direction of travel: the phone's course when moving, else the bearing between fixes.
export function nextCourse(prev, fix, speed, prevCourse) {
  if (fix.heading != null && !isNaN(fix.heading) && speed > 1.5) return fix.heading;
  if (prev && haversine(prev.p, fix.p) > Math.max(5, fix.acc)) return bearing(prev.p, fix.p);
  return prevCourse;
}

// Nearest point on a route. With a hint, look near where we were first (300 m back, 600 m ahead)
// so a road that passes close by later in the route can't steal the match.
export function matchRoute(route, p, nearS) {
  const kx = Math.cos(p[0] * toRad) * 111320, ky = 110540;   // metres per degree
  const lo = nearS == null ? -1 : nearS - 300, hi = nearS == null ? Infinity : nearS + 600;
  let best = { d: Infinity, s: 0 };
  for (let i = 0; i < route.pts.length - 1; i++) {
    if (route.cum[i + 1] < lo || route.cum[i] > hi) continue;
    const a = route.pts[i], b = route.pts[i + 1];
    const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky;
    const dx = (b[1] - a[1]) * kx, dy = (b[0] - a[0]) * ky, l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + dx * u, ay + dy * u);
    if (d < best.d) best = { d, s: route.cum[i] + u * (route.cum[i + 1] - route.cum[i]) };
  }
  return best;
}

export function resetMatch() {
  G.s = null; G.off = 0; G.offRoute = false;
}

// Match the latest fix onto the route and update the off-route state.
export function matchFix(route) {
  if (!G.fix || route.pts.length < 2) return;
  const f = G.fix;
  let m = matchRoute(route, f.p, G.s);
  if (G.s != null && m.d > 50) { const all = matchRoute(route, f.p, null); if (all.d < m.d) m = all; }
  // Off route after three fixes in a row clearly away from it (allowing for GPS accuracy).
  const tol = Math.max(35, Math.min(80, f.acc * 1.5));
  G.off = m.d > tol ? G.off + 1 : 0;
  G.offRoute = G.off >= 3;
  if (m.d <= tol) {
    // Ignore small backward steps (GPS noise); a real move back larger than the noise is kept.
    if (G.s == null || m.s >= G.s || G.s - m.s > Math.max(15, f.acc)) G.s = m.s;
    G.sT = f.now;
  }
}

// Fold a browser position into G and return the fix.
function applyPosition(pos) {
  const c = pos.coords;
  const fix = { p: [c.latitude, c.longitude], t: pos.timestamp / 1000, acc: c.accuracy,
    speed: c.speed, heading: c.heading, now: performance.now() };
  const prev = G.fix;
  G.err = null; G.denied = false;
  G.speed = nextSpeed(prev, fix, G.speed);
  G.course = nextCourse(prev, fix, G.speed, G.course);
  G.fix = fix;
  return fix;
}

export function startGps(onFix) {
  if (G.watch != null) return;
  if (!('geolocation' in navigator)) { G.err = "This browser can't share its location."; return; }
  G.watch = navigator.geolocation.watchPosition(pos => onFix(applyPosition(pos)), e => {
    G.denied = e.code === 1;
    G.err = G.denied
      ? 'Location access is off. Allow it for this site (iPhone: Settings → Privacy & Security → Location Services → Safari Websites), then start again.'
      : 'Waiting for a GPS signal. It can take a minute, and needs a view of the sky.';
    if (G.denied) stopGps();
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}

export function stopGps() {
  if (G.watch != null) navigator.geolocation.clearWatch(G.watch);
  G.watch = null;
  G.speed = 0;
}

// One position for "start from where I am".
export function currentPlace() {
  if (G.fix && performance.now() - G.fix.now < 30000) return Promise.resolve({ lat: G.fix.p[0], lon: G.fix.p[1], name: 'My location' });
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error("Type a start place: this browser can't share its location.")); return; }
    navigator.geolocation.getCurrentPosition(
      q => resolve({ lat: q.coords.latitude, lon: q.coords.longitude, name: 'My location' }),
      e => reject(new Error(e.code === 1 ? 'Location access is off, so type a start place instead.' : "Couldn't find your location. Type a start place instead.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  });
}

// The small status next to the speed: accuracy, or why there's no fix.
export function gpsStatus(source) {
  if (source !== 'gps') return { text: '', weak: false };
  const text = G.denied ? 'location off' : G.watch == null ? '' : !G.fix ? 'GPS…' : `GPS ±${Math.round(G.fix.acc)} m`;
  const weak = G.denied || (!!G.fix && G.fix.acc > 30) || (G.watch != null && !G.fix);
  return { text, weak };
}
