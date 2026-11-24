// Спрайты хлопьев, нарисованные кодом и закэшированные в offscreen-canvas.
import { FlakeType } from '../sim/snowfall';
import { Rng } from '../sim/rng';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Во сколько раз спрайт больше «радиуса» хлопья (диаметр отрисовки = r * scale). */
  scale: number;
}

const VARIANTS = 3;

function mk(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function soft(): HTMLCanvasElement {
  const S = 32;
  const [c, g] = mk(S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(250,253,255,0.95)');
  gr.addColorStop(0.6, 'rgba(235,244,255,0.45)');
  gr.addColorStop(1, 'rgba(235,244,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

function crystal(v: number): HTMLCanvasElement {
  const S = 64;
  const [c, g] = mk(S);
  const r = new Rng(1000 + v * 77);
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineCap = 'round';
  g.shadowColor = 'rgba(200,225,255,0.9)';
  g.shadowBlur = 3;
  const L = S * 0.42;
  const branches = [r.range(0.35, 0.5), r.range(0.6, 0.78)];
  const blen = [r.range(0.22, 0.36), r.range(0.14, 0.24)];
  const plate = v === 2;
  for (let a = 0; a < 6; a++) {
    g.save();
    g.rotate((a * Math.PI) / 3);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -L);
    g.stroke();
    g.lineWidth = 2;
    for (let k = 0; k < branches.length; k++) {
      const y = -L * branches[k];
      const bl = L * blen[k];
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(-bl * 0.75, y - bl * 0.7);
      g.moveTo(0, y);
      g.lineTo(bl * 0.75, y - bl * 0.7);
      g.stroke();
    }
    g.restore();
  }
  if (plate) {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    for (let a = 0; a < 6; a++) {
      const ang = (a * Math.PI) / 3 + Math.PI / 6;
      g.lineTo(Math.cos(ang) * L * 0.3, Math.sin(ang) * L * 0.3);
    }
    g.closePath();
    g.fill();
  }
  return c;
}

function fluffy(v: number): HTMLCanvasElement {
  const S = 48;
  const [c, g] = mk(S);
  const r = new Rng(2000 + v * 31);
  const n = r.int(5, 8);
  for (let k = 0; k < n; k++) {
    const a = r.range(0, Math.PI * 2);
    const d = r.range(0, S * 0.18);
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d;
    const rad = r.range(S * 0.12, S * 0.24);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.6, 'rgba(240,247,255,0.45)');
    gr.addColorStop(1, 'rgba(240,247,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function glitter(): HTMLCanvasElement {
  const S = 32;
  const [c, g] = mk(S);
  const h = S / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h * 0.45);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(220,235,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // четырёхлучевой блик
  for (const [w, len] of [[1.4, h], [1, h * 0.6]] as const) {
    g.save();
    g.translate(h, h);
    if (len < h) g.rotate(Math.PI / 4);
    const lg = g.createLinearGradient(-len, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(-len, -w / 2, len * 2, w);
    g.rotate(Math.PI / 2);
    g.fillRect(-len, -w / 2, len * 2, w);
    g.restore();
  }
  return c;
}

function blurred(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const pad = Math.ceil(px * 3);
  const [c, g] = mk(src.width + pad * 2);
  g.filter = `blur(${px}px)`;
  g.drawImage(src, pad, pad);
  return c;
}

/** sprites[layerBlurClass][type][variant]; класс 0 — резкие, 1 — размытые (ближний слой). */
export class FlakeSprites {
  readonly sets: Sprite[][][] = [];
  constructor() {
    const base: Sprite[][] = [];
    base[FlakeType.Soft] = [{ canvas: soft(), scale: 2.6 }];
    base[FlakeType.Crystal] = [0, 1, 2].map((v) => ({ canvas: crystal(v), scale: 2.3 }));
    base[FlakeType.Fluffy] = [0, 1, 2].map((v) => ({ canvas: fluffy(v), scale: 2.8 }));
    base[FlakeType.Glitter] = [{ canvas: glitter(), scale: 3.6 }];
    this.sets.push(base);
    const blur = base.map((arr) =>
      arr.map((s) => {
        const px = s.canvas.width / 14;
        const c = blurred(s.canvas, px);
        return { canvas: c, scale: (s.scale * c.width) / s.canvas.width };
      }),
    );
    this.sets.push(blur);
  }
  get(type: FlakeType, seed: number, blur: boolean): Sprite {
    const arr = this.sets[blur ? 1 : 0][type];
    return arr[seed % Math.min(VARIANTS, arr.length)];
  }
}

/** Маленький спрайт искорки на снегу. */
export function sparkleSprite(): HTMLCanvasElement {
  return glitter();
}
