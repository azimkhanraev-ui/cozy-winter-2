// Отрисовка эффектов: отпечатки и «ангелы» в снегу, летящие снежки, брызги на «стекле», «резинка»
// рогатки, снег на кромках окон.
import type { EffectsModule, Decal, Splat, Projectile } from '../sim/effects';
import type { Ledge } from '../sim/ledges';
import { LCOL } from '../sim/ledges';
import { Rng } from '../sim/rng';

export function drawDecal(g: CanvasRenderingContext2D, d: Decal, surfY: number, alpha: number): void {
  if (alpha <= 0.02) return;
  g.save();
  g.globalAlpha = alpha;
  if (d.kind === 'foot') {
    // отпечаток подошвы на кромке снега (вид чуть сверху)
    const y = surfY + 2.5;
    g.fillStyle = 'rgba(95,125,185,0.7)';
    g.beginPath();
    g.ellipse(d.x, y, 6.5, 2.4, d.flip * 0.12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(d.x - d.flip * 1, y - 1.6, 6.5, 1, d.flip * 0.12, 0, Math.PI);
    g.fill();
  } else {
    // «ангел»: силуэт с крыльями, вдавленный в снег
    const y = surfY + 10;
    g.translate(d.x, y);
    g.fillStyle = 'rgba(95,125,190,0.5)';
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, -6, 4.5, 0, Math.PI * 2);
    g.moveTo(0, -1);
    g.quadraticCurveTo(-24, -8, -28, 2);
    g.quadraticCurveTo(-14, 2, -8, 4);
    g.lineTo(-11, 16);
    g.lineTo(11, 16);
    g.lineTo(8, 4);
    g.quadraticCurveTo(14, 2, 28, 2);
    g.quadraticCurveTo(24, -8, 0, -1);
    g.fill();
    g.stroke();
  }
  g.restore();
}

export function drawProjectile(g: CanvasRenderingContext2D, p: Projectile): void {
  const r = p.r * (1 + 2.2 * p.z);
  const gr = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#c9d8ee');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
}

/** Брызги снежка на «стекле» экрана: неровная клякса с подтёками, медленно тает. */
export function drawSplat(g: CanvasRenderingContext2D, s: Splat): void {
  const fade = s.t < 12 ? 1 : Math.max(0, 1 - (s.t - 12) / 12);
  if (fade <= 0) return;
  const r = new Rng(s.seed);
  g.save();
  g.globalAlpha = 0.92 * fade;
  // подтёки: короткие, широкие, с каплей на конце
  g.fillStyle = 'rgba(240,247,255,0.9)';
  for (const d of s.drips) {
    const x = s.x + d.dx * 0.8;
    const len = s.r * 0.3 + d.len * 1.4;
    const w = d.w * 1.6;
    g.beginPath();
    g.roundRect(x - w / 2, s.y, w, len, w / 2);
    g.fill();
    g.beginPath();
    g.arc(x, s.y + len, w * 0.65, 0, Math.PI * 2);
    g.fill();
  }
  // клякса: гладкий контур по сглаженным точкам
  const N = 12;
  const pts: [number, number][] = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const rr = s.r * r.range(0.82, 1.08) * (1 - 0.15 * Math.min(1, s.t / 20));
    pts.push([s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr * 0.85]);
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let k = 0; k < N; k++) {
    const p0 = pts[k];
    const p1 = pts[(k + 1) % N];
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    if (k === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  const p0 = pts[0];
  const p1 = pts[1];
  g.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(150,180,220,0.45)';
  g.lineWidth = 1;
  g.stroke();
  // мелкие брызги вокруг
  for (let k = 0; k < 7; k++) {
    const a = r.range(0, Math.PI * 2);
    const d = s.r * r.range(1.2, 1.9);
    g.beginPath();
    g.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.85, r.range(1, 2.6), 0, Math.PI * 2);
    g.fill();
  }
  // блик «стекла» (капля тает — становится прозрачнее в центре)
  g.fillStyle = `rgba(200,225,255,${(0.25 * Math.min(1, s.t / 10)).toFixed(3)})`;
  g.beginPath();
  g.ellipse(s.x - s.r * 0.25, s.y - s.r * 0.2, s.r * 0.35, s.r * 0.2, -0.4, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** «Резинка» рогатки: от точки нажатия к курсору + пунктир траектории. */
export function drawSlingshot(g: CanvasRenderingContext2D, ax: number, ay: number, x: number, y: number, k: number): void {
  g.save();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(x, y);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, 6, 0, Math.PI * 2);
  g.fill();
  let px = x;
  let py = y;
  let vx = (ax - x) * k;
  let vy = (ay - y) * k;
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 18; i++) {
    for (let s = 0; s < 3; s++) {
      vy += 700 / 60;
      px += vx / 60;
      py += vy / 60;
    }
    g.beginPath();
    g.arc(px, py, 1.8 + (i / 18) * 2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Снег на верхней кромке окна — только на видимых (не перекрытых) участках. */
export function drawLedge(g: CanvasRenderingContext2D, l: Ledge): void {
  const c = l.cols;
  for (const [a, b] of l.segs) {
    const i0 = Math.max(0, Math.floor((a - l.x) / LCOL));
    const i1 = Math.min(c.length - 1, Math.ceil((b - l.x) / LCOL));
    let any = false;
    for (let i = i0; i <= i1; i++) if (c[i] > 0.4) any = true;
    if (!any) continue;
    g.beginPath();
    g.moveTo(l.x + i0 * LCOL, l.y + 1);
    for (let i = i0; i <= i1; i++) {
      const h = (c[Math.max(i0, i - 1)] + 2 * c[i] + c[Math.min(i1, i + 1)]) / 4;
      g.lineTo(l.x + i * LCOL, l.y - h);
    }
    g.lineTo(l.x + i1 * LCOL, l.y + 1);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = 'rgba(120,150,200,0.45)';
    g.lineWidth = 1;
    g.stroke();
  }
}

export type { EffectsModule };
