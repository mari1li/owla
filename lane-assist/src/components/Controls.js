import { $, mount, setText } from '../lib/dom.js';

export function createControls(slotId, { onCamera, onNav, onMute, onTrip }) {
  mount(slotId, `
    <div class="controls">
      <button class="btn" type="button" id="camBtn">Turn on camera</button>
      <button class="btn primary" type="button" id="navBtn" disabled>Start navigation</button>
      <button class="btn" type="button" id="muteBtn" aria-pressed="false">Voice on</button>
      <button class="btn" type="button" id="tripBtn" hidden>Save trip</button>
    </div>`);
  const cam = $('camBtn'), nav = $('navBtn'), mute = $('muteBtn'), tripBtn = $('tripBtn');
  cam.addEventListener('click', onCamera);
  nav.addEventListener('click', onNav);
  mute.addEventListener('click', onMute);
  tripBtn.addEventListener('click', onTrip);

  return {
    setNavigating(on) {
      setText(nav, on ? 'Stop navigation' : 'Start navigation');
      nav.classList.toggle('primary', !on);
    },
    setNavEnabled(on) { nav.disabled = !on; },
    // The camera button only shows while the camera is off.
    setCamera({ hidden = false, starting = false }) {
      cam.hidden = hidden;
      setText(cam, starting ? 'Starting camera…' : 'Turn on camera');
    },
    setMuted(m) {
      mute.setAttribute('aria-pressed', String(m));
      setText(mute, m ? 'Muted' : 'Voice on');
    },
    setVoiceUnavailable() {
      mute.disabled = true;
      setText(mute, 'No voice');
      mute.title = "This browser can't speak";
    },
    // label: button text, or null to hide it.
    setTrip(label) {
      tripBtn.hidden = !label;
      if (label) setText(tripBtn, label);
    },
  };
}
