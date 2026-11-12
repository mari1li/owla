import { CORNERS, insideRoi, moveRoi, setCorner, cloneRoi } from '../vision/roi.js';

/* Drag a corner of the road area, or drag inside it to move the whole shape.
   getRoi() / setRoi(r, save) read and write it; isEditing() gates the pointer handlers. */
export function attachRoadAreaEditor(canvas, { getRoi, setRoi, isEditing }) {
  let drag = null;

  // Pointer position as fractions of the frame (the canvas is letterboxed with object-fit: contain).
  function framePoint(e) {
    const r = canvas.getBoundingClientRect(), k = Math.min(r.width / canvas.width, r.height / canvas.height);
    const ox = (r.width - canvas.width * k) / 2, oy = (r.height - canvas.height * k) / 2;
    return { x: (e.clientX - r.left - ox) / k / canvas.width, y: (e.clientY - r.top - oy) / k / canvas.height, k };
  }

  canvas.addEventListener('pointerdown', e => {
    if (!isEditing()) return;
    const roi = getRoi(), p = framePoint(e), W = canvas.width * p.k, H = canvas.height * p.k;
    let best = null, bd = 30;   // grab radius in CSS px
    for (const key of CORNERS) {
      const [cx, cy] = roi[key], d = Math.hypot((cx - p.x) * W, (cy - p.y) * H);
      if (d < bd) { bd = d; best = key; }
    }
    if (!best && !insideRoi(roi, p.x, p.y)) return;
    drag = { key: best, x: p.x, y: p.y, start: cloneRoi(roi) };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = framePoint(e);
    setRoi(drag.key ? setCorner(drag.start, drag.key, p.x, p.y) : moveRoi(drag.start, p.x - drag.x, p.y - drag.y), false);
  });
  const end = () => { if (drag) { drag = null; setRoi(getRoi(), true); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return { cancel() { drag = null; } };
}
