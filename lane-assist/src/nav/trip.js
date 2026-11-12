import { MAX_GPS_SPEED, MILE, MPS_TO_MPH, STORAGE } from '../config.js';
import { haversine } from '../lib/geo.js';
import { loadJSON, saveJSON, removeKey } from '../lib/storage.js';

// The trip log: every fix while navigating, with its time, accuracy, speed and course.
// `dist` and `top` only use fixes good to 30 m, and skip GPS jumps.
export const trip = { pts: [], dist: 0, top: 0, last: null };

export function recordFix(fix, speed, course) {
  const q = { t: fix.t, lat: fix.p[0], lon: fix.p[1], acc: fix.acc, speed, course };
  trip.pts.push(q);
  if (fix.acc <= 30) {
    if (trip.last) {
      const d = haversine([trip.last.lat, trip.last.lon], fix.p), dt = Math.max(0.5, fix.t - trip.last.t);
      if (d >= 3) {
        if (d / dt <= MAX_GPS_SPEED) trip.dist += d;
        trip.last = q;
      }
    } else {
      trip.last = q;
    }
    trip.top = Math.max(trip.top, speed);
  }
  if (trip.pts.length % 10 === 0) saveTripLocal();
  return q;
}

export function resetTrip() {
  trip.pts = []; trip.dist = 0; trip.top = 0; trip.last = null;
  removeKey(STORAGE.trip);
}

// A copy in the browser, so a reload or a crash doesn't lose the trip.
export function saveTripLocal() {
  saveJSON(STORAGE.trip, trip.pts);
}

export function loadSavedTrip() {
  const pts = loadJSON(STORAGE.trip);
  return Array.isArray(pts) && pts.length > 1 ? pts : null;
}

export function tripSummary(t = trip) {
  if (t.pts.length < 2) return '';
  const secs = t.pts[t.pts.length - 1].t - t.pts[0].t;
  const avg = secs > 0 ? t.dist / secs : 0;
  return `Trip: ${(t.dist / MILE).toFixed(1)} mi in ${Math.max(1, Math.round(secs / 60))} min · ` +
    `average ${Math.round(avg * MPS_TO_MPH)} mph · top ${Math.round(t.top * MPS_TO_MPH)} mph.`;
}

// GPX 1.0 (it has <speed> and <course>), which most map apps open.
export function tripGpx(pts) {
  const n = (v, d) => v == null || isNaN(v) ? '' : v.toFixed(d);
  const rows = pts.map(q => `<trkpt lat="${q.lat.toFixed(7)}" lon="${q.lon.toFixed(7)}"><time>${new Date(q.t * 1000).toISOString()}</time>` +
    (q.course != null ? `<course>${n(q.course, 1)}</course>` : '') + `<speed>${n(q.speed, 2)}</speed>` +
    `<desc>accuracy ${n(q.acc, 0)} m</desc></trkpt>`).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.0" creator="New-driver lane assist" xmlns="http://www.topografix.com/GPX/1/0">\n' +
    `<trk><name>Drive ${new Date(pts[0].t * 1000).toLocaleString()}</name><trkseg>\n${rows}\n</trkseg></trk>\n</gpx>\n`;
}

export function tripFileName(pts) {
  const d = new Date(pts[0].t * 1000), pad = x => String(x).padStart(2, '0');
  return `drive-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.gpx`;
}

export function downloadGpx(pts) {
  if (!pts || pts.length < 2) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([tripGpx(pts)], { type: 'application/gpx+xml' }));
  a.download = tripFileName(pts);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
