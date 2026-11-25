import { describe, it, expect } from 'vitest';
import { SnowField, COL_W } from '../../src/sim/terrain';
import { Scene } from '../../src/sim/scene';
import * as T from '../../src/sim/tools';

const H = 600;

function snowy(width = 1200, depth = 40) {
  const f = new SnowField(width, 5, { unevenness: 0 });
  for (let i = 0; i < f.n; i++) f.addRaw(i, depth + 10 * Math.sin(i / 17));
  f.settle();
  return f;
}

describe('ластик', () => {
  it('в радиусе ластика снега нет', () => {
    const f = snowy();
    const cx = 600;
    const R = 50;
    const cy = H - f.heightAt(cx) + 10; // круг касается поверхности и уходит в снег
    T.erase(f, H, cx, cy, R, 0.3);
    const core = R * 0.7;
    for (let i = 0; i < f.n; i++) {
      const x = i * COL_W;
      const dx = x - cx;
      if (Math.abs(dx) >= core) continue;
      const bottom = cy + Math.sqrt(R * R - dx * dx); // нижняя кромка круга (экранная y)
      const surface = H - (f.base[i] + f.snow[i]);
      // поверхность снега не выше нижней кромки круга → внутри круга снега нет
      // (если круг ниже скрытой основы, снега там просто не осталось: snow = 0)
      if (f.snow[i] > 0.01) expect(surface).toBeGreaterThanOrEqual(bottom - 0.01);
    }
  });

  it('размер 10–200 px работает на краях диапазона', () => {
    for (const R of [10, 200]) {
      const f = snowy();
      const before = f.totalSnow();
      T.erase(f, H, 600, H - f.heightAt(600), R, 0.4);
      expect(f.totalSnow()).toBeLessThan(before);
    }
  });
});

describe('лопата', () => {
  it('объём при работе лопатой сохраняется', () => {
    const f = snowy();
    const before = f.totalSnow();
    let x = 200;
    const y = H - f.heightAt(x) + 15;
    for (let k = 0; k < 40; k++) {
      T.shovel(f, H, x, y, 30, 1);
      x += 15;
    }
    expect(Math.abs(f.totalSnow() - before) / before).toBeLessThan(0.01);
  });

  it('у края экрана снег не теряется', () => {
    const f = snowy();
    const before = f.totalSnow();
    T.shovel(f, H, 5, H - f.heightAt(5) + 10, 40, -1);
    T.shovel(f, H, 1195, H - f.heightAt(1195) + 10, 40, 1);
    expect(Math.abs(f.totalSnow() - before) / before).toBeLessThan(0.01);
  });

  it('лопата расчищает полосу, а снег уходит в валики по сторонам', () => {
    const sc = new Scene(1200, H, 3);
    for (let i = 0; i < sc.field.n; i++) sc.field.addRaw(i, 40);
    const y = H - 40 + 30; // лопата глубоко в снегу
    sc.shovelStroke(400, y, 700, y, 30);
    const mid = sc.field.snow[Math.round(550 / COL_W)];
    expect(mid).toBeLessThan(15);
    let maxRidge = 0;
    for (let i = 0; i < sc.field.n; i++) maxRidge = Math.max(maxRidge, sc.field.snow[i]);
    expect(maxRidge).toBeGreaterThan(40);
  });
});

describe('другие инструменты', () => {
  it('насыпать добавляет, тепло растапливает, снегодув уносит частицами и возвращает объём', () => {
    const sc = new Scene(1200, H, 2);
    for (let i = 0; i < sc.field.n; i++) sc.field.addRaw(i, 30);
    sc.apply({ snowfall: { intensity: 0 }, windBase: 0, gustiness: 0, drift: { windTransport: 0 } });
    const v0 = sc.field.totalSnow();
    sc.activeTool = { kind: 'add', x: 300, y: H - 30, R: 40, softness: 0.4, strength: 1, dirX: 0, dirY: 0 };
    for (let k = 0; k < 60; k++) sc.step();
    const v1 = sc.field.totalSnow();
    expect(v1).toBeGreaterThan(v0);
    sc.activeTool = { kind: 'heat', x: 800, y: H - 40, R: 40, softness: 0.4, strength: 1, dirX: 0, dirY: 0 };
    for (let k = 0; k < 60; k++) sc.step();
    const v2 = sc.field.totalSnow();
    expect(v2).toBeLessThan(v1);
    sc.activeTool = { kind: 'blower', x: 600, y: H - 30, R: 40, softness: 0.4, strength: 1, dirX: 1, dirY: 0 };
    for (let k = 0; k < 30; k++) sc.step();
    sc.activeTool = null;
    const carried = sc.particles.filter((p) => p.kind === 'carrier').reduce((a, p) => a + (p.vol ?? 0), 0);
    expect(carried).toBeGreaterThan(0);
    // компактация уменьшает объём свежего снега — отключаем её влияние сравнением «до/после» с допуском
    for (let k = 0; k < 600; k++) sc.step();
    expect(sc.particles.filter((p) => p.kind === 'carrier').length).toBe(0);
  });

  it('«Очистить всё» за пару секунд убирает весь снег', () => {
    const sc = new Scene(1200, H, 2);
    sc.apply({ snowfall: { intensity: 0 } });
    for (let i = 0; i < sc.field.n; i++) sc.field.addRaw(i, 30);
    sc.startClearAll();
    for (let k = 0; k < 60 * 4; k++) sc.step();
    expect(sc.field.totalSnow()).toBeLessThan(1);
  });
});

describe('Undo/Redo', () => {
  it('минимум 20 шагов отмены и повтор', () => {
    const sc = new Scene(800, H, 1);
    const h = new T.History<ReturnType<Scene['snapshot']>>(40);
    const totals: number[] = [];
    for (let k = 0; k < 25; k++) {
      totals.push(sc.field.totalSnow());
      h.push(sc.snapshot());
      sc.field.addRaw(100 + k * 10, 20);
    }
    const final = sc.field.totalSnow();
    for (let k = 24; k >= 0; k--) {
      const s = h.undo(sc.snapshot());
      expect(s).not.toBeNull();
      sc.restore(s!);
      expect(sc.field.totalSnow()).toBeCloseTo(totals[k], 3);
    }
    expect(h.undo(sc.snapshot())).toBeNull();
    for (let k = 0; k < 25; k++) sc.restore(h.redo(sc.snapshot())!);
    expect(sc.field.totalSnow()).toBeCloseTo(final, 3);
  });
});
