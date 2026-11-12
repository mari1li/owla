// A straight test route due north from (37, -122), `n` segments of about 111 m each,
// shaped like an OSRM response.
export function straightRoute({ n = 20, step = 0.001, steps } = {}) {
  const coordinates = Array.from({ length: n + 1 }, (_, i) => [-122, 37 + i * step]);
  return {
    duration: 600,
    geometry: { coordinates },
    legs: [{
      annotation: { speed: Array(n).fill(20) },
      steps: steps || [{ distance: n * 111, maneuver: { type: 'depart', location: coordinates[0] }, name: 'Test Road' }],
    }],
  };
}
