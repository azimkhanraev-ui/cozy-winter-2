// Гирлянда вдоль верхнего края экрана: провисает между креплениями, покачивается от ветра,
// лампочки мерцают / бегут / горят ровно. Спрайты лампочек и ореолов кэшируются по цвету.
import { Rng } from '../sim/rng';

export type GarlandStyle = 'multi' | 'warm' | 'cold' | 'candy';
export type GarlandMode = 'twinkle' | 'chase' | 'steady';

const PALETTES: Record<GarlandStyle, string[]> = {
  multi: ['255,64,64', '60,220,110', '70,150,255', '255,205,50', '220,100,255'],
  warm: ['255,206,130', '255,190,110', '255,220,150'],
  cold: ['180,225,255', '120,190,255', '220,240,255'],
  candy: ['255,60,70', '255,245,240'],
};

interface BulbSprites {
  bulb: HTMLCanvasElement;
  glow: HTMLCanvasElement;
}

const cache = new Map<string, BulbSprites>();

function sprites(rgb: string): BulbSprites {
  const hit = cache.get(rgb);
  if (hit) return hit;
  // лампочка-капля со стеклянным бликом
  const bulb = document.createElement('canvas');
  bulb.width = 16;
  bulb.height = 24;
  const b = bulb.getContext('2d')!;
  b.fillStyle = '#3a3f36';
  b.fillRect(5, 0, 6, 6);
  const gr = b.createRadialGradient(6, 11, 1, 8, 13, 9);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.35, `rgb(${rgb})`);
  gr.addColorStop(1, `rgba(${rgb},0.85)`);
  b.fillStyle = gr;
  b.beginPath();
  b.ellipse(8, 14, 5.5, 8.5, 0, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = 'rgba(255,255,255,0.7)';
  b.beginPath();
  b.ellipse(6, 11, 1.4, 3, -0.3, 0, Math.PI * 2);
  b.fill();
  // ореол
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const g = glow.getContext('2d')!;
  const hg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  hg.addColorStop(0, `rgba(${rgb},0.9)`);
  hg.addColorStop(0.25, `rgba(${rgb},0.35)`);
  hg.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = hg;
  g.fillRect(0, 0, 64, 64);
  const out = { bulb, glow };
  cache.set(rgb, out);
  return out;
}

export interface TopGarlandOpts {
  style: GarlandStyle;
  mode: GarlandMode;
  /** 0..1 */
  brightness: number;
  /** 0..1 — ночью ореолы ярче */
  night: number;
  /** ветер, px/с */
  wind: number;
}

/** Нарисовать гирлянду по верху области шириной W. t — время, с. */
export function drawTopGarland(g: CanvasRenderingContext2D, W: number, t: number, o: TopGarlandOpts): void {
  const span = Math.max(160, Math.min(260, W / 8));
  const nSpans = Math.max(2, Math.round(W / span));
  const sw = W / nSpans;
  const pal = PALETTES[o.style];
  const r = new Rng(7);
  const sway = Math.max(-1, Math.min(1, o.wind / 200));
  // провод: цепная линия между креплениями, провис чуть «дышит»
  const pts: [number, number][] = [];
  const bulbs: { x: number; y: number; a: number; k: number }[] = [];
  let k = 0;
  for (let s = 0; s < nSpans; s++) {
    const x0 = s * sw;
    const sag = 22 + 10 * Math.sin(s * 1.7) + 3 * Math.sin(t * 0.9 + s);
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = x0 + u * sw + Math.sin(Math.PI * u) * sway * 6;
      const y = 3 + Math.sin(Math.PI * u) * sag;
      if (i > 0 || s === 0) pts.push([x, y]);
    }
    // лампочки на пролёте
    const per = Math.max(4, Math.round(sw / 30));
    for (let i = 1; i < per; i++) {
      const u = i / per;
      const x = x0 + u * sw + Math.sin(Math.PI * u) * sway * 6;
      const y = 3 + Math.sin(Math.PI * u) * sag;
      // наклон провода → лампочка висит чуть вбок и качается
      const slope = Math.cos(Math.PI * u) * sag * Math.PI / sw;
      bulbs.push({ x, y, a: Math.atan(slope) * 0.5 + Math.sin(t * 1.6 + k * 0.9) * 0.08 + sway * 0.25, k: k++ });
    }
  }
  g.save();
  // провод
  g.strokeStyle = '#2b3326';
  g.lineWidth = 1.6;
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.stroke();
  // крепления-«крючки» с капелькой снега
  for (let s = 0; s <= nSpans; s++) {
    const x = s * sw;
    g.fillStyle = '#2b3326';
    g.beginPath();
    g.arc(x, 3, 2.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(x, 1.5, 4, 2, 0, Math.PI, 0);
    g.fill();
  }
  // свечение и лампочки
  const glowK = o.brightness * (0.45 + 0.55 * o.night);
  for (const b of bulbs) {
    const rgb = pal[b.k % pal.length];
    let lit: number;
    if (o.mode === 'steady') lit = 1;
    else if (o.mode === 'chase') lit = 0.25 + 0.75 * Math.max(0, Math.cos((b.k * 0.55 - t * 4) % (Math.PI * 2)));
    else lit = 0.45 + 0.55 * Math.max(0, Math.sin(t * (1.3 + (b.k % 5) * 0.35) + r.range(0, 6) + b.k));
    const sp = sprites(rgb);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, glowK * lit);
    const R = 30 + 10 * lit;
    g.drawImage(sp.glow, b.x - R / 2, b.y + 8 - R / 2, R, R);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.55 + 0.45 * lit;
    g.save();
    g.translate(b.x, b.y);
    g.rotate(b.a);
    g.drawImage(sp.bulb, -6, -1, 12, 18);
    g.restore();
  }
  g.globalAlpha = 1;
  g.restore();
}
