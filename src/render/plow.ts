// Снегоуборщик (оригинальный дизайн): жёлтый корпус, кабина, гусеницы, шнек спереди, жёлоб,
// маячок, фары вечером и ночью. Локальные координаты: начало — середина гусениц на земле, нос вправо.
import type { Plow } from '../sim/plow';
import { PLOW_LEN, PLOW_H } from '../sim/plow';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Масштаб/смещение с учётом «полосы» (на заднем плане — дальше и меньше). */
export function plowTransform(p: Plow): { s: number; dy: number; alpha: number } {
  return { s: p.scale * (1 - 0.18 * p.lane), dy: -16 * p.lane * p.scale, alpha: 1 - 0.25 * p.lane };
}

export function drawPlow(g: CanvasRenderingContext2D, p: Plow, t: number): void {
  const { s, dy, alpha } = plowTransform(p);
  const c = p.color;
  g.save();
  g.globalAlpha = alpha;
  g.translate(p.x, p.y + dy);
  g.scale(s * p.dir, s);
  // тень
  g.fillStyle = 'rgba(60,80,120,0.25)';
  g.beginPath();
  g.ellipse(0, 0, PLOW_LEN * 0.55, 6, 0, 0, Math.PI * 2);
  g.fill();
  // жёлоб (сзади сверху)
  g.strokeStyle = shade(c, 0.85);
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-32, -36);
  g.quadraticCurveTo(-40, -70, -56, -76);
  g.stroke();
  g.fillStyle = shade(c, 0.7);
  g.beginPath();
  g.ellipse(-58, -76, 7, 5, -0.4, 0, Math.PI * 2);
  g.fill();
  // кабина
  g.fillStyle = shade(c, 0.92);
  g.beginPath();
  g.roundRect(-30, -PLOW_H, 40, 30, 5);
  g.fill();
  const glass = g.createLinearGradient(-26, -PLOW_H + 4, 6, -40);
  glass.addColorStop(0, '#cfe8ff');
  glass.addColorStop(0.5, '#7fb3e0');
  glass.addColorStop(1, '#3d6a99');
  g.fillStyle = glass;
  g.beginPath();
  g.roundRect(-25, -PLOW_H + 5, 30, 20, 3);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-20, -PLOW_H + 22);
  g.lineTo(-12, -PLOW_H + 8);
  g.stroke();
  g.fillStyle = shade(c, 0.6);
  g.fillRect(-32, -PLOW_H - 3, 44, 4);
  // маячок
  g.fillStyle = '#ff8c1a';
  g.beginPath();
  g.arc(-10, -PLOW_H - 4, 5, Math.PI, 0);
  g.fill();
  // корпус
  const body = g.createLinearGradient(0, -42, 0, -14);
  body.addColorStop(0, shade(c, 1.08));
  body.addColorStop(1, shade(c, 0.8));
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(-50, -40, 82, 25, 6);
  g.fill();
  // капот
  g.beginPath();
  g.roundRect(8, -48, 26, 12, 4);
  g.fill();
  g.fillStyle = shade(c, 0.55);
  g.fillRect(-44, -30, 70, 3);
  // фара
  g.fillStyle = '#fff6d0';
  g.beginPath();
  g.roundRect(30, -46, 5, 7, 2);
  g.fill();
  // гусеницы
  g.fillStyle = '#2b2e35';
  g.beginPath();
  g.roundRect(-52, -18, 86, 18, 9);
  g.fill();
  g.fillStyle = '#4a4f59';
  const tread = (((p.wheel * 10) % 8) + 8) % 8;
  for (let x = -50 + tread; x < 32; x += 8) g.fillRect(x, -2.5, 4, 2.5);
  for (const wx of [-42, -24, -6, 12, 26]) {
    g.fillStyle = '#7b828f';
    g.beginPath();
    g.arc(wx, -9, 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#30343b';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = p.wheel + (k * Math.PI * 2) / 3;
      g.moveTo(wx, -9);
      g.lineTo(wx + Math.cos(a) * 5, -9 + Math.sin(a) * 5);
    }
    g.stroke();
  }
  // шнек (снегоочиститель спереди)
  g.fillStyle = '#9aa3b0';
  g.beginPath();
  g.moveTo(34, -34);
  g.lineTo(58, -34);
  g.quadraticCurveTo(64, -17, 58, 0);
  g.lineTo(34, 0);
  g.closePath();
  g.fill();
  g.fillStyle = '#3a3f48';
  g.beginPath();
  g.roundRect(42, -29, 16, 25, 4);
  g.fill();
  g.strokeStyle = '#c8ced8';
  g.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const yy = -26 + ((((p.wheel * 6 + k * 7) % 21) + 21) % 21);
    g.beginPath();
    g.moveTo(43, yy);
    g.lineTo(57, yy + 4);
    g.stroke();
  }
  // предупреждающие полосы на ноже
  g.save();
  g.beginPath();
  g.rect(34, -6, 26, 6);
  g.clip();
  for (let k = 0; k < 8; k++) {
    g.fillStyle = k % 2 ? '#222' : '#f4c430';
    g.beginPath();
    g.moveTo(30 + k * 5, 0);
    g.lineTo(35 + k * 5, -6);
    g.lineTo(40 + k * 5, -6);
    g.lineTo(35 + k * 5, 0);
    g.fill();
  }
  g.restore();
  // гудок — звуковые волны
  if (p.horn > 0) {
    g.strokeStyle = `rgba(255,255,255,${(p.horn * 1.4).toFixed(2)})`;
    g.lineWidth = 2;
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.arc(36, -44, 6 + k * 7 + (0.6 - p.horn) * 20, -0.7, 0.7);
      g.stroke();
    }
  }
  g.restore();
  void t;
}

/** Светящееся: маячок (всегда, ярче в темноте) и фары (вечером/ночью). Слой glow. */
export function drawPlowLights(g: CanvasRenderingContext2D, p: Plow, t: number, night: number): void {
  const { s, dy, alpha } = plowTransform(p);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = alpha;
  // маячок: вращающийся отблеск
  const bx = p.x + p.dir * -10 * s;
  const by = p.y + dy - (PLOW_H + 5) * s;
  const flash = Math.max(0, Math.sin(t * 7));
  const R = (14 + 30 * night) * s;
  const gr = g.createRadialGradient(bx, by, 0, bx, by, R);
  gr.addColorStop(0, `rgba(255,150,40,${(0.25 + 0.6 * flash).toFixed(3)})`);
  gr.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = gr;
  g.fillRect(bx - R, by - R, R * 2, R * 2);
  // фары
  if (night > 0.15) {
    const hx = p.x + p.dir * 35 * s;
    const hy = p.y + dy - 43 * s;
    const len = 260 * s;
    const cone = g.createLinearGradient(hx, hy, hx + p.dir * len, hy);
    cone.addColorStop(0, `rgba(255,245,200,${(0.38 * night).toFixed(3)})`);
    cone.addColorStop(1, 'rgba(255,245,200,0)');
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(hx, hy - 3 * s);
    g.lineTo(hx + p.dir * len, hy - 30 * s);
    g.lineTo(hx + p.dir * len, hy + 45 * s);
    g.lineTo(hx, hy + 3 * s);
    g.closePath();
    g.fill();
    const hg = g.createRadialGradient(hx, hy, 0, hx, hy, 10 * s);
    hg.addColorStop(0, `rgba(255,250,220,${(0.9 * night).toFixed(3)})`);
    hg.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = hg;
    g.fillRect(hx - 10 * s, hy - 10 * s, 20 * s, 20 * s);
  }
  g.restore();
}
