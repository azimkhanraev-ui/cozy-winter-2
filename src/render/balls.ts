// Отрисовка снежных шаров: объёмная заливка (кэш по радиусу), вращающаяся фактура, шапочка, тень.
import type { Ball } from '../sim/physics';
import { Rng } from '../sim/rng';

interface Cached {
  body: HTMLCanvasElement;
  tex: HTMLCanvasElement;
  pad: number;
}

const cache = new Map<string, Cached>();

function mk(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Тело шара: освещение сверху-слева, голубая тень снизу-справа, мягкий контур (виден и на светлом фоне). */
export function ballSprites(r: number, dpr: number): Cached {
  const R = Math.max(3, Math.round(r));
  const key = `${R}|${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pad = 3;
  const S = Math.ceil((R * 2 + pad * 2) * dpr);
  const [body, g] = mk(S);
  g.scale(dpr, dpr);
  const c = R + pad;
  const gr = g.createRadialGradient(c - R * 0.38, c - R * 0.42, R * 0.08, c, c, R);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.45, '#f4f8fd');
  gr.addColorStop(0.85, '#dbe6f4');
  gr.addColorStop(1, '#c3d3ea');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fill();
  // отражённый свет от снега снизу
  const rf = g.createLinearGradient(0, c + R * 0.2, 0, c + R);
  rf.addColorStop(0, 'rgba(255,255,255,0)');
  rf.addColorStop(1, 'rgba(235,243,255,0.35)');
  g.fillStyle = rf;
  g.beginPath();
  g.arc(c, c, R * 0.98, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(95,125,170,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(c, c, R - 0.5, 0, Math.PI * 2);
  g.stroke();

  // фактура: комочки и вмятины (вращается вместе с шаром)
  const [tex, t] = mk(S);
  t.scale(dpr, dpr);
  t.save();
  t.beginPath();
  t.arc(c, c, R - 0.8, 0, Math.PI * 2);
  t.clip();
  const rng = new Rng(R * 131 + 7);
  // несколько больших мягких неровностей (налипшие пласты)
  for (let k = 0; k < 3 + Math.round(R / 25); k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * R * 0.7;
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d;
    const s = rng.range(0.25, 0.45) * R;
    const sg = t.createRadialGradient(x, y, 0, x, y, s);
    sg.addColorStop(0, 'rgba(150,178,220,0.10)');
    sg.addColorStop(1, 'rgba(150,178,220,0)');
    t.fillStyle = sg;
    t.fillRect(x - s, y - s, s * 2, s * 2);
  }
  // мелкая зернистость
  const n = Math.round(10 + R * 1.2);
  for (let k = 0; k < n; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * R * 0.95;
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d;
    const s = rng.range(0.4, 1.1) * Math.max(1, R / 34);
    t.fillStyle = rng.chance(0.5) ? 'rgba(130,160,210,0.18)' : 'rgba(255,255,255,0.55)';
    t.beginPath();
    t.ellipse(x, y, s * 1.5, s, a, 0, Math.PI * 2);
    t.fill();
  }
  // «шов» от катания
  t.strokeStyle = 'rgba(150,180,220,0.12)';
  t.lineWidth = Math.max(1, R / 20);
  t.beginPath();
  t.arc(c, c, R * 0.62, -0.6, 1.4);
  t.stroke();
  t.restore();
  const out = { body, tex, pad };
  cache.set(key, out);
  return out;
}

/** Тень шара на снегу. */
export function drawBallShadow(ctx: CanvasRenderingContext2D, b: { x: number; y: number; r: number }, groundY: number): void {
  const gap = groundY - (b.y + b.r);
  if (gap > b.r * 3) return;
  const k = Math.max(0, 1 - gap / (b.r * 3));
  const w = b.r * (1.05 - 0.3 * (1 - k));
  const gr = ctx.createRadialGradient(b.x, groundY, 0, b.x, groundY, w);
  gr.addColorStop(0, `rgba(90,115,160,${(0.32 * k).toFixed(3)})`);
  gr.addColorStop(1, 'rgba(90,115,160,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.ellipse(b.x, groundY - 1, w, w * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Снежная шапочка сверху (не вращается). */
export function drawCap(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cap: number, seed = 1): void {
  if (cap < 0.4) return;
  const a0 = -Math.PI * 0.85;
  const a1 = -Math.PI * 0.15;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const N = 14;
  for (let k = 0; k <= N; k++) {
    const a = a0 + ((a1 - a0) * k) / N;
    const prof = Math.sin((Math.PI * k) / N);
    const bump = 1 + 0.18 * Math.sin(k * 2.3 + seed);
    const rr = r + cap * prof * bump;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let k = N; k >= 0; k--) {
    const a = a0 + ((a1 - a0) * k) / N;
    ctx.lineTo(x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1));
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,180,220,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

export function drawBall(ctx: CanvasRenderingContext2D, b: Ball, dpr: number): void {
  const sp = ballSprites(b.r, dpr);
  const R = Math.max(3, Math.round(b.r));
  const s = b.r / R; // плавный рост радиуса между ступенями кэша
  const half = (R + sp.pad) * s;
  const size = half * 2;
  const alpha = b.melting > 0 ? 1 - b.melting * 0.5 : 1;
  ctx.globalAlpha = alpha;
  ctx.drawImage(sp.body, b.x - half, b.y - half, size, size);
  const m = ctx.getTransform();
  const c = Math.cos(b.angle);
  const sn = Math.sin(b.angle);
  ctx.transform(c, sn, -sn, c, b.x, b.y);
  ctx.drawImage(sp.tex, -half, -half, size, size);
  ctx.setTransform(m);
  drawCap(ctx, b.x, b.y, b.r, b.cap, b.seed % 7);
  ctx.globalAlpha = 1;
}
