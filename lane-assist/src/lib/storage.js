// localStorage can be missing or throw (private browsing, blocked storage), so every
// access is guarded; the app works without it, it just doesn't remember things.
export function loadJSON(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not saved */ }
}

export function removeKey(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
}
