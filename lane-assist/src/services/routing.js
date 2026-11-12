import { SERVICES } from '../config.js';

// A driving route between two places from OSRM: full geometry, steps (for maneuvers)
// and per-segment typical speeds.
export async function fetchDrivingRoute(a, b) {
  const url = `${SERVICES.osrm}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}` +
    '?overview=full&geometries=geojson&steps=true&annotations=speed';
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 'Ok' || !j.routes || !j.routes.length) throw new Error('No driving route found between those places.');
  return j.routes[0];
}
