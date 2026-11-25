// Снеговики: сборка из трёх шаров, внешность (у каждого своя), «живое» поведение. Чистый TS.
import type { Scene, SceneModule } from './scene';
import type { Flake } from './snowfall';
import type { BallWorld, Ball, StaticCircle } from './physics';
import { Rng } from './rng';
import { COL_W } from './terrain';

export type HatType = 'bucket' | 'top' | 'knit' | 'none';
export type NoseType = 'carrot' | 'long' | 'button';
export type MouthType = 'smile' | 'grin' | 'o';

export interface Look {
  hat: HatType;
  hatColor: string;
  scarfColor: string;
  scarfStripe: string;
  nose: NoseType;
  mouth: MouthType;
  broom: boolean;
  buttons: number;
  /** Куда смотрит: 1 — вправо, -1 — влево. */
  face: number;
  armSeed: number;
  name: string;
}

export interface Part {
  /** Смещение центра шара от точки опоры снеговика (x — вправо, y — вверх отрицательный). */
  dx: number;
  dy: number;
  r: number;
}

export interface Snowman {
  id: number;
  /** Точка опоры (центр низа нижнего шара). */
  x: number;
  y: number;
  /** Насколько точка опоры ниже поверхности снега (снеговик чуть утоплен). */
  sink: number;
  parts: [Part, Part, Part];
  look: Look;
  // анимация/поведение
  sway: number;
  swayV: number;
  blinkIn: number;
  blink: number;
  wave: number;
  wavePhase: number;
  talkIn: number;
  phrase: number;
  talk: number;
  born: number;
  hatSnow: number;
  /** >0 — шапка сбита (секунды до возвращения). */
  hatOff: number;
  melting: number;
  dragging: boolean;
  seed: number;
}

/** Условия сборки (из ТЗ). */
export const RULES = {
  shrink: 0.95, // r_mid ≤ 0.95·r_bottom, r_top ≤ 0.95·r_mid
  minFrac: 0.4, // каждый ≥ 0.4·r_bottom
  offset: 0.6, // |Δx| ≤ 0.6·r_меньшего
  still: 0.6, // все неподвижны ≥ 0.6 с
};

export type StackCheck = { ok: true } | { ok: false; reason: 'order' | 'crooked' };

/** Проверить тройку (низ, середина, верх) на правила снеговика. */
export function checkStack(b: { x: number; r: number }, m: { x: number; r: number }, t: { x: number; r: number }): StackCheck {
  if (m.r > RULES.shrink * b.r || t.r > RULES.shrink * m.r) return { ok: false, reason: 'order' };
  if (m.r < RULES.minFrac * b.r || t.r < RULES.minFrac * b.r) return { ok: false, reason: 'order' };
  if (Math.abs(m.x - b.x) > RULES.offset * Math.min(m.r, b.r)) return { ok: false, reason: 'crooked' };
  if (Math.abs(t.x - m.x) > RULES.offset * Math.min(t.r, m.r)) return { ok: false, reason: 'crooked' };
  return { ok: true };
}

const HAT_COLORS = ['#c0392b', '#2e86de', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#d35400'];
const SCARVES = [
  ['#e74c3c', '#ffffff'],
  ['#2980b9', '#f1c40f'],
  ['#27ae60', '#ffffff'],
  ['#8e44ad', '#f5b7b1'],
  ['#f39c12', '#c0392b'],
  ['#e84393', '#ffffff'],
  ['#00a8a8', '#003f5c'],
];

export function randomLook(rng: Rng, name: string): Look {
  const hats: HatType[] = ['bucket', 'top', 'knit', 'knit', 'bucket', 'top'];
  const sc = SCARVES[rng.int(0, SCARVES.length - 1)];
  return {
    hat: hats[rng.int(0, hats.length - 1)],
    hatColor: HAT_COLORS[rng.int(0, HAT_COLORS.length - 1)],
    scarfColor: sc[0],
    scarfStripe: sc[1],
    nose: rng.chance(0.7) ? 'carrot' : rng.chance(0.6) ? 'long' : 'button',
    mouth: (['smile', 'smile', 'grin', 'o'] as MouthType[])[rng.int(0, 3)],
    broom: rng.chance(0.3),
    buttons: rng.int(2, 4),
    face: rng.chance(0.5) ? 1 : -1,
    armSeed: rng.int(1, 9999),
    name,
  };
}

/** Мировые координаты центров частей (без учёта покачивания). */
export function partCenters(s: Snowman): { x: number; y: number; r: number }[] {
  return s.parts.map((p) => ({ x: s.x + p.dx, y: s.y + p.dy, r: p.r }));
}

export class SnowmanModule implements SceneModule {
  snowmen: Snowman[] = [];
  limit = 12;
  speech = true;
  /** Подсказка о неправильной стопке (для интерфейса). */
  hint: { x: number; y: number; reason: 'order' | 'crooked' | 'limit'; t: number } | null = null;
  /** Курсор (для взмаха рукой и касаний). */
  cursor: { x: number; y: number; vx: number; vy: number } | null = null;
  names: string[] = ['Снежок'];
  phrasesCount = 12;
  private nextId = 1;
  private stepNo = 0;
  private rng: Rng;

  constructor(private scene: Scene, private world: BallWorld) {
    this.rng = new Rng(scene.seed * 977 + 3);
    world.staticProviders.push((c) => this.colliders(c));
  }

  private colliders(out: StaticCircle[]): void {
    for (const s of this.snowmen) {
      if (s.melting > 0.7) continue;
      for (const p of partCenters(s)) out.push({ x: p.x, y: p.y, r: p.r * (1 - s.melting * 0.6), vx: 0, vy: 0, owner: `snowman${s.id}` });
    }
  }

  /** Найти стопки из трёх шаров. */
  findStacks(): { b: Ball; m: Ball; t: Ball }[] {
    const balls = this.world.balls;
    const byId = new Map(balls.map((b) => [b.id, b]));
    const out: { b: Ball; m: Ball; t: Ball }[] = [];
    for (const t of balls) {
      const m = byId.get(t.restsOn);
      if (!m) continue;
      const b = byId.get(m.restsOn);
      if (!b || b.restsOn !== 0) continue;
      out.push({ b, m, t });
    }
    return out;
  }

  private detect(): void {
    for (const st of this.findStacks()) {
      const { b, m, t } = st;
      if ([b, m, t].some((x) => x.held || x.rolling || x.melting > 0)) continue;
      if (Math.min(b.still, m.still, t.still) < RULES.still) continue;
      const chk = checkStack(b, m, t);
      if (!chk.ok) {
        this.hint = { x: t.x, y: t.y - t.r, reason: chk.reason, t: this.scene.time };
        continue;
      }
      if (this.snowmen.length >= this.limit) {
        this.hint = { x: t.x, y: t.y - t.r, reason: 'limit', t: this.scene.time };
        continue;
      }
      this.create(b, m, t);
    }
  }

  create(b: Ball, m: Ball, t: Ball): Snowman {
    const r = this.rng;
    const baseY = b.y + b.r;
    const name = this.names[(this.nextId - 1) % this.names.length];
    const s: Snowman = {
      id: this.nextId++,
      x: b.x,
      y: baseY,
      sink: baseY - this.scene.surfaceY(b.x),
      parts: [
        { dx: 0, dy: -b.r, r: b.r },
        { dx: m.x - b.x, dy: m.y - baseY, r: m.r },
        { dx: t.x - b.x, dy: t.y - baseY, r: t.r },
      ],
      look: randomLook(r, name),
      sway: 0,
      swayV: 0,
      blinkIn: r.range(1, 4),
      blink: 0,
      wave: 0,
      wavePhase: 0,
      talkIn: r.range(6, 16),
      phrase: r.int(0, this.phrasesCount - 1),
      talk: 0,
      born: 0,
      hatSnow: 0,
      hatOff: 0,
      melting: 0,
      dragging: false,
      seed: r.int(1, 1e6),
    };
    for (const x of [b, m, t]) this.world.remove(x.id);
    this.snowmen.push(s);
    // превращение: вспышка искр и «пуф» снега
    const sc = this.scene;
    for (const p of partCenters(s)) {
      for (let k = 0; k < 10; k++) {
        const a = r.range(0, Math.PI * 2);
        sc.particles.push({ kind: 'spark', x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * r.range(40, 140), vy: Math.sin(a) * r.range(40, 140) - 40, life: 0, maxLife: r.range(0.5, 1.1), r: r.range(1.5, 3) });
      }
    }
    for (let k = 0; k < 14; k++) {
      sc.particles.push({ kind: 'puff', x: s.x + r.range(-1, 1) * b.r * 1.2, y: s.y - r.range(0, 8), vx: r.range(-60, 60), vy: -r.range(10, 60), life: 0, maxLife: r.range(0.5, 1), r: r.range(3, 7) });
    }
    sc.emit('snowman', s.x, s.y);
    return s;
  }

  remove(id: number): void {
    this.snowmen = this.snowmen.filter((s) => s.id !== id);
  }

  /** Попадание снежком или толчок. */
  hit(s: Snowman, power = 1, knockHat = true): void {
    s.swayV += (this.rng.chance(0.5) ? 1 : -1) * 2.2 * power;
    if (knockHat && s.look.hat !== 'none' && s.hatOff <= 0) {
      s.hatOff = 8;
      s.hatSnow = 0;
    }
    this.scene.emit('hit', s.x, s.y - 40, power);
  }

  step(dt: number): void {
    this.stepNo++;
    if (this.stepNo % 6 === 0) this.detect();
    const sc = this.scene;
    const r = this.rng;
    const wind = sc.wind.value;
    for (let i = this.snowmen.length - 1; i >= 0; i--) {
      const s = this.snowmen[i];
      s.born += dt;
      // стоит на снегу: опускается, если снег под ним убрали
      if (!s.dragging) {
        const ty = sc.surfaceY(s.x) + Math.max(0, Math.min(s.sink, s.parts[0].r * 0.3));
        s.y += (ty - s.y) * Math.min(1, dt * 6);
      }
      // покачивание: пружина + ветер (большие снеговики качаются меньше)
      const size = s.parts[0].r + s.parts[1].r + s.parts[2].r;
      const windT = (wind / 160) * (40 / size) * 0.9;
      s.swayV += (-28 * s.sway - 3.2 * s.swayV + windT * 6) * dt;
      s.sway += s.swayV * dt;
      s.sway = Math.max(-0.35, Math.min(0.35, s.sway));
      // касание курсором
      const c = this.cursor;
      const head = { x: s.x + s.parts[2].dx, y: s.y + s.parts[2].dy };
      if (c) {
        const sp = Math.hypot(c.vx, c.vy);
        for (const p of partCenters(s)) {
          if (Math.hypot(c.x - p.x, c.y - p.y) < p.r && sp > 250) {
            s.swayV += Math.sign(c.vx || 1) * Math.min(1.2, sp / 1500) * dt * 8;
            break;
          }
        }
        // машет, когда курсор рядом
        const d = Math.hypot(c.x - head.x, c.y - head.y);
        s.wave += ((d < 170 ? 1 : 0) - s.wave) * Math.min(1, dt * 4);
      } else s.wave += (0 - s.wave) * Math.min(1, dt * 4);
      s.wavePhase += dt * (6 + s.wave * 4);
      // моргание
      s.blinkIn -= dt;
      if (s.blinkIn <= 0) {
        s.blink = 0.14;
        s.blinkIn = r.range(2, 6);
      }
      if (s.blink > 0) s.blink -= dt;
      // фразы
      if (this.speech) {
        if (s.talk > 0) s.talk -= dt;
        else {
          s.talkIn -= dt;
          if (s.talkIn <= 0) {
            s.talk = 4.5;
            s.phrase = r.int(0, this.phrasesCount - 1);
            s.talkIn = r.range(25, 70);
          }
        }
      } else s.talk = 0;
      // шапка возвращается сама
      if (s.hatOff > 0) s.hatOff = Math.max(0, s.hatOff - dt);
      // снег на шапке тает при таянии
      if (sc.field.params.melt > 0) s.hatSnow = Math.max(0, s.hatSnow - sc.field.params.melt * dt * 0.02);
      // растапливание
      if (s.melting > 0) {
        s.melting = Math.min(1, s.melting + dt * 0.45);
        if (r.chance(0.7)) {
          const p = partCenters(s)[r.int(0, 2)];
          sc.particles.push({ kind: 'drop', x: p.x + r.range(-0.8, 0.8) * p.r, y: p.y + p.r * 0.5, vx: r.range(-10, 10), vy: 10, life: 0, maxLife: 1.4, r: 1.6 });
        }
        if (s.melting >= 1) {
          this.snowmen.splice(i, 1);
          continue;
        }
      }
    }
    if (this.hint && sc.time - this.hint.t > 3) this.hint = null;
  }

  // ---------- SceneModule ----------

  catchFlake(f: Flake): boolean {
    for (const s of this.snowmen) {
      const ps = partCenters(s);
      for (let k = 0; k < 3; k++) {
        const p = ps[k];
        const dx = f.x - p.x;
        const dy = f.y - p.y;
        if (dx * dx + dy * dy > (p.r + 2) * (p.r + 2)) continue;
        // снег копится на шапке/макушке
        if (k === 2 && dy < -p.r * 0.4) s.hatSnow = Math.min(1, s.hatSnow + (f.r * f.r) / (p.r * 25));
        return true;
      }
    }
    return false;
  }

  obstacles(obst: Float32Array): void {
    const H = this.scene.height;
    for (const s of this.snowmen) {
      for (const p of partCenters(s)) {
        const i0 = Math.max(0, Math.floor((p.x - p.r) / COL_W));
        const i1 = Math.min(obst.length - 1, Math.ceil((p.x + p.r) / COL_W));
        for (let i = i0; i <= i1; i++) {
          const dx = i * COL_W - p.x;
          const h = H - p.y + Math.sqrt(Math.max(0, p.r * p.r - dx * dx));
          if (h > obst[i]) obst[i] = h;
        }
      }
    }
  }

  snapshot(): unknown {
    return this.snowmen.map((s) => structuredClone(s));
  }
  restore(d: unknown): void {
    this.snowmen = (d as Snowman[]).map((s) => ({ ...structuredClone(s), dragging: false }));
    this.nextId = Math.max(this.nextId, ...this.snowmen.map((s) => s.id + 1));
  }
  serialize(): unknown {
    return this.snowmen.filter((s) => s.melting === 0).map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), sink: +s.sink.toFixed(1), parts: s.parts.map((p) => [+p.dx.toFixed(1), +p.dy.toFixed(1), +p.r.toFixed(1)]), look: s.look, hatSnow: +s.hatSnow.toFixed(2) }));
  }
  deserialize(d: unknown): void {
    const { data, sx } = d as { data: { x: number; y: number; sink: number; parts: number[][]; look: Look; hatSnow: number }[]; sx: number };
    if (!Array.isArray(data)) return;
    this.snowmen = [];
    for (const o of data.slice(0, 30)) {
      if (!Array.isArray(o.parts) || o.parts.length !== 3 || !o.look) continue;
      const r = this.rng;
      this.snowmen.push({
        id: this.nextId++,
        x: o.x * sx,
        y: o.y,
        sink: o.sink || 0,
        parts: o.parts.map(([dx, dy, rr]) => ({ dx, dy, r: rr })) as [Part, Part, Part],
        look: { ...randomLook(r, o.look.name ?? 'Снежок'), ...o.look },
        sway: 0, swayV: 0, blinkIn: r.range(1, 4), blink: 0, wave: 0, wavePhase: 0, talkIn: r.range(10, 30), phrase: 0, talk: 0,
        born: 99, hatSnow: o.hatSnow || 0, hatOff: 0, melting: 0, dragging: false, seed: r.int(1, 1e6),
      });
    }
  }
  testInfo(): Record<string, unknown> {
    return { snowmen: this.snowmen.length, hint: this.hint?.reason ?? null };
  }
}
