// Физика снежных шаров: круги с гравитацией, трением, лёгкой упругостью, сопротивлением качению,
// контактами с картой высот, друг с другом, со статикой (снеговики, декор, снегоуборщик) и краями экрана.
// Спящие шары не двигаются и не дрожат. Чистый TS.
import type { Scene, SceneModule } from './scene';
import type { Flake } from './snowfall';
import { COL_W } from './terrain';

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Угловая скорость, рад/с (по часовой — положительная, т.к. y вниз). */
  w: number;
  angle: number;
  r: number;
  /** Снежная «шапочка» сверху, px. */
  cap: number;
  sleeping: boolean;
  sleepT: number;
  /** Сколько секунд шар неподвижен (для сборки снеговика). */
  still: number;
  /** Ведётся мышью (кинематический). */
  held: boolean;
  /** Катается по снегу и растёт (кинематический). */
  rolling: boolean;
  /** >0 — тает (прогресс 0..1). */
  melting: number;
  /** На чём лежит: id шара, 0 — земля, -1 — ничего/статика. */
  restsOn: number;
  /** Время последнего удара (для звука). */
  seed: number;
}

export interface StaticCircle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  owner: string;
}
export interface StaticRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  owner: string;
}

interface Contact {
  a: Ball;
  b: Ball | null;
  /** Нормаль от b (или поверхности) к a. */
  nx: number;
  ny: number;
  pen: number;
  /** Скорость второй стороны (для движущейся статики). */
  ovx: number;
  ovy: number;
  pn: number;
  pt: number;
  pr: number;
  prB: number;
  ground: boolean;
  bias: number;
}

export const GRAVITY = 1400;
const MU = 0.9;
/** Сопротивление качению по снегу на земле и между шарами (снег липнет к снегу — больше). */
const MU_ROLL_GROUND = 0.26;
const MU_ROLL_BALL = 0.7;
const RESTITUTION = 0.18;
const SLEEP_V = 7;
const SLEEP_T = 0.35;
const WAKE_V = 70;

export class BallWorld implements SceneModule {
  balls: Ball[] = [];
  private nextId = 1;
  circles: StaticCircle[] = [];
  rects: StaticRect[] = [];
  /** Источники статики (снеговики, декор, снегоуборщики) — заполняют circles/rects перед шагом. */
  staticProviders: ((c: StaticCircle[], r: StaticRect[]) => void)[] = [];
  /** Снег копится на шарах. */
  capSnow = true;
  /** Удары (для звука). */
  impacts: { x: number; y: number; power: number }[] = [];
  private stepNo = 0;

  constructor(private scene: Scene) {}

  get H(): number {
    return this.scene.height;
  }
  get W(): number {
    return this.scene.width;
  }

  add(x: number, y: number, r: number, vx = 0, vy = 0): Ball {
    const b: Ball = { id: this.nextId++, x, y, vx, vy, w: 0, angle: (this.nextId * 2.39996) % (Math.PI * 2), r, cap: 0, sleeping: false, sleepT: 0, still: 0, held: false, rolling: false, melting: 0, restsOn: -1, seed: Math.floor(this.scene.rng.next() * 1e6) };
    this.balls.push(b);
    return b;
  }

  remove(id: number): void {
    const i = this.balls.findIndex((b) => b.id === id);
    if (i >= 0) this.balls.splice(i, 1);
  }

  get(id: number): Ball | undefined {
    return this.balls.find((b) => b.id === id);
  }

  wake(b: Ball): void {
    b.sleeping = false;
    b.sleepT = 0;
  }

  /** Разбудить шары, касающиеся области (например, после работы инструментом). */
  wakeNear(x: number, y: number, R: number): void {
    for (const b of this.balls) if (Math.hypot(b.x - x, b.y - y) < b.r + R + 4) this.wake(b);
  }

  // ---------- геометрия ----------

  surfaceY(x: number): number {
    return this.H - this.scene.field.heightAt(x);
  }

  /** Контакт шара с поверхностью снега (или null). slack — дополнительный зазор для проверки опоры. */
  groundContact(b: Ball, slack = 0): { nx: number; ny: number; pen: number } | null {
    const r = b.r + slack;
    // центр под поверхностью — выталкиваем вверх
    const sc = this.surfaceY(b.x);
    if (sc < b.y) return { nx: 0, ny: -1, pen: r + (b.y - sc) };
    let best: { nx: number; ny: number; pen: number } | null = null;
    const step = Math.max(2, b.r / 6);
    for (let xs = b.x - r * 0.97; xs <= b.x + r * 0.97; xs += step) {
      const sy = this.surfaceY(xs);
      const dx = xs - b.x;
      const dy = sy - b.y;
      const d = Math.hypot(dx, dy);
      if (d >= r || d < 1e-6) continue;
      const pen = r - d;
      if (!best || pen > best.pen) best = { nx: -dx / d, ny: -dy / d, pen };
    }
    return best;
  }

  private buildContacts(): Contact[] {
    const out: Contact[] = [];
    const bs = this.balls;
    for (const a of bs) {
      if (a.melting > 0.95) continue;
      if (!a.sleeping || a.held || a.rolling) {
        const g = this.groundContact(a);
        if (g) out.push(this.mk(a, null, g.nx, g.ny, g.pen, 0, 0, true));
        if (a.x - a.r < 0) out.push(this.mk(a, null, 1, 0, a.r - a.x, 0, 0, false));
        if (a.x + a.r > this.W) out.push(this.mk(a, null, -1, 0, a.x + a.r - this.W, 0, 0, false));
        for (const c of this.circles) {
          const dx = a.x - c.x;
          const dy = a.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d < a.r + c.r && d > 1e-6) out.push(this.mk(a, null, dx / d, dy / d, a.r + c.r - d, c.vx, c.vy, false));
        }
        for (const rc of this.rects) {
          const px = Math.max(rc.x0, Math.min(a.x, rc.x1));
          const py = Math.max(rc.y0, Math.min(a.y, rc.y1));
          const dx = a.x - px;
          const dy = a.y - py;
          const d = Math.hypot(dx, dy);
          if (d < a.r && d > 1e-6) out.push(this.mk(a, null, dx / d, dy / d, a.r - d, 0, 0, false));
          else if (d <= 1e-6) out.push(this.mk(a, null, 0, -1, a.r + (a.y - rc.y0), 0, 0, false));
        }
      }
    }
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        if (a.sleeping && b.sleeping && !a.held && !b.held && !a.rolling && !b.rolling) continue;
        if (a.melting > 0.95 || b.melting > 0.95) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const rr = a.r + b.r;
        if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
        const d = Math.hypot(dx, dy);
        if (d >= rr || d < 1e-6) continue;
        out.push(this.mk(a, b, dx / d, dy / d, rr - d, 0, 0, false));
      }
    }
    return out;
  }

  private mk(a: Ball, b: Ball | null, nx: number, ny: number, pen: number, ovx: number, ovy: number, ground: boolean): Contact {
    return { a, b, nx, ny, pen, ovx, ovy, pn: 0, pt: 0, pr: 0, prB: 0, ground, bias: 0 };
  }

  /** Обратная масса/инерция: удерживаемые, катаемые и спящие (для чужих контактов) — бесконечная масса. */
  private im(b: Ball | null, asOther = false): number {
    if (!b || b.held || b.rolling) return 0;
    if (b.sleeping && asOther) return 0;
    return 1 / (b.r * b.r);
  }
  private iI(b: Ball | null, asOther = false): number {
    if (!b || b.held || b.rolling) return 0;
    if (b.sleeping && asOther) return 0;
    return 1 / (0.5 * b.r * b.r * b.r * b.r);
  }

  private solve(contacts: Contact[], dt: number): void {
    // будим спящих при сильном ударе
    for (const c of contacts) {
      if (!c.b) continue;
      const rv = (c.a.vx - c.b.vx) * c.nx + (c.a.vy - c.b.vy) * c.ny;
      if (c.b.sleeping && !c.a.sleeping && rv < -WAKE_V) this.wake(c.b);
      if (c.a.sleeping && !c.b.sleeping && rv < -WAKE_V) this.wake(c.a);
    }
    // упругость: целевая скорость отскока по начальной относительной скорости
    for (const c of contacts) {
      const vn = this.relN(c);
      c.bias = vn < -120 ? -RESTITUTION * vn : 0;
      if (vn < -150) this.impacts.push({ x: c.a.x - c.nx * c.a.r, y: c.a.y - c.ny * c.a.r, power: Math.min(1, -vn / 900) });
    }
    for (let it = 0; it < 10; it++) {
      for (const c of contacts) {
        const a = c.a;
        const b = c.b;
        const aS = a.sleeping && !!b && !b.sleeping; // спящий a отвечает за контакт только как опора
        const imA = aS ? 0 : this.im(a);
        const iIA = aS ? 0 : this.iI(a);
        const imB = this.im(b, true);
        const iIB = this.iI(b, true);
        if (imA + imB === 0) continue;
        const { nx, ny } = c;
        const tx = -ny;
        const ty = nx;
        // нормаль
        const vn = this.relN(c);
        let dpn = (-vn + c.bias) / (imA + imB);
        const pn0 = c.pn;
        c.pn = Math.max(0, pn0 + dpn);
        dpn = c.pn - pn0;
        this.applyImpulse(c, nx * dpn, ny * dpn, imA, iIA, imB, iIB);
        // трение
        const vt = this.relT(c, tx, ty);
        const kt = imA + iIA * a.r * a.r + imB + (b ? iIB * b.r * b.r : 0);
        if (kt > 0) {
          let dpt = -vt / kt;
          const pt0 = c.pt;
          c.pt = Math.max(-MU * c.pn, Math.min(MU * c.pn, pt0 + dpt));
          dpt = c.pt - pt0;
          this.applyImpulse(c, tx * dpt, ty * dpt, imA, iIA, imB, iIB);
        }
        // сопротивление качению: снег вминается и липнет — шару трудно катиться по пологому,
        // а шар на шаре держится, пока смещение небольшое. Действует на ОБА тела контакта.
        const muR = b ? MU_ROLL_BALL : MU_ROLL_GROUND;
        if (iIA > 0) {
          const maxR = muR * c.pn * a.r;
          const pr0 = c.pr;
          c.pr = Math.max(-maxR, Math.min(maxR, pr0 - a.w / iIA));
          a.w += (c.pr - pr0) * iIA;
        }
        if (b && iIB > 0) {
          const maxR = muR * c.pn * b.r;
          const pr0 = c.prB;
          c.prB = Math.max(-maxR, Math.min(maxR, pr0 - b.w / iIB));
          b.w += (c.prB - pr0) * iIB;
        }
      }
    }
    void dt;
  }

  private relN(c: Contact): number {
    const a = c.a;
    const b = c.b;
    // скорость точки контакта: v + w × r (для нормали вращение не влияет — r ∥ n)
    const bvx = b ? b.vx : c.ovx;
    const bvy = b ? b.vy : c.ovy;
    return (a.vx - bvx) * c.nx + (a.vy - bvy) * c.ny;
  }

  private relT(c: Contact, tx: number, ty: number): number {
    const a = c.a;
    const b = c.b;
    // точка контакта на a: -n·ra; скорость вращения w×r = (-w*ry, w*rx)
    const rax = -c.nx * a.r;
    const ray = -c.ny * a.r;
    let vax = a.vx - a.w * ray;
    let vay = a.vy + a.w * rax;
    let vbx = c.ovx;
    let vby = c.ovy;
    if (b) {
      const rbx = c.nx * b.r;
      const rby = c.ny * b.r;
      vbx = b.vx - b.w * rby;
      vby = b.vy + b.w * rbx;
    }
    vax -= vbx;
    vay -= vby;
    return vax * tx + vay * ty;
  }

  private applyImpulse(c: Contact, px: number, py: number, imA: number, iIA: number, imB: number, iIB: number): void {
    const a = c.a;
    const rax = -c.nx * a.r;
    const ray = -c.ny * a.r;
    a.vx += px * imA;
    a.vy += py * imA;
    a.w += (rax * py - ray * px) * iIA;
    const b = c.b;
    if (b) {
      const rbx = c.nx * b.r;
      const rby = c.ny * b.r;
      b.vx -= px * imB;
      b.vy -= py * imB;
      b.w -= (rbx * py - rby * px) * iIB;
    }
  }

  /** Позиционная коррекция (без добавления энергии). */
  private correct(contacts: Contact[]): void {
    for (const c of contacts) {
      const a = c.a;
      const b = c.b;
      const aS = a.sleeping && !!b && !b.sleeping;
      const imA = aS ? 0 : this.im(a);
      const imB = this.im(b, true);
      const sum = imA + imB;
      if (sum === 0) continue;
      const pen = c.pen - 0.25;
      if (pen <= 0) continue;
      const k = (pen * 0.7) / sum;
      a.x += c.nx * k * imA;
      a.y += c.ny * k * imA;
      if (b) {
        b.x -= c.nx * k * imB;
        b.y -= c.ny * k * imB;
      }
    }
  }

  // ---------- шаг ----------

  step(dt: number): void {
    this.stepNo++;
    this.circles.length = 0;
    this.rects.length = 0;
    for (const p of this.staticProviders) p(this.circles, this.rects);
    const sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) this.substep(h);
    this.post(dt);
  }

  private substep(h: number): void {
    for (const b of this.balls) {
      if (b.sleeping || b.held || b.rolling) continue;
      b.vy += GRAVITY * h;
      b.vx *= 1 - 0.05 * h;
      b.vy *= 1 - 0.05 * h;
    }
    let contacts = this.buildContacts();
    this.solve(contacts, h);
    // шар на снегу «пашет» его и быстро теряет скорость
    for (const c of contacts) {
      if (!c.ground || c.a.held || c.a.rolling || c.a.sleeping) continue;
      const k = Math.max(0, 1 - 1.6 * h);
      c.a.vx *= k;
      c.a.w *= k;
    }
    for (const b of this.balls) {
      if (b.sleeping || b.held || b.rolling) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 3000) {
        b.vx *= 3000 / sp;
        b.vy *= 3000 / sp;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.angle += b.w * h;
    }
    for (let k = 0; k < 2; k++) {
      contacts = this.buildContacts();
      this.correct(contacts);
    }
    // на чём лежит каждый шар (для снеговиков). У спящих контакты не строятся — они помнят опору.
    for (const b of this.balls) if (!b.sleeping) b.restsOn = -1;
    for (const c of contacts) {
      if (c.a.sleeping) continue;
      if (c.ny > -0.55) continue; // опора должна быть снизу
      if (c.ground) c.a.restsOn = 0;
      else if (c.b && c.a.restsOn !== 0) c.a.restsOn = c.b.id;
      else if (!c.b && c.a.restsOn === -1) c.a.restsOn = -2; // статика
    }
    for (const c of contacts) {
      if (!c.b || c.b.sleeping) continue;
      // b тоже может лежать на a (нормаль контакта направлена от b к a)
      if (c.ny > 0.55 && c.b.restsOn !== 0) c.b.restsOn = c.a.id;
    }
  }

  private post(dt: number): void {
    const H = this.H;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      // таяние
      if (b.melting > 0) {
        b.melting = Math.min(1, b.melting + dt * 0.9);
        b.r *= 1 - dt * 1.6;
        b.cap *= 1 - dt * 3;
        this.wake(b);
        const rng = this.scene.rng;
        if (rng.chance(0.6)) this.scene.particles.push({ kind: 'drop', x: b.x + rng.range(-0.7, 0.7) * b.r, y: b.y + b.r * 0.6, vx: rng.range(-10, 10), vy: 10, life: 0, maxLife: 1.4, r: 1.5 });
        if (b.r < 3 || b.melting >= 1) {
          this.balls.splice(i, 1);
          continue;
        }
      }
      // улетел за экран
      if (b.y > H + 300 || b.x < -400 || b.x > this.W + 400) {
        this.balls.splice(i, 1);
        continue;
      }
      if (b.held || b.rolling) {
        b.sleeping = false;
        b.still = 0;
        continue;
      }
      const v = Math.hypot(b.vx, b.vy) + Math.abs(b.w) * b.r * 0.5;
      if (!b.sleeping) {
        if (v < SLEEP_V && b.restsOn !== -1) b.sleepT += dt;
        else b.sleepT = 0;
        if (b.sleepT > SLEEP_T) {
          b.sleeping = true;
          b.vx = b.vy = b.w = 0;
        }
      }
      b.still = b.sleeping || v < SLEEP_V ? b.still + dt : 0;
      // шапочка слетает, если шар быстро катится
      if (Math.abs(b.w) * b.r > 80 && b.cap > 0.5) {
        this.scene.particles.push({ kind: 'puff', x: b.x, y: b.y - b.r, vx: b.vx * 0.3, vy: -30, life: 0, maxLife: 0.6, r: 2 + b.cap * 0.5 });
        b.cap = 0;
      }
    }
    // проверка опоры у спящих: если снег под шаром убрали — шар падает
    if (this.stepNo % 8 === 0) {
      for (const b of this.balls) {
        if (!b.sleeping) continue;
        if (!this.hasSupport(b)) this.wake(b);
        else {
          const g = this.groundContact(b);
          if (g && g.pen > 3) this.wake(b); // снег подтаял/насыпали — переуложить
        }
      }
    }
    for (const im of this.impacts) this.scene.emit('thud', im.x, im.y, im.power);
    this.impacts.length = 0;
  }

  hasSupport(b: Ball): boolean {
    if (this.groundContact(b, 1.5)) return true;
    for (const o of this.balls) {
      if (o === b) continue;
      const d = Math.hypot(b.x - o.x, b.y - o.y);
      if (d < b.r + o.r + 1.5 && o.y > b.y - b.r * 0.2) return true;
    }
    for (const c of this.circles) if (Math.hypot(b.x - c.x, b.y - c.y) < b.r + c.r + 1.5) return true;
    for (const rc of this.rects) {
      const px = Math.max(rc.x0, Math.min(b.x, rc.x1));
      const py = Math.max(rc.y0, Math.min(b.y, rc.y1));
      if (Math.hypot(b.x - px, b.y - py) < b.r + 1.5) return true;
    }
    return false;
  }

  // ---------- катание кома ----------

  /**
   * Прокатить ком к x по поверхности: снег под пятном контакта забирается из карты, объём ровно
   * переходит в шар (площадь круга растёт на собранную площадь). Остаётся чистая полоса.
   * Возвращает собранную площадь.
   */
  rollTo(b: Ball, x: number, maxR = 90): number {
    const f = this.scene.field;
    let collected = 0;
    const dir = Math.sign(x - b.x);
    let guard = 0;
    while (Math.abs(x - b.x) > 0.5 && guard++ < 400) {
      const dx = dir * Math.min(2, Math.abs(x - b.x));
      b.x += dx;
      b.angle += dx / b.r;
      // пятно контакта: ширина ~ радиус
      const half = Math.max(4, b.r * 0.55);
      const i0 = Math.max(0, Math.floor((b.x - half) / COL_W));
      const i1 = Math.min(f.n - 1, Math.ceil((b.x + half) / COL_W));
      for (let i = i0; i <= i1 && b.r < maxR - 1e-6; i++) {
        // сколько ещё влезет в шар до максимального радиуса (в высоте колонки)
        const room = (Math.PI * (maxR * maxR - b.r * b.r)) / COL_W;
        const take = Math.min(f.snow[i], room);
        if (take <= 0) continue;
        f.snow[i] -= take;
        f.fresh[i] = Math.min(f.fresh[i], f.snow[i]);
        collected += take * COL_W;
        b.r = Math.sqrt(b.r * b.r + (take * COL_W) / Math.PI);
      }
      b.y = this.surfaceY(b.x) - b.r + Math.min(2, b.r * 0.08);
    }
    if (collected > 0) f.revision++;
    return collected;
  }

  // ---------- SceneModule ----------

  catchFlake(fl: Flake): boolean {
    for (const b of this.balls) {
      const dx = fl.x - b.x;
      if (dx < -b.r || dx > b.r) continue;
      const dy = fl.y - b.y;
      if (dx * dx + dy * dy > (b.r + b.cap + 1) * (b.r + b.cap + 1)) continue;
      if (this.capSnow && dy < -b.r * 0.35 && !b.held && Math.abs(b.w) * b.r < 40) {
        b.cap = Math.min(b.r * 0.3, b.cap + (Math.PI * fl.r * fl.r * 0.35) / (b.r * 0.9));
      }
      return true;
    }
    return false;
  }

  obstacles(obst: Float32Array): void {
    const H = this.H;
    for (const b of this.balls) {
      const top = H - (b.y - b.r);
      const i0 = Math.max(0, Math.floor((b.x - b.r) / COL_W));
      const i1 = Math.min(obst.length - 1, Math.ceil((b.x + b.r) / COL_W));
      for (let i = i0; i <= i1; i++) {
        const dx = i * COL_W - b.x;
        const h = top - b.r + Math.sqrt(Math.max(0, b.r * b.r - dx * dx));
        if (h > obst[i]) obst[i] = h;
      }
    }
  }

  snapshot(): unknown {
    return this.balls.map((b) => ({ ...b, held: false, rolling: false }));
  }
  restore(s: unknown): void {
    this.balls = (s as Ball[]).map((b) => ({ ...b, sleeping: false, sleepT: 0 }));
    this.nextId = Math.max(this.nextId, ...this.balls.map((b) => b.id + 1));
  }
  serialize(): unknown {
    return this.balls.filter((b) => b.melting === 0).map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: +b.r.toFixed(1), a: +b.angle.toFixed(2), c: +b.cap.toFixed(1) }));
  }
  deserialize(d: unknown): void {
    const { data, sx } = d as { data: { x: number; y: number; r: number; a: number; c: number }[]; sx: number };
    if (!Array.isArray(data)) return;
    this.balls = [];
    for (const o of data.slice(0, 200)) {
      if (![o.x, o.y, o.r].every(Number.isFinite)) continue;
      const b = this.add(o.x * sx, Math.min(o.y, this.H - o.r), Math.max(4, Math.min(90, o.r)));
      b.angle = o.a || 0;
      b.cap = Math.max(0, o.c || 0);
    }
  }
  testInfo(): Record<string, unknown> {
    return { balls: this.balls.length, sleeping: this.balls.filter((b) => b.sleeping).length, radii: this.balls.map((b) => +b.r.toFixed(1)) };
  }
}
