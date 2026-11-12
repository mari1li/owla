/* Instruction hysteresis: a more urgent instruction takes over at once, anything else has to
   hold for 0.9 s so detection flicker doesn't chatter. render() shows it; say() speaks it.

   Quiet instructions ("Continue on I-280") are shown but not spoken, except:
   - the first one after navigation starts (speakNext()), so the driver hears where things stand;
   - the first one after a status message (waiting for GPS, off route), so the driver hears
     that it's sorted. */
export function createInstructions({ render, say, holdMs = 900 }) {
  let shown = null, cand = null, candSince = 0, forceSpeak = false;

  function commit(next) {
    const speakIt = !next.silent || forceSpeak || (shown && shown.status && !next.status);
    forceSpeak = false;
    shown = next; cand = null;
    render(next);
    if (speakIt) say((next.say || next.text).replace(/ — /g, ', '), next.pri);
  }

  return {
    settle(next, now) {
      if (!shown || (next.key !== shown.key && next.pri < shown.pri)) { commit(next); return; }
      if (next.key === shown.key) { shown = next; render(shown); cand = null; return; }
      if (!cand || cand.key !== next.key) { cand = next; candSince = now; }
      else if (now - candSince > holdMs) commit(next);
    },
    // A status message outside the guidance flow (route ready, stopped, arrived).
    show(ins) {
      shown = null; cand = null;
      render(ins);
    },
    // Speak the next instruction even if it's a quiet one.
    speakNext() {
      shown = null; cand = null; forceSpeak = true;
    },
  };
}
