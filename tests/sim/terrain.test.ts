import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/sim/scene';
import { SnowField, COL_W } from '../../src/sim/terrain';
import { Rng } from '../../src/sim/rng';

function stats(f: SnowField) {
  const m = Math.floor(f.n * 0.03);
  const v: number[] = [];
  for (let i = m; i < f.n - m; i++) v.push(f.snow[i]);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  const s = [...v].sort((a, b) => a - b);
  return { mean, sd, cv: sd / mean, p10: s[Math.floor(s.length * 0.1)], p90: s[Math.floor(s.length * 0.9)] };
}

function fallFlakes(unevenness: number, count: number, seed = 3) {
  const sc = new Scene(1920, 1000, seed);
  sc.apply({ drift: { unevenness, maxHeight: 120, accumulation: 1 }, snowfall: { intensity: 1 }, windBase: 25, gustiness: 0.4 });
  let guard = 0;
  while (sc.snowfall.landed < count && guard++ < 200000) sc.step();
  return sc;
}

describe('SnowField: накопление', () => {
  it('после 10 000 хлопьев снег неровный (разброс высот выше порога)', () => {
    const sc = fallFlakes(0.7, 10000);
    expect(sc.snowfall.landed).toBeGreaterThanOrEqual(10000);
    sc.field.settle();
    const s = stats(sc.field);
    expect(s.mean).toBeGreaterThan(1);
    expect(s.cv).toBeGreaterThan(0.35);
    expect(s.p90 - s.p10).toBeGreaterThan(s.mean * 0.8);
  });

  it('слайдер «Неравномерность» реально влияет: 0% ровнее, чем 100%', () => {
    const even = stats(fallFlakes(0, 6000).field);
    const uneven = stats(fallFlakes(1, 6000).field);
    expect(uneven.cv).toBeGreaterThan(even.cv * 1.8);
  });

  it('разные места — разный снег: есть почти голые места и глубокие сугробы', () => {
    const sc = fallFlakes(1, 10000, 11);
    sc.field.settle();
    const s = stats(sc.field);
    expect(s.p10).toBeLessThan(s.mean * 0.45);
    expect(s.p90).toBeGreaterThan(s.mean * 1.5);
  });
});

describe('SnowField: угол откоса', () => {
  it('после 10 000 хлопьев склоны не круче угла откоса', () => {
    const sc = fallFlakes(0.7, 10000, 5);
    sc.field.settle();
    expect(sc.field.maxSlopeViolation()).toBeLessThan(0.05);
  });

  it('высокая «стенка» осыпается в пологий холм', () => {
    const f = new SnowField(800, 2);
    for (let i = 190; i < 200; i++) f.addRaw(i, 150);
    f.settle();
    expect(f.maxSlopeViolation()).toBeLessThan(0.05);
    let peak = 0;
    for (let i = 0; i < f.n; i++) peak = Math.max(peak, f.snow[i]);
    expect(peak).toBeLessThan(150);
  });
});

describe('SnowField: сохранение объёма', () => {
  it('объём при осыпании сохраняется (±1%)', () => {
    const f = new SnowField(1200, 9);
    const r = new Rng(42);
    for (let k = 0; k < 60; k++) {
      const c = r.int(5, f.n - 6);
      const h = r.range(10, 120);
      for (let d = -3; d <= 3; d++) f.addRaw(c + d, h);
    }
    const before = f.totalSnow();
    f.settle();
    const after = f.totalSnow();
    expect(Math.abs(after - before) / before).toBeLessThan(0.01);
  });

  it('снег никогда не уходит в минус', () => {
    const sc = fallFlakes(1, 3000, 8);
    sc.apply({ windBase: 220, gustiness: 1 });
    for (let k = 0; k < 600; k++) sc.step();
    for (let i = 0; i < sc.field.n; i++) {
      expect(sc.field.snow[i]).toBeGreaterThanOrEqual(0);
      expect(sc.field.fresh[i]).toBeGreaterThanOrEqual(-1e-4);
    }
  });
});

describe('SnowField: ветер', () => {
  it('за препятствием растёт намёт, с наветренной стороны тоньше', () => {
    const f = new SnowField(1000, 4, { unevenness: 0, windTransport: 1 });
    f.base.fill(0);
    for (let i = 0; i < f.n; i++) f.addRaw(i, 10);
    // Препятствие (как шар) на x≈500
    const c = Math.round(500 / COL_W);
    for (let d = -15; d <= 15; d++) f.obstacle[c + d] = 50;
    for (let k = 0; k < 900; k++) {
      f.windStep(200, 1 / 60);
      f.relax(2);
    }
    const avg = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += f.snow[i];
      return s / (b - a);
    };
    const windward = avg(c - 60, c - 20);
    const lee = avg(c + 18, c + 60);
    expect(lee).toBeGreaterThan(windward * 1.3);
  });
});
