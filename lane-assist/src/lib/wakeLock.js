// Keep the screen on while navigating: iPhones stop the camera, GPS and speech when it locks.
let lock = null;

export async function keepAwake(on) {
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
    }
  } catch { /* not allowed right now; the screen may lock */ }
}
