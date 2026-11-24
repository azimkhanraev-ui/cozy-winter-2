// Высотная карта снега. Чистый TS: колонки по COL_W px, высоты отсчитываются вверх от «земли».
import { Rng, fbm1, clamp, lerp, smoothstep } from './rng';

export const COL_W = 2;

export interface DriftParams {
  /** 0..1 — насколько поле неравномерности влияет на накопление. */
  unevenness: number;
  /** Максимальная высота сугробов, px. */
  maxHeight: number;
  /** Множитель скорости накопления. */
  accumulation: number;
  /** 0..1 — таяние. */
  melt: number;
  /** 0..1 — перенос ветром. */
  windTransport: number;
  /** Угол естественного откоса, градусы. */
  reposeDeg: number;
}

export const DEFAULT_DRIFT: DriftParams = {
  unevenness: 0.7,
  maxHeight: 90,
  accumulation: 1,
  melt: 0,
  windTransport: 0.5,
  reposeDeg: 36,
};

export interface DustEvent {
  x: number;
  h: number;
  amount: number;
}

export class SnowField {
  readonly n: number;
  /** Скрытый рельеф-основа (камни, бугры). */
  readonly base: Float32Array;
  /** Толщина снега. */
  readonly snow: Float32Array;
  /** Рыхлый (свежий) снег, ≤ snow. Его переносит ветер, со временем он уплотняется. */
  readonly fresh: Float32Array;
  /** Поле неравномерности (среднее ≈ 1): где-то почти 0, где-то 2–3. */
  readonly field: Float32Array;
  /** Высота препятствий (шары, снеговики, декор) над землёй; 0 — нет. */
  readonly obstacle: Float32Array;
  params: DriftParams;
  /** События «снежная пыль с гребня» за последний шаг. */
  dust: DustEvent[] = [];
  /** Увеличивается при каждом изменении — рендер решает, перерисовывать ли. */
  revision = 0;
  private rng: Rng;

  constructor(readonly width: number, readonly seed = 1, params: Partial<DriftParams> = {}) {
    this.n = Math.max(4, Math.ceil(width / COL_W) + 1);
    this.base = new Float32Array(this.n);
    this.snow = new Float32Array(this.n);
    this.fresh = new Float32Array(this.n);
    this.field = new Float32Array(this.n);
    this.obstacle = new Float32Array(this.n);
    this.params = { ...DEFAULT_DRIFT, ...params };
    this.rng = new Rng(seed * 7919 + 13);
    this.generateRelief();
    this.generateField();
  }

  // ---------- генерация ----------

  private generateRelief(): void {
    const r = this.rng;
    const s = this.seed;
    for (let i = 0; i < this.n; i++) {
      const x = i * COL_W;
      this.base[i] = 3 + 3 * fbm1(x / 240, s + 11, 3) + 1.2 * fbm1(x / 37, s + 23, 2);
    }
    // Пологие бугры
    const bumps = Math.max(2, Math.round(this.width / 450));
    for (let k = 0; k < bumps; k++) {
      const c = r.range(0, this.width);
      const w = r.range(50, 180);
      const h = r.range(3, 10);
      this.addProfile(c, w, h, 2);
    }
    // Камни: узкие, с более крутыми боками
    const rocks = Math.max(1, Math.round(this.width / 600));
    for (let k = 0; k < rocks; k++) {
      const c = r.range(30, this.width - 30);
      const w = r.range(14, 34);
      const h = r.range(6, 15);
      this.addProfile(c, w, h, 0.6);
    }
    for (let i = 0; i < this.n; i++) this.base[i] = Math.max(0, this.base[i]);
  }

  /** Добавить к основе «купол» (cos-профиль, степень p задаёт крутизну). */
  private addProfile(cx: number, halfW: number, h: number, p: number): void {
    const i0 = Math.max(0, Math.floor((cx - halfW) / COL_W));
    const i1 = Math.min(this.n - 1, Math.ceil((cx + halfW) / COL_W));
    for (let i = i0; i <= i1; i++) {
      const d = Math.abs(i * COL_W - cx) / halfW;
      if (d < 1) this.base[i] += h * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * d), p);
    }
  }

  private generateField(): void {
    const r = this.rng;
    const s = this.seed;
    const f = this.field;
    for (let i = 0; i < this.n; i++) {
      const x = i * COL_W;
      f[i] = 1 + 0.9 * fbm1(x / 610, s + 101, 3) + 0.3 * fbm1(x / 140, s + 131, 2);
    }
    // Зоны намётов
    const zones = Math.max(2, Math.round((this.width / 1920) * r.int(3, 5)));
    for (let k = 0; k < zones; k++) {
      const c = r.range(0, this.width);
      const w = r.range(50, 260);
      const amp = r.range(1, 3);
      const sharp = r.range(1.2, 2.6);
      for (let i = 0; i < this.n; i++) {
        const d = (i * COL_W - c) / w;
        f[i] += amp * Math.exp(-Math.pow(Math.abs(d), sharp));
      }
    }
    // Почти голые места (выдуваемые проплешины)
    const bare = Math.max(1, Math.round((this.width / 1920) * r.int(3, 4)));
    for (let k = 0; k < bare; k++) {
      const c = r.range(0, this.width);
      const w = r.range(60, 220);
      const depth = r.range(0.85, 0.98);
      for (let i = 0; i < this.n; i++) {
        const d = Math.abs(i * COL_W - c) / w;
        f[i] *= 1 - depth * (1 - smoothstep(0.5, 1.2, d));
      }
    }
    let mean = 0;
    for (let i = 0; i < this.n; i++) {
      // степень усиливает контраст: намёты выше, проплешины голее
      f[i] = Math.pow(Math.max(0.02, f[i]), 1.35);
      mean += f[i];
    }
    mean /= this.n;
    for (let i = 0; i < this.n; i++) f[i] /= mean;
  }

  // ---------- доступ ----------

  col(x: number): number {
    return clamp(Math.round(x / COL_W), 0, this.n - 1);
  }

  /** Видимая высота поверхности в колонке: снег + основа (основа «проявляется» только под снегом). */
  visibleHeight(i: number): number {
    const s = this.snow[i];
    return s + this.base[i] * smoothstep(0, 4, s);
  }

  /** Интерполированная видимая высота в точке x. */
  heightAt(x: number): number {
    const fx = clamp(x / COL_W, 0, this.n - 1);
    const i = Math.floor(fx);
    const j = Math.min(this.n - 1, i + 1);
    return lerp(this.visibleHeight(i), this.visibleHeight(j), fx - i);
  }

  /** Физическая высота поверхности (основа + снег). */
  top(i: number): number {
    return this.base[i] + this.snow[i];
  }

  totalSnow(): number {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.snow[i];
    return s * COL_W;
  }

  // ---------- источники/стоки ----------

  /** Локальный множитель накопления (неравномерность × мягкий предел высоты). */
  localFactor(i: number): number {
    const p = this.params;
    const f = lerp(1, this.field[i], p.unevenness);
    // Предел высоты тоже немного неравномерный — сугробы в зонах намётов могут быть выше.
    const cap = p.maxHeight * lerp(1, clamp(0.55 + 0.35 * this.field[i], 0.5, 1.6), p.unevenness);
    const k = this.snow[i] / cap;
    const capF = k >= 1 ? 0 : 1 - k * k;
    return f * capF;
  }

  /**
   * Хлопья долетели до земли: добавить снег площадью `area` (px²) около x с разбросом.
   * Возвращает добавленный объём.
   */
  deposit(x: number, area: number, spread = 4): number {
    const r = this.rng;
    const xx = x + r.gauss() * spread;
    const c = this.col(xx);
    const amt = (area * this.params.accumulation * this.localFactor(c)) / COL_W;
    if (amt <= 0) return 0;
    // Треугольное ядро на 3 колонки — без «иголок»
    let added = 0;
    for (let d = -1; d <= 1; d++) {
      const i = c + d;
      if (i < 0 || i >= this.n) continue;
      const w = d === 0 ? 0.5 : 0.25;
      const a = amt * w;
      this.snow[i] += a;
      this.fresh[i] += a;
      added += a;
    }
    this.revision++;
    return added * COL_W;
  }

  /** Добавить снег без учёта поля неравномерности (кисть «Насыпать», тесты). */
  addRaw(i: number, h: number): void {
    if (i < 0 || i >= this.n) return;
    this.snow[i] += h;
    this.fresh[i] += h;
    this.revision++;
  }

  clear(): void {
    this.snow.fill(0);
    this.fresh.fill(0);
    this.revision++;
  }

  // ---------- процессы ----------

  get maxDiff(): number {
    return Math.tan((this.params.reposeDeg * Math.PI) / 180) * COL_W;
  }

  /**
   * Осыпание по углу естественного откоса. Сохраняет объём точно:
   * снег только перекладывается между соседними колонками, основа не двигается.
   * Возвращает максимальное превышение уклона до прохода.
   */
  relax(passes = 2, rate = 0.5): number {
    const maxD = this.maxDiff;
    const { base, snow, fresh, n } = this;
    let worst = 0;
    for (let p = 0; p < passes; p++) {
      const fwd = (p & 1) === 0;
      for (let k = 0; k < n - 1; k++) {
        const i = fwd ? k : n - 2 - k;
        const j = i + 1;
        const d = base[i] + snow[i] - (base[j] + snow[j]);
        let hi: number, lo: number, ex: number;
        if (d > maxD) {
          hi = i; lo = j; ex = d - maxD;
        } else if (-d > maxD) {
          hi = j; lo = i; ex = -d - maxD;
        } else continue;
        if (ex > worst) worst = ex;
        const t = Math.min(ex * rate, snow[hi]);
        if (t <= 0) continue;
        const fr = snow[hi] > 0 ? (fresh[hi] / snow[hi]) * t : 0;
        snow[hi] -= t;
        snow[lo] += t;
        fresh[hi] -= fr;
        fresh[lo] += fr;
      }
    }
    if (worst > 0) this.revision++;
    return worst;
  }

  /** Осыпать до устойчивого состояния (для тестов и «Присыпать сразу»). */
  settle(maxIter = 4000, eps = 0.01): number {
    let w = Infinity;
    for (let it = 0; it < maxIter && w > eps; it++) w = this.relax(2, 0.5);
    return w;
  }

  /** Максимальное превышение угла откоса там, где на верхней колонке есть снег. */
  maxSlopeViolation(): number {
    const maxD = this.maxDiff;
    let worst = 0;
    for (let i = 0; i < this.n - 1; i++) {
      const d = this.top(i) - this.top(i + 1);
      const hi = d > 0 ? i : i + 1;
      if (this.snow[hi] < 1e-3) continue; // голый камень может быть крутым
      worst = Math.max(worst, Math.abs(d) - maxD);
    }
    return worst;
  }

  /**
   * Перенос рыхлого снега ветром. wind — px/s (знак — направление).
   * За препятствиями (рельеф, шары, декор) — зона затишья, там растут намёты.
   */
  windStep(wind: number, dt: number): void {
    this.dust.length = 0;
    const p = this.params;
    if (p.windTransport <= 0) return;
    const s = Math.abs(wind) / 160; // нормированная сила
    const s0 = 0.22;
    if (s <= s0) return;
    const dir = wind > 0 ? 1 : -1;
    const { base, snow, fresh, obstacle, n } = this;
    const power = Math.pow(s - s0, 1.5) * p.windTransport;
    const shadowDrop = Math.tan((11 * Math.PI) / 180) * COL_W;
    let horizon = -1e9;
    let carried = 0;
    let prevTop = dir > 0 ? base[0] + snow[0] : base[n - 1] + snow[n - 1];
    let changed = false;
    for (let k = 0; k < n; k++) {
      const i = dir > 0 ? k : n - 1 - k;
      const top = base[i] + snow[i];
      const obst = obstacle[i];
      horizon -= shadowDrop;
      if (obst > top) {
        // Под препятствием снег не оседает (он «обтекает» препятствие), но и не сдувается.
        horizon = Math.max(horizon, obst);
        prevTop = top;
        continue;
      }
      const shelter = horizon - top;
      if (shelter > 0.3) {
        // Зона затишья: снег оседает, тем сильнее, чем глубже тень.
        const dep = carried * Math.min(0.5, 0.06 + shelter * 0.03);
        if (dep > 0) {
          snow[i] += dep;
          fresh[i] += dep;
          carried -= dep;
          changed = true;
        }
      } else {
        // Открытое место: эрозия рыхлого слоя; наветренный склон (подъём по ветру) теряет больше.
        const slope = (top - prevTop) / COL_W;
        const expo = clamp(1 + slope * 2.5, 0.2, 3);
        let e = 0.9 * power * expo * dt * Math.min(fresh[i], 6);
        e = Math.min(e, fresh[i], snow[i]);
        if (e > 0) {
          snow[i] -= e;
          fresh[i] -= e;
          carried += e;
          changed = true;
        }
        // Часть летящего снега всё равно падает (сальтация) — без резких краёв.
        const land = carried * 0.012;
        snow[i] += land;
        fresh[i] += land;
        carried -= land;
        // Снежная пыль с гребней при сильном ветре
        if (s > 0.75 && e > 0.004 && top >= prevTop) {
          const nxt = i + dir;
          if (nxt >= 0 && nxt < n && base[nxt] + snow[nxt] <= top && this.rng.chance(0.25 * (s - 0.6))) {
            this.dust.push({ x: i * COL_W, h: top, amount: e });
          }
        }
      }
      horizon = Math.max(horizon, top);
      prevTop = top;
    }
    // carried, вылетевший за край экрана, унесён ветром.
    if (changed) this.revision++;
  }

  /** Уплотнение: свежий снег оседает (теряет ~25% объёма) и перестаёт быть рыхлым. */
  compactStep(dt: number): void {
    const { snow, fresh, n } = this;
    const k = 1 - Math.exp(-dt / 150);
    for (let i = 0; i < n; i++) {
      const f = fresh[i];
      if (f <= 1e-5) continue;
      const c = f * k;
      fresh[i] = f - c;
      snow[i] -= c * 0.25;
    }
  }

  /** Таяние: тонкий снег тает относительно быстрее. */
  meltStep(dt: number): void {
    const m = this.params.melt;
    if (m <= 0) return;
    const { snow, fresh, n } = this;
    const rate = m * 0.06 * dt; // px/s при 100% ≈ 3.6 px/мин
    for (let i = 0; i < n; i++) {
      const s = snow[i];
      if (s <= 0) continue;
      const d = Math.min(s, rate * (1 + 2 / (1 + s)));
      snow[i] = s - d;
      fresh[i] = Math.min(fresh[i], snow[i]);
    }
    this.revision++;
  }

  step(dt: number, wind: number): void {
    this.windStep(wind, dt);
    this.relax(2, 0.5);
    this.compactStep(dt);
    this.meltStep(dt);
  }

  // ---------- сохранение ----------

  /** Перенести снег из другой карты (при смене размера окна) с пересэмплированием. */
  copyFrom(other: SnowField): void {
    for (let i = 0; i < this.n; i++) {
      const x = (i / (this.n - 1)) * (other.n - 1);
      const a = Math.floor(x);
      const b = Math.min(other.n - 1, a + 1);
      const t = x - a;
      this.snow[i] = lerp(other.snow[a], other.snow[b], t);
      this.fresh[i] = lerp(other.fresh[a], other.fresh[b], t);
    }
    this.revision++;
  }
}
