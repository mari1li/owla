import { AUTO_FIND_FRAMES } from '../config.js';
import { S } from '../state.js';
import { V } from './loaders.js';
import { roiPoints, roiSpan, roiMidX, saveRoi } from './roi.js';

/* Lane detection: white top-hat, not Canny.
   grey → blur → top-hat with a wide 25×1 kernel (keeps narrow bright markings) → threshold →
   road-area mask → HoughLinesP → slope and side filter → least-squares x = a·y + b per side →
   average over the last 10 frames. */
const M = { w: 0, h: 0 };
let maskDirty = true;
export const laneHist = { left: [], right: [] };
const laneMiss = { left: 0, right: 0 };

export function resetLanes() {
  laneHist.left.length = 0; laneHist.right.length = 0;
  laneMiss.left = 0; laneMiss.right = 0;
}

export function invalidateMask() {
  maskDirty = true;
}

// Change the road area: re-mask, drop the lane history fitted to the old one, and remember it.
export function setRoadArea(r, save = true) {
  S.roi = r;
  maskDirty = true;
  resetLanes();
  if (save) saveRoi(r);
}

function freeMats() {
  ['src', 'gray', 'top', 'bin', 'roi', 'mask', 'lines', 'kernel', 'all'].forEach(k => { if (M[k]) { M[k].delete(); M[k] = null; } });
}
function allocMats(cv, w, h) {
  freeMats();
  M.w = w; M.h = h;
  M.src = new cv.Mat(h, w, cv.CV_8UC4);
  M.gray = new cv.Mat(); M.top = new cv.Mat(); M.bin = new cv.Mat(); M.roi = new cv.Mat();
  M.lines = new cv.Mat();
  M.mask = cv.Mat.zeros(h, w, cv.CV_8UC1);
  // Wide horizontal kernel: the opening erases anything narrower than 25 px,
  // so original − opening leaves the narrow bright markings.
  M.kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(25, 1));
  M.blur = new cv.Size(5, 5);
  maskDirty = true;
}
function buildMask(cv) {
  const pts = roiPoints(S.roi, M.w, M.h).flat().map(Math.round);
  const pm = cv.matFromArray(4, 1, cv.CV_32SC2, pts);
  const mv = new cv.MatVector();
  mv.push_back(pm);
  M.mask.setTo(new cv.Scalar(0));
  cv.fillPoly(M.mask, mv, new cv.Scalar(255));
  pm.delete(); mv.delete();
  maskDirty = false;
}

// Least squares fit of x = a·y + b (lane lines are near-vertical in the image).
export function fitXofY(pts) {
  const n = pts.length;
  if (n < 2) return null;
  let sy = 0, sx = 0, syy = 0, sxy = 0, ymin = Infinity, ymax = -Infinity;
  for (const [x, y] of pts) { sx += x; sy += y; syy += y * y; sxy += x * y; ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  const den = n * syy - sy * sy;
  if (Math.abs(den) < 1e-6 || ymax - ymin < 8) return null;
  const a = (n * sxy - sy * sx) / den;
  return { a, b: (sx - a * sy) / n };
}

// Run lane detection on the frame currently in `ctx` (w × h).
export function processLanes(ctx, w, h) {
  const cv = V.cv;
  if (!M.src || M.w !== w || M.h !== h) allocMats(cv, w, h);
  if (maskDirty) buildMask(cv);
  M.src.data.set(ctx.getImageData(0, 0, w, h).data);
  cv.cvtColor(M.src, M.gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(M.gray, M.gray, M.blur, 0);
  cv.morphologyEx(M.gray, M.top, cv.MORPH_TOPHAT, M.kernel);
  cv.threshold(M.top, M.bin, S.tune.thr, 255, cv.THRESH_BINARY);
  cv.bitwise_and(M.bin, M.mask, M.roi);
  cv.HoughLinesP(M.roi, M.lines, 1, Math.PI / 180, 20, Math.max(10, h * 0.04), Math.max(20, h * 0.1));

  if (autoFind.on) collectRoad(cv, w, h);
  const pts = { left: [], right: [] }, d = M.lines.data32S;
  for (let i = 0; i < M.lines.rows; i++) {
    const x1 = d[i * 4], y1 = d[i * 4 + 1], x2 = d[i * 4 + 2], y2 = d[i * 4 + 3];
    if (x1 === x2) continue;
    const slope = (y2 - y1) / (x2 - x1), as = Math.abs(slope);
    if (as < 0.5 || as > 3.0) continue;               // wires, poles
    let side;
    const m1 = roiMidX(S.roi, y1, w, h), m2 = roiMidX(S.roi, y2, w, h);
    if (slope < 0 && x1 < m1 && x2 < m2) side = 'left';
    else if (slope > 0 && x1 > m1 && x2 > m2) side = 'right';
    else continue;                                    // geometrically impossible
    const reps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 25));
    for (let r = 0; r < reps; r++) pts[side].push([x1, y1], [x2, y2]);
  }
  const { yT, yB } = roiSpan(S.roi, h);
  for (const side of ['left', 'right']) {
    const f = fitXofY(pts[side]);
    const ok = f && (side === 'left' ? f.a < 0 : f.a > 0);
    if (ok) {
      laneHist[side].push({ xb: f.a * yB + f.b, xt: f.a * yT + f.b });
      if (laneHist[side].length > 10) laneHist[side].shift();
      laneMiss[side] = 0;
    } else if (++laneMiss[side] > 15) {
      laneHist[side].length = 0;
    }
  }
}

// The averaged lane line on one side: x at the area's bottom (xb) and top (xt), or null.
export function laneAvg(side) {
  const H = laneHist[side];
  if (!H.length) return null;
  let xb = 0, xt = 0;
  for (const p of H) { xb += p.xb; xt += p.xt; }
  return { xb: xb / H.length, xt: xt / H.length };
}

/* Find the road automatically: for about 1.5 s, look for marking-like lines across the whole
   frame, find where the left-leaning and right-leaning ones meet (the vanishing point), keep
   the lines that run through it, and put the road area around them. */
const autoFind = { on: false, frames: 0, segs: [], done: null };

export function startFindRoad(done) {
  Object.assign(autoFind, { on: true, frames: 0, segs: [], done });
}

function collectRoad(cv, w, h) {
  if (!M.all) M.all = new cv.Mat();
  cv.HoughLinesP(M.bin, M.all, 1, Math.PI / 180, 25, Math.max(12, h * 0.05), Math.max(20, h * 0.08));
  const d = M.all.data32S;
  for (let i = 0; i < M.all.rows && autoFind.segs.length < 4000; i++) {
    const x1 = d[i * 4], y1 = d[i * 4 + 1], x2 = d[i * 4 + 2], y2 = d[i * 4 + 3];
    if (y1 === y2 || x1 === x2) continue;
    const m = (y2 - y1) / (x2 - x1);
    if (Math.abs(m) < 0.3 || Math.abs(m) > 4) continue;
    const a = (x2 - x1) / (y2 - y1);                 // as x = a·y + b
    autoFind.segs.push({ a, b: x1 - a * y1, len: Math.hypot(x2 - x1, y2 - y1), ylo: Math.max(y1, y2) });
  }
  if (++autoFind.frames >= AUTO_FIND_FRAMES) {
    autoFind.on = false;
    const roi = roadAreaFromSegments(autoFind.segs, w, h);
    if (roi) setRoadArea(roi);
    if (autoFind.done) autoFind.done(!!roi);
  }
}

const pct = (arr, q) => { const v = [...arr].sort((x, y) => x - y); return v[Math.round(q * (v.length - 1))]; };

// Segments are lines x = a·y + b in a w × h frame. Returns a road area, or null if there
// aren't enough lines that agree on a vanishing point.
export function roadAreaFromSegments(segs, w, h) {
  const byLen = (x, y) => y.len - x.len;
  const left = segs.filter(g => g.a < 0).sort(byLen).slice(0, 80);
  const right = segs.filter(g => g.a > 0).sort(byLen).slice(0, 80);
  if (left.length < 5 || right.length < 5) return null;
  const xs = [], ys = [];
  for (const g of left) for (const k of right) {
    const y = (k.b - g.b) / (g.a - k.a), x = g.a * y + g.b;
    if (y > -0.3 * h && y < h * 0.95 && x > -0.2 * w && x < 1.2 * w) { xs.push(x); ys.push(y); }
  }
  if (xs.length < 20) return null;
  const vx = pct(xs, 0.5), vy = pct(ys, 0.5);
  // Only lines that actually run through the vanishing point are road markings.
  const near = g => Math.abs(g.a * vy + g.b - vx) < 0.06 * w;
  const L2 = left.filter(near), R2 = right.filter(near);
  if (L2.length < 3 || R2.length < 3) return null;
  const yB = Math.min(h, pct([...L2, ...R2].map(g => g.ylo), 0.9) + 0.02 * h);
  const yT = Math.max(0, vy + Math.max(0.04 * h, 0.12 * (yB - vy)));
  if (yB - yT < 0.12 * h) return null;
  const xbl = Math.max(0, pct(L2.map(g => g.a * yB + g.b), 0.1) - 0.08 * w);
  const xbr = Math.min(w, pct(R2.map(g => g.a * yB + g.b), 0.9) + 0.08 * w);
  const k = (yT - vy) / ((yB - vy) || 1);            // the top edge sits on the lines from the vanishing point
  let xtl = vx + (xbl - vx) * k, xtr = vx + (xbr - vx) * k;
  if (xtr - xtl < 0.06 * w) { const c = (xtl + xtr) / 2; xtl = c - 0.03 * w; xtr = c + 0.03 * w; }
  const n = (x, y) => [Math.max(0, Math.min(1, x / w)), Math.max(0, Math.min(1, y / h))];
  return { tl: n(xtl, yT), tr: n(xtr, yT), br: n(xbr, yB), bl: n(xbl, yB) };
}
