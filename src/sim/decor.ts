// Декор: домик с окнами и трубой, ёлки, фонарь, забор, гирлянда. Снег ложится на декор,
// декор — препятствие для ветра и шаров. Чистый TS (геометрия и состояние; отрисовка отдельно).
import type { Scene, SceneModule } from './scene';
import type { Flake } from './snowfall';
import type { StaticRect, BallWorld } from './physics';
import { COL_W } from './terrain';
import { Rng } from './rng';

export type DecorKind = 'house' | 'tree' | 'lantern' | 'fence';

export interface DecorItem {
  id: number;
  kind: DecorKind;
  /** Центр основания, px. */
  x: number;
  scale: number;
  /** Снежная шапка 0..1. */
  snow: number;
  seed: number;
  /** Поставлен пользователем (инструмент «Ёлка»). */
  user: boolean;
}

/** Размеры при масштабе 1 (ширина, высота). */
export const SIZE: Record<DecorKind, [number, number]> = {
  house: [150, 130],
  tree: [70, 120],
  lantern: [22, 110],
  fence: [170, 42],
};

export interface DecorFlags {
  enabled: boolean;
  scale: number;
  house: boolean;
  trees: boolean;
  garland: boolean;
  lantern: boolean;
  fence: boolean;
}

export class DecorModule implements SceneModule {
  items: DecorItem[] = [];
  flags: DecorFlags = { enabled: true, scale: 100, house: true, trees: true, garland: true, lantern: true, fence: true };
  private nextId = 1;
  private smokeT = 0;
  /** Сколько дыма (0..1) — больше вечером. */
  smokeAmount = 0.5;

  constructor(private scene: Scene, world: BallWorld | null) {
    this.layout();
    world?.staticProviders.push((_c, r) => this.rects(r));
  }

  /** Расстановка по умолчанию (в долях ширины). */
  layout(): void {
    const W = this.scene.width;
    const r = new Rng(this.scene.seed * 53 + 1);
    const add = (kind: DecorKind, fx: number, sc = 1) => this.items.push({ id: this.nextId++, kind, x: W * fx, scale: sc * r.range(0.92, 1.08), snow: 0.3, seed: r.int(1, 1e6), user: false });
    this.items = [];
    add('fence', 0.28);
    add('tree', 0.08, 0.9);
    add('lantern', 0.6);
    add('tree', 0.71, 1.1);
    add('house', 0.82);
    add('tree', 0.93, 0.8);
  }

  visible(it: DecorItem): boolean {
    const f = this.flags;
    if (!f.enabled) return false;
    if (it.kind === 'house') return f.house;
    if (it.kind === 'tree') return f.trees || it.user;
    if (it.kind === 'lantern') return f.lantern;
    return f.fence;
  }

  /** Размер с учётом общего масштаба. */
  dims(it: DecorItem): [number, number] {
    const k = it.scale * (this.flags.scale / 100);
    const [w, h] = SIZE[it.kind];
    return [w * k, h * k];
  }

  /** Гирлянда: от угла крыши домика до ближайшей ёлки. */
  garland(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!this.flags.enabled || !this.flags.garland) return null;
    const house = this.items.find((i) => i.kind === 'house' && this.visible(i));
    if (!house) return null;
    const H = this.scene.height;
    let best: DecorItem | null = null;
    for (const t of this.items) {
      if (t.kind !== 'tree' || !this.visible(t)) continue;
      if (!best || Math.abs(t.x - house.x) < Math.abs(best.x - house.x)) best = t;
    }
    if (!best) return null;
    const [hw, hh] = this.dims(house);
    const [, th] = this.dims(best);
    const side = best.x < house.x ? -1 : 1;
    return { x0: house.x + side * hw * 0.5, y0: H - hh * 0.55, x1: best.x, y1: H - th * 0.62 };
  }

  addTree(x: number): DecorItem | null {
    if (this.items.filter((i) => i.user).length >= 20) return null;
    const r = this.scene.rng;
    const it: DecorItem = { id: this.nextId++, kind: 'tree', x, scale: r.range(0.6, 1.15), snow: 0, seed: r.int(1, 1e6), user: true };
    this.items.push(it);
    return it;
  }

  private rects(out: StaticRect[]): void {
    const H = this.scene.height;
    for (const it of this.items) {
      if (!this.visible(it)) continue;
      const [w, h] = this.dims(it);
      if (it.kind === 'house') out.push({ x0: it.x - w * 0.42, y0: H - h * 0.55, x1: it.x + w * 0.42, y1: H, owner: 'decor' });
      else if (it.kind === 'tree') {
        out.push({ x0: it.x - w * 0.18, y0: H - h * 0.45, x1: it.x + w * 0.18, y1: H, owner: 'decor' });
        out.push({ x0: it.x - w * 0.06, y0: H - h * 0.85, x1: it.x + w * 0.06, y1: H, owner: 'decor' });
      } else if (it.kind === 'lantern') out.push({ x0: it.x - 3, y0: H - h, x1: it.x + 3, y1: H, owner: 'decor' });
      else out.push({ x0: it.x - w / 2, y0: H - h * 0.85, x1: it.x + w / 2, y1: H, owner: 'decor' });
    }
  }

  /** Верхний контур предмета (высота над землёй) в точке x, или -1. Для ловли снега и ветра. */
  topAt(it: DecorItem, x: number): number {
    const [w, h] = this.dims(it);
    const dx = x - it.x;
    if (Math.abs(dx) > w / 2) return -1;
    const u = Math.abs(dx) / (w / 2);
    switch (it.kind) {
      case 'house':
        // двускатная крыша: конёк в центре, свесы по краям
        return h * (1 - u * 0.45);
      case 'tree':
        return h * (1 - u) ;
      case 'lantern':
        return u < 0.6 ? h : -1;
      case 'fence':
        return h * 0.85;
    }
  }

  step(dt: number): void {
    const sc = this.scene;
    const melt = sc.field.params.melt;
    for (const it of this.items) if (melt > 0) it.snow = Math.max(0, it.snow - melt * dt * 0.01);
    // дым из трубы
    const house = this.items.find((i) => i.kind === 'house' && this.visible(i));
    if (house) {
      this.smokeT += dt * (0.8 + this.smokeAmount * 2.5);
      if (this.smokeT > 1 && sc.particles.length < 900) {
        this.smokeT = 0;
        const [w, h] = this.dims(house);
        const r = sc.rng;
        sc.particles.push({ kind: 'smoke', x: house.x + w * 0.22, y: sc.height - h * 0.98, vx: r.range(-5, 5), vy: -r.range(14, 24), life: 0, maxLife: r.range(3, 5), r: r.range(3, 5) * (w / 150) });
      }
    }
  }

  catchFlake(f: Flake): boolean {
    const H = this.scene.height;
    for (const it of this.items) {
      if (!this.visible(it)) continue;
      const top = this.topAt(it, f.x);
      if (top < 0) continue;
      const y = H - top;
      // хлопья, долетевшая до верхнего контура, ложится на предмет. Забор и ветки ёлки
      // пропускают часть снега (щели, хвоя) — иначе за ними никогда не было бы снега.
      if (f.y >= y - 1 && f.y <= y + 12) {
        const pass = it.kind === 'fence' ? 0.7 : it.kind === 'tree' ? 0.5 : 0;
        if (pass > 0 && ((f.seed * 2654435761) >>> 0) / 4294967296 < pass) continue;
        it.snow = Math.min(1, it.snow + (f.r * f.r) / (this.dims(it)[0] * 6));
        return true;
      }
    }
    return false;
  }

  obstacles(obst: Float32Array): void {
    for (const it of this.items) {
      if (!this.visible(it)) continue;
      const [w] = this.dims(it);
      const i0 = Math.max(0, Math.floor((it.x - w / 2) / COL_W));
      const i1 = Math.min(obst.length - 1, Math.ceil((it.x + w / 2) / COL_W));
      for (let i = i0; i <= i1; i++) {
        const h = this.topAt(it, i * COL_W);
        if (h > obst[i]) obst[i] = h;
      }
    }
  }

  snapshot(): unknown {
    return this.items.map((i) => ({ ...i }));
  }
  restore(s: unknown): void {
    this.items = (s as DecorItem[]).map((i) => ({ ...i }));
  }
  serialize(): unknown {
    return this.items.map((i) => ({ k: i.kind, x: Math.round(i.x), s: +i.scale.toFixed(2), n: +i.snow.toFixed(2), u: i.user ? 1 : 0, seed: i.seed }));
  }
  deserialize(d: unknown): void {
    const { data, sx } = d as { data: { k: DecorKind; x: number; s: number; n: number; u: number; seed: number }[]; sx: number };
    if (!Array.isArray(data)) return;
    const items: DecorItem[] = [];
    for (const o of data.slice(0, 60)) {
      if (!(o.k in SIZE) || !Number.isFinite(o.x)) continue;
      items.push({ id: this.nextId++, kind: o.k, x: o.x * sx, scale: Math.max(0.3, Math.min(3, o.s || 1)), snow: Math.max(0, Math.min(1, o.n || 0)), seed: o.seed || 1, user: !!o.u });
    }
    if (items.length) this.items = items;
  }
  testInfo(): Record<string, unknown> {
    return { decor: this.items.filter((i) => this.visible(i)).length, decorSnow: this.items.map((i) => +i.snow.toFixed(2)) };
  }
}
