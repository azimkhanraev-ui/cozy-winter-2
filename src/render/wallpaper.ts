// Зимние обои рабочего стола, нарисованные кодом (оригинальная графика): горы, лес, деревня, сияние.
// Рисуются один раз в разрешении экрана, поэтому здесь можно позволить себе детальную отрисовку.
import { Rng, fbm1 } from '../sim/rng';
import type { WallpaperScene } from '../shared/settings';

type G = CanvasRenderingContext2D;

function skyGrad(g: G, W: number, H: number, stops: [number, string][]): void {
  const gr = g.createLinearGradient(0, 0, 0, H);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}

/** Количество мелких деталей — пропорционально площади (на миниатюре их меньше). */
const perArea = (n: number, W: number, H: number) => Math.max(3, Math.round((n * W * H) / (1920 * 1080)));

function stars(g: G, W: number, H: number, n: number, r: Rng, maxY = 0.6): void {
  n = perArea(n, W, H);
  for (let i = 0; i < n; i++) {
    const x = r.range(0, W);
    const y = Math.pow(r.next(), 1.6) * H * maxY;
    const s = r.chance(0.06) ? r.range(1.4, 2.2) : r.range(0.4, 1.1);
    g.globalAlpha = r.range(0.35, 1);
    g.fillStyle = r.chance(0.15) ? '#cfe0ff' : '#ffffff';
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
    if (s > 1.4) {
      g.globalAlpha *= 0.4;
      g.fillRect(x - s * 3, y - 0.4, s * 6, 0.8);
      g.fillRect(x - 0.4, y - s * 3, 0.8, s * 6);
    }
  }
  g.globalAlpha = 1;
}

function moon(g: G, x: number, y: number, R: number): void {
  const halo = g.createRadialGradient(x, y, R * 0.8, x, y, R * 7);
  halo.addColorStop(0, 'rgba(220,230,255,0.28)');
  halo.addColorStop(1, 'rgba(220,230,255,0)');
  g.fillStyle = halo;
  g.fillRect(x - R * 7, y - R * 7, R * 14, R * 14);
  const b = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
  b.addColorStop(0, '#fffdf2');
  b.addColorStop(1, '#d8dcec');
  g.fillStyle = b;
  g.beginPath();
  g.arc(x, y, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(150,158,185,0.3)';
  for (const [dx, dy, r] of [[-0.3, -0.15, 0.22], [0.25, 0.2, 0.16], [0.05, -0.42, 0.1], [-0.12, 0.38, 0.13], [0.4, -0.2, 0.08]]) {
    g.beginPath();
    g.arc(x + dx * R, y + dy * R, r * R, 0, Math.PI * 2);
    g.fill();
  }
}

/** Горный хребет: острые вершины (гребневой шум), снег сверху, теневая грань каждого пика справа. */
function mountains(g: G, W: number, H: number, baseY: number, amp: number, seed: number, rock: string, shade: string, snowLine: number, haze = 0): void {
  const step = Math.max(2, W / 700);
  const heightAt = (x: number) => {
    // «гребни»: 1 - |шум| даёт острые вершины, сумма октав — разнообразие
    let h = 0;
    let a = 1;
    let f = 1 / (W * 0.16);
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      h += (1 - Math.abs(fbm1(x * f, seed + o * 7, 1))) * a;
      norm += a;
      a *= 0.5;
      f *= 2.1;
    }
    h /= norm;
    return baseY - amp * Math.pow(Math.max(0, h), 1.6) * 1.25;
  };
  const pts: [number, number][] = [];
  for (let x = -20; x <= W + 20; x += step) pts.push([x, heightAt(x)]);
  const body = new Path2D();
  body.moveTo(-20, H);
  for (const [x, y] of pts) body.lineTo(x, y);
  body.lineTo(W + 20, H);
  body.closePath();
  let top = baseY;
  for (const [, y] of pts) top = Math.min(top, y);
  const gr = g.createLinearGradient(0, top, 0, baseY);
  gr.addColorStop(0, '#f7faff');
  gr.addColorStop(snowLine, '#dfe7f5');
  gr.addColorStop(Math.min(1, snowLine + 0.22), rock);
  gr.addColorStop(1, rock);
  g.fillStyle = gr;
  g.fill(body);
  g.save();
  g.clip(body);
  // Гранёная светотень (свет слева): у каждого пика правая грань — от вершины до следующей седловины —
  // закрашивается одним многоугольником с диагональной «складкой» от вершины к подножию.
  const n = pts.length;
  const sm = pts.map((_, k) => {
    let acc = 0;
    let c = 0;
    for (let d = -3; d <= 3; d++) {
      const q = pts[Math.max(0, Math.min(n - 1, k + d))];
      acc += q[1];
      c++;
    }
    return acc / c;
  });
  const peaks: number[] = [];
  const valleys: number[] = [];
  const R = Math.max(3, Math.round(W / 140 / step));
  for (let k = R; k < n - R; k++) {
    let isMin = true; // минимум y = вершина
    let isMax = true;
    for (let d = -R; d <= R; d++) {
      if (sm[k + d] < sm[k]) isMin = false;
      if (sm[k + d] > sm[k]) isMax = false;
    }
    if (isMin) peaks.push(k);
    if (isMax) valleys.push(k);
  }
  for (const p of peaks) {
    const v = valleys.find((k) => k > p);
    if (v === undefined) continue;
    const [px, py] = pts[p];
    const [vx, vy] = pts[v];
    if (vy - py < amp * 0.06) continue; // невыраженный пик
    const foot = Math.min(baseY + amp * 0.1, vy + (vy - py) * 1.2);
    const crease = px + (vx - px) * 0.22;
    const poly = new Path2D();
    poly.moveTo(px, py);
    for (let k = p + 1; k <= v; k++) poly.lineTo(pts[k][0], pts[k][1]);
    poly.lineTo(vx + (vx - px) * 0.1, foot);
    poly.lineTo(crease, foot);
    poly.closePath();
    const sg = g.createLinearGradient(0, py, 0, foot);
    sg.addColorStop(0, shade);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.5;
    g.fillStyle = sg;
    g.fill(poly);
    // вторичная складка на освещённой стороне
    g.globalAlpha = 0.12;
    g.strokeStyle = shade;
    g.lineWidth = Math.max(1, amp * 0.006);
    g.beginPath();
    g.moveTo(px, py + 2);
    g.lineTo(px - (vx - px) * 0.35, py + (foot - py) * 0.55);
    g.stroke();
  }
  g.globalAlpha = 1;
  // мягкая подсветка гребня
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  pts.forEach(([x, y], k) => (k ? g.lineTo(x, y + 1) : g.moveTo(x, y + 1)));
  g.stroke();
  if (haze > 0) {
    const hz = g.createLinearGradient(0, baseY - amp * 0.6, 0, baseY);
    hz.addColorStop(0, 'rgba(205,218,242,0)');
    hz.addColorStop(1, `rgba(205,218,242,${haze})`);
    g.fillStyle = hz;
    g.fillRect(0, baseY - amp * 0.6, W, amp * 0.6 + 2);
  }
  g.restore();
}

/** Дымка между планами (глубина). */
function mist(g: G, W: number, y: number, h: number, a: number): void {
  const gr = g.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, 'rgba(190,205,235,0)');
  gr.addColorStop(1, `rgba(190,205,235,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, y - h, W, h);
}

/** Заснеженные холмы. */
function hills(g: G, W: number, H: number, y: number, amp: number, seed: number, c1: string, c2: string): void {
  const path = new Path2D();
  path.moveTo(-10, H);
  for (let x = -10; x <= W + 10; x += 6) path.lineTo(x, y - amp * (0.5 + 0.5 * fbm1(x / (W * 0.3), seed, 3)));
  path.lineTo(W + 10, H);
  path.closePath();
  const gr = g.createLinearGradient(0, y - amp, 0, H);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fill(path);
}

/** Ель со снегом на ярусах. */
function pine(g: G, x: number, baseY: number, h: number, dark: string, light: string, snow: number, r: Rng): void {
  const w = h * r.range(0.34, 0.44);
  g.fillStyle = '#3b2a1f';
  g.fillRect(x - h * 0.025, baseY - h * 0.12, h * 0.05, h * 0.12);
  const tiers = Math.max(3, Math.round(h / 28));
  for (let k = 0; k < tiers; k++) {
    const t0 = k / tiers;
    const yb = baseY - h * (0.08 + t0 * 0.8);
    const yt = baseY - h * (0.08 + (t0 + 1.6 / tiers) * 0.8);
    const half = (w / 2) * (1 - t0 * 0.78);
    const gr = g.createLinearGradient(x - half, 0, x + half, 0);
    gr.addColorStop(0, light);
    gr.addColorStop(0.55, dark);
    gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - half, yb);
    g.lineTo(x, Math.max(baseY - h, yt));
    g.lineTo(x + half, yb);
    g.quadraticCurveTo(x, yb + h * 0.03, x - half, yb);
    g.fill();
    if (snow > 0) {
      g.fillStyle = 'rgba(245,249,255,0.95)';
      g.beginPath();
      g.moveTo(x - half * 0.95, yb - 1);
      g.quadraticCurveTo(x - half * 0.4, yb - h * 0.035 * snow, x, Math.max(baseY - h, yt) + 2);
      g.quadraticCurveTo(x + half * 0.2, yb - h * 0.05 * snow, x + half * 0.35, yb - h * 0.02);
      g.quadraticCurveTo(x - half * 0.2, yb + 1, x - half * 0.95, yb - 1);
      g.fill();
    }
  }
}

function forestRow(g: G, W: number, baseY: number, hMin: number, hMax: number, gap: number, dark: string, light: string, snow: number, seed: number): void {
  const r = new Rng(seed);
  for (let x = -gap; x < W + gap; x += gap * r.range(0.55, 1.15)) {
    pine(g, x + r.range(-gap * 0.3, gap * 0.3), baseY + r.range(-hMin * 0.06, hMin * 0.1), r.range(hMin, hMax), dark, light, snow, r);
  }
}

function house(g: G, x: number, baseY: number, w: number, h: number, wall: string, roof: string, lit: number, r: Rng): void {
  const roofH = h * 0.55;
  g.fillStyle = wall;
  g.fillRect(x - w / 2, baseY - h, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  for (let y = baseY - h + 5; y < baseY; y += Math.max(4, h * 0.1)) {
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.lineTo(x + w / 2, y);
    g.stroke();
  }
  // окна
  const nw = Math.max(1, Math.round(w / (h * 0.55)));
  for (let i = 0; i < nw; i++) {
    const wx = x - w / 2 + ((i + 0.5) * w) / nw;
    const ww = h * 0.22;
    const wy = baseY - h * 0.7;
    const on = r.chance(0.85) ? lit : 0;
    if (on > 0) {
      const halo = g.createRadialGradient(wx, wy + ww * 0.6, 0, wx, wy + ww * 0.6, ww * 4);
      halo.addColorStop(0, `rgba(255,190,90,${0.35 * on})`);
      halo.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = halo;
      g.fillRect(wx - ww * 4, wy - ww * 3.4, ww * 8, ww * 8);
    }
    g.fillStyle = on > 0 ? '#ffd27a' : '#2a3650';
    g.fillRect(wx - ww / 2, wy, ww, ww * 1.2);
    g.strokeStyle = '#4a3020';
    g.lineWidth = 1.5;
    g.strokeRect(wx - ww / 2, wy, ww, ww * 1.2);
    g.beginPath();
    g.moveTo(wx, wy);
    g.lineTo(wx, wy + ww * 1.2);
    g.stroke();
  }
  // крыша со снегом
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(x - w / 2 - w * 0.08, baseY - h + 2);
  g.lineTo(x, baseY - h - roofH);
  g.lineTo(x + w / 2 + w * 0.08, baseY - h + 2);
  g.closePath();
  g.fill();
  g.fillStyle = '#f4f8ff';
  g.beginPath();
  g.moveTo(x - w / 2 - w * 0.1, baseY - h + 3);
  g.lineTo(x, baseY - h - roofH - h * 0.06);
  g.lineTo(x + w / 2 + w * 0.1, baseY - h + 3);
  g.lineTo(x + w / 2 + w * 0.04, baseY - h + 3 + h * 0.07);
  g.lineTo(x, baseY - h - roofH + h * 0.08);
  g.lineTo(x - w / 2 - w * 0.04, baseY - h + 3 + h * 0.07);
  g.closePath();
  g.fill();
  // труба с дымком
  const cx = x + w * 0.22;
  g.fillStyle = '#6e3a2e';
  g.fillRect(cx - w * 0.05, baseY - h - roofH * 0.75, w * 0.1, roofH * 0.45);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(200,206,222,${0.22 - k * 0.03})`;
    g.beginPath();
    g.arc(cx + k * w * 0.05, baseY - h - roofH * 0.8 - k * h * 0.18, h * (0.07 + k * 0.03), 0, Math.PI * 2);
    g.fill();
  }
}

function aurora(g: G, W: number, H: number, seed: number, strength: number): void {
  const r = new Rng(seed);
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 3; band++) {
    const base = H * (0.14 + band * 0.08);
    const len = H * (0.2 + r.range(0, 0.12));
    const hue = band === 1 ? [140, 90, 255] : [60, 255, 170];
    for (let x = 0; x < W; x += 2) {
      const y = base + Math.sin(x / (W * 0.16) + band * 2) * H * 0.05 + fbm1(x / (W * 0.05), seed + band, 2) * H * 0.03;
      const a = strength * (0.18 + 0.22 * Math.max(0, fbm1(x / (W * 0.07), seed + 50 + band, 3))) * (band === 1 ? 0.6 : 1);
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
      gr.addColorStop(0.15, `rgba(${hue[0]},${hue[1]},${hue[2]},${a.toFixed(3)})`);
      gr.addColorStop(1, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
      g.fillStyle = gr;
      g.fillRect(x, y, 2, len);
    }
  }
  g.restore();
}

function fallingSnow(g: G, W: number, H: number, n: number, seed: number): void {
  const r = new Rng(seed);
  n = perArea(n, W, H);
  const k = Math.max(0.35, Math.min(1, W / 1920));
  g.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) {
    g.globalAlpha = r.range(0.25, 0.85);
    g.beginPath();
    g.arc(r.range(0, W), r.range(0, H), r.range(0.6, 2.2) * k, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Нарисовать обои. Размеры — в физических пикселях экрана. */
export function drawWallpaper(g: G, W: number, H: number, scene: WallpaperScene): void {
  const r = new Rng(1234 + scene.length * 17);
  const S = Math.min(W, H * 1.78) / 1920; // масштаб деталей
  if (scene === 'mountains') {
    skyGrad(g, W, H, [[0, '#0f1a3a'], [0.45, '#3a3f7a'], [0.7, '#c98aa0'], [0.82, '#f4c3a0']]);
    stars(g, W, H, 260, r, 0.45);
    moon(g, W * 0.78, H * 0.17, 34 * S);
    mountains(g, W, H, H * 0.84, H * 0.5, 11, '#5a6489', '#232850', 0.38, 0.55);
    mountains(g, W, H, H * 0.88, H * 0.32, 23, '#424a72', '#1c2142', 0.3, 0.45);
    hills(g, W, H, H * 0.9, H * 0.08, 31, '#eef3fc', '#c7d3ea');
    forestRow(g, W, H * 0.9, 50 * S, 110 * S, 46 * S, '#1c3b34', '#2f5a4c', 1, 5);
    hills(g, W, H, H * 0.98, H * 0.05, 37, '#f6f9ff', '#d5e0f2');
    fallingSnow(g, W, H, 400, 2);
  } else if (scene === 'forest') {
    skyGrad(g, W, H, [[0, '#070d22'], [0.5, '#16234a'], [1, '#2c3d6e']]);
    stars(g, W, H, 380, r, 0.55);
    moon(g, W * 0.3, H * 0.2, 40 * S);
    // лунный свет сквозь деревья
    const beam = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, H * 0.9);
    beam.addColorStop(0, 'rgba(170,190,255,0.18)');
    beam.addColorStop(1, 'rgba(170,190,255,0)');
    g.fillStyle = beam;
    g.fillRect(0, 0, W, H);
    mountains(g, W, H, H * 0.67, H * 0.2, 39, '#3a4a78', '#18214a', 0.45, 0.45);
    hills(g, W, H, H * 0.66, H * 0.05, 41, '#3a4a78', '#2a3866');
    forestRow(g, W, H * 0.68, 50 * S, 110 * S, 26 * S, '#22365a', '#34507a', 0.6, 7);
    mist(g, W, H * 0.7, H * 0.08, 0.35);
    hills(g, W, H, H * 0.76, H * 0.05, 43, '#a9badd', '#8798c4');
    forestRow(g, W, H * 0.79, 110 * S, 220 * S, 90 * S, '#16343a', '#2a5552', 1, 8);
    mist(g, W, H * 0.82, H * 0.06, 0.25);
    hills(g, W, H, H * 0.9, H * 0.06, 47, '#eef3fd', '#c3d1ea');
    pine(g, W * 0.07, H * 1.0, 560 * S, '#0d2422', '#1d3f39', 1, new Rng(91));
    pine(g, W * 0.93, H * 1.02, 620 * S, '#0d2422', '#1d3f39', 1, new Rng(92));
    pine(g, W * 0.82, H * 0.98, 380 * S, '#0f2a28', '#20453f', 1, new Rng(93));
    fallingSnow(g, W, H, 600, 3);
  } else if (scene === 'village') {
    skyGrad(g, W, H, [[0, '#101a3e'], [0.55, '#3c4c8a'], [0.85, '#8a86b8'], [1, '#c4b3c8']]);
    stars(g, W, H, 180, r, 0.4);
    moon(g, W * 0.85, H * 0.15, 30 * S);
    mountains(g, W, H, H * 0.76, H * 0.3, 61, '#6a74a0', '#343b68', 0.4, 0.55);
    hills(g, W, H, H * 0.74, H * 0.08, 63, '#cfd9f0', '#a9b9dc');
    forestRow(g, W, H * 0.76, 40 * S, 80 * S, 30 * S, '#25404a', '#3a5c62', 0.9, 11);
    hills(g, W, H, H * 0.82, H * 0.05, 67, '#eaf0fc', '#c6d3ec');
    // домики вдоль улицы
    const rr = new Rng(77);
    const walls = ['#8b5a3c', '#a0522d', '#7a4a6a', '#5d6f8a', '#9a6b3f'];
    const roofs = ['#4b3f5c', '#5a2e2e', '#2f4050', '#463a5a'];
    for (let x = W * 0.06; x < W * 0.96; x += W * rr.range(0.1, 0.16)) {
      const hh = rr.range(60, 95) * S;
      house(g, x, H * 0.86 + rr.range(-6, 6) * S, hh * rr.range(1.1, 1.6), hh, walls[rr.int(0, walls.length - 1)], roofs[rr.int(0, roofs.length - 1)], 1, rr);
      if (rr.chance(0.6)) pine(g, x + hh * 1.2, H * 0.87, rr.range(80, 150) * S, '#1f4038', '#2f6050', 1, rr);
    }
    hills(g, W, H, H * 0.95, H * 0.04, 69, '#f6f9ff', '#d7e2f3');
    // фонари вдоль дороги
    for (let x = W * 0.12; x < W; x += W * 0.22) {
      const y = H * 0.93;
      const halo = g.createRadialGradient(x, y - 70 * S, 0, x, y - 70 * S, 90 * S);
      halo.addColorStop(0, 'rgba(255,210,140,0.45)');
      halo.addColorStop(1, 'rgba(255,210,140,0)');
      g.fillStyle = halo;
      g.fillRect(x - 90 * S, y - 160 * S, 180 * S, 180 * S);
      g.fillStyle = '#2d3340';
      g.fillRect(x - 2 * S, y - 70 * S, 4 * S, 70 * S);
      g.fillStyle = '#ffe3a8';
      g.fillRect(x - 7 * S, y - 82 * S, 14 * S, 14 * S);
    }
    fallingSnow(g, W, H, 500, 4);
  } else if (scene === 'aurora') {
    skyGrad(g, W, H, [[0, '#030817'], [0.5, '#0b1838'], [1, '#14284a']]);
    stars(g, W, H, 500, r, 0.6);
    aurora(g, W, H, 91, 1);
    mountains(g, W, H, H * 0.63, H * 0.26, 93, '#3a4668', '#141a36', 0.35, 0.25);
    // замёрзшее озеро с отражением сияния
    const lake = g.createLinearGradient(0, H * 0.62, 0, H * 0.8);
    lake.addColorStop(0, '#1a2f52');
    lake.addColorStop(1, '#0e1a33');
    g.fillStyle = lake;
    g.fillRect(0, H * 0.62, W, H * 0.2);
    g.save();
    g.globalAlpha = 0.35;
    g.translate(0, H * 1.24);
    g.scale(1, -1);
    g.beginPath();
    g.rect(0, H * 0.42, W, H * 0.2);
    g.clip();
    aurora(g, W, H, 91, 0.7);
    g.restore();
    // блики льда
    g.strokeStyle = 'rgba(200,230,255,0.15)';
    g.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const y = H * 0.64 + r.range(0, H * 0.16);
      const x = r.range(0, W);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + r.range(40, 160) * S, y + r.range(-2, 2));
      g.stroke();
    }
    hills(g, W, H, H * 0.86, H * 0.07, 97, '#dfe8f8', '#aebfde');
    forestRow(g, W, H * 0.9, 80 * S, 170 * S, 55 * S, '#0f2a2a', '#1f4a44', 1, 13);
    hills(g, W, H, H * 0.98, H * 0.04, 99, '#eef3fc', '#c9d6ec');
    fallingSnow(g, W, H, 250, 5);
  }
}

/** Названия для настроек. */
export const WALLPAPER_NAMES: Record<WallpaperScene, [string, string]> = {
  none: ['Мои обои', 'My wallpaper'],
  mountains: ['Горы на закате', 'Mountains at dusk'],
  forest: ['Зимний лес', 'Winter forest'],
  village: ['Деревня вечером', 'Village evening'],
  aurora: ['Северное сияние', 'Northern lights'],
};
