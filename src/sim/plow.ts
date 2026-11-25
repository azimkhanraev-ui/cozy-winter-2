// Снегоуборщик: едет сам по расписанию или под ручным управлением, срезает снег с карты высот
// и разбрасывает его частицами; снеговиков объезжает (уходит «за» них на задний план). Чистый TS.
import type { Scene, SceneModule } from './scene';
import type { StaticCircle, BallWorld } from './physics';
import { COL_W } from './terrain';
import { partCenters, type SnowmanModule } from './snowman';

export interface Plow {
  id: number;
  x: number;
  y: number;
  dir: number;
  /** Текущая скорость, px/с (со знаком). */
  v: number;
  scale: number;
  color: string;
  /** 0 — передний план (чистит), 1 — позади снеговиков (объезд). */
  lane: number;
  laneTarget: number;
  manual: boolean;
  throttle: number;
  throttleT: number;
  boost: boolean;
  wheel: number;
  horn: number;
  /** Сколько снега убрано (px²). */
  cleared: number;
}

export interface PlowSettings {
  enabled: boolean;
  speed: number;
  size: number;
  color: string;
  count: number;
  interval: number;
  direction: 'ltr' | 'rtl' | 'alternate';
}

/** Размеры при масштабе 1. */
export const PLOW_LEN = 120;
export const PLOW_H = 66;
/** Высота оставляемого под отвалом слоя, px. */
const LEAVE = 1.2;

export class PlowModule implements SceneModule {
  plows: Plow[] = [];
  settings: PlowSettings = { enabled: true, speed: 55, size: 100, color: '#f4c430', count: 1, interval: 480, direction: 'alternate' };
  private timer = 0;
  private nextId = 1;
  private altDir = 1;

  constructor(private scene: Scene, world: BallWorld | null, private snowmen: SnowmanModule | null) {
    // отвал толкает шары (кинематический круг)
    world?.staticProviders.push((c) => this.colliders(c));
    // первый выезд — через ~1.5 минуты (а потом по интервалу), чтобы сугробы успели вырасти
    this.timer = this.settings.interval - 90;
  }

  private colliders(out: StaticCircle[]): void {
    for (const p of this.plows) {
      if (p.lane > 0.3) continue;
      const s = p.scale;
      const r = PLOW_H * 0.32 * s;
      out.push({ x: p.x + p.dir * PLOW_LEN * 0.5 * s, y: p.y - r * 0.9, r, vx: p.v, vy: 0, owner: `plow${p.id}` });
      out.push({ x: p.x, y: p.y - PLOW_H * 0.45 * s, r: PLOW_H * 0.42 * s, vx: p.v, vy: 0, owner: `plow${p.id}` });
    }
  }

  spawn(dir: number, manual = false): Plow {
    const s = this.settings.size / 100;
    const W = this.scene.width;
    const p: Plow = {
      id: this.nextId++,
      x: manual ? (dir > 0 ? W * 0.2 : W * 0.8) : dir > 0 ? -PLOW_LEN * s : W + PLOW_LEN * s,
      y: this.scene.height,
      dir,
      v: 0,
      scale: s,
      color: this.settings.color,
      lane: 0,
      laneTarget: 0,
      manual,
      throttle: 0,
      throttleT: 0,
      boost: false,
      wheel: 0,
      horn: 0,
      cleared: 0,
    };
    this.plows.push(p);
    return p;
  }

  /** Ручное управление (стрелки/WASD, пробел — гудок). */
  drive(key: 'left' | 'right' | 'up' | 'down' | 'horn'): void {
    let p = this.plows.find((x) => x.manual);
    if (!p) p = this.spawn(1, true);
    if (key === 'left' || key === 'right') {
      const d = key === 'left' ? -1 : 1;
      p.throttle = d;
      p.dir = d;
      p.throttleT = 0.4;
    } else if (key === 'up') p.boost = true;
    else if (key === 'down') {
      p.throttle = 0;
      p.throttleT = 0;
      p.boost = false;
    } else if (key === 'horn') this.honk(p);
  }

  honk(p: Plow): void {
    p.horn = 0.6;
    this.scene.emit('horn', p.x, p.y - 40, 1);
  }

  /** Перевести ручной снегоуборщик в автоматический (уедет сам). */
  releaseManual(): void {
    for (const p of this.plows) if (p.manual) p.manual = false;
  }

  private snowmanAhead(p: Plow, dist: number): boolean {
    if (!this.snowmen) return false;
    const front = p.x + p.dir * PLOW_LEN * 0.5 * p.scale;
    for (const s of this.snowmen.snowmen) {
      for (const c of partCenters(s)) {
        const near = p.dir > 0 ? c.x + c.r > front - 10 && c.x - c.r < front + dist : c.x - c.r < front + 10 && c.x + c.r > front - dist;
        const behindBody = Math.abs(c.x - p.x) < PLOW_LEN * 0.6 * p.scale + c.r;
        if (near || behindBody) return true;
      }
    }
    return false;
  }

  step(dt: number): void {
    const st = this.settings;
    const sc = this.scene;
    const W = sc.width;
    // расписание выездов
    if (st.enabled) {
      this.timer += dt;
      const auto = this.plows.filter((p) => !p.manual).length;
      if (auto < st.count && this.timer >= st.interval) {
        this.timer = 0;
        const dir = st.direction === 'ltr' ? 1 : st.direction === 'rtl' ? -1 : this.altDir;
        if (st.direction === 'alternate') this.altDir = -this.altDir;
        // второй/третий выезжают следом через интервал
        this.spawn(dir, false);
      }
    }
    for (let i = this.plows.length - 1; i >= 0; i--) {
      const p = this.plows[i];
      p.scale += (st.size / 100 - p.scale) * Math.min(1, dt * 2);
      p.color = st.color;
      let target: number;
      if (p.manual) {
        p.throttleT -= dt;
        if (p.throttleT <= 0) p.throttle = 0;
        target = p.throttle * st.speed * (p.boost ? 2 : 1.3);
        if (p.throttle === 0) p.boost = false;
      } else target = p.dir * st.speed;
      p.v += (target - p.v) * Math.min(1, dt * 2.5);
      // объезд снеговиков: уходим на задний план, пока снеговик рядом
      p.laneTarget = this.snowmanAhead(p, 110 * p.scale) ? 1 : 0;
      p.lane += Math.sign(p.laneTarget - p.lane) * Math.min(Math.abs(p.laneTarget - p.lane), dt * 1.8);
      p.x += p.v * dt;
      p.wheel += (p.v * dt) / (10 * p.scale);
      if (p.horn > 0) p.horn -= dt;
      if (p.manual) p.x = Math.max(PLOW_LEN * 0.5 * p.scale, Math.min(W - PLOW_LEN * 0.5 * p.scale, p.x));
      // срезаем снег отвалом (только на переднем плане)
      if (p.lane < 0.5 && Math.abs(p.v) > 2) this.cut(p, dt);
      // гусеницы идут по тому, что осталось
      const half = PLOW_LEN * 0.42 * p.scale;
      let gy = sc.height;
      for (let x = p.x - half; x <= p.x + half; x += 8) gy = Math.min(gy, sc.surfaceY(x));
      // на заднем плане снегоуборщик «дальше»: чуть выше и меньше (рисуется по lane)
      p.y += (gy - p.y) * Math.min(1, dt * 8);
      // уехал за край
      if (!p.manual && ((p.dir > 0 && p.x > W + PLOW_LEN * p.scale * 1.2) || (p.dir < 0 && p.x < -PLOW_LEN * p.scale * 1.2))) this.plows.splice(i, 1);
    }
  }

  private cut(p: Plow, dt: number): void {
    const f = this.scene.field;
    const r = this.scene.rng;
    const s = p.scale;
    const front = p.x + p.dir * PLOW_LEN * 0.52 * s;
    const bladeH = PLOW_H * 0.55 * s; // выше отвала снег не берётся — перелетает
    const reach = Math.abs(p.v * dt) + 4;
    const a = p.dir > 0 ? front - 4 : front - reach;
    const b = p.dir > 0 ? front + reach : front + 4;
    const i0 = Math.max(0, Math.floor(a / COL_W));
    const i1 = Math.min(f.n - 1, Math.ceil(b / COL_W));
    let vol = 0;
    for (let i = i0; i <= i1; i++) {
      const take = Math.max(0, Math.min(f.snow[i] - LEAVE, bladeH + 200));
      if (take <= 0) continue;
      f.snow[i] -= take;
      f.fresh[i] = Math.min(f.fresh[i], f.snow[i]);
      vol += take * COL_W;
    }
    if (vol <= 0) return;
    f.revision++;
    p.cleared += vol;
    // Снег вылетает из жёлоба вверх и вбок — как у настоящего снегоуборщика, с дороги в сторону.
    // В боковом виде «в сторону» = в глубину сцены: ~92% объёма уходит из профиля, ~8% лёгкой
    // порошей падает позади (иначе расчищенная полоса тут же засыпалась бы обратно).
    const chuteX = p.x - p.dir * PLOW_LEN * 0.05 * s;
    const chuteY = p.y - PLOW_H * 1.05 * s;
    const sc = this.scene;
    const n = Math.min(6, 1 + Math.floor(vol / 30));
    for (let k = 0; k < n && sc.particles.length < 900; k++) {
      const back = k === 0;
      sc.particles.push({
        kind: back ? 'carrier' : 'puff',
        vol: back ? vol * 0.08 : undefined,
        x: chuteX + r.range(-3, 3),
        y: chuteY,
        vx: -p.dir * r.range(60, 220) + p.v * 0.5,
        vy: -r.range(180, 340),
        life: 0,
        maxLife: back ? 8 : r.range(0.7, 1.3),
        r: back ? r.range(1.4, 2.6) : r.range(2, 4.5),
      });
    }
    if (r.chance(0.05)) sc.emit('crunch', front, p.y, 0.4);
  }

  // ---------- SceneModule ----------

  obstacles(obst: Float32Array): void {
    const H = this.scene.height;
    for (const p of this.plows) {
      if (p.lane > 0.5) continue;
      const half = PLOW_LEN * 0.5 * p.scale;
      const top = H - p.y + PLOW_H * p.scale;
      const i0 = Math.max(0, Math.floor((p.x - half) / COL_W));
      const i1 = Math.min(obst.length - 1, Math.ceil((p.x + half) / COL_W));
      for (let i = i0; i <= i1; i++) if (top > obst[i]) obst[i] = top;
    }
  }

  testInfo(): Record<string, unknown> {
    return { plows: this.plows.length, plowCleared: Math.round(this.plows.reduce((a, p) => a + p.cleared, 0)), plowLane: this.plows.map((p) => +p.lane.toFixed(2)) };
  }
}
