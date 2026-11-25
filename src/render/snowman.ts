// Отрисовка снеговика кодом: шары с тенями и бликами, угольки, морковка, улыбка, пуговицы, руки-ветки,
// ведро/цилиндр/вязаная шапка, шарф, иногда метла. Анимации: моргание, взмах рукой, покачивание, «подпрыгивание».
import type { Snowman, Look } from '../sim/snowman';
import { ballSprites, drawBallShadow } from './balls';
import { Rng } from '../sim/rng';

const COAL = '#24242c';

function coal(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = COAL;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.9, 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2);
  g.fill();
}

function sphere(g: CanvasRenderingContext2D, x: number, y: number, r: number, dpr: number): void {
  const sp = ballSprites(r, dpr);
  const R = Math.max(3, Math.round(r));
  const s = r / R;
  const half = (R + sp.pad) * s;
  g.drawImage(sp.body, x - half, y - half, half * 2, half * 2);
  g.drawImage(sp.tex, x - half, y - half, half * 2, half * 2);
}

/** Ветка-рука из точки (x,y) под углом a (рад), длиной L. */
function branch(g: CanvasRenderingContext2D, x: number, y: number, a: number, L: number, seed: number): [number, number] {
  const r = new Rng(seed);
  g.strokeStyle = '#6b4a2b';
  g.lineCap = 'round';
  g.lineWidth = Math.max(2, L * 0.07);
  const mx = x + Math.cos(a) * L * 0.55 + r.range(-2, 2);
  const my = y + Math.sin(a) * L * 0.55 + r.range(-2, 2);
  const ex = x + Math.cos(a + r.range(-0.15, 0.15)) * L;
  const ey = y + Math.sin(a + r.range(-0.15, 0.15)) * L;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(mx, my, ex, ey);
  g.stroke();
  // веточки-пальцы
  g.lineWidth = Math.max(1.2, L * 0.04);
  for (const [t, da, l] of [[0.62, -0.7, 0.32], [0.8, 0.6, 0.26], [1, -0.25, 0.22], [1, 0.35, 0.2]] as const) {
    const bx = x + (ex - x) * t;
    const by = y + (ey - y) * t;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a + da) * L * l, by + Math.sin(a + da) * L * l);
    g.stroke();
  }
  return [ex, ey];
}

function darker(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const gg = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${gg},${b})`;
}

/** Шапка: низ шапки в (x,y) (макушка головы), ширина по радиусу головы. */
export function drawHat(g: CanvasRenderingContext2D, look: Look, x: number, y: number, rh: number, snow: number): void {
  const w = rh * 1.25;
  g.save();
  g.translate(x, y);
  if (look.hat === 'bucket') {
    // ведро вверх дном: широкое внизу
    const h = rh * 0.95;
    const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    grd.addColorStop(0, '#8f9aab');
    grd.addColorStop(0.35, '#d8dee8');
    grd.addColorStop(0.6, '#aab4c4');
    grd.addColorStop(1, '#6f7a8c');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-w / 2, 2);
    g.lineTo(-w * 0.36, -h);
    g.lineTo(w * 0.36, -h);
    g.lineTo(w / 2, 2);
    g.closePath();
    g.fill();
    g.strokeStyle = '#5d6676';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#7d8798';
    g.fillRect(-w / 2 - 2, -2, w + 4, 5);
    // ручка
    g.strokeStyle = '#4b5361';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, -h * 0.25, w * 0.42, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    if (snow > 0.05) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(0, -h, w * 0.37, 2 + snow * rh * 0.25, 0, Math.PI, 0);
      g.fill();
    }
  } else if (look.hat === 'top') {
    const h = rh * 1.05;
    g.fillStyle = '#1f1f26';
    g.beginPath();
    g.ellipse(0, 0, w * 0.62, rh * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-w * 0.36, -h, w * 0.72, h);
    g.fillStyle = look.hatColor;
    g.fillRect(-w * 0.36, -rh * 0.32, w * 0.72, rh * 0.18);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(-w * 0.26, -h + 2, w * 0.1, h - 6);
    if (snow > 0.05) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(0, -h, w * 0.38, 2 + snow * rh * 0.22, 0, Math.PI, 0);
      g.fill();
      g.beginPath();
      g.ellipse(-w * 0.45, -2, w * 0.12, 1 + snow * 2, 0, Math.PI, 0);
      g.fill();
    }
  } else if (look.hat === 'knit') {
    const h = rh * 0.9;
    g.fillStyle = look.hatColor;
    g.beginPath();
    g.moveTo(-w * 0.52, 2);
    g.quadraticCurveTo(-w * 0.55, -h * 1.1, 0, -h);
    g.quadraticCurveTo(w * 0.55, -h * 1.1, w * 0.52, 2);
    g.closePath();
    g.fill();
    // полоски
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = Math.max(1.5, rh * 0.08);
    for (const t of [0.35, 0.6]) {
      g.beginPath();
      g.moveTo(-w * 0.5, -h * t);
      g.quadraticCurveTo(0, -h * t - rh * 0.08, w * 0.5, -h * t);
      g.stroke();
    }
    // отворот
    g.fillStyle = darker(look.hatColor, 0.75);
    g.beginPath();
    g.roundRect(-w * 0.56, -rh * 0.18, w * 1.12, rh * 0.26, rh * 0.1);
    g.fill();
    // помпон
    const pr = rh * 0.22;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, -h - pr * 0.6, pr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(160,185,225,0.5)';
    g.beginPath();
    g.arc(pr * 0.3, -h - pr * 0.4, pr * 0.5, 0, Math.PI * 2);
    g.fill();
    if (snow > 0.05) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(-w * 0.18, -h * 0.95, w * 0.22, 1.5 + snow * rh * 0.15, -0.3, Math.PI, 0);
      g.fill();
    }
  }
  g.restore();
}

/** Нарисовать снеговика. t — время (с). */
export function drawSnowman(g: CanvasRenderingContext2D, s: Snowman, t: number, dpr: number, groundY: number): void {
  const L = s.look;
  const [p1, p2, p3] = s.parts;
  const f = L.face;
  // тень (не качается)
  drawBallShadow(g, { x: s.x, y: groundY - p1.r, r: p1.r * 1.15 }, groundY);
  g.save();
  g.translate(s.x, s.y);
  // «подпрыгивание» при рождении, сжатие при таянии
  const bounce = s.born < 1.2 ? Math.sin(s.born * 13) * Math.exp(-s.born * 4) * 0.16 : 0;
  const melt = 1 - s.melting * 0.55;
  g.rotate(s.sway);
  g.scale((1 - bounce * 0.6) * melt, (1 + bounce) * melt * (1 - s.melting * 0.25));
  if (s.melting > 0) g.globalAlpha = 1 - s.melting * 0.5;

  const mid = { x: p2.dx, y: p2.dy };
  const head = { x: p3.dx, y: p3.dy };
  const armLen = p2.r * 1.35;

  // метла (позади, у руки, противоположной взгляду)
  if (L.broom) {
    const bx = mid.x - f * p2.r * 1.25;
    g.strokeStyle = '#8a5a2b';
    g.lineWidth = Math.max(2, p2.r * 0.09);
    g.beginPath();
    g.moveTo(bx + f * p2.r * 0.1, mid.y - p2.r * 1.1);
    g.lineTo(bx - f * p1.r * 0.15, -p1.r * 0.15);
    g.stroke();
    g.fillStyle = '#d9b45a';
    g.beginPath();
    const tx = bx - f * p1.r * 0.15;
    g.moveTo(tx - p1.r * 0.08, -p1.r * 0.2);
    g.lineTo(tx - p1.r * 0.3, 0);
    g.lineTo(tx + p1.r * 0.3, 0);
    g.lineTo(tx + p1.r * 0.08, -p1.r * 0.2);
    g.closePath();
    g.fill();
    g.strokeStyle = '#a8832c';
    g.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(tx + k * p1.r * 0.03, -p1.r * 0.18);
      g.lineTo(tx + k * p1.r * 0.11, -1);
      g.stroke();
    }
  }

  // руки-ветки (за телом): одна машет, когда курсор рядом
  const shoulderY = mid.y - p2.r * 0.15;
  const waveA = s.wave * (0.55 + 0.45 * Math.sin(s.wavePhase));
  branch(g, mid.x - p2.r * 0.7, shoulderY, Math.PI + 0.35 - (f < 0 ? waveA * 1.3 : 0), armLen, L.armSeed);
  branch(g, mid.x + p2.r * 0.7, shoulderY, -0.35 + (f > 0 ? -waveA * 1.3 : 0), armLen, L.armSeed + 7);

  // тело
  sphere(g, 0, p1.dy, p1.r, dpr);
  sphere(g, mid.x, mid.y, p2.r, dpr);
  sphere(g, head.x, head.y, p3.r, dpr);
  // мягкая тень под средним и верхним шаром (контакт)
  for (const [a, b] of [[p1, p2], [p2, p3]] as const) {
    const cy = b.dy + b.r * 0.9;
    const gr = g.createRadialGradient(b.dx, cy, 0, b.dx, cy, b.r * 0.8);
    gr.addColorStop(0, 'rgba(110,140,190,0.28)');
    gr.addColorStop(1, 'rgba(110,140,190,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(b.dx, cy, b.r * 0.8, b.r * 0.25, 0, 0, Math.PI * 2);
    g.fill();
    void a;
  }

  // пуговицы-угольки
  const nb = L.buttons;
  for (let k = 0; k < nb; k++) {
    const yy = mid.y - p2.r * 0.35 + (k * p2.r * 0.95) / Math.max(1, nb - 1) * (nb > 2 ? 0.85 : 0.6);
    const onBottom = yy > mid.y + p2.r * 0.7;
    coal(g, mid.x + f * p2.r * 0.12, onBottom ? p1.dy - p1.r * 0.55 : yy, Math.max(1.8, p2.r * 0.09));
  }

  // шарф: лента на шее
  const neckY = head.y + p3.r * 0.82;
  const sw = p3.r * 1.15;
  const sh = Math.max(4, p3.r * 0.32);
  g.fillStyle = L.scarfColor;
  g.beginPath();
  g.roundRect(head.x - sw, neckY - sh / 2, sw * 2, sh, sh / 2);
  g.fill();
  g.fillStyle = L.scarfStripe;
  for (let k = -2; k <= 2; k++) g.fillRect(head.x + k * sw * 0.38 - 1.5, neckY - sh / 2 + 1, 3, sh - 2);
  // хвост шарфа, колышется
  const tailSw = Math.sin(t * 2.3 + s.seed) * 0.12 + s.sway * 1.5;
  g.save();
  g.translate(head.x - f * sw * 0.55, neckY);
  g.rotate(tailSw * -f);
  g.fillStyle = L.scarfColor;
  g.beginPath();
  g.roundRect(-sh * 0.45, 0, sh * 0.9, p2.r * 0.9, 3);
  g.fill();
  g.fillStyle = L.scarfStripe;
  g.fillRect(-sh * 0.45, p2.r * 0.35, sh * 0.9, 3);
  g.strokeStyle = L.scarfColor;
  g.lineWidth = 1.5;
  for (let k = -2; k <= 2; k++) {
    g.beginPath();
    g.moveTo(k * sh * 0.18, p2.r * 0.9);
    g.lineTo(k * sh * 0.22, p2.r * 0.9 + 5);
    g.stroke();
  }
  g.restore();

  // лицо (смещено в сторону взгляда)
  const fx = head.x + f * p3.r * 0.12;
  const eyeY = head.y - p3.r * 0.18;
  const er = Math.max(1.6, p3.r * 0.1);
  if (s.blink > 0) {
    g.strokeStyle = COAL;
    g.lineWidth = Math.max(1.2, er * 0.6);
    for (const ex of [-0.33, 0.33]) {
      g.beginPath();
      g.moveTo(fx + ex * p3.r - er, eyeY);
      g.lineTo(fx + ex * p3.r + er, eyeY);
      g.stroke();
    }
  } else {
    coal(g, fx - p3.r * 0.33, eyeY, er);
    coal(g, fx + p3.r * 0.33, eyeY, er);
  }
  // рот
  const my = head.y + p3.r * 0.38;
  if (L.mouth === 'o') coal(g, fx, my, er * 0.8);
  else {
    const n = L.mouth === 'grin' ? 7 : 5;
    const span = L.mouth === 'grin' ? 0.9 : 0.7;
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.5 - span / 2 + (span * k) / (n - 1));
      coal(g, fx + Math.cos(a) * p3.r * 0.42, my - p3.r * 0.22 + Math.sin(a) * p3.r * 0.22, er * 0.55);
    }
  }
  // нос
  const ny = head.y + p3.r * 0.08;
  if (L.nose === 'button') {
    g.fillStyle = '#ff8c2b';
    g.beginPath();
    g.arc(fx + f * p3.r * 0.05, ny, er * 1.1, 0, Math.PI * 2);
    g.fill();
  } else {
    const len = p3.r * (L.nose === 'long' ? 1.0 : 0.62);
    const base = p3.r * 0.13;
    const nx0 = fx + f * p3.r * 0.02;
    const grd = g.createLinearGradient(nx0, ny - base, nx0, ny + base);
    grd.addColorStop(0, '#ffa040');
    grd.addColorStop(1, '#e06a10');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(nx0, ny - base);
    g.lineTo(nx0 + f * len, ny + base * 0.25);
    g.lineTo(nx0, ny + base);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(150,70,10,0.6)';
    g.lineWidth = 1;
    for (const k of [0.3, 0.55]) {
      g.beginPath();
      g.moveTo(nx0 + f * len * k, ny - base * (1 - k) + 1);
      g.lineTo(nx0 + f * len * k, ny + base * (1 - k) * 0.8);
      g.stroke();
    }
  }
  // шапка (если не сбита)
  if (s.hatOff <= 0 && L.hat !== 'none') drawHat(g, L, head.x - f * p3.r * 0.05, head.y - p3.r * 0.72, p3.r, s.hatSnow);
  else if (L.hat === 'none' && s.hatSnow > 0.05) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(head.x, head.y - p3.r * 0.92, p3.r * 0.55, 1.5 + s.hatSnow * p3.r * 0.25, 0, Math.PI, 0);
    g.fill();
  }
  g.restore();
  g.globalAlpha = 1;

  // сбитая шапка лежит рядом на снегу
  if (s.hatOff > 0 && L.hat !== 'none') {
    const hx = s.x - f * (p1.r + p3.r * 1.2);
    g.save();
    g.translate(hx, groundY - 1);
    g.rotate(-f * 1.2);
    drawHat(g, L, 0, 0, p3.r, 0);
    g.restore();
  }
}

/** Тёплый отсвет ночью (рисуется в слое glow). */
export function drawSnowmanGlow(g: CanvasRenderingContext2D, s: Snowman, night: number): void {
  if (night < 0.2) return;
  const p = s.parts;
  const cx = s.x + p[1].dx + s.look.face * p[1].r * 0.5;
  const cy = s.y + p[1].dy;
  const R = (p[0].r + p[1].r + p[2].r) * 1.3;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  gr.addColorStop(0, `rgba(255,190,120,${(0.16 * night).toFixed(3)})`);
  gr.addColorStop(1, 'rgba(255,190,120,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.globalCompositeOperation = 'source-over';
}
