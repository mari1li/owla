import { PROC_MAX_WIDTH } from '../config.js';

/* The phone's rear camera as a live stream, plus an offscreen canvas each new frame is copied
   into for processing. No UI here: callers get onLive / onStopped / onStarting callbacks. */
export function createCamera({ onStarting, onLive, onStopped }) {
  const video = document.createElement('video');
  video.id = 'video';
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  document.body.appendChild(video);

  const proc = document.createElement('canvas');
  const ctx = proc.getContext('2d', { willReadFrequently: true });
  let stream = null, starting = false, live = false, newFrame = false;

  async function start() {
    if (stream || starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onStopped(window.isSecureContext ? "This browser can't use the camera."
        : 'The camera only works on a secure page. Open the https:// address (see the README).');
      return;
    }
    starting = true;
    onStarting();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
      stream.getVideoTracks()[0].addEventListener('ended', () => stop('The camera stopped. Tap Turn on camera to restart it.'));
      video.srcObject = stream;
      video.play().catch(() => {});
    } catch (e) {
      stream = null;
      onStopped(e.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow the camera for this site (iPhone: Settings → Apps → Safari → Camera), then tap Turn on camera.'
        : e.name === 'NotFoundError' ? 'No camera found on this device.'
        : `The camera didn't start (${e.name}). Close other apps using it and try again.`);
    }
    starting = false;
  }

  function stop(message) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; live = false; video.srcObject = null;
    onStopped(message);
  }

  // Fires when the stream starts and whenever its size changes (e.g. the phone rotates).
  function sizeFrame() {
    if (!video.videoWidth) return;
    const w = Math.min(PROC_MAX_WIDTH, video.videoWidth);
    const h = Math.round(w * video.videoHeight / video.videoWidth);
    const resized = proc.width !== w || proc.height !== h;
    if (resized) { proc.width = w; proc.height = h; }
    live = true;
    onLive({ w, h, videoW: video.videoWidth, videoH: video.videoHeight, resized });
  }
  video.addEventListener('loadedmetadata', sizeFrame);
  video.addEventListener('resize', sizeFrame);

  // A camera has no timeline: use the frame callback where there is one, else every tick.
  const hasFrameCallback = 'requestVideoFrameCallback' in video;
  if (hasFrameCallback) {
    const onFrame = () => { newFrame = true; video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  }

  // Keep the camera live if the browser pauses it, and notice if the phone shut it off in the background.
  video.addEventListener('pause', () => { if (live && !document.hidden) video.play().catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (stream && stream.getVideoTracks()[0].readyState === 'ended') stop('The camera stopped. Tap Turn on camera to restart it.');
    else if (live) video.play().catch(() => {});
  });

  return {
    proc, ctx,
    start,
    get live() { return live; },
    ready: () => live && video.readyState >= 2 && proc.width > 0,
    // Copy the newest frame into the processing canvas; false if there's no new one yet.
    grabFrame() {
      if (hasFrameCallback && !newFrame) return false;
      newFrame = false;
      ctx.drawImage(video, 0, 0, proc.width, proc.height);
      return true;
    },
  };
}
