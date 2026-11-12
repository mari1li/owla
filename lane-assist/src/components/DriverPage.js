import { mount } from '../lib/dom.js';

const PROFILE_CARDS = [
  [8, 'First year', 'The most cautious. Asks you to wait for the biggest gaps.'],
  [6, 'Newer driver', 'A middle setting for drivers getting used to highway merges.'],
  [4, 'Confident', 'Accepts tighter gaps. Warns later.'],
];
const SOURCE_CARDS = [
  ['gps', 'Phone GPS', 'The map follows where the phone really is, and the speed comes from GPS. Your trip is recorded.'],
  ['sim', 'Simulated drive', 'The car drives the route at typical road speeds. For trying the app at a desk.'],
];
const card = (attr, value, title, meta, desc) => `
  <button class="pcard" type="button" role="radio" ${attr}="${value}" aria-checked="false">
    <span class="dot"></span><span class="pt">${title}</span><span class="pm">${meta}</span>
    <span class="pd">${desc}</span>
  </button>`;

/* The Driver tab: profile (how early a lane turns red), position source, camera tuning. */
export function createDriverPage(slotId, { onMargin, onSource, onTune, onEditRoad, onFindRoad }) {
  mount(slotId, `
    <div class="profile-wrap">
      <h2>Driver profile</h2>
      <p>Sets how early a lane beside you turns red. A lane is red when traffic in it would reach you within your margin.</p>
      <div class="profiles" id="profileSeg" role="radiogroup" aria-label="Driver profile">
        ${PROFILE_CARDS.map(([m, t, d]) => card('data-margin', m, t, `${m} s`, d)).join('')}
      </div>

      <h3>Position</h3>
      <div class="profiles" id="srcSeg" role="radiogroup" aria-label="Position source">
        ${SOURCE_CARDS.map(([s, t, d]) => card('data-src', s, t, '', d)).join('')}
      </div>

      <h3>Camera tuning</h3>
      <div class="tune-grid">
        <p class="note">Lanes are only looked for inside the <b>road area</b>, the dashed shape on the camera view. It can sit anywhere in the picture, so it works however the phone is mounted: road in the bottom half, the top half, or off to one side.</p>
        <div class="tune-actions">
          <button class="btn" type="button" id="roiEditBtn">Adjust road area</button>
          <button class="btn" type="button" id="roiFindBtn">Find the road automatically</button>
        </div>
        <label>Marking threshold <output id="o_thr">25</output>
          <input type="range" id="t_thr" min="5" max="80" value="25"></label>
        <label>Focal length (px) <output id="o_focal">480</output>
          <input type="range" id="t_focal" min="300" max="1600" step="10" value="480"></label>
        <p class="note">Focal length only changes the distances in metres and the 60 m watch range. Time-to-arrival comes from how fast a box grows, so it doesn't depend on it.</p>
      </div>
    </div>`);

  const margins = [...document.querySelectorAll('#profileSeg [data-margin]')];
  const sources = [...document.querySelectorAll('#srcSeg [data-src]')];
  margins.forEach(b => b.addEventListener('click', () => onMargin(+b.dataset.margin)));
  sources.forEach(b => b.addEventListener('click', () => onSource(b.dataset.src)));
  for (const k of ['thr', 'focal']) {
    const inp = document.getElementById('t_' + k), out = document.getElementById('o_' + k);
    inp.addEventListener('input', () => { out.textContent = inp.value; onTune(k, +inp.value); });
  }
  document.getElementById('roiEditBtn').addEventListener('click', onEditRoad);
  document.getElementById('roiFindBtn').addEventListener('click', onFindRoad);

  return {
    setMargin(m) { margins.forEach(b => b.setAttribute('aria-checked', String(+b.dataset.margin === m))); },
    setSource(src) { sources.forEach(b => b.setAttribute('aria-checked', String(b.dataset.src === src))); },
  };
}
