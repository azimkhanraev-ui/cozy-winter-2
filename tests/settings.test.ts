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
