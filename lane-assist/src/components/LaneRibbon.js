import { KIND_NOUN } from '../config.js';
import { setText } from '../lib/dom.js';

const STATE_WORD = { none: 'No input', clear: 'Clear', occupied: 'Occupied', closing: 'Closing' };

const lane = (id, name) => `
  <div class="lane" id="${id}" data-state="none">
    <span class="exit-chip">Exit side</span>
    <span class="ln">${name}</span>
    <span class="st"><span class="sx">No input</span><span class="tta"></span></span>
  </div>`;

// Left lane · you · right lane, coloured by state, with the maneuver side outlined.
export const ribbonMarkup = `
  <div class="ribbon">
    ${lane('laneL', 'Left lane')}
    <div class="you" id="you" data-state="none">
      <svg viewBox="0 0 18 22" aria-hidden="true"><rect x="2" y="1" width="14" height="20" rx="4" fill="#F2F4F0"/><rect x="4.5" y="5" width="9" height="4" rx="1" fill="#0C1410"/></svg>
      <span class="yt">You</span>
    </div>
    ${lane('laneR', 'Right lane')}
  </div>`;

export function createLaneRibbon(root) {
  const left = root.querySelector('#laneL'), right = root.querySelector('#laneR'), you = root.querySelector('#you');
  const chips = [...root.querySelectorAll('.exit-chip')];
  const prev = {};

  function renderLane(el, z, Z, exitSide) {
    if (el.dataset.state !== Z.state) el.dataset.state = Z.state;
    el.classList.toggle('exit-target', exitSide === z);
    setText(el.querySelector('.sx'), STATE_WORD[Z.state]);
    const t = Z.state === 'clear' || Z.state === 'none' ? '' : Z.tta != null ? `${Z.tta.toFixed(1)} s` : 'steady';
    setText(el.querySelector('.tta'), t);
    // Flash once when a lane turns red.
    if (Z.state === 'closing' && prev[el.id] !== 'closing') {
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    prev[el.id] = Z.state;
  }
  function renderYou(A) {
    if (you.dataset.state !== A.state) you.dataset.state = A.state;
    const yt = A.state === 'closing' || (A.state === 'occupied' && A.tta != null) ? `Ahead ${A.tta.toFixed(1)} s`
      : A.state === 'occupied' ? `Ahead ${Math.round(A.dist)} m` : 'You';
    setText(you.querySelector('.yt'), yt);
  }

  return {
    update(L, nx) {
      const exitSide = nx && nx.dist < nx.exit.range ? nx.exit.side : null;
      const chip = nx ? `${KIND_NOUN[nx.exit.kind]} side` : '';
      chips.forEach(c => setText(c, chip));
      renderLane(left, 'left', L.left, exitSide);
      renderLane(right, 'right', L.right, exitSide);
      renderYou(L.ahead);
      return exitSide;
    },
  };
}
