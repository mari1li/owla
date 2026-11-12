import { ROI_DEFAULT, STORAGE } from '../config.js';
import { loadJSON, saveJSON } from '../lib/storage.js';

/* Road area: four corners as fractions of the frame (top-left, top-right, bottom-right,
   bottom-left), so it can sit wherever the phone's mounting puts the road. All functions
   here are pure geometry on a road area `r`, plus saving it on the phone. */
export const CORNERS = ['tl', 'tr', 'br', 'bl'];

export const cloneRoi = r => ({ tl: [...r.tl], tr: [...r.tr], br: [...r.br], bl: [...r.bl] });
export const defaultRoi = () => cloneRoi(ROI_DEFAULT);
export const roiCorners = r => [r.tl, r.tr, r.br, r.bl];
export const roiTop = r => Math.min(...roiCorners(r).map(q => q[1]));

export function roiPoints(r, w, h) {
  return roiCorners(r).map(([x, y]) => [x * w, y * h]);
}

// The rows lanes are fitted over: from the area's top edge to its bottom edge.
export function roiSpan(r, h) {
  return { yT: h * Math.min(r.tl[1], r.tr[1]), yB: h * Math.max(r.bl[1], r.br[1]) };
}

// The area's centre line splits left markings from right ones (it needn't be the frame's middle).
export function roiMidX(r, y, w, h) {
  const tx = (r.tl[0] + r.tr[0]) / 2 * w, ty = (r.tl[1] + r.tr[1]) / 2 * h;
  const bx = (r.bl[0] + r.br[0]) / 2 * w, by = (r.bl[1] + r.br[1]) / 2 * h;
  return tx + (bx - tx) * (y - ty) / ((by - ty) || 1);
}

// Point-in-polygon (even-odd rule), in frame fractions.
export function insideRoi(r, x, y) {
  const P = roiCorners(r);
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Move the whole shape by (dx, dy), stopping at the frame's edges.
export function moveRoi(r, dx, dy) {
  const P = roiCorners(r);
  const cx = Math.max(-Math.min(...P.map(q => q[0])), Math.min(1 - Math.max(...P.map(q => q[0])), dx));
  const cy = Math.max(-Math.min(...P.map(q => q[1])), Math.min(1 - Math.max(...P.map(q => q[1])), dy));
  const out = cloneRoi(r);
  for (const k of CORNERS) out[k] = [r[k][0] + cx, r[k][1] + cy];
  return out;
}

export function setCorner(r, key, x, y) {
  const c = v => Math.max(0, Math.min(1, v));
  const out = cloneRoi(r);
  out[key] = [c(x), c(y)];
  return out;
}

export function isValidRoi(r) {
  return !!r && CORNERS.every(k => Array.isArray(r[k]) && r[k].length === 2 && r[k].every(Number.isFinite));
}

export function loadRoi() {
  const r = loadJSON(STORAGE.roi);
  return isValidRoi(r) ? r : null;
}

export function saveRoi(r) {
  saveJSON(STORAGE.roi, r);
}
