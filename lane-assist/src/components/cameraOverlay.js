import { COLORS, WATCH_RANGE_M } from '../config.js';
import { roiPoints, roiSpan } from '../vision/roi.js';

/* Draws the camera frame with what the vision sees: the road area (solid with handles while
   editing), the thirds used for left / ahead / right, the fitted lane lines, and a labelled box
   per tracked vehicle or person (amber = in range, red = closing inside the margin or a person). */
export function drawOverlay(ctx, frame, { roi, editing, lanes, tracks, margin }) {
  const w = ctx.canvas.width, h = ctx.canvas.height, u = w / 640;
  ctx.drawImage(frame, 0, 0);

  const P = roiPoints(roi, w, h);
  ctx.save();
  if (editing) { ctx.lineWidth = 2.5 * u; ctx.strokeStyle = COLORS.paper; ctx.fillStyle = 'rgba(31,164,95,.16)'; }
  else { ctx.setLineDash([6 * u, 6 * u]); ctx.lineWidth = 1.2 * u; ctx.strokeStyle = 'rgba(242,244,240,.35)'; }
  ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
  if (editing) {
    ctx.fill();
    for (const [x, y] of P) {
      ctx.beginPath(); ctx.arc(x, y, 11 * u, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.paper; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = COLORS.ink; ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.setLineDash([2 * u, 8 * u]); ctx.strokeStyle = 'rgba(242,244,240,.22)';
  for (const x of [w / 3, 2 * w / 3]) { ctx.beginPath(); ctx.moveTo(x, h * 0.3); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.restore();

  const { yT, yB } = roiSpan(roi, h);
  const { left: Lf, right: Rf } = lanes;
  if (Lf && Rf) {
    ctx.fillStyle = 'rgba(31,164,95,.18)';
    ctx.beginPath(); ctx.moveTo(Lf.xt, yT); ctx.lineTo(Rf.xt, yT); ctx.lineTo(Rf.xb, yB); ctx.lineTo(Lf.xb, yB); ctx.closePath(); ctx.fill();
  }
  ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.strokeStyle = COLORS.guideLit;
  for (const f of [Lf, Rf]) if (f) { ctx.beginPath(); ctx.moveTo(f.xt, yT); ctx.lineTo(f.xb, yB); ctx.stroke(); }

  const fs = Math.max(11, Math.round(13 * u));
  ctx.font = `600 ${fs}px Archivo, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  for (const tr of tracks) {
    if (tr.hits < 2) continue;
    const [x, y, bw, bh] = tr.box;
    const far = tr.dist > WATCH_RANGE_M;
    const red = tr.cls === 'person' || (tr.tta != null && tr.tta < margin);
    const col = far ? 'rgba(124,138,131,.8)' : red ? COLORS.stop : COLORS.caution;
    ctx.lineWidth = (far ? 1.5 : 2.5) * u; ctx.strokeStyle = col; ctx.strokeRect(x, y, bw, bh);
    const label = `${tr.cls} ${Math.round(tr.dist)} m${tr.tta != null ? ` · ${tr.tta.toFixed(1)} s` : ''}`;
    const tw = ctx.measureText(label).width + 8, ly = Math.max(0, y - fs - 6);
    ctx.fillStyle = col; ctx.fillRect(x, ly, tw, fs + 6);
    ctx.fillStyle = red && !far ? COLORS.paper : COLORS.ink;
    ctx.fillText(label, x + 4, ly + 3);
  }
}
