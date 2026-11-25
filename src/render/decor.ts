// Декор: домик с тёплыми окнами и трубой, ёлки со снежными шапками, фонарь, забор, гирлянда.
// Геометрия согласована с sim/decor.ts (topAt): снег рисуется ровно там, где он «лежит» в симуляции.
import type { DecorItem, DecorModule } from '../sim/decor';
import { Rng } from '../sim/rng';

function snowCap(g: CanvasRenderingContext2D, pts: [number, number][], thick: number, seed: number): void {
  if (thick < 0.5 || pts.length < 2) return;
  const r = new Rng(seed);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) g.lineTo(x, y);
  // верхняя кромка снега: неровная, толще в середине
  for (let k = pts.length - 1; k >= 0; k--) {
    const [x, y] = pts[k];
    const edge = k === 0 || k === pts.length - 1 ? 0.35 : 1;
    g.lineTo(x, y - thick * edge * r.range(0.8, 1.15));
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(150,180,220,0.5)';
  g.lineWidth = 0.8;
  g.stroke();
}

export function drawHouse(g: CanvasRenderingContext2D, it: DecorItem, w: number, h: number, H: number, windowLight: number): void {
  const x = it.x;
  const eave = H - h * 0.55;
  const ridge = H - h;
  const ww = w * 0.42;
  // стены из брёвен
  g.fillStyle = '#8b5a3c';
  g.fillRect(x - ww, eave, ww * 2, H - eave);
  g.strokeStyle = 'rgba(60,35,20,0.45)';
  g.lineWidth = 1;
  for (let y = eave + 6; y < H; y += Math.max(5, h * 0.06)) {
    g.beginPath();
    g.moveTo(x - ww, y);
    g.lineTo(x + ww, y);
    g.stroke();
  }
  // окна
  const winW = w * 0.17;
  const winH = h * 0.2;
  for (const wx of [x - ww * 0.55, x + ww * 0.45]) {
    const wy = eave + (H - eave) * 0.18;
    g.fillStyle = '#5b3a26';
    g.fillRect(wx - winW / 2 - 3, wy - 3, winW + 6, winH + 6);
    const glass = g.createLinearGradient(0, wy, 0, wy + winH);
    const wl = windowLight;
    glass.addColorStop(0, wl > 0.1 ? `rgb(${Math.round(80 + 175 * wl)},${Math.round(110 + 110 * wl)},${Math.round(150 - 70 * wl)})` : '#7fa6cf');
    glass.addColorStop(1, wl > 0.1 ? `rgb(${Math.round(70 + 170 * wl)},${Math.round(80 + 90 * wl)},${Math.round(90 - 50 * wl)})` : '#4e7aa6');
    g.fillStyle = glass;
    g.fillRect(wx - winW / 2, wy, winW, winH);
    g.strokeStyle = '#5b3a26';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(wx, wy);
    g.lineTo(wx, wy + winH);
    g.moveTo(wx - winW / 2, wy + winH / 2);
    g.lineTo(wx + winW / 2, wy + winH / 2);
    g.stroke();
    // снег на подоконнике
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(wx, wy + winH + 3, winW / 2 + 4, 2.5 + it.snow * 2, 0, Math.PI, 0);
    g.fill();
  }
  // дверь
  g.fillStyle = '#5b3a26';
  g.beginPath();
  g.roundRect(x - w * 0.06, H - h * 0.33, w * 0.13, h * 0.33, [4, 4, 0, 0]);
  g.fill();
  g.fillStyle = '#e8c35a';
  g.beginPath();
  g.arc(x + w * 0.04, H - h * 0.17, 1.8, 0, Math.PI * 2);
  g.fill();
  // труба
  g.fillStyle = '#9a4b3a';
  g.fillRect(x + w * 0.18, H - h * 0.98, w * 0.09, h * 0.3);
  g.fillStyle = '#7a3a2c';
  g.fillRect(x + w * 0.17, H - h * 0.99, w * 0.11, h * 0.05);
  // крыша
  g.fillStyle = '#4b3f5c';
  g.beginPath();
  g.moveTo(x - w / 2, eave + 4);
  g.lineTo(x, ridge);
  g.lineTo(x + w / 2, eave + 4);
  g.closePath();
  g.fill();
  g.strokeStyle = '#3a2f48';
  g.lineWidth = 2;
  g.stroke();
  // снег на крыше
  const t = (2 + it.snow * 12) * (w / 150);
  snowCap(g, [[x - w / 2 - 2, eave + 4], [x - w / 4, (eave + ridge) / 2 + 2], [x, ridge], [x + w / 4, (eave + ridge) / 2 + 2], [x + w / 2 + 2, eave + 4]], t, it.seed);
  // сосульки
  if (it.snow > 0.3) {
    g.fillStyle = 'rgba(220,240,255,0.9)';
    const r = new Rng(it.seed + 5);
    for (let k = 0; k < 7; k++) {
      const ix = x - w / 2 + 6 + r.range(0, w - 12);
      const len = r.range(3, 10) * (w / 150) * it.snow;
      const iy = eave + 4 + (Math.abs(ix - x) < w * 0.4 ? -((w / 2 - Math.abs(ix - x)) * (h * 0.45)) / (w / 2) : 0);
      if (Math.abs(ix - x) < w * 0.42) continue; // только у свесов
      g.beginPath();
      g.moveTo(ix - 2, iy);
      g.lineTo(ix + 2, iy);
      g.lineTo(ix, iy + len);
      g.fill();
    }
  }
}

export function drawHouseGlow(g: CanvasRenderingContext2D, it: DecorItem, w: number, h: number, H: number, windowLight: number): void {
  if (windowLight < 0.05) return;
  const eave = H - h * 0.55;
  const ww = w * 0.42;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const wx of [it.x - ww * 0.55, it.x + ww * 0.45]) {
    const wy = eave + (H - eave) * 0.18 + h * 0.1;
    const R = w * 0.35;
    const gr = g.createRadialGradient(wx, wy, 0, wx, wy, R);
    gr.addColorStop(0, `rgba(255,190,90,${(0.32 * windowLight).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = gr;
    g.fillRect(wx - R, wy - R, R * 2, R * 2);
  }
  g.restore();
}

export function drawTree(g: CanvasRenderingContext2D, it: DecorItem, w: number, h: number, H: number, t: number, wind: number): void {
  const x = it.x;
  const sway = Math.sin(t * 1.3 + it.seed) * 0.01 + wind * 0.00008;
  g.save();
  g.translate(x, H);
  g.rotate(sway);
  g.fillStyle = '#6b4a2b';
  g.fillRect(-w * 0.07, -h * 0.2, w * 0.14, h * 0.2);
  const tiers = 3;
  for (let k = 0; k < tiers; k++) {
    const yb = -h * (0.15 + k * 0.24);
    const yt = -h * (0.55 + k * 0.15);
    const half = (w / 2) * (1 - k * 0.22);
    const gr = g.createLinearGradient(-half, 0, half, 0);
    gr.addColorStop(0, '#1f6b45');
    gr.addColorStop(0.5, '#2e8b5a');
    gr.addColorStop(1, '#1a5a3a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-half, yb);
    g.quadraticCurveTo(-half * 0.3, yb - (yb - yt) * 0.35, 0, k === tiers - 1 ? -h : yt);
    g.quadraticCurveTo(half * 0.3, yb - (yb - yt) * 0.35, half, yb);
    g.quadraticCurveTo(0, yb + h * 0.04, -half, yb);
    g.fill();
    // снег на ярусе
    const th = (1.5 + it.snow * 7) * (w / 70);
    const top = k === tiers - 1 ? -h : yt;
    snowCap(g, [[-half * 0.92, yb - 2], [-half * 0.45, (yb + top) / 2 + 3], [0, top + 2], [half * 0.45, (yb + top) / 2 + 3], [half * 0.92, yb - 2]], th, it.seed + k * 17);
  }
  g.restore();
}

export function drawLantern(g: CanvasRenderingContext2D, it: DecorItem, w: number, h: number, H: number, light: number): void {
  const x = it.x;
  g.fillStyle = '#2d3340';
  g.fillRect(x - 2.5, H - h, 5, h);
  g.fillRect(x - 6, H - 8, 12, 8);
  // фонарь
  const lw = w * 0.9;
  const lh = h * 0.16;
  const ly = H - h;
  g.fillStyle = light > 0.1 ? `rgba(255,${Math.round(200 + 40 * light)},${Math.round(120 + 40 * light)},1)` : '#c9d8e8';
  g.fillRect(x - lw / 2, ly - lh, lw, lh);
  g.strokeStyle = '#2d3340';
  g.lineWidth = 2;
  g.strokeRect(x - lw / 2, ly - lh, lw, lh);
  g.fillStyle = '#2d3340';
  g.beginPath();
  g.moveTo(x - lw / 2 - 4, ly - lh);
  g.lineTo(x, ly - lh - 10);
  g.lineTo(x + lw / 2 + 4, ly - lh);
  g.closePath();
  g.fill();
  snowCap(g, [[x - lw / 2 - 4, ly - lh], [x, ly - lh - 10], [x + lw / 2 + 4, ly - lh]], 1 + it.snow * 5, it.seed);
}

export function drawLanternGlow(g: CanvasRenderingContext2D, it: DecorItem, w: number, h: number, H: number, light: number): void {
  if (light < 0.05) return;
  const cy = H - h - h * 0.08;
  const R = h * 1.1;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(it.x, cy, 0, it.x, cy, R);
  gr.addColorStop(0, `rgba(255,210,130,${(0.4 * light).toFixed(3)})`);
  gr.addColorStop(0.3, `rgba(255,200,120,${(0.14 * light).toFixed(3)})`);
  gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr;
  g.fillRect(it.x - R, cy - R, R * 2, R * 2);
  // световое пятно на снегу
  const sg = g.createRadialGradient(it.x, H - 4, 0, it.x, H - 4, R * 0.8);
  sg.addColorStop(0, `rgba(255,200,120,${(0.18 * light).toFixed(3)})`);
  sg.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = sg;
  g.beginPath();
  g.ellipse(it.x, H - 4, R * 0.8, R * 0.18, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  void w;
}

export function drawFence(g: CanvasRenderingContext2D, it: DecorItem, w: number, h: number, H: number): void {
  const x0 = it.x - w / 2;
  const posts = Math.max(3, Math.round(w / 28));
  g.fillStyle = '#9b6a43';
  for (const y of [H - h * 0.75, H - h * 0.4]) g.fillRect(x0, y, w, h * 0.12);
  for (let k = 0; k <= posts; k++) {
    const px = x0 + (w * k) / posts;
    g.fillStyle = '#a8764d';
    g.beginPath();
    g.moveTo(px - 4, H);
    g.lineTo(px - 4, H - h * 0.85);
    g.lineTo(px, H - h);
    g.lineTo(px + 4, H - h * 0.85);
    g.lineTo(px + 4, H);
    g.fill();
    snowCap(g, [[px - 5, H - h * 0.85], [px, H - h], [px + 5, H - h * 0.85]], 1 + it.snow * 4, it.seed + k);
  }
  snowCap(g, [[x0, H - h * 0.75], [x0 + w / 2, H - h * 0.75], [x0 + w, H - h * 0.75]], 1 + it.snow * 3, it.seed + 99);
}

/** Гирлянда: провод по цепной линии и лампочки. glow=true — светящиеся лампочки (после тонирования). */
export function drawGarland(g: CanvasRenderingContext2D, d: DecorModule, t: number, brightness: number, glow: boolean): void {
  const gl = d.garland();
  if (!gl) return;
  const { x0, y0, x1, y1 } = gl;
  const sag = Math.max(18, Math.abs(x1 - x0) * 0.18);
  const pt = (u: number): [number, number] => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + Math.sin(Math.PI * u) * sag];
  const colors = ['255,70,70', '80,220,120', '80,150,255', '255,210,60', '230,110,255'];
  const n = Math.max(4, Math.round(Math.abs(x1 - x0) / 16));
  if (!glow) {
    g.strokeStyle = '#2a3326';
    g.lineWidth = 1.4;
    g.beginPath();
    for (let k = 0; k <= 20; k++) {
      const [x, y] = pt(k / 20);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    for (let k = 1; k < n; k++) {
      const [x, y] = pt(k / n);
      g.fillStyle = `rgb(${colors[k % colors.length]})`;
      g.globalAlpha = 0.55 + 0.45 * brightness;
      g.beginPath();
      g.ellipse(x, y + 3, 2.2, 3.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return;
  }
  if (brightness < 0.05) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let k = 1; k < n; k++) {
    const [x, y] = pt(k / n);
    const tw = 0.6 + 0.4 * Math.sin(t * 3 + k * 1.7);
    const a = brightness * tw;
    const R = 11;
    const gr = g.createRadialGradient(x, y + 3, 0, x, y + 3, R);
    gr.addColorStop(0, `rgba(${colors[k % colors.length]},${(0.75 * a).toFixed(3)})`);
    gr.addColorStop(1, `rgba(${colors[k % colors.length]},0)`);
    g.fillStyle = gr;
    g.fillRect(x - R, y + 3 - R, R * 2, R * 2);
  }
  g.restore();
}
