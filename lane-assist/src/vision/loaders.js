import { SERVICES } from '../config.js';
import { loadScript } from '../lib/loadScript.js';

// The two vision engines, loaded in the background after the app is up.
// OpenCV.js (~10 MB) comes from its CDN at runtime rather than being bundled.
export const V = { cv: null, model: null, status: { cv: 'loading', model: 'loading' } };

export async function loadOpenCV() {
  try {
    await loadScript(SERVICES.opencv);
    let c = window.cv;
    if (c instanceof Promise) c = await c;
    const t0 = performance.now();
    while (!(c && c.Mat)) {
      if (performance.now() - t0 > 60000) throw new Error('OpenCV runtime timeout');
      await new Promise(r => setTimeout(r, 50));
      c = window.cv instanceof Promise ? await window.cv : window.cv;
    }
    V.cv = c;
    V.status.cv = 'ready';
  } catch (e) {
    console.error(e);
    V.status.cv = 'failed';
  }
}

// TensorFlow.js and COCO-SSD are split into their own lazy chunk; the model weights
// download from Google's storage the first time.
export async function loadDetector() {
  try {
    const [tf, cocoSsd] = await Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/coco-ssd')]);
    await tf.ready();
    V.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    V.status.model = 'ready';
  } catch (e) {
    console.error(e);
    V.status.model = 'failed';
  }
}
