// Отрисовка снежного покрова: гладкая кривая Catmull-Rom, градиент, голубые тени во впадинах,
// освещение склонов, фактура свежего снега. Перерисовывается в offscreen-canvas с ограничением частоты.
import { SnowField, COL_W } from '../sim/terrain';
import { hash1 } from '../sim/rng';

const STEP = 6; // px между опорными точками кривой

export class GroundRenderer {
  readonly canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private bandH = 0;
  private width = 0;
  private dpr = 1;
  private lastRev = -1;
  private lastDraw = -1e9;
  /** Сглаженные высоты опорных точек (используются и для искорок). */
  pts: Float32Array = new Float32Array(0);

  ensure(width: number, minBand: number, dpr: number): void {
    const band = Math.ceil(Math.max(60, minBand) / 40) * 40;
    if (width === this.width && band <= this.bandH && dpr === this.dpr) return;
    this.width = width;
    this.bandH = Math.max(band, this.bandH);
    this.dpr = dpr;
    this.canvas.width = Math.ceil(width * dpr);
    this.canvas.height = Math.ceil(this.bandH * dpr);
    this.lastRev = -1;
  }

  get height(): number {
    return this.bandH;
  }

  /** Перерисовать, если карта изменилась (не чаще чем раз в minIntervalMs). */
  update(field: SnowField, now: number, minIntervalMs = 66, force = false): void {
    if (!force && (field.revision === this.lastRev || now - this.lastDraw < minIntervalMs)) return;
    this.lastRev = field.revision;
    this.lastDraw = now;
    this.redraw(field);
  }

  private sample(field: SnowField): Float32Array {
    const W = this.width;
    const n = Math.ceil(W / STEP) + 3;
    const raw = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const x = (k - 1) * STEP;
      const c0 = field.col(x - STEP / 2);
      const c1 = field.col(x + STEP / 2);
      let s = 0;
      let m = 0;
      for (let i = c0; i <= c1; i++) {
        s += field.visibleHeight(i);
        m++;
      }
      raw[k] = s / Math.max(1, m);
    }
    // лёгкое сглаживание 1-2-1 (убирает «ступеньки» колонок)
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const a = raw[Math.max(0, k - 1)];
      const b = raw[k];
      const c = raw[Math.min(n - 1, k + 1)];
      out[k] = (a + 2 * b + c) / 4;
    }
    return out;
  }

  private curve(g: CanvasRenderingContext2D, h: Float32Array, base: number, offset = 0): void {
    const n = h.length;
    const X = (k: number) => (k - 1) * STEP;
    const Y = (k: number) => base - h[Math.max(0, Math.min(n - 1, k))] + offset;
    g.moveTo(X(0), Y(0));
    for (let k = 0; k < n - 1; k++) {
      const x0 = X(k - 1), y0 = Y(k - 1);
      const x1 = X(k), y1 = Y(k);
      const x2 = X(k + 1), y2 = Y(k + 1);
      const x3 = X(k + 2), y3 = Y(k + 2);
      g.bezierCurveTo(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
    }
  }

  private redraw(field: SnowField): void {
    const g = this.g;
    const W = this.width;
    const B = this.bandH;
    const h = this.sample(field);
    this.pts = h;
    const n = h.length;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, B);

    let peak = 0;
    for (let k = 0; k < n; k++) peak = Math.max(peak, h[k]);
    if (peak < 0.3) return;

    // --- тело снега: замкнутый контур (низ — земля, верх — кривая) ---
    const shape = new Path2D();
    shape.moveTo(-STEP, B + 2);
    shape.lineTo(-STEP, B - h[0]);
    this.curve(shapeProxy(shape), h, B);
    shape.lineTo(W + STEP * 2, B + 2);
    shape.closePath();

    const top = B - peak;
    const grad = g.createLinearGradient(0, top, 0, B);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#f3f8fd');
    grad.addColorStop(0.8, '#e2ecf7');
    grad.addColorStop(1, '#d3e0ef');
    g.fillStyle = grad;
    g.fill(shape);

    g.save();
    g.clip(shape);

    // --- освещение склонов и тени во впадинах: градиент вдоль x по опорным точкам ---
    const lit = g.createLinearGradient(-STEP, 0, (n - 2) * STEP, 0);
    const ao = g.createLinearGradient(-STEP, 0, (n - 2) * STEP, 0);
    const R = 7; // радиус для оценки вогнутости (в точках)
    for (let k = 0; k < n; k++) {
      const a = h[Math.max(0, k - 1)];
      const c = h[Math.min(n - 1, k + 1)];
      const slope = (c - a) / (2 * STEP); // >0: поверхность поднимается вправо → склон смотрит влево, к свету
      let avg = 0;
      let m = 0;
      for (let d = -R; d <= R; d++) {
        const j = k + d;
        if (j < 0 || j >= n) continue;
        avg += h[j];
        m++;
      }
      avg /= m;
      const concave = Math.max(0, Math.min(1, (avg - h[k]) / 10)); // впадина
      const t = k / (n - 1);
      const s = Math.max(-1, Math.min(1, slope * 1.6));
      if (s >= 0) lit.addColorStop(t, `rgba(255,255,255,${(0.15 + 0.55 * s).toFixed(3)})`);
      else lit.addColorStop(t, `rgba(150,178,228,${(0.12 + 0.45 * -s).toFixed(3)})`);
      const thin = h[k] < 6 ? (6 - h[k]) / 6 : 0;
      ao.addColorStop(t, `rgba(128,160,220,${(0.06 + 0.4 * concave + 0.12 * thin).toFixed(3)})`);
    }
    g.lineJoin = 'round';
    // широкая мягкая «окклюзия» во впадинах
    g.strokeStyle = ao;
    g.lineWidth = 34;
    g.beginPath();
    this.curve(g, h, B, 10);
    g.stroke();
    // направленный свет
    g.strokeStyle = lit;
    g.lineWidth = 12;
    g.beginPath();
    this.curve(g, h, B, 3);
    g.stroke();

    // нижняя глубина (у самой земли снег плотнее и голубее)
    const deep = g.createLinearGradient(0, B - 14, 0, B);
    deep.addColorStop(0, 'rgba(170,195,232,0)');
    deep.addColorStop(1, 'rgba(160,188,230,0.35)');
    g.fillStyle = deep;
    g.fillRect(0, B - 14, W, 14);

    // --- фактура: пушистые точки свежего снега и редкие голубые крапинки старого ---
    for (let x = 1; x < W; x += 3) {
      const i = Math.min(field.n - 1, Math.round(x / COL_W));
      const sn = field.snow[i];
      if (sn < 1.5) continue;
      const surfY = B - field.heightAt(x);
      const fr = field.fresh[i] / (sn + 1e-6);
      const hsh = hash1(x, 77);
      if (hsh < 0.35 + 0.4 * fr) {
        const dy = 1 + hash1(x, 91) * Math.min(10, sn * 0.6);
        g.fillStyle = `rgba(255,255,255,${(0.35 + 0.5 * fr).toFixed(2)})`;
        g.fillRect(x, surfY + dy, 1.2, 1.2);
      } else if (hsh > 0.93) {
        const dy = 2 + hash1(x, 13) * Math.min(20, sn * 0.8);
        g.fillStyle = 'rgba(150,180,225,0.35)';
        g.fillRect(x, surfY + dy, 1.4, 1.4);
      }
    }
    g.restore();

    // --- кромка: светлая линия + едва заметный контур (видно и на светлых обоях) ---
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(110,135,175,0.28)';
    g.lineWidth = 1;
    g.beginPath();
    this.curve(g, h, B, -0.8);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 1.3;
    g.beginPath();
    this.curve(g, h, B, 0.2);
    g.stroke();
  }

  draw(ctx: CanvasRenderingContext2D, groundY: number): void {
    if (!this.width) return;
    ctx.drawImage(this.canvas, 0, groundY - this.bandH, this.width, this.bandH);
  }
}

/** Path2D поддерживает moveTo/bezierCurveTo с той же сигнатурой — используем как контекст. */
function shapeProxy(p: Path2D): CanvasRenderingContext2D {
  return {
    moveTo: (x: number, y: number) => p.lineTo(x, y),
    bezierCurveTo: (a: number, b: number, c: number, d: number, e: number, f: number) => p.bezierCurveTo(a, b, c, d, e, f),
  } as unknown as CanvasRenderingContext2D;
}
