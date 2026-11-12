import { $, mount, setText, isCompactLayout } from '../lib/dom.js';
import { roiTop } from '../vision/roi.js';
import { drawOverlay } from './cameraOverlay.js';
import { attachRoadAreaEditor } from './RoadAreaEditor.js';

const STATUS_WORD = v => v === 'ready' ? 'ready' : v === 'failed' ? 'failed to load' : 'loading…';

/* The camera pane: live frame with the detection overlay, the road-area editor, and the
   "camera off" state. On phones it's a small inset on the map; tap it to enlarge.
   roadArea: { get(), set(r, save), reset(), find() } */
export function createCameraView(slotId, { roadArea }) {
  mount(slotId, `
    <section class="pane" id="videoPane" aria-label="Camera with detection overlay">
      <canvas id="view" hidden></canvas>
      <span class="tag tl" id="portraitTip" hidden>Turn the phone sideways</span>
      <button class="btn roi-btn" type="button" id="roiBtn" hidden>Road area</button>
      <div class="roi-bar" id="roiBar" hidden>
        <button class="btn primary" type="button" id="roiDone">Done</button>
        <button class="btn" type="button" id="roiFind">Find the road</button>
        <button class="btn" type="button" id="roiReset">Reset</button>
        <span class="hint">Drag the corners onto the road edges, or drag inside to move it.</span>
      </div>
      <span class="tag bl" id="roiMsg" hidden></span>
      <div class="empty" id="empty">
        <p id="camMsg">Camera is off. Detection starts as soon as it's on. Mount the phone sideways, looking ahead.</p>
        <p class="meta" id="visionStatus">Loading OpenCV and COCO-SSD…</p>
      </div>
    </section>`);
  const pane = $('videoPane'), view = $('view'), ctx = view.getContext('2d');
  const empty = $('empty'), roiBtn = $('roiBtn'), roiBar = $('roiBar'), roiMsg = $('roiMsg');
  let live = false, editing = false, wasBig = false, msgTimer = 0;

  const editor = attachRoadAreaEditor(view, { getRoi: roadArea.get, setRoi: roadArea.set, isEditing: () => editing });

  function placeBar() {
    // Keep the buttons on the side away from the road area so they don't cover its corners.
    roiBar.classList.toggle('low', roiTop(roadArea.get()) < 0.4);
  }
  function setEditing(on) {
    editing = on;
    pane.classList.toggle('editing', on);
    roiBar.hidden = !on;
    roiBtn.hidden = on || !live;
    placeBar();
    const stage = $('stage');
    if (on) { wasBig = stage.classList.contains('pip-big'); stage.classList.add('pip-big'); }
    else if (!wasBig) stage.classList.remove('pip-big');
    if (!on) { editor.cancel(); roadArea.set(roadArea.get(), true); }
  }

  roiBtn.addEventListener('click', () => setEditing(true));
  $('roiDone').addEventListener('click', () => setEditing(false));
  $('roiReset').addEventListener('click', () => { roadArea.reset(); placeBar(); });
  $('roiFind').addEventListener('click', () => roadArea.find());
  pane.addEventListener('click', e => {
    if (editing || e.target.closest('button') || !isCompactLayout()) return;
    $('stage').classList.toggle('pip-big');
  });

  return {
    setVisionStatus(status) {
      setText($('visionStatus'), `OpenCV ${STATUS_WORD(status.cv)} · COCO-SSD ${STATUS_WORD(status.model)}`);
    },
    showLive({ w, h, videoW, videoH }) {
      live = true;
      if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
      empty.hidden = true; view.hidden = false;
      roiBtn.hidden = editing;
      $('portraitTip').hidden = videoW >= videoH;
      pane.style.setProperty('--ar', `${videoW} / ${videoH}`);
    },
    showOff(text) {
      live = false;
      if (editing) setEditing(false);
      roiBtn.hidden = true;
      setText($('camMsg'), text);
      empty.hidden = false; view.hidden = true; $('portraitTip').hidden = true;
    },
    // ms = 0 keeps the message up until the next one.
    message(text, ms = 4500) {
      setText(roiMsg, text);
      roiMsg.hidden = !text;
      clearTimeout(msgTimer);
      if (ms) msgTimer = setTimeout(() => { roiMsg.hidden = true; }, ms);
    },
    editRoadArea() { setEditing(true); },
    draw(frame, data) {
      if (editing) placeBar();
      drawOverlay(ctx, frame, { ...data, editing });
    },
  };
}
