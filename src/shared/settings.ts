// Схема настроек, значения по умолчанию и санитайзер. Чистый модуль (без Electron/DOM).

export interface Settings {
  version: 1;
  lang: 'ru' | 'en';
  paused: boolean;
  /** overlay — прозрачный слой поверх рабочего стола; windowed — отладочное окно. */
  mode: 'overlay' | 'windowed';
  /** Где «земля»: верх панели задач или самый низ экрана. */
  groundLevel: 'taskbar' | 'screen';
  monitors: 'all' | 'primary';
  fpsLimit: 60 | 30;
  /** Аппаратное ускорение (если окно чёрное — выключить). */
  gpu: boolean;
  snow: {
    /** 0..100 — плотность снегопада. */
    intensity: number;
    /** -100..100 — базовый ветер (знак = направление). */
    wind: number;
    /** 0..100 — сила порывов. */
    gusts: number;
    /** 50..200 % — размер хлопьев. */
    flakeSize: number;
    /** 1..4 — сколько слоёв глубины. */
    layers: number;
    soft: boolean;
    crystal: boolean;
    fluffy: boolean;
    glitter: boolean;
  };
  drift: {
    /** 0..100 % — неравномерность сугробов. */
    unevenness: number;
    /** 10..300 px — максимальная высота сугробов. */
    maxHeight: number;
    /** 0..400 % — скорость накопления. */
    accumulation: number;
    /** 0..100 % — таяние. */
    melt: number;
    /** 0..100 % — перенос снега ветром. */
    windTransport: number;
    /** 20..50 ° — угол естественного откоса. */
    repose: number;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  lang: 'ru',
  paused: false,
  mode: 'overlay',
  groundLevel: 'taskbar',
  monitors: 'all',
  fpsLimit: 60,
  gpu: true,
  snow: {
    intensity: 45,
    wind: 18,
    gusts: 45,
    flakeSize: 100,
    layers: 4,
    soft: true,
    crystal: true,
    fluffy: true,
    glitter: true,
  },
  drift: {
    unevenness: 70,
    maxHeight: 90,
    accumulation: 100,
    melt: 0,
    windTransport: 50,
    repose: 36,
  },
};

type Range = readonly [number, number];
const RANGES: Record<string, Range> = {
  'snow.intensity': [0, 100],
  'snow.wind': [-100, 100],
  'snow.gusts': [0, 100],
  'snow.flakeSize': [50, 200],
  'snow.layers': [1, 4],
  'drift.unevenness': [0, 100],
  'drift.maxHeight': [10, 300],
  'drift.accumulation': [0, 400],
  'drift.melt': [0, 100],
  'drift.windTransport': [0, 100],
  'drift.repose': [20, 50],
};
const ENUMS: Record<string, readonly unknown[]> = {
  lang: ['ru', 'en'],
  mode: ['overlay', 'windowed'],
  groundLevel: ['taskbar', 'screen'],
  monitors: ['all', 'primary'],
  fpsLimit: [60, 30],
  version: [1],
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Сливает произвольное значение со схемой: неизвестные ключи отбрасываются, неверные типы → по умолчанию. */
function sanitizeNode(def: unknown, val: unknown, path: string): unknown {
  if (isObj(def)) {
    const out: Record<string, unknown> = {};
    const src = isObj(val) ? val : {};
    for (const k of Object.keys(def)) out[k] = sanitizeNode(def[k], src[k], path ? `${path}.${k}` : k);
    return out;
  }
  const en = ENUMS[path];
  if (en) return en.includes(val) ? val : def;
  if (typeof def === 'number') {
    if (typeof val !== 'number' || !Number.isFinite(val)) return def;
    const r = RANGES[path];
    return r ? Math.min(r[1], Math.max(r[0], val)) : val;
  }
  if (typeof def === typeof val) return val;
  return def;
}

export function sanitizeSettings(val: unknown): Settings {
  return sanitizeNode(DEFAULT_SETTINGS, val, '') as Settings;
}

/** Глубокое слияние патча в настройки (с последующей санитизацией). */
export function mergeSettings(base: Settings, patch: unknown): Settings {
  const merge = (a: unknown, b: unknown): unknown => {
    if (isObj(a) && isObj(b)) {
      const out: Record<string, unknown> = { ...a };
      for (const k of Object.keys(b)) out[k] = merge(a[k], b[k]);
      return out;
    }
    return b === undefined ? a : b;
  };
  return sanitizeSettings(merge(base, patch));
}

export type ParseResult = { settings: Settings; corrupt: boolean };

/** Разбирает текст файла настроек. Повреждённый JSON не роняет приложение. */
export function parseSettingsText(text: string | null): ParseResult {
  if (text === null || text.trim() === '') return { settings: structuredClone(DEFAULT_SETTINGS), corrupt: false };
  try {
    return { settings: sanitizeSettings(JSON.parse(text)), corrupt: false };
  } catch {
    return { settings: structuredClone(DEFAULT_SETTINGS), corrupt: true };
  }
}
