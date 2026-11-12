/* Speech output.
   Rules: the same phrase isn't repeated within 5 s; nothing non-urgent speaks within 1.6 s of
   anything else; priorities 1–2 interrupt, 3–5 wait their turn (the newest waiting one wins).

   iPhone notes, each of which can make Safari silently say nothing:
   - Speech only works after the page has spoken from a tap. unlock() is called from taps
     (Start/Stop navigation, Voice on) and speaks a real phrase right away, which also tells
     the driver the voice works.
   - Calling speak() straight after cancel() can drop the new phrase, so an interrupting phrase
     starts a moment after the cancel.
   - Safari pauses speech while the page is hidden; it's resumed before speaking and when the
     page comes back.
   - The engine's own `speaking` flag can stay stuck, so the queue tracks its own phrase (with a
     watchdog) instead of trusting it. */
const GAP_MS = 1600, REPEAT_MS = 5000, CANCEL_SETTLE_MS = 80;

const browserSynth = () => (typeof window !== 'undefined' && window.speechSynthesis) || null;

export function createVoice({
  getSynth = browserSynth,
  Utterance = null,
  now = () => performance.now(),
  later = (fn, ms) => setTimeout(fn, ms),
} = {}) {
  const U = () => Utterance || globalThis.SpeechSynthesisUtterance;
  let chosen = null;

  const v = {
    muted: false, unlocked: false, current: null, pending: null,
    lastStart: -1e9, lastEnd: -1e9, history: new Map(),

    get supported() { return !!getSynth() && typeof U() === 'function'; },

    // Prefer an on-device US English voice; some Android phones say nothing without one.
    pickVoice() {
      const s = getSynth();
      if (!s || !s.getVoices) return;
      const all = s.getVoices();
      chosen = all.find(x => x.lang === 'en-US' && x.localService) || all.find(x => /^en[-_]/i.test(x.lang)) || null;
    },
    init() {
      const s = getSynth();
      if (!s) return;
      v.pickVoice();
      if (s.addEventListener) s.addEventListener('voiceschanged', () => v.pickVoice());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) v.resume(); });
    },
    resume() {
      const s = getSynth();
      if (s && s.paused) s.resume();
    },

    // From a tap: allow speech from now on and say `text` at once.
    unlock(text) {
      if (!v.supported) return;
      v.unlocked = true;
      if (!v.muted && text) v.interrupt(text);
    },
    // Say `text` now (cutting off anything else), if speech is allowed.
    announce(text) {
      if (v.unlocked && !v.muted && v.supported) v.interrupt(text);
    },

    recentlySaid(text, t) {
      const at = v.history.get(text);
      return at != null && t - at < REPEAT_MS;
    },
    say(text, pri) {
      if (v.muted || !v.unlocked || !v.supported) return;
      if (v.recentlySaid(text, now())) return;
      if (pri <= 2) v.interrupt(text);
      else { v.pending = text; v.pump(); }
    },
    // Called every frame: speaks the waiting non-urgent phrase once there's room.
    pump() {
      if (!v.pending || v.muted || !v.supported || v.current) return;
      const t = now();
      if (t - v.lastEnd < GAP_MS || t - v.lastStart < GAP_MS) return;
      const text = v.pending;
      v.pending = null;
      if (!v.recentlySaid(text, t)) v.speak(text);
    },
    interrupt(text) {
      const s = getSynth();
      v.pending = null;
      if (v.current || s.speaking) {
        s.cancel();
        v.current = null;
        later(() => v.speak(text), CANCEL_SETTLE_MS);
      } else {
        v.speak(text);   // synchronous, so a tap still counts as the gesture that unlocks speech
      }
    },
    speak(text) {
      const s = getSynth();
      if (!s || v.muted) return;
      v.resume();
      const u = new (U())(text);
      u.rate = 1.03;
      u.lang = 'en-US';
      if (chosen) u.voice = chosen;
      const done = () => { if (v.current === u) { v.current = null; v.lastEnd = now(); } };
      u.onend = done;
      u.onerror = done;
      const t = now();
      v.current = u; v.lastStart = t; v.history.set(text, t);
      s.speak(u);
      later(done, 8000 + text.length * 80);   // some engines never fire onend
    },
    stop() {
      v.pending = null;
      v.current = null;
      const s = getSynth();
      if (s) s.cancel();
    },
    setMuted(m) {
      v.muted = m;
      if (m) v.stop();
    },
  };
  return v;
}

export const voice = createVoice();
