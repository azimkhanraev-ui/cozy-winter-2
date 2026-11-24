// Ветер: базовое значение + турбулентность (процесс Орнштейна–Уленбека) + порывы.
import { Rng, noise1 } from './rng';

interface Gust {
  amp: number;
  t: number;
  attack: number;
  hold: number;
  decay: number;
}

export class Wind {
  /** Базовый ветер, px/s (знак — направление). */
  base = 30;
  /** Сила порывов 0..1. */
  gustiness = 0.5;
  /** Текущее глобальное значение, px/s. */
  value = 0;
  /** Дополнительный внешний импульс (например, «встряхнуть»), затухает сам. */
  impulse = 0;
  time = 0;
  private turb = 0;
  private gusts: Gust[] = [];
  constructor(private rng: Rng, private seed = 7) {}

  step(dt: number): void {
    const rng = this.rng;
    this.time += dt;
    const scale = Math.max(35, Math.abs(this.base));
    // Турбулентность
    const tau = 2.5;
    const sigma = this.gustiness * scale * 0.55;
    this.turb += (-this.turb / tau) * dt + sigma * Math.sqrt(2 * dt / tau) * rng.gauss();
    // Порывы
    if (this.gustiness > 0 && rng.chance(this.gustiness * 0.07 * dt)) {
      const dir = Math.abs(this.base) > 5 ? Math.sign(this.base) : rng.chance(0.5) ? 1 : -1;
      this.gusts.push({
        amp: dir * scale * this.gustiness * rng.range(0.7, 1.8),
        t: 0,
        attack: rng.range(0.8, 2),
        hold: rng.range(0.8, 3),
        decay: rng.range(1.5, 4),
      });
    }
    let g = 0;
    for (let i = this.gusts.length - 1; i >= 0; i--) {
      const q = this.gusts[i];
      q.t += dt;
      let k: number;
      if (q.t < q.attack) k = q.t / q.attack;
      else if (q.t < q.attack + q.hold) k = 1;
      else k = 1 - (q.t - q.attack - q.hold) / q.decay;
      if (k <= 0) {
        this.gusts.splice(i, 1);
        continue;
      }
      g += q.amp * k * k * (3 - 2 * k);
    }
    this.impulse *= Math.exp(-dt / 1.2);
    this.value = this.base + this.turb + g + this.impulse;
  }

  /** Локальный ветер в точке (лёгкая пространственная неоднородность). */
  at(x: number, y: number): number {
    const n = noise1(x / 520 + y / 900 - this.time * 0.12, this.seed);
    return this.value * (1 + 0.28 * n);
  }
}
