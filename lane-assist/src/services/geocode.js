import { SERVICES } from '../config.js';

// Free-text place → { lat, lon, name } with OpenStreetMap's Nominatim.
// Nominatim asks for at most one request a second, so callers don't run these in parallel.
export async function geocode(q) {
  const r = await fetch(`${SERVICES.nominatim}/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
    { headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('The place search service is busy. Try again in a moment.');
  const j = await r.json();
  if (!j.length) throw new Error(`Couldn't find "${q}".`);
  return { lat: +j[0].lat, lon: +j[0].lon, name: j[0].name || q };
}
