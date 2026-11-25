// Снег на верхних краях окон Windows. Прямоугольники и видимые (не перекрытые) отрезки верхних кромок
// приходят из main (помощник Windows API). Когда окно двигают/закрывают — снег с него осыпается. Чистый TS.
import type { Scene, SceneModule } from './scene';
import type { Flake } from './snowfall';
import { depositRidge } from './tools';

export interface LedgeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  top: [number, number][];
}

export interface Ledge {
  id: string;
  x: number;
  y: number;
  w: number;
  segs: [number, number][];
  /** Высота снега по колонкам шириной LCOL px. */
  cols: Float32Array;
}

export const LCOL = 3;
const MAXH = 16;

export class LedgeModule implements SceneModule {
  ledges = new Map<string, Ledge>();
  enabled = false;

  constructor(private scene: Scene) {}

  /** Новые прямоугольники окон. */
  update(rects: LedgeRect[]): void {
    if (!this.enabled) return;
    const seen = new Set<string>();
    for (const r of rects) {
      seen.add(r.id);
      const l = this.ledges.get(r.id);
      if (l && Math.abs(l.x - r.x) < 2 && Math.abs(l.y - r.y) < 2 && Math.abs(l.w - r.w) < 2) {
        l.segs = r.top;
        continue;
      }
      // окно сдвинули/изменили — снег осыпается
      if (l) this.drop(l);
      this.ledges.set(r.id, { id: r.id, x: r.x, y: r.y, w: r.w, segs: r.top, cols: new Float32Array(Math.max(1, Math.ceil(r.w / LCOL))) });
    }
    for (const [id, l] of this.ledges) {
      if (!seen.has(id)) {
        this.drop(l);
        this.ledges.delete(id);
      }
    }
  }

  clear(): void {
    for (const l of this.ledges.values()) this.drop(l);
    this.ledges.clear();
  }

  /** Снег с кромки падает вниз частицами-носителями (и ложится на землю). */
  drop(l: Ledge): void {
    const sc = this.scene;
    const r = sc.rng;
    let acc = 0;
    for (let i = 0; i < l.cols.length; i++) {
      acc += l.cols[i] * LCOL;
      l.cols[i] = 0;
      if (acc > 20 || (i === l.cols.length - 1 && acc > 0)) {
        if (sc.particles.length < 900) sc.particles.push({ kind: 'carrier', vol: acc, x: l.x + i * LCOL, y: l.y - 3, vx: r.range(-20, 20), vy: r.range(0, 40), life: 0, maxLife: 30, r: r.range(1.5, 3) });
        acc = 0;
      }
    }
  }

  private visibleAt(l: Ledge, x: number): boolean {
    for (const [a, b] of l.segs) if (x >= a && x <= b) return true;
    return false;
  }

  catchFlake(f: Flake): boolean {
    if (!this.enabled) return false;
    for (const l of this.ledges.values()) {
      if (f.x < l.x || f.x > l.x + l.w) continue;
      const i = Math.min(l.cols.length - 1, Math.floor((f.x - l.x) / LCOL));
      const top = l.y - l.cols[i];
      if (f.y < top - 2 || f.y > l.y + 6) continue;
      if (!this.visibleAt(l, f.x)) continue;
      l.cols[i] = Math.min(MAXH, l.cols[i] + (Math.PI * f.r * f.r * 0.35) / LCOL);
      return true;
    }
    return false;
  }

  step(_dt: number): void {
    if (!this.enabled) return;
    // осыпание по углу откоса вдоль кромки; с краёв снег срывается вниз
    for (const l of this.ledges.values()) {
      const c = l.cols;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < c.length - 1; i++) {
          const d = c[i] - c[i + 1];
          if (Math.abs(d) > 1.6) {
            const t = (Math.abs(d) - 1.6) * 0.5 * Math.sign(d);
            c[i] -= t;
            c[i + 1] += t;
          }
        }
      }
      // на краях снег копится до 5 px, лишнее срывается комком раз в несколько кадров
      for (const i of [0, c.length - 1]) {
        if (c[i] > 7) {
          const ex = c[i] - 5;
          c[i] = 5;
          const x = l.x + i * LCOL + (i === 0 ? -4 : 4);
          const sc = this.scene;
          depositRidge(sc.field, x, 4, ex * LCOL);
          if (sc.particles.length < 900) sc.particles.push({ kind: 'chunk', x, y: l.y - 2, vx: i === 0 ? -20 : 20, vy: 0, life: 0, maxLife: 1.5, r: 2.5 });
        }
      }
    }
  }

  testInfo(): Record<string, unknown> {
    let total = 0;
    for (const l of this.ledges.values()) for (const v of l.cols) total += v * LCOL;
    return { ledges: this.ledges.size, ledgeSnow: Math.round(total) };
  }
}
