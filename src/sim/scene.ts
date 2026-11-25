// Сцена: связывает ветер, снегопад, карту снега, инструменты и частицы. Чистый TS, фиксированный шаг.
import { Rng, clamp } from './rng';
import { Wind } from './wind';
import { SnowField, DriftParams, COL_W } from './terrain';
import { Snowfall, SnowfallParams, LAYERS, DEPOSIT_K, Flake } from './snowfall';
import * as T from './tools';

export type ParticleKind = 'dust' | 'chunk' | 'carrier' | 'drop' | 'smoke' | 'spark' | 'puff' | 'swirl';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  /** Объём снега (px²), который частица вернёт в карту при приземлении (carrier/swirl). */
  vol?: number;
  /** Для вихря: центр, угол, радиус. */
  cx?: number;
  cy?: number;
  ang?: number;
  rad?: number;
}

export interface SceneParams {
  snowfall: Partial<SnowfallParams>;
  drift: Partial<DriftParams>;
  windBase: number;
  gustiness: number;
}

export type ContinuousTool = 'blower' | 'heat' | 'add';

export interface ActiveTool {
  kind: ContinuousTool;
  x: number;
  y: number;
  R: number;
  softness: number;
  /** множитель силы (1 = 100%) */
  strength: number;
  dirX: number;
  dirY: number;
}

/** Событие для звука/эффектов рендера. */
export interface SceneEvent {
  type: 'crunch' | 'puff' | 'melt' | 'thud' | 'splat' | 'horn' | 'shake' | 'snowman' | 'hit' | 'drip';
  x: number;
  y: number;
  power?: number;
}

/** Снимок для Undo/Redo (расширяется следующими этапами через extra). */
export interface Snapshot {
  snow: Float32Array;
  fresh: Float32Array;
  extra: Record<string, unknown>;
}

export const FIXED_DT = 1 / 60;

/** Хук для расширений сцены (шары, снеговики, декор…), чтобы не раздувать один файл. */
export interface SceneModule {
  /** Перехват хлопья до земли; true — хлопья «поймана» (лежит на объекте). */
  catchFlake?(f: Flake): boolean;
  /** Заполнить высоты препятствий (для ветровой тени). */
  obstacles?(obst: Float32Array): void;
  step?(dt: number): void;
  snapshot?(): unknown;
  restore?(s: unknown): void;
  serialize?(): unknown;
  deserialize?(d: unknown): void;
}

export class Scene {
  readonly rng: Rng;
  readonly wind: Wind;
  field: SnowField;
  readonly snowfall: Snowfall;
  particles: Particle[] = [];
  events: SceneEvent[] = [];
  time = 0;
  activeTool: ActiveTool | null = null;
  /** Анимация «очистить всё»: фронт ветра, сдувающий снег. */
  clearing: { x: number; dir: number; speed: number } | null = null;
  readonly modules: Record<string, SceneModule> = {};

  constructor(public width: number, public height: number, public seed = 1) {
    this.rng = new Rng(seed);
    this.wind = new Wind(new Rng(seed * 31 + 5), seed);
    this.field = new SnowField(width, seed);
    this.snowfall = new Snowfall(new Rng(seed * 17 + 3), width, height);
  }

  apply(p: Partial<SceneParams>): void {
    if (p.snowfall) Object.assign(this.snowfall.params, p.snowfall);
    if (p.drift) Object.assign(this.field.params, p.drift);
    if (p.windBase !== undefined) this.wind.base = p.windBase;
    if (p.gustiness !== undefined) this.wind.gustiness = p.gustiness;
  }

  resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    const old = this.field;
    this.width = w;
    this.height = h;
    this.field = new SnowField(w, this.seed, old.params);
    this.field.copyFrom(old);
    this.snowfall.resize(w, h);
  }

  emit(type: SceneEvent['type'], x: number, y: number, power = 1): void {
    if (this.events.length < 64) this.events.push({ type, x, y, power });
  }

  /** Поверхность снега (экранная y) в точке x. */
  surfaceY(x: number): number {
    return this.height - this.field.heightAt(x);
  }

  step(dt = FIXED_DT): void {
    this.time += dt;
    this.wind.step(dt);
    this.applyContinuousTool(dt);
    const mods = Object.values(this.modules);
    // препятствия для ветра
    const obst = this.field.obstacle;
    obst.fill(0);
    for (const m of mods) m.obstacles?.(obst);
    const catcher = mods.some((m) => m.catchFlake) ? (f: Flake) => mods.some((m) => m.catchFlake?.(f) ?? false) : undefined;
    this.snowfall.step(dt, this.wind, this.field, catcher);
    this.field.step(dt, this.wind.value);
    this.stepClearing(dt);
    for (const m of mods) m.step?.(dt);
    this.spawnDust();
    this.stepParticles(dt);
  }

  // ---------- инструменты ----------

  /** Лопата вдоль отрезка (интерполяция, чтобы не было пропусков при быстром движении мыши). */
  /** Начало хода лопаты: запоминаем, куда отбрасывать снег «через плечо». */
  private shovelStart: { x: number; dir: number; R: number } | null = null;
  beginShovel(x: number): void {
    this.shovelStart = { x, dir: 0, R: 0 };
  }
  endShovel(): void {
    const s = this.shovelStart;
    // после хода — лавина по всей полосе: срезанные стенки и валики сразу оседают до угла откоса
    if (s && s.R > 0) this.field.settleAround(s.x, Math.max(400, s.R * 10), 400);
    this.shovelStart = null;
  }

  shovelStroke(x0: number, y0: number, x1: number, y1: number, R: number): number {
    const st = this.shovelStart;
    const dir = Math.sign(x1 - x0) || st?.dir || 1;
    if (st && !st.dir) st.dir = dir;
    if (st) st.R = R;
    // «через плечо» — за начало хода (без beginShovel — за начало этого отрезка)
    const backX = (st ? st.x : x0) - (st?.dir || dir) * (R + 22);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / Math.max(2, R / 3)));
    let vol = 0;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      vol += T.shovel(this.field, this.height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, R, dir, backX);
    }
    if (vol > 0) {
      // мгновенная лавина вокруг лопаты — без вертикальных столбов на месте валика
      this.field.settleAround(x1, Math.max(250, R * 6), 120);
      this.field.settleAround(backX, Math.max(250, R * 6), 120);
      this.spawnChunks(x1, y1, R, dir, vol);
      this.emit('crunch', x1, y1, Math.min(1, vol / 400));
    }
    return vol;
  }

  eraseStroke(x0: number, y0: number, x1: number, y1: number, R: number, softness: number): number {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / Math.max(2, R / 3)));
    let vol = 0;
    for (let k = 0; k <= n; k++) {
      const t = n === 0 ? 1 : k / n;
      vol += T.erase(this.field, this.height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, R, softness);
    }
    if (vol > 0) {
      const r = this.rng;
      for (let k = 0; k < Math.min(6, vol / 60); k++)
        this.particles.push({ kind: 'puff', x: x1 + r.range(-R, R) * 0.6, y: y1 + r.range(-R, R) * 0.4, vx: r.range(-20, 20), vy: r.range(-30, -5), life: 0, maxLife: r.range(0.4, 0.8), r: r.range(2, 5) });
    }
    return vol;
  }

  private spawnChunks(x: number, y: number, R: number, dir: number, vol: number): void {
    const r = this.rng;
    const n = Math.min(8, 1 + Math.floor(vol / 80));
    for (let k = 0; k < n && this.particles.length < 900; k++) {
      const side = r.chance(0.65) ? dir : -dir;
      this.particles.push({ kind: 'chunk', x: x + side * R * 0.7, y: y - R * 0.3, vx: side * r.range(40, 140), vy: -r.range(60, 180), life: 0, maxLife: r.range(0.5, 0.9), r: r.range(1.5, 3.5) });
    }
  }

  private applyContinuousTool(dt: number): void {
    const t = this.activeTool;
    if (!t) return;
    const f = this.field;
    const H = this.height;
    const r = this.rng;
    if (t.kind === 'add') {
      T.addSnow(f, H, t.x, t.y, t.R, t.softness, 40 * t.strength, dt);
      if (r.chance(0.5))
        this.particles.push({ kind: 'puff', x: t.x + r.range(-t.R, t.R) * 0.7, y: t.y + r.range(-5, 5), vx: r.range(-10, 10), vy: r.range(20, 60), life: 0, maxLife: 0.5, r: r.range(1.5, 3) });
    } else if (t.kind === 'heat') {
      const v = T.melt(f, H, t.x, t.y, t.R, t.softness, 18 * t.strength, dt);
      if (v > 0 && this.particles.length < 700) {
        // пар над тающим снегом
        if (r.chance(Math.min(0.8, v * 0.3 + 0.2))) {
          const x = t.x + r.range(-t.R, t.R) * 0.8;
          this.particles.push({ kind: 'smoke', x, y: this.surfaceY(x) - 2, vx: r.range(-10, 10), vy: -r.range(15, 35), life: 0, maxLife: r.range(0.8, 1.6), r: r.range(3, 6) });
        }
        // капли талой воды срываются с края струи и падают на снег
        if (r.chance(Math.min(0.6, v * 0.2 + 0.1))) {
          const x = t.x + r.range(-t.R, t.R) * 0.6;
          this.particles.push({ kind: 'drop', x, y: Math.min(t.y, this.surfaceY(x) - 30), vx: r.range(-15, 15), vy: r.range(-40, 10), life: 0, maxLife: 2, r: r.range(1.2, 2.2) });
        }
        if (r.chance(0.04)) this.emit('drip', t.x, t.y);
      }
    } else if (t.kind === 'blower') {
      const { volume, perCol } = T.blow(f, H, t.x, t.y, t.R, t.softness, 30 * t.strength, dt);
      if (volume > 0) {
        // объём уносится частицами-носителями и возвращается туда, где они упадут
        const groups = Math.min(4, perCol.length);
        const chunk = Math.ceil(perCol.length / Math.max(1, groups));
        for (let g = 0; g < groups; g++) {
          let vol = 0;
          let xs = 0;
          for (let k = g * chunk; k < Math.min(perCol.length, (g + 1) * chunk); k++) {
            vol += perCol[k][1];
            xs = perCol[k][0];
          }
          if (vol <= 0) continue;
          const sp = r.range(260, 520);
          this.particles.push({
            kind: 'carrier', vol, x: xs, y: this.surfaceY(xs) - 2,
            vx: t.dirX * sp + r.range(-30, 30), vy: Math.min(-40, t.dirY * sp * 0.5) - r.range(40, 160),
            life: 0, maxLife: 6, r: r.range(1.2, 2.4),
          });
        }
        if (r.chance(0.08)) this.emit('puff', t.x, t.y, 0.4);
      }
    }
  }

  /** «Очистить всё»: порыв ветра проходит по экрану и сдувает снег. */
  startClearAll(): void {
    const dir = this.wind.value >= 0 ? 1 : -1;
    this.clearing = { x: dir > 0 ? -40 : this.width + 40, dir, speed: Math.max(500, this.width / 1.6) };
    this.wind.impulse += dir * 260;
    this.emit('puff', this.width / 2, this.height - 20, 1);
  }

  private stepClearing(dt: number): void {
    const c = this.clearing;
    if (!c) return;
    const f = this.field;
    c.x += c.dir * c.speed * dt;
    const r = this.rng;
    // всё позади фронта быстро сдувается
    for (let i = 0; i < f.n; i++) {
      const x = i * COL_W;
      const behind = c.dir > 0 ? x < c.x : x > c.x;
      if (!behind || f.snow[i] <= 0) continue;
      const take = f.snow[i] * (1 - Math.exp(-dt * 9)) + 0.05;
      const a = Math.min(f.snow[i], take);
      f.snow[i] -= a;
      f.fresh[i] = Math.min(f.fresh[i], f.snow[i]);
      if (a > 0.4 && r.chance(0.12) && this.particles.length < 900)
        this.particles.push({ kind: 'dust', x, y: this.surfaceY(x) - 2, vx: c.dir * r.range(250, 600), vy: -r.range(20, 120), life: 0, maxLife: r.range(0.6, 1.4), r: r.range(0.8, 2) });
    }
    f.revision++;
    if ((c.dir > 0 && c.x > this.width + 60) || (c.dir < 0 && c.x < -60)) {
      f.clear();
      this.clearing = null;
    }
  }

  // ---------- частицы ----------

  private spawnDust(): void {
    const ev = this.field.dust;
    if (!ev.length) return;
    const r = this.rng;
    for (const e of ev) {
      if (this.particles.length > 220) break;
      const n = 1 + Math.min(3, Math.floor(e.amount * 800));
      for (let k = 0; k < n; k++) {
        this.particles.push({
          kind: 'dust',
          x: e.x + r.range(-3, 3),
          y: this.height - e.h - r.range(0, 3),
          vx: this.wind.value * r.range(0.6, 1.2),
          vy: -r.range(15, 55),
          life: 0,
          maxLife: r.range(0.6, 1.6),
          r: r.range(0.5, 1.2),
        });
      }
    }
  }

  private stepParticles(dt: number): void {
    const arr = this.particles;
    const f = this.field;
    for (let k = arr.length - 1; k >= 0; k--) {
      const p = arr[k];
      p.life += dt;
      let dead = p.life >= p.maxLife;
      switch (p.kind) {
        case 'dust':
          p.vx += (this.wind.at(p.x, p.y) - p.vx) * dt * 1.5;
          p.vy += 18 * dt;
          p.vy *= 1 - dt * 0.8;
          break;
        case 'puff':
          p.vx *= 1 - dt * 3;
          p.vy *= 1 - dt * 3;
          p.r += dt * 6;
          break;
        case 'smoke':
          p.vx += (this.wind.at(p.x, p.y) * 0.4 - p.vx) * dt * 0.8;
          p.vy += -6 * dt;
          p.r += dt * 4;
          break;
        case 'spark':
          p.vy += 60 * dt;
          p.vx *= 1 - dt * 1.5;
          break;
        case 'chunk':
        case 'drop':
          p.vy += 700 * dt;
          if (p.y >= this.surfaceY(p.x) && p.vy > 0) dead = true;
          break;
        case 'swirl': {
          // вихрь «снежного шара»: частица кружит вокруг центра, потом падает носителем
          const tSw = 2.6;
          if (p.life < 0) {
            // ещё не взлетела — лежит у земли
            dead = false;
            continue;
          }
          if (p.life < tSw) {
            p.ang! += dt * (1.6 + 160 / (p.rad! + 40));
            p.rad! += dt * 30 * Math.sin(p.life * 1.7 + p.ang! * 0.5);
            const nx = p.cx! + Math.cos(p.ang!) * p.rad!;
            const ny = p.cy! + Math.sin(p.ang!) * p.rad! * 0.55;
            p.vx = (nx - p.x) / dt;
            p.vy = (ny - p.y) / dt;
            p.x = nx;
            p.y = ny;
            dead = false;
            continue;
          }
          p.kind = 'carrier';
          p.vx *= 0.15;
          p.vy = 20;
          p.life = 0;
          p.maxLife = 30;
          dead = false;
          break;
        }
        case 'carrier': {
          p.vx += (this.wind.at(p.x, p.y) * 0.5 - p.vx) * dt * 1.2;
          p.vy += 260 * dt;
          if (p.vy > 70) p.vy = 70; // парит как хлопья
          const sy = this.surfaceY(p.x);
          if (p.y >= sy) {
            if (p.x >= 0 && p.x <= this.width && p.vol) T.depositRidge(f, p.x, 4, p.vol);
            dead = true;
          } else if (p.x < -50 || p.x > this.width + 50) dead = true;
          else dead = false; // носитель живёт, пока не упадёт
          break;
        }
      }
      if (dead) {
        arr[k] = arr[arr.length - 1];
        arr.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ---------- снимки (Undo/Redo) ----------

  snapshot(): Snapshot {
    const extra: Record<string, unknown> = {};
    for (const [k, m] of Object.entries(this.modules)) if (m.snapshot) extra[k] = m.snapshot();
    return { snow: this.field.snow.slice(), fresh: this.field.fresh.slice(), extra };
  }

  restore(s: Snapshot): void {
    if (s.snow.length === this.field.n) {
      this.field.snow.set(s.snow);
      this.field.fresh.set(s.fresh);
    }
    for (const [k, m] of Object.entries(this.modules)) if (m.restore && k in s.extra) m.restore(s.extra[k]);
    this.clearing = null;
    this.field.revision++;
  }

  // ---------- сохранение между запусками ----------

  serialize(): unknown {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const mods: Record<string, unknown> = {};
    for (const [k, m] of Object.entries(this.modules)) if (m.serialize) mods[k] = m.serialize();
    return { v: 1, width: this.width, height: this.height, snow: Array.from(this.field.snow, r1), fresh: Array.from(this.field.fresh, r1), modules: mods };
  }

  deserialize(d: unknown): void {
    const o = d as { v?: number; width?: number; snow?: number[]; fresh?: number[]; modules?: Record<string, unknown> };
    if (!o || o.v !== 1 || !Array.isArray(o.snow)) return;
    const src = new SnowField(Math.max(4, (o.snow.length - 1) * COL_W), this.seed);
    const n = Math.min(src.n, o.snow.length);
    for (let i = 0; i < n; i++) {
      src.snow[i] = Math.max(0, Number(o.snow[i]) || 0);
      src.fresh[i] = Math.min(src.snow[i], Math.max(0, Number(o.fresh?.[i]) || 0));
    }
    this.field.copyFrom(src);
    const sx = this.width / Math.max(1, o.width ?? this.width);
    for (const [k, m] of Object.entries(this.modules)) if (m.deserialize && o.modules && k in o.modules) m.deserialize({ data: o.modules[k], sx });
    this.field.revision++;
  }

  /** Сводка для тестов (модули дополняют). */
  testInfo(): Record<string, unknown> {
    const out: Record<string, unknown> = { particles: this.particles.length };
    for (const m of Object.values(this.modules)) Object.assign(out, (m as { testInfo?: () => object }).testInfo?.() ?? {});
    return out;
  }

  /** Быстрая промотка (без рендера). */
  fastForward(seconds: number): void {
    const steps = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < steps; i++) this.step(FIXED_DT);
  }

  /**
   * «Присыпать сразу»: эквивалент нескольких минут снегопада за один кадр,
   * с той же логикой неравномерности, что и у настоящих хлопьев.
   */
  dustNow(seconds = 600): void {
    const r = this.rng;
    const sf = this.snowfall;
    const landing = LAYERS.filter((l) => l.lands);
    const ratePerSec = (26 * Math.max(0.3, sf.params.intensity) * this.width) / 1000;
    const count = Math.round(ratePerSec * seconds * landing.reduce((a, l) => a + l.weight, 0));
    for (let k = 0; k < count; k++) {
      const L = landing[k % landing.length];
      const rad = r.range(L.rMin, L.rMax) * sf.params.sizeScale * 1.15;
      this.field.deposit(r.range(0, this.width), DEPOSIT_K * Math.PI * rad * rad, 2 + rad * 1.5);
      if ((k & 255) === 0) this.field.relax(1, 0.5);
    }
    // Немного ветрового переноса, чтобы намёты сформировались сразу
    const w = this.wind.base || 40;
    for (let i = 0; i < 120; i++) {
      this.field.windStep(clamp(w * 1.5, -260, 260), 0.25);
      this.field.relax(2, 0.5);
    }
    this.field.settle(400);
  }
}

export { COL_W };
