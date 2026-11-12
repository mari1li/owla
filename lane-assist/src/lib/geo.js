import { MILE } from '../config.js';

export const toRad = Math.PI / 180;

// Great-circle distance in metres between two [lat, lon] points.
export function haversine(a, b) {
  const dLat = (b[0] - a[0]) * toRad, dLon = (b[1] - a[1]) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

// Initial compass bearing (0 = north, clockwise) from a to b.
export function bearing(a, b) {
  const y = Math.sin((b[1] - a[1]) * toRad) * Math.cos(b[0] * toRad);
  const x = Math.cos(a[0] * toRad) * Math.sin(b[0] * toRad) - Math.sin(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.cos((b[1] - a[1]) * toRad);
  return (Math.atan2(y, x) / toRad + 360) % 360;
}

const feet = m => Math.max(50, Math.round(m * 3.28084 / 50) * 50);
export const fmtDist = m => m < 0.1 * MILE ? `${feet(m)} feet` : `${(m / MILE).toFixed(1)} miles`;
export const fmtDistShort = m => m < 0.1 * MILE ? `${feet(m)} ft` : `${(m / MILE).toFixed(1)} mi`;
