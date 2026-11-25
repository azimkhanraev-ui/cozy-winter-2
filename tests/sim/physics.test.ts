import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/sim/scene';
import { BallWorld } from '../../src/sim/physics';

const H = 700;

function world(snow = 0) {
  const sc = new Scene(1200, H, 4);
  sc.apply({ snowfall: { intensity: 0 }, windBase: 0, gustiness: 0, drift: { windTransport: 0 } });
  sc.field.base.fill(0);
  for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = snow;
  const w = new BallWorld(sc);
  sc.modules.balls = w;
  return { sc, w };
}
const run = (sc: Scene, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) sc.step();
};

describe('шары: базовая физика', () => {
  it('шар падает и спокойно ложится на снег, засыпает', () => {
    const { sc, w } = world(20);
    const b = w.add(600, 100, 26);
    run(sc, 3);
    expect(b.y).toBeCloseTo(H - 20 - 26, 0);
    expect(b.sleeping).toBe(true);
  });

  it('шары не проникают друг в друга', () => {
    const { sc, w } = world(10);
    for (let k = 0; k < 12; k++) w.add(500 + (k % 4) * 30, 100 - k * 60, 14 + (k % 3) * 10);
    run(sc, 6);
    for (const a of w.balls)
      for (const b of w.balls) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r - 1.5);
      }
    for (const a of w.balls) expect(a.y + a.r).toBeLessThanOrEqual(H - 10 + 1.5);
  });

  it('шар держится в пределах экрана', () => {
    const { sc, w } = world(10);
    const b = w.add(1150, 300, 30, 2500, 0);
    run(sc, 3);
    expect(b.x + b.r).toBeLessThanOrEqual(1200 + 1);
  });

  it('по крутому склону шар скатывается, на ровном месте — лежит', () => {
    const { sc, w } = world(0);
    // склон 40°: высота растёт влево
    for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = Math.max(0, (300 - i) * 2 * Math.tan((40 * Math.PI) / 180));
    sc.field.params.reposeDeg = 50;
    const b = w.add(300, H - 300, 20);
    run(sc, 4);
    expect(b.x).toBeGreaterThan(560); // скатился к подножию
    expect(b.x).toBeLessThan(1100); // и остановился, а не укатился через весь экран
    // на ровном снегу шар, брошенный сверху, остаётся на месте
    const f = world(10);
    const b2 = f.w.add(900, H - 200, 20);
    run(f.sc, 4);
    expect(Math.abs(b2.x - 900)).toBeLessThan(1);
  });

  it('на пологом склоне (10°) шар лежит', () => {
    const { sc, w } = world(0);
    for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = Math.max(0, (600 - i) * 2 * Math.tan((10 * Math.PI) / 180));
    const b = w.add(600, H - 200, 26);
    run(sc, 4);
    const x = b.x;
    run(sc, 3);
    expect(Math.abs(b.x - x)).toBeLessThan(0.5);
    expect(b.sleeping).toBe(true);
  });
});

describe('стопка из трёх шаров', () => {
  for (const off of [0, 6]) {
    it(`стоит устойчиво (смещение ${off}px), без дрожания`, () => {
      const { sc, w } = world(15);
      const g = H - 15;
      const b1 = w.add(600, g - 42, 42);
      const b2 = w.add(600 + off, g - 84 - 26, 26);
      const b3 = w.add(600 + off * 1.5, g - 84 - 52 - 14, 14);
      run(sc, 2);
      const p = [b1, b2, b3].map((b) => [b.x, b.y]);
      run(sc, 10);
      [b1, b2, b3].forEach((b, k) => {
        expect(Math.abs(b.x - p[k][0])).toBeLessThan(0.5);
        expect(Math.abs(b.y - p[k][1])).toBeLessThan(0.5);
        expect(b.sleeping).toBe(true);
      });
      // порядок не нарушен: средний на нижнем, верхний на среднем
      expect(b2.restsOn === b1.id || b2.sleeping).toBe(true);
      expect(b3.y).toBeLessThan(b2.y);
      expect(b2.y).toBeLessThan(b1.y);
    });
  }

  it('стопка, поставленная падением сверху, тоже устаканивается', () => {
    const { sc, w } = world(15);
    w.add(600, 300, 42);
    run(sc, 2);
    w.add(602, 150, 26);
    run(sc, 3);
    w.add(603, 50, 14);
    run(sc, 4);
    const [a, b, c] = w.balls;
    expect(b.y).toBeLessThan(a.y - a.r);
    expect(c.y).toBeLessThan(b.y - b.r);
    expect(w.balls.every((x) => x.sleeping)).toBe(true);
  });

  it('если убрать снег под стопкой — шары падают', () => {
    const { sc, w } = world(30);
    const b = w.add(600, H - 30 - 30, 30);
    run(sc, 1.5);
    expect(b.sleeping).toBe(true);
    for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = 0;
    run(sc, 1.5);
    expect(b.y).toBeGreaterThan(H - 30 - 2);
  });
});

describe('катание кома', () => {
  it('ком растёт, снег на пути убирается, объём сохраняется', () => {
    const { sc, w } = world(12);
    const v0 = sc.field.totalSnow();
    const b = w.add(200, H - 12 - 8, 8);
    b.rolling = true;
    const a0 = Math.PI * b.r * b.r;
    const collected = w.rollTo(b, 700);
    const v1 = sc.field.totalSnow();
    const a1 = Math.PI * b.r * b.r;
    expect(b.r).toBeGreaterThan(30);
    expect(Math.abs(v0 - v1 - (a1 - a0)) / (a1 - a0)).toBeLessThan(0.01);
    expect(collected).toBeCloseTo(a1 - a0, 0);
    // чистая полоса
    for (let x = 260; x < 640; x += 10) expect(sc.field.snow[sc.field.col(x)]).toBeLessThan(0.5);
  });

  it('у максимального радиуса ком перестаёт расти, но объём не теряется', () => {
    const { sc, w } = world(40);
    const v0 = sc.field.totalSnow();
    const b = w.add(50, H - 48, 8);
    b.rolling = true;
    w.rollTo(b, 1150, 30);
    expect(b.r).toBeLessThanOrEqual(30 + 1e-6);
    const v1 = sc.field.totalSnow();
    expect(Math.abs(v0 - v1 - Math.PI * (b.r * b.r - 64)) / v0).toBeLessThan(0.001);
  });
});
