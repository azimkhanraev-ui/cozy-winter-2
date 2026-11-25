import { describe, it, expect } from 'vitest';
import { parseSettingsText, mergeSettings, DEFAULT_SETTINGS, sanitizeSettings } from '../src/shared/settings';

describe('настройки', () => {
  it('повреждённый JSON → значения по умолчанию и флаг corrupt', () => {
    const r = parseSettingsText('{"snow": {"intensity": 5'); // обрезанный файл
    expect(r.corrupt).toBe(true);
    expect(r.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('пустой/отсутствующий файл → по умолчанию, не corrupt', () => {
    expect(parseSettingsText(null).corrupt).toBe(false);
    expect(parseSettingsText('').settings).toEqual(DEFAULT_SETTINGS);
  });

  it('неверные типы и значения вне диапазона исправляются', () => {
    const s = sanitizeSettings({ snow: { intensity: 9999, wind: 'abc' }, mode: 'bogus', fpsLimit: 30, extra: 1 });
    expect(s.snow.intensity).toBe(100);
    expect(s.snow.wind).toBe(DEFAULT_SETTINGS.snow.wind);
    expect(s.mode).toBe('overlay');
    expect(s.fpsLimit).toBe(30);
    expect((s as unknown as Record<string, unknown>).extra).toBeUndefined();
  });

  it('патч сливается глубоко', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, { drift: { unevenness: 10 } });
    expect(s.drift.unevenness).toBe(10);
    expect(s.drift.maxHeight).toBe(DEFAULT_SETTINGS.drift.maxHeight);
  });
});

describe('настройки этапов 3–9', () => {
  it('пресеты времени суток: значения 0..100, цвета только #rrggbb', () => {
    const s = sanitizeSettings({ day: { presets: { night: { stars: 500, skyTop: 'red', tint: '#ABCDEF' } } } });
    expect(s.day.presets.night.stars).toBe(100);
    expect(s.day.presets.night.skyTop).toBe(DEFAULT_SETTINGS.day.presets.night.skyTop);
    expect(s.day.presets.night.tint).toBe('#abcdef');
    expect(s.day.presets.day).toEqual(DEFAULT_SETTINGS.day.presets.day);
  });

  it('перечисления и диапазоны новых разделов', () => {
    const s = sanitizeSettings({ tools: { current: 'bazooka', size: 5000 }, plow: { count: 9, direction: 'up' }, system: { economy: 'max' } });
    expect(s.tools.current).toBe(DEFAULT_SETTINGS.tools.current);
    expect(s.tools.size).toBe(200);
    expect(s.plow.count).toBe(3);
    expect(s.plow.direction).toBe('alternate');
    expect(s.system.economy).toBe('auto');
  });

  it('частичный патч пресета фазы не затирает остальные поля', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, { day: { presets: { evening: { moon: 10 } } } });
    expect(s.day.presets.evening.moon).toBe(10);
    expect(s.day.presets.evening.stars).toBe(DEFAULT_SETTINGS.day.presets.evening.stars);
  });

  it('пресеты настроек дают корректные настройки', async () => {
    const { PRESETS } = await import('../src/shared/settings');
    for (const p of Object.values(PRESETS)) {
      const s = mergeSettings(DEFAULT_SETTINGS, p.patch());
      expect(sanitizeSettings(s)).toEqual(s);
    }
  });
});

describe('настройки 1.1', () => {
  it('гирлянда, обои и уборка рукой: значения по умолчанию и проверка', () => {
    expect(DEFAULT_SETTINGS.tools.handSweep).toBe(true);
    expect(DEFAULT_SETTINGS.topGarland.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.wallpaper.scene).toBe('none');
    const s = sanitizeSettings({ topGarland: { style: 'disco', brightness: 900 }, wallpaper: { scene: 'beach' } });
    expect(s.topGarland.style).toBe('multi');
    expect(s.topGarland.brightness).toBe(100);
    expect(s.wallpaper.scene).toBe('none');
  });
});
