import { PROFILES } from '../config.js';
import { $, mount, setText } from '../lib/dom.js';
import { fmtDistShort } from '../lib/geo.js';
import { cap } from '../guidance/fusion.js';
import { ribbonMarkup, createLaneRibbon } from './LaneRibbon.js';

const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z" fill="currentColor"/></svg>';

/* The guidance panel: the spoken instruction, the blind-spot check, a detail line,
   what each input is saying, and the lane ribbon. */
export function createGuidancePanel(slotId) {
  mount(slotId, `
    <section id="output" aria-label="Guidance">
      <div class="out-top">
        <span id="profileLabel"></span>
        <span id="fps" class="num">— fps</span>
      </div>
      <div class="instr" id="instr" aria-live="polite">Where to?</div>
      <div class="check" id="check" hidden>${EYE}<span id="checkText"></span></div>
      <div class="sub" id="sub">Enter a start and destination, then start navigation. It turns on the camera too.</div>
      <div class="inputs">
        <span><b>Map</b><span id="inMap">—</span></span>
        <span><b>Camera</b><span id="inCam">—</span></span>
      </div>
      ${ribbonMarkup}
      <div class="legend" id="legend">
        <span class="sw" style="background:var(--guide-lit)"></span>clear
        <span class="sw" style="background:var(--caution)"></span>occupied
        <span class="sw" style="background:var(--stop)"></span>arriving within <span class="num" id="legendMargin"></span> s
      </div>
    </section>`);
  const el = { instr: $('instr'), check: $('check'), checkText: $('checkText'), sub: $('sub'), fps: $('fps'), inMap: $('inMap'), inCam: $('inCam') };
  const ribbon = createLaneRibbon($('output'));

  return {
    render(ins) {
      setText(el.instr, ins.text);
      setText(el.checkText, ins.check || '');
      el.check.hidden = !ins.check;
      setText(el.sub, ins.sub || '');
    },
    setProfile(margin) {
      setText($('profileLabel'), `${PROFILES[margin]} · margin ${margin} s`);
      setText($('legendMargin'), String(margin));
    },
    setFps(text, slow) {
      setText(el.fps, text);
      el.fps.classList.toggle('slow', slow);
    },
    // L: lane states; nx: next maneuver; ctx: { routed, remaining, camLive, lines: { left, right } }
    update(L, nx, { routed, remaining, camLive, lines }) {
      const exitSide = ribbon.update(L, nx);
      setText(el.inMap, !routed ? 'no route yet'
        : nx ? `${nx.exit.label} in ${fmtDistShort(nx.dist)}, ${nx.exit.side} side` : `destination in ${fmtDistShort(remaining)}`);
      let cam;
      if (!L.live) cam = camLive ? 'starting detection…' : 'camera off';
      else {
        const desc = z => `${z} ${L[z].state === 'closing' ? `closing ${L[z].tta.toFixed(1)} s` : L[z].state}`;
        cam = exitSide ? cap(desc(exitSide)) + ' lane' : `${cap(desc('left'))} · ${desc('right')}`;
        cam += ` · lane lines: ${lines.left && lines.right ? 'both' : lines.left ? 'left only' : lines.right ? 'right only' : 'not found'}`;
      }
      setText(el.inCam, cam);
    },
  };
}
