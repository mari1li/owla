/* Instruction hysteresis: a more urgent instruction takes over at once, anything else has to
   hold for 0.9 s so detection flicker doesn't chatter. render() shows it; say() speaks it. */
export function createInstructions({ render, say, holdMs = 900 }) {
  let shown = null, cand = null, candSince = 0;

  function commit(next) {
    shown = next; cand = null;
    render(next);
    if (!next.silent) say((next.say || next.text).replace(/ — /g, ', '), next.pri);
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
  };
}
