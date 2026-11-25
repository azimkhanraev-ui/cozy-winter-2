import { describe, it, expect } from 'vitest';
import { lightAt, hourFor } from '../../src/sim/daytime';
import { DEFAULT_PRESETS, DEFAULT_SETTINGS } from '../../src/shared/settings';
import { Scene } from '../../src/sim/scene';
import { BallWorld } from '../../src/sim/physics';
import { SnowmanModule } from '../../src/sim/snowman';
import { PlowModule } from '../../src/sim/plow';
import { DecorModule } from '../../src/sim/decor';
import { COL_W } from '../../src/sim/terrain';

describe('время суток', () => {
  it('в «якорных» часах — ровно пресет фазы', () => {
    const d = lightAt(13.2, DEFAULT_PRESETS);
    expect(d.phase).toBe('day');
    expect(d.sun).toBeCloseTo(1, 5);
    const n = lightAt(1, DEFAULT_PRESETS);
    expect(n.phase).toBe('night');
    expect(n.stars).toBeCloseTo(1, 5);
  });

  it('переходы плавные: никаких скачков за всю ночь и день', () => {
    let prev = lightAt(0, DEFAULT_PRESETS);
    for (let h = 0.01; h <= 24.001; h += 0.01) {
      const l = lightAt(h, DEFAULT_PRESETS);
      for (const k of ['skyAlpha', 'tintAlpha', 'stars', 'moon', 'sun', 'aurora', 'windowLight', 'night'] as const) {
        expect(Math.abs(l[k] - prev[k])).toBeLessThan(0.03);
      }
      prev = l;
    }
  });

  it('режимы: ручной, ползунок, демо (сутки за 60 с)', () => {
    const base = DEFAULT_SETTINGS.day;
    expect(lightAt(hourFor({ ...base, mode: 'manual', phase: 'sunset' }, 0, 0), DEFAULT_PRESETS).phase).toBe('sunset');
    expect(hourFor({ ...base, mode: 'slider', hour: 7.5 }, 0, 0)).toBe(7.5);
    const a = hourFor({ ...base, mode: 'demo' }, 0, 0);
    const b = hourFor({ ...base, mode: 'demo' }, 0, 30);
    expect(((b - a + 24) % 24)).toBeCloseTo(12, 5);
  });
});

function scene(snow = 30) {
  const sc = new Scene(1200, 600, 3);
  sc.apply({ snowfall: { intensity: 0 }, windBase: 0, gustiness: 0, drift: { windTransport: 0 } });
  sc.field.base.fill(0);
  for (let i = 0; i < sc.field.n; i++) sc.field.snow[i] = snow;
  const w = new BallWorld(sc);
  const sm = new SnowmanModule(sc, w);
  const pl = new PlowModule(sc, w, sm);
  sc.modules.balls = w;
  sc.modules.snowmen = sm;
  sc.modules.plow = pl;
  return { sc, w, sm, pl };
}

describe('снегоуборщик', () => {
  it('проезжает и реально срезает снег с карты высот', () => {
    const { sc, pl } = scene(30);
    pl.settings.interval = 1;
    pl.settings.speed = 120;
    for (let k = 0; k < 60 * 14; k++) sc.step();
    const mid = sc.field.snow[Math.round(600 / COL_W)];
    expect(mid).toBeLessThan(4); // из 30 px: 1.2 px оставляет отвал + лёгкая пороша
    expect(pl.plows.length).toBeLessThanOrEqual(1);
  });

  it('объезжает снеговика: уходит на задний план и не трогает снег под ним', () => {
    const { sc, w, sm, pl } = scene(30);
    const g = 600 - 30;
    w.add(600, g - 40, 40);
    for (let k = 0; k < 90; k++) sc.step();
    w.add(600, g - 80 - 30 - 10, 28);
    for (let k = 0; k < 120; k++) sc.step();
    w.add(601, g - 80 - 56 - 20 - 10, 19);
    for (let k = 0; k < 120; k++) sc.step();
    expect(sm.snowmen.length).toBe(1);
    const sx = sm.snowmen[0].x;
    pl.settings.speed = 120;
    pl.spawn(1);
    let maxLane = 0;
    for (let k = 0; k < 60 * 14; k++) {
      sc.step();
      for (const p of pl.plows) maxLane = Math.max(maxLane, p.lane);
    }
    expect(maxLane).toBeGreaterThan(0.95);
    expect(sm.snowmen.length).toBe(1);
    expect(Math.abs(sm.snowmen[0].x - sx)).toBeLessThan(1);
    expect(sc.field.snow[Math.round(sx / COL_W)]).toBeGreaterThan(25); // снег под снеговиком остался
    expect(sc.field.snow[Math.round(300 / COL_W)]).toBeLessThan(4); // а до него — расчищено (было 30)
  });

  it('ручное управление: стрелки двигают, пробел — гудок', () => {
    const { sc, pl } = scene(10);
    pl.settings.enabled = false;
    pl.drive('right');
    const p = pl.plows[0];
    const x0 = p.x;
    for (let k = 0; k < 20; k++) sc.step();
    expect(p.x).toBeGreaterThan(x0 + 3);
    pl.drive('horn');
    expect(sc.events.some((e) => e.type === 'horn')).toBe(true);
  });
});

describe('декор', () => {
  it('снег ложится на декор', () => {
    const sc = new Scene(1200, 600, 3);
    sc.apply({ snowfall: { intensity: 1 } });
    const d = new DecorModule(sc, null);
    sc.modules.decor = d;
    for (const i of d.items) i.snow = 0;
    for (let k = 0; k < 60 * 120; k++) sc.step();
    expect(d.items.find((i) => i.kind === 'house')!.snow).toBeGreaterThan(0.2);
    expect(Math.max(...d.items.filter((i) => i.kind === 'tree').map((i) => i.snow))).toBeGreaterThan(0.2);
  });

  it('за домиком растёт намёт (ветровая тень)', () => {
    const sc = new Scene(1200, 600, 3);
    sc.apply({ snowfall: { intensity: 0 }, drift: { windTransport: 1, unevenness: 0 } });
    sc.field.base.fill(0);
    for (let i = 0; i < sc.field.n; i++) sc.field.addRaw(i, 12);
    const d = new DecorModule(sc, null);
    d.items = d.items.filter((i) => i.kind === 'house');
    d.items[0].x = 500;
    sc.modules.decor = d;
    const obst = sc.field.obstacle;
    for (let k = 0; k < 900; k++) {
      obst.fill(0);
      d.obstacles(obst);
      sc.field.windStep(220, 1 / 60);
      sc.field.relax(2);
    }
    const avg = (a: number, b: number) => {
      let s = 0;
      for (let x = a; x < b; x += COL_W) s += sc.field.snow[sc.field.col(x)];
      return s / ((b - a) / COL_W);
    };
    expect(avg(600, 700)).toBeGreaterThan(avg(300, 400) * 1.3);
  });
});
