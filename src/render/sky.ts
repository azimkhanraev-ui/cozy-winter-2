// Небо: градиент, мерцающие звёзды, луна, солнце, северное сияние. Рисуется на своём холсте ~10 раз/с.
import type { Light } from '../ui/app';
import { Rng } from '../sim/rng';

export class SkyRenderer {
  private stars: { x: number; y: number; r: number; ph: number; sp: number }[] = [];
  private w = 0;
  private h = 0;

  private ensure(W: number, H: number): void {
    if (W === this.w && H === this.h) return;
    this.w = W;
    this.h = H;
    const r = new Rng(777);
    const n = Math.round((W * H) / 9000);
    this.stars = [];
    for (let k = 0; k < n; k++) {
      const y = Math.pow(r.next(), 1.4) * H * 0.7;
      this.stars.push({ x: r.range(0, W), y, r: r.chance(0.08) ? r.range(1.3, 2) : r.range(0.5, 1.2), ph: r.range(0, 6.28), sp: r.range(0.6, 2.2) });
    }
  }

  /** skyAlpha и celestial — множители (в оверлее небо по умолчанию прозрачное, светила приглушены). */
  draw(g: CanvasRenderingContext2D, W: number, H: number, L: Light, t: number, skyMul: number, celestial: number): void {
    this.ensure(W, H);
    const sa = L.skyAlpha * skyMul;
    if (sa > 0.01) {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, L.skyTop);
      gr.addColorStop(1, L.skyBottom);
      g.globalAlpha = sa;
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (celestial <= 0.01) return;
    // северное сияние
    const au = L.aurora * celestial;
    if (au > 0.02) {
      g.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 3; b++) {
        const base = H * (0.12 + b * 0.07);
        const amp = H * 0.05;
        const ph = t * (0.12 + b * 0.05) + b * 2;
        const band = H * (0.16 - b * 0.03);
        g.beginPath();
        const N = 48;
        for (let k = 0; k <= N; k++) {
          const x = (W * k) / N;
          const y = base + Math.sin(x / (W * 0.18) + ph) * amp + Math.sin(x / (W * 0.07) - ph * 1.7) * amp * 0.3;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        for (let k = N; k >= 0; k--) {
          const x = (W * k) / N;
          const y = base + band + Math.sin(x / (W * 0.2) + ph * 0.8) * amp * 0.6;
          g.lineTo(x, y);
        }
        g.closePath();
        const gr = g.createLinearGradient(0, base - amp, 0, base + band + amp);
        const c = b === 1 ? '120,90,255' : '60,255,170';
        gr.addColorStop(0, `rgba(${c},0)`);
        gr.addColorStop(0.35, `rgba(${c},${(0.22 * au).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    // звёзды
    const st = L.stars * celestial;
    if (st > 0.02) {
      g.fillStyle = '#ffffff';
      for (const s of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
        g.globalAlpha = st * tw * 0.9;
        g.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
        if (s.r > 1.3 && tw > 0.85) {
          g.globalAlpha = st * 0.35;
          g.fillRect(s.x - s.r * 2, s.y - 0.4, s.r * 4, 0.8);
          g.fillRect(s.x - 0.4, s.y - s.r * 2, 0.8, s.r * 4);
        }
      }
      g.globalAlpha = 1;
    }
    // луна: дуга с 18 до 6
    const mo = L.moon * celestial;
    const mp = ((L.hour - 18 + 24) % 24) / 12;
    if (mo > 0.02 && mp <= 1) {
      const x = W * (0.08 + 0.84 * mp);
      const y = H * 0.1 + (1 - Math.sin(Math.PI * mp)) * H * 0.22;
      const R = Math.max(16, Math.min(34, W / 60));
      const halo = g.createRadialGradient(x, y, R, x, y, R * 5);
      halo.addColorStop(0, `rgba(220,230,255,${(0.22 * mo).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(220,230,255,0)');
      g.fillStyle = halo;
      g.fillRect(x - R * 5, y - R * 5, R * 10, R * 10);
      g.globalAlpha = mo;
      const body = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.2, x, y, R);
      body.addColorStop(0, '#fffdf2');
      body.addColorStop(1, '#d9dcea');
      g.fillStyle = body;
      g.beginPath();
      g.arc(x, y, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(160,165,190,0.35)';
      for (const [dx, dy, r] of [[-0.3, -0.15, 0.22], [0.25, 0.2, 0.16], [0.05, -0.4, 0.1], [-0.1, 0.4, 0.12]]) {
        g.beginPath();
        g.arc(x + dx * R, y + dy * R, r * R, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // солнце: дуга с 6 до 18 (мягкое свечение, не слепит поверх рабочего стола)
    const su = L.sun * celestial;
    const sp = (L.hour - 6) / 12;
    if (su > 0.02 && sp >= 0 && sp <= 1) {
      const x = W * (0.08 + 0.84 * sp);
      const y = H * 0.08 + (1 - Math.sin(Math.PI * sp)) * H * 0.3;
      const R = Math.max(22, Math.min(46, W / 45));
      const warm = sp < 0.2 || sp > 0.8 ? '255,180,120' : '255,240,200';
      const glow = g.createRadialGradient(x, y, 0, x, y, R * 6);
      glow.addColorStop(0, `rgba(${warm},${(0.45 * su).toFixed(3)})`);
      glow.addColorStop(0.18, `rgba(${warm},${(0.18 * su).toFixed(3)})`);
      glow.addColorStop(1, `rgba(${warm},0)`);
      g.fillStyle = glow;
      g.fillRect(x - R * 6, y - R * 6, R * 12, R * 12);
      g.globalAlpha = Math.min(1, su * 0.9);
      g.fillStyle = `rgb(${warm})`;
      g.beginPath();
      g.arc(x, y, R * 0.55, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  }
}
