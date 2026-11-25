import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/sim/scene';
import { BallWorld } from '../../src/sim/physics';
import { SnowmanModule, checkStack } from '../../src/sim/snowman';

const H = 700;

function setup() {
  const sc = new Scene(1200, H, 6);
  sc.apply({ snowfall: { intensity: 0 }, windBase: 0, gustiness: 0, drift: { windTransport: 0 } });
  sc.field.base.fill(0);
  for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = 15;
  const w = new BallWorld(sc);
  const sm = new SnowmanModule(sc, w);
  sc.modules.balls = w;
  sc.modules.snowmen = sm;
  return { sc, w, sm };
}
const run = (sc: Scene, s: number) => {
  for (let i = 0; i < Math.round(s * 60); i++) sc.step();
};
/** Поставить стопку, как это сделал бы пользователь: по одному шару сверху. */
function stack(sc: Scene, w: BallWorld, radii: [number, number, number], off = [0, 3, 5]) {
  const g = H - 15;
  w.add(600 + off[0], g - radii[0], radii[0]);
  run(sc, 1.5);
  w.add(600 + off[1], g - radii[0] * 2 - radii[1] - 30, radii[1]);
  run(sc, 2);
  w.add(600 + off[2], g - radii[0] * 2 - radii[1] * 2 - radii[2] - 30, radii[2]);
  run(sc, 3);
}

describe('правила сборки', () => {
  it('checkStack: порядок и смещение', () => {
    expect(checkStack({ x: 0, r: 42 }, { x: 0, r: 30 }, { x: 0, r: 20 }).ok).toBe(true);
    expect(checkStack({ x: 0, r: 30 }, { x: 0, r: 42 }, { x: 0, r: 20 })).toEqual({ ok: false, reason: 'order' });
    expect(checkStack({ x: 0, r: 42 }, { x: 0, r: 41 }, { x: 0, r: 20 })).toEqual({ ok: false, reason: 'order' });
    expect(checkStack({ x: 0, r: 42 }, { x: 0, r: 30 }, { x: 0, r: 12 })).toEqual({ ok: false, reason: 'order' }); // < 0.4·r_низа
    expect(checkStack({ x: 0, r: 42 }, { x: 25, r: 30 }, { x: 25, r: 20 })).toEqual({ ok: false, reason: 'crooked' });
  });
});

describe('снеговик из трёх шаров', () => {
  it('три шара в правильном порядке дают ровно одного снеговика', () => {
    const { sc, w, sm } = setup();
    stack(sc, w, [42, 30, 20]);
    expect(sm.snowmen.length).toBe(1);
    expect(w.balls.length).toBe(0);
    const s = sm.snowmen[0];
    // пропорции реальных шаров
    expect(s.parts.map((p) => Math.round(p.r))).toEqual([42, 30, 20]);
    run(sc, 3);
    expect(sm.snowmen.length).toBe(1); // не плодится
  });

  it('в неправильном порядке — 0 снеговиков и подсказка', () => {
    const { sc, w, sm } = setup();
    // одинаковые шары: стоят, но порядок неверный (средний не меньше нижнего)
    stack(sc, w, [30, 30, 20]);
    expect(sm.snowmen.length).toBe(0);
    expect(sm.hint?.reason).toBe('order');
  });

  it('маленький снизу, большой сверху — 0 снеговиков', () => {
    const { sc, w, sm } = setup();
    stack(sc, w, [20, 30, 42]);
    run(sc, 3);
    expect(sm.snowmen.length).toBe(0);
  });

  it('пока шары двигаются, снеговик не собирается', () => {
    const { sc, w, sm } = setup();
    const g = H - 15;
    w.add(600, g - 42, 42);
    w.add(600, g - 84 - 30, 30);
    w.add(600, g - 84 - 60 - 20, 20);
    // через 0.3 с ещё рано (нужно ≥ 0.6 с неподвижности)
    run(sc, 0.3);
    expect(sm.snowmen.length).toBe(0);
    run(sc, 2);
    expect(sm.snowmen.length).toBe(1);
  });

  it('лимит снеговиков соблюдается', () => {
    const { sc, w, sm } = setup();
    sm.limit = 1;
    stack(sc, w, [42, 30, 20]);
    const g = H - 15;
    w.add(300, g - 40, 40);
    run(sc, 1.5);
    w.add(300, g - 80 - 28 - 20, 28);
    run(sc, 2);
    w.add(300, g - 80 - 56 - 18 - 20, 18);
    run(sc, 3);
    expect(sm.snowmen.length).toBe(1);
    expect(sm.hint?.reason).toBe('limit');
  });

  it('снеговик стоит на снегу и опускается, если снег под ним убрать', () => {
    const { sc, w, sm } = setup();
    stack(sc, w, [42, 30, 20]);
    const s = sm.snowmen[0];
    const y0 = s.y;
    for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = 0;
    run(sc, 2);
    expect(s.y).toBeGreaterThan(y0 + 10);
  });
});
