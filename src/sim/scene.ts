// Сцена: связывает ветер, снегопад, карту снега и частицы. Чистый TS, фиксированный шаг.
import { Rng, clamp } from './rng';
import { Wind } from './wind';
import { SnowField, DriftParams, COL_W } from './terrain';
import { Snowfall, SnowfallParams, LAYERS, DEPOSIT_K } from './snowfall';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  kind: 'dust';
}

export interface SceneParams {
  snowfall: Partial<SnowfallParams>;
  drift: Partial<DriftParams>;
  windBase: number;
  gustiness: number;
}

export const FIXED_DT = 1 / 60;

export class Scene {
  readonly rng: Rng;
  readonly wind: Wind;
  field: SnowField;
  readonly snowfall: Snowfall;
  particles: Particle[] = [];
  time = 0;

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

  step(dt = FIXED_DT): void {
    this.time += dt;
    this.wind.step(dt);
    this.snowfall.step(dt, this.wind, this.field);
    this.field.step(dt, this.wind.value);
    this.spawnDust();
    this.stepParticles(dt);
  }

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
    for (let k = arr.length - 1; k >= 0; k--) {
      const p = arr[k];
      p.life += dt;
      if (p.life >= p.maxLife) {
        arr[k] = arr[arr.length - 1];
        arr.pop();
        continue;
      }
      p.vx += (this.wind.at(p.x, p.y) - p.vx) * dt * 1.5;
      p.vy += 18 * dt;
      p.vy *= 1 - dt * 0.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
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
