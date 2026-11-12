import { SERVICES } from '../config.js';

// A short main line and a context line for a Photon result.
export function placeLabel(p) {
  const addr = [p.housenumber, p.street].filter(Boolean).join(' ');
  const main = p.name || addr;
  const rest = [p.name ? addr : '', p.city || p.county, p.state, p.countrycode === 'US' ? '' : p.country]
    .filter(x => x && x !== main);
  return { main, rest: [...new Set(rest)].join(', ') };
}

// Type-ahead place search (Photon: built for autocomplete, no key), biased toward `near`.
export async function searchPlaces(q, near) {
  const r = await fetch(`${SERVICES.photon}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en` +
    `&lat=${near.lat.toFixed(3)}&lon=${near.lng.toFixed(3)}&zoom=9&location_bias_scale=0.1`);
  const j = await r.json();
  const seen = new Set();
  return j.features.map(f => {
    const l = placeLabel(f.properties);
    return { ...l, text: l.rest ? `${l.main}, ${l.rest}` : l.main, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
  }).filter(it => it.main && !seen.has(it.text) && seen.add(it.text));
}
