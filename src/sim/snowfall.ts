// Падающий снег: слои глубины, типы хлопьев, инерция к ветру, покачивание.
import { Rng, clamp } from './rng';
import { Wind } from './wind';
import { SnowField } from './terrain';

export enum FlakeType {
  Soft = 0,
  Crystal = 1,
  Fluffy = 2,
  Glitter = 3,
}

export interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  layer: number;
  type: FlakeType;
  phase: number;
  swayAmp: number;
  swayFreq: number;
  rot: number;
  rotSpeed: number;
  fall: number;
  /** Для дальних слоёв: высота, на которой хлопья растворяются (0 — долетает до земли). */
  fadeY: number;
  alpha: number;
  /** >0 — хлопья лежит на снегу и тает (секунды). */
  rest: number;
  seed: number;
}

export interface LayerSpec {
  rMin: number;
  rMax: number;
  speed: number;
  windK: number;
  alpha: number;
  blur: number;
  /** Доля от общего числа хлопьев. */
  weight: number;
  lands: boolean;
}

/** 0 — дальний, 3 — ближний (перед «землёй», крупный и размытый). */
export const LAYERS: LayerSpec[] = [
  { rMin: 0.6, rMax: 1.2, speed: 24, windK: 0.4, alpha: 0.42, blur: 0, weight: 0.3, lands: false },
  { rMin: 1.0, rMax: 1.9, speed: 38, windK: 0.65, alpha: 0.7, blur: 0, weight: 0.32, lands: true },
  { rMin: 1.7, rMax: 3.2, speed: 58, windK: 0.9, alpha: 0.92, blur: 0.4, weight: 0.3, lands: true },
  { rMin: 4.5, rMax: 8.5, speed: 105, windK: 1.25, alpha: 0.5, blur: 2.5, weight: 0.08, lands: false },
];

/** Какие слои включаются при layers = 1..4 (сначала основной средний). */
const LAYER_ORDER = [2, 1, 3, 0];

export interface SnowfallParams {
  /** 0..1 */
  intensity: number;
  /** Множитель размера. */
  sizeScale: number;
  layers: number;
  types: [boolean, boolean, boolean, boolean];
}

export const DEFAULT_SNOWFALL: SnowfallParams = {
  intensity: 0.45,
  sizeScale: 1,
  layers: 4,
  types: [true, true, true, true],
};

/** Хлопьев в секунду на 1000 px ширины при intensity = 1. */
const RATE_PER_1000 = 26;
/** Сколько площади снега (в долях от площади хлопья) даёт одна осевшая снежинка: задаёт темп накопления. */
export const DEPOSIT_K = 0.35;

export class Snowfall {
  flakes: Flake[] = [];
  params: SnowfallParams;
  /** Счётчик осевших хлопьев (для тестов/статистики). */
  landed = 0;
  private acc = 0;
  private pool: Flake[] = [];
  private seedCounter = 1;

  constructor(private rng: Rng, public width: number, public height: number, params: Partial<SnowfallParams> = {}) {
    this.params = { ...DEFAULT_SNOWFALL, ...params };
  }

  private activeLayers(): number[] {
    return LAYER_ORDER.slice(0, clamp(Math.round(this.params.layers), 1, 4));
  }

  private pickType(): FlakeType {
    const t = this.params.types;
    const w = [t[0] ? 0.45 : 0, t[1] ? 0.22 : 0, t[2] ? 0.2 : 0, t[3] ? 0.13 : 0];
    const sum = w[0] + w[1] + w[2] + w[3];
    if (sum <= 0) return FlakeType.Soft;
    let u = this.rng.next() * sum;
    for (let i = 0; i < 4; i++) {
      u -= w[i];
      if (u <= 0) return i as FlakeType;
    }
    return FlakeType.Soft;
  }

  spawn(layer: number, y?: number): Flake {
    const r = this.rng;
    const L = LAYERS[layer];
    const f = this.pool.pop() ?? ({} as Flake);
    const type = this.pickType();
    let rad = r.range(L.rMin, L.rMax) * this.params.sizeScale;
    let fall = L.speed * r.range(0.8, 1.2);
    if (type === FlakeType.Crystal) { rad *= 1.25; fall *= 0.8; }
    else if (type === FlakeType.Fluffy) { rad *= 1.35; fall *= 0.7; }
    else if (type === FlakeType.Glitter) { rad *= 0.6; fall *= 1.1; }
    f.x = r.range(-20, this.width + 20);
    f.y = y ?? r.range(-40, -5);
    f.vx = 0;
    f.vy = fall;
    f.r = rad;
    f.layer = layer;
    f.type = type;
    f.phase = r.range(0, Math.PI * 2);
    f.swayAmp = r.range(6, 22) * (layer === 3 ? 1.5 : 1) * (type === FlakeType.Fluffy ? 1.4 : 1);
    f.swayFreq = r.range(0.5, 1.4);
    f.rot = r.range(0, Math.PI * 2);
    f.rotSpeed = r.range(-1.5, 1.5);
    f.fall = fall;
    f.fadeY = L.lands ? 0 : layer === 0 ? r.range(0.5, 0.97) * this.height : this.height + 40;
    f.alpha = L.alpha * r.range(0.75, 1);
    f.rest = 0;
    f.seed = this.seedCounter++;
    return f;
  }

  /** Заполнить экран хлопьями сразу (старт без «пустого неба»). */
  prefill(): void {
    const layers = this.activeLayers();
    const total = (RATE_PER_1000 * this.params.intensity * this.width) / 1000;
    for (const l of layers) {
      const L = LAYERS[l];
      const count = Math.round(total * L.weight * (this.height / L.speed));
      for (let k = 0; k < count; k++) this.flakes.push(this.spawn(l, this.rng.range(-20, this.height)));
    }
  }

  /**
   * Шаг: ветер, покачивание, оседание на снег.
   * onLand получает хлопья, долетевшие до поверхности (уже после добавления снега в карту).
   */
  step(dt: number, wind: Wind, field: SnowField | null): void {
    const r = this.rng;
    const p = this.params;
    // Рождение
    const layers = this.activeLayers();
    const rate = (RATE_PER_1000 * p.intensity * this.width) / 1000;
    this.acc += rate * dt;
    let wsum = 0;
    for (const l of layers) wsum += LAYERS[l].weight;
    while (this.acc >= 1) {
      this.acc -= 1;
      let u = r.next() * wsum;
      let chosen = layers[0];
      for (const l of layers) {
        u -= LAYERS[l].weight;
        if (u <= 0) { chosen = l; break; }
      }
      const f = this.spawn(chosen);
      // При сильном ветре часть хлопьев влетает сбоку
      const wv = wind.value * LAYERS[chosen].windK;
      if (Math.abs(wv) > 40 && r.chance(clamp(Math.abs(wv) / 400, 0, 0.5))) {
        f.x = wv > 0 ? -15 : this.width + 15;
        f.y = r.range(-20, this.height * 0.7);
      }
      this.flakes.push(f);
    }

    const H = this.height;
    const W = this.width;
    const t = wind.time;
    const arr = this.flakes;
    for (let k = arr.length - 1; k >= 0; k--) {
      const f = arr[k];
      if (f.rest > 0) {
        f.rest -= dt;
        f.alpha *= Math.exp(-dt * 0.9);
        if (f.rest <= 0) this.kill(k);
        continue;
      }
      const L = LAYERS[f.layer];
      const target = wind.at(f.x, f.y) * L.windK;
      // Инерция: маленькие хлопья быстрее подхватываются ветром
      const tau = 0.25 + f.r * 0.06;
      f.vx += ((target - f.vx) * dt) / tau;
      const sway = Math.sin(t * f.swayFreq * 2 + f.phase) * f.swayAmp;
      // Горизонтальный ветер немного замедляет падение пушистых
      const vy = f.fall * (1 + 0.15 * Math.sin(t * f.swayFreq * 1.3 + f.phase * 2));
      f.x += (f.vx + sway * 0.9 * f.swayFreq) * dt;
      f.y += vy * dt;
      f.rot += f.rotSpeed * dt;
      // Горизонтальное «заворачивание»
      if (f.x < -40) f.x += W + 80;
      else if (f.x > W + 40) f.x -= W + 80;

      if (L.lands && field) {
        const surf = H - field.heightAt(f.x);
        if (f.y + f.r * 0.3 >= surf) {
          if (f.x >= 0 && f.x <= W) {
            const area = DEPOSIT_K * Math.PI * f.r * f.r * (f.type === FlakeType.Fluffy ? 1.6 : 1);
            field.deposit(f.x, area, 2 + f.r * 1.5);
          }
          this.landed++;
          f.y = surf - f.r * 0.2;
          f.rest = r.range(0.6, 2.2);
          continue;
        }
      } else if (f.fadeY > 0 && f.y > f.fadeY) {
        f.alpha -= dt * 1.5;
        if (f.alpha <= 0) { this.kill(k); continue; }
      }
      if (f.y > H + 30) this.kill(k);
    }
  }

  private kill(k: number): void {
    const arr = this.flakes;
    const f = arr[k];
    arr[k] = arr[arr.length - 1];
    arr.pop();
    if (this.pool.length < 2000) this.pool.push(f);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
}
