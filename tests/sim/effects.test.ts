import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/sim/scene';
import { BallWorld } from '../../src/sim/physics';
import { SnowmanModule } from '../../src/sim/snowman';
import { EffectsModule } from '../../src/sim/effects';

const H = 600;
function setup() {
  const sc = new Scene(1200, H, 9);
  sc.apply({ snowfall: { intensity: 0 }, windBase: 0, gustiness: 0, drift: { windTransport: 0 } });
  sc.field.base.fill(0);
  for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = 25;
  const w = new BallWorld(sc);
  const sm = new SnowmanModule(sc, w);
  const fx = new EffectsModule(sc, w, sm, null);
  sc.modules.balls = w;
  sc.modules.snowmen = sm;
  sc.modules.fx = fx;
  return { sc, w, sm, fx };
}
const run = (sc: Scene, s: number) => {
  for (let i = 0; i < Math.round(s * 60); i++) sc.step();
};

describe('следы', () => {
  it('шаги оставляют вмятины (объём сохраняется) и постепенно заметаются', () => {
    const { sc, fx } = setup();
    const v0 = sc.field.totalSnow();
    for (let x = 300; x < 600; x += 5) fx.walk(x);
    expect(fx.decals.length).toBeGreaterThan(8);
    expect(Math.abs(sc.field.totalSnow() - v0) / v0).toBeLessThan(0.001);
    const d = fx.decals[3];
    expect(fx.decalAlpha(d)).toBeGreaterThan(0.9);
    // снегопад заметает
    sc.apply({ snowfall: { intensity: 1 }, drift: { accumulation: 3 } });
    run(sc, 120);
    expect(fx.decalAlpha(d)).toBeLessThan(0.3);
  });

  it('снежный ангел — широкий штамп', () => {
    const { sc, fx } = setup();
    expect(fx.angel(600)).toBe(true);
    expect(sc.field.snow[sc.field.col(600)]).toBeLessThan(20);
  });
});

describe('снежковый бой', () => {
  it('снежок долетает до «стекла» и оставляет брызги, которые сползают и тают', () => {
    const { sc, fx } = setup();
    fx.throwBall(600, 400, 100, -600);
    run(sc, 1.2);
    expect(fx.splats.length).toBe(1);
    const y0 = fx.splats[0].y;
    run(sc, 5);
    expect(fx.splats[0].y).toBeGreaterThan(y0 + 5);
    run(sc, 25);
    expect(fx.splats.length).toBe(0);
  });

  it('попадание в снеговика: вздрагивает и роняет шапку', () => {
    const { sc, w, sm, fx } = setup();
    const g = H - 25;
    w.add(600, g - 40, 40);
    run(sc, 1.5);
    w.add(600, g - 80 - 28 - 10, 28);
    run(sc, 2);
    w.add(601, g - 80 - 56 - 19 - 10, 19);
    run(sc, 2);
    const s = sm.snowmen[0];
    s.look.hat = 'top';
    const head = { x: s.x + s.parts[2].dx, y: s.y + s.parts[2].dy };
    // бросок из точки слева-снизу прямо в голову (по прямой: гравитацию компенсируем вверх)
    const t = 0.4;
    fx.throwBall(head.x - 200, head.y, 200 / t, (0 - 0.5 * 700 * t * t) / t);
    run(sc, 0.8);
    expect(s.hatOff).toBeGreaterThan(0);
    expect(Math.abs(s.swayV) + Math.abs(s.sway)).toBeGreaterThan(0.1);
  });
});

describe('снежный шар', () => {
  it('встряхивание поднимает снег вихрем, и он оседает обратно (объём сохраняется)', () => {
    const { sc, fx } = setup();
    const v0 = sc.field.totalSnow();
    fx.shake();
    expect(sc.field.totalSnow()).toBeLessThan(v0 * 0.6);
    expect(sc.particles.filter((p) => p.kind === 'swirl').length).toBeGreaterThan(100);
    run(sc, 20);
    expect(sc.particles.filter((p) => p.kind === 'swirl' || p.kind === 'carrier').length).toBe(0);
    // часть могла улететь за край экрана — допускаем 10%
    expect(sc.field.totalSnow()).toBeGreaterThan(v0 * 0.9);
  });
});

import { LedgeModule } from '../../src/sim/ledges';

describe('снег на краях окон', () => {
  it('копится на видимой части кромки и осыпается вниз, когда окно сдвигают', () => {
    const sc = new Scene(1200, 600, 2);
    sc.apply({ snowfall: { intensity: 1 }, windBase: 0, gustiness: 0 });
    const lm = new LedgeModule(sc);
    lm.enabled = true;
    sc.modules.ledges = lm;
    // окно 300..700, но его правую половину закрывает другое окно
    lm.update([{ id: 'w', x: 300, y: 250, w: 400, h: 200, top: [[300, 500]] }]);
    for (let k = 0; k < 60 * 60; k++) sc.step();
    const l = lm.ledges.get('w')!;
    const left = l.cols.slice(0, 60).reduce((a, b) => a + b, 0);
    const right = l.cols.slice(80).reduce((a, b) => a + b, 0);
    expect(left).toBeGreaterThan(20);
    expect(right).toBe(0); // на перекрытой части снега нет
    const v0 = sc.field.totalSnow();
    // окно сдвинули — снег падает частицами и ложится на землю
    lm.update([{ id: 'w', x: 500, y: 300, w: 400, h: 200, top: [[500, 900]] }]);
    expect(lm.ledges.get('w')!.cols.reduce((a, b) => a + b, 0)).toBe(0);
    expect(sc.particles.some((p) => p.kind === 'carrier')).toBe(true);
    sc.apply({ snowfall: { intensity: 0 } });
    for (let k = 0; k < 60 * 10; k++) sc.step();
    expect(sc.field.totalSnow()).toBeGreaterThan(v0);
    // окно закрыли — кромка исчезает
    lm.update([]);
    expect(lm.ledges.size).toBe(0);
  });
});
