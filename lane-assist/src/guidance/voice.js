/* Speech rules: the same phrase isn't repeated within 5 s; nothing non-urgent speaks within
   1.6 s of anything else; priorities 1–2 interrupt, 3–5 wait their turn (newest wins).
   iOS only allows speech after a tap, so unlock() runs from the Start navigation tap. */
const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export const voice = {
  muted: false, unlocked: false, current: null, pending: null,
  lastStart: -1e9, lastEnd: -1e9, history: new Map(),

  unlock() {
    if (!hasSpeech()) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
    this.unlocked = true;
  },
  recentlySaid(text, now) {
    const t = this.history.get(text);
    return t != null && now - t < 5000;
  },
  say(text, pri) {
    if (this.muted || !this.unlocked) return;
    const now = performance.now();
    if (this.recentlySaid(text, now)) return;
    if (pri <= 2) {
      this.pending = null;
      speechSynthesis.cancel();
      this.speak(text, now);
    } else {
      this.pending = text;
      this.pump();
    }
  },
  // Called every frame: speaks the waiting non-urgent phrase once there's room.
  pump() {
    if (!this.pending || this.muted || !hasSpeech()) return;
    const now = performance.now();
    if (this.current || speechSynthesis.speaking) return;
    if (now - this.lastEnd < 1600 || now - this.lastStart < 1600) return;
    const text = this.pending;
    this.pending = null;
    if (!this.recentlySaid(text, now)) this.speak(text, now);
  },
  speak(text, now) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.03; u.lang = 'en-US';
    const done = () => { if (this.current === u) { this.current = null; this.lastEnd = performance.now(); } };
    u.onend = done; u.onerror = done;
    this.current = u; this.lastStart = now; this.history.set(text, now);
    speechSynthesis.speak(u);
    setTimeout(done, 8000 + text.length * 80);   // some engines never fire onend
  },
  stop() {
    this.pending = null;
    if (hasSpeech()) speechSynthesis.cancel();
  },
  setMuted(m) {
    this.muted = m;
    this.pending = null;
    if (m && hasSpeech()) { speechSynthesis.cancel(); this.current = null; }
  },
};
