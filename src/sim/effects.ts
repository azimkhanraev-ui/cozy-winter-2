// Дополнительные эффекты: следы и «снежный ангел», снежковый бой (полёт к «стеклу», брызги),
// «снежный шар» (встряхнуть — вихрь и оседание). Чистый TS.
import type { Scene, SceneModule } from './scene';
import type { BallWorld } from './physics';
import { partCenters, type SnowmanModule } from './snowman';
import type { DecorModule } from './decor';
import { press, depositRidge } from './tools';
import { COL_W } from './terrain';

export interface Decal {
  kind: 'foot' | 'angel';
  x: number;
  /** Высота поверхности снега в момент отпечатка. */
  h0: number;
  flip: number;
  seed: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0 — у снега, 1 — долетел до «стекла» экрана. */
  z: number;
  r: number;
  T: number;
}

export interface Splat {
  x: number;
  y: number;
  r: number;
  t: number;
  seed: number;
  drips: { dx: number; len: number; speed: number; w: number }[];
}

export class EffectsModule implements SceneModule {
  decals: Decal[] = [];
  projectiles: Projectile[] = [];
  splats: Splat[] = [];
  splatsOn = true;
  private lastFoot = -1e9;
  private footSide = 1;

  constructor(private scene: Scene, private balls: BallWorld | null, private snowmen: SnowmanModule | null, private decor: DecorModule | null) {}

  // ---------- следы ----------

  /** Отпечаток ноги у x (если снега достаточно). Возвращает true, если след оставлен. */
  footprint(x: number): boolean {
    const f = this.scene.field;
    const i = f.col(x);
    if (f.snow[i] < 2) return false;
    const depth = Math.min(5, f.snow[i] * 0.35);
    press(f, x, 5, depth);
    this.decals.push({ kind: 'foot', x, h0: f.heightAt(x), flip: this.footSide, seed: (x * 7919) | 0 });
    this.footSide = -this.footSide;
    if (this.decals.length > 400) this.decals.shift();
    this.scene.emit('crunch', x, this.scene.surfaceY(x), 0.35);
    return true;
  }

  /** Шаги вдоль перетаскивания: отпечаток каждые ~24 px. */
  walk(x: number): void {
    if (Math.abs(x - this.lastFoot) < 24) return;
    if (this.footprint(x + this.footSide * 3)) this.lastFoot = x;
  }
  resetWalk(): void {
    this.lastFoot = -1e9;
  }

  /** «Снежный ангел»: широкий отпечаток-штамп. */
  angel(x: number): boolean {
    const f = this.scene.field;
    const i = f.col(x);
    if (f.snow[i] < 3) return false;
    press(f, x, 26, Math.min(9, f.snow[i] * 0.45));
    this.decals.push({ kind: 'angel', x, h0: f.heightAt(x), flip: 1, seed: (x * 104729) | 0 });
    this.scene.emit('puff', x, this.scene.surfaceY(x), 0.6);
    return true;
  }

  /** Прозрачность отпечатка: заметается новым снегом, исчезает, если снег убрали. */
  decalAlpha(d: Decal): number {
    const h = this.scene.field.heightAt(d.x);
    if (h < d.h0 - 4) return 0;
    const cover = d.kind === 'angel' ? 10 : 5;
    return Math.max(0, Math.min(1, 1 - (h - d.h0) / cover));
  }

  // ---------- снежковый бой ----------

  throwBall(x: number, y: number, vx: number, vy: number): void {
    const sp = Math.hypot(vx, vy);
    const k = sp > 2600 ? 2600 / sp : 1;
    this.projectiles.push({ x, y, vx: vx * k, vy: vy * k, z: 0, r: 6, T: 0.85 });
    this.scene.emit('puff', x, y, 0.3);
  }

  private stepProjectiles(dt: number): void {
    const sc = this.scene;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += dt / p.T;
      const vr = p.r * (1 + 2.2 * p.z);
      // по пути — снеговики и шары
      if (p.z > 0.15 && p.z < 0.85) {
        let hit = false;
        for (const s of this.snowmen?.snowmen ?? []) {
          for (const c of partCenters(s)) {
            if (Math.hypot(p.x - c.x, p.y - c.y) < c.r + vr * 0.5) {
              this.snowmen!.hit(s, 1, true);
              hit = true;
              break;
            }
          }
          if (hit) break;
        }
        if (!hit && this.balls) {
          for (const b of this.balls.balls) {
            if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + vr * 0.4) {
              this.balls.wake(b);
              b.vx += p.vx * (30 / (b.r * b.r)) * 6;
              b.vy -= 120 * (20 / b.r);
              b.cap = 0;
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          this.puff(p.x, p.y, 10);
          sc.emit('hit', p.x, p.y, 0.8);
          this.projectiles.splice(i, 1);
          continue;
        }
      }
      // упал в снег раньше, чем долетел до стекла
      if (p.y > sc.surfaceY(p.x) && p.vy > 0) {
        this.puff(p.x, p.y, 6);
        depositRidge(sc.field, p.x, 4, Math.PI * p.r * p.r * 0.5);
        sc.emit('puff', p.x, p.y, 0.4);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.z >= 1) {
        if (this.splatsOn) this.splat(p.x, p.y, vr);
        sc.emit('splat', p.x, p.y, 1);
        this.projectiles.splice(i, 1);
      } else if (p.x < -200 || p.x > sc.width + 200 || p.y < -400) this.projectiles.splice(i, 1);
    }
  }

  splat(x: number, y: number, r: number): void {
    const rng = this.scene.rng;
    const n = rng.int(3, 6);
    const drips = [];
    for (let k = 0; k < n; k++) drips.push({ dx: rng.range(-0.7, 0.7) * r * 1.6, len: rng.range(2, 8), speed: rng.range(2, 7), w: rng.range(1.5, 3.5) });
    this.splats.push({ x, y, r: r * 1.6, t: 0, seed: rng.int(1, 1e6), drips });
    if (this.splats.length > 30) this.splats.shift();
  }

  private stepSplats(dt: number): void {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      s.t += dt;
      // медленно сползает и тает
      s.y += dt * (2 + Math.min(6, s.t * 0.4));
      for (const d of s.drips) d.len += d.speed * dt * Math.max(0, 1 - s.t / 25);
      if (s.t > 24) this.splats.splice(i, 1);
    }
  }

  private puff(x: number, y: number, n: number): void {
    const r = this.scene.rng;
    for (let k = 0; k < n && this.scene.particles.length < 900; k++) {
      const a = r.range(0, Math.PI * 2);
      this.scene.particles.push({ kind: 'puff', x, y, vx: Math.cos(a) * r.range(30, 110), vy: Math.sin(a) * r.range(30, 110) - 30, life: 0, maxLife: r.range(0.4, 0.8), r: r.range(2, 5) });
    }
  }

  // ---------- «снежный шар» ----------

  /** Встряхнуть: половина снега взмывает вихрем и оседает заново (объём возвращается в карту). */
  shake(): void {
    const sc = this.scene;
    const f = sc.field;
    const r = sc.rng;
    const W = sc.width;
    const H = sc.height;
    const N = 260;
    let total = 0;
    const lifted = new Float32Array(f.n);
    for (let i = 0; i < f.n; i++) {
      const a = f.snow[i] * 0.55;
      lifted[i] = a;
      total += a * COL_W;
    }
    if (total > 1) {
      for (let i = 0; i < f.n; i++) {
        f.snow[i] -= lifted[i];
        f.fresh[i] = Math.min(f.fresh[i], f.snow[i]);
      }
      f.revision++;
      const cx = W / 2;
      const cy = H * 0.55;
      for (let k = 0; k < N; k++) {
        const x = r.range(0, W);
        // у каждой снежинки свой центр, радиус и фаза — получается объёмный вихрь, а не одно кольцо
        const pcx = cx + r.range(-W * 0.08, W * 0.08);
        const pcy = cy + r.range(-H * 0.12, H * 0.12);
        sc.particles.push({ kind: 'swirl', x, y: H - 10, vx: 0, vy: 0, life: r.range(-0.6, 0), maxLife: 30, r: r.range(1.2, 2.8), vol: total / N, cx: pcx, cy: pcy, ang: r.range(0, Math.PI * 2), rad: r.range(0.12, 0.5) * Math.min(W, H * 1.6) });
      }
    }
    sc.wind.impulse += (r.chance(0.5) ? 1 : -1) * 220;
    for (const fl of sc.snowfall.flakes) {
      fl.vx += r.range(-300, 300);
      fl.y -= r.range(0, 60);
    }
    for (const b of this.balls?.balls ?? []) {
      b.cap = 0;
      this.balls!.wake(b);
      b.vy -= 160;
      b.vx += r.range(-60, 60);
    }
    for (const s of this.snowmen?.snowmen ?? []) {
      s.hatSnow = 0;
      s.swayV += r.range(-2.5, 2.5);
    }
    for (const it of this.decor?.items ?? []) it.snow = 0;
    sc.emit('shake', W / 2, H / 2, 1);
  }

  // ---------- SceneModule ----------

  step(dt: number): void {
    this.stepProjectiles(dt);
    this.stepSplats(dt);
    // отпечатки, которые полностью замело или убрали, забываем
    if (this.scene.time % 2 < dt) this.decals = this.decals.filter((d) => this.decalAlpha(d) > 0.02);
  }

  snapshot(): unknown {
    return this.decals.map((d) => ({ ...d }));
  }
  restore(s: unknown): void {
    this.decals = (s as Decal[]).map((d) => ({ ...d }));
  }
  serialize(): unknown {
    return this.decals.map((d) => [d.kind === 'angel' ? 1 : 0, Math.round(d.x), +d.h0.toFixed(1), d.flip]);
  }
  deserialize(d: unknown): void {
    const { data, sx } = d as { data: number[][]; sx: number };
    if (!Array.isArray(data)) return;
    this.decals = data.slice(0, 400).map(([k, x, h0, flip]) => ({ kind: k ? 'angel' : 'foot', x: x * sx, h0, flip: flip || 1, seed: (x * 7919) | 0 }));
  }
  testInfo(): Record<string, unknown> {
    return { decals: this.decals.length, projectiles: this.projectiles.length, splats: this.splats.length };
  }
}
