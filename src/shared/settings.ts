// Схема настроек, значения по умолчанию и санитайзер. Чистый модуль (без Electron/DOM).

export type Phase = 'dawn' | 'morning' | 'day' | 'sunset' | 'evening' | 'night';
export const PHASES: Phase[] = ['dawn', 'morning', 'day', 'sunset', 'evening', 'night'];

export interface DayPreset {
  skyTop: string;
  skyBottom: string;
  /** 0..100 — непрозрачность неба (в оверлее дополнительно умножается на day.skyOpacity). */
  skyAlpha: number;
  tint: string;
  /** 0..100 — сила тонирования сцены. */
  tintAlpha: number;
  snowColor: string;
  fog: number;
  windowLight: number;
  garland: number;
  stars: number;
  moon: number;
  sun: number;
  aurora: number;
}

export type WallpaperScene = 'none' | 'mountains' | 'forest' | 'village' | 'aurora';
export const WALLPAPERS: WallpaperScene[] = ['none', 'mountains', 'forest', 'village', 'aurora'];

export type ToolId =
  | 'hand' | 'shovel' | 'eraser' | 'blower' | 'heat' | 'add'
  | 'ball' | 'roll' | 'steps' | 'angel' | 'tree' | 'throw' | 'drive';
export const TOOLS: ToolId[] = ['hand', 'shovel', 'eraser', 'blower', 'heat', 'add', 'ball', 'roll', 'steps', 'angel', 'tree', 'throw', 'drive'];

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
  firstRun: boolean;
  snow: {
    intensity: number;
    wind: number;
    gusts: number;
    flakeSize: number;
    layers: number;
    soft: boolean;
    crystal: boolean;
    fluffy: boolean;
    glitter: boolean;
  };
  drift: {
    unevenness: number;
    maxHeight: number;
    accumulation: number;
    melt: number;
    windTransport: number;
    repose: number;
  };
  tools: {
    /** Текущий инструмент (запоминается). */
    current: ToolId;
    /** Размер кисти 10..200 px. */
    size: number;
    /** Мягкость края 0..100 %. */
    softness: number;
    /** Радиус шара 8..90 px. */
    ballSize: number;
    /** Сила инструментов (снегодув/тепло/насыпать) 10..200 %. */
    strength: number;
    /** Без режима инструментов: навести на сугроб и тянуть — снег сгребается рукой. */
    handSweep: boolean;
  };
  balls: {
    capSnow: boolean;
    max: number;
  };
  snowmen: {
    limit: number;
    speech: boolean;
    blink: boolean;
    wave: boolean;
  };
  plow: {
    enabled: boolean;
    speed: number;
    size: number;
    color: string;
    count: number;
    interval: number;
    direction: 'ltr' | 'rtl' | 'alternate';
  };
  day: {
    mode: 'auto' | 'manual' | 'slider' | 'demo';
    phase: Phase;
    hour: number;
    /** 0..100 — градиент неба поверх рабочего стола (в оверлее). */
    skyOpacity: number;
    /** 0..100 — звёзды, луна, солнце, сияние поверх рабочего стола. */
    celestial: number;
    presets: Record<Phase, DayPreset>;
  };
  decor: {
    enabled: boolean;
    scale: number;
    house: boolean;
    trees: boolean;
    garland: boolean;
    lantern: boolean;
    fence: boolean;
  };
  effects: {
    splats: boolean;
    windowSnow: boolean;
  };
  /** Гирлянда вдоль верхнего края экрана. */
  topGarland: {
    enabled: boolean;
    style: 'multi' | 'warm' | 'cold' | 'candy';
    mode: 'twinkle' | 'chase' | 'steady';
    brightness: number;
  };
  /** Зимние обои рабочего стола (рисуются кодом). */
  wallpaper: {
    scene: WallpaperScene;
    /** Обои пользователя до первой замены — чтобы вернуть. */
    original: string;
  };
  sound: {
    enabled: boolean;
    master: number;
    wind: number;
    effects: number;
    motor: number;
  };
  hotkeys: {
    toggle: string;
    pause: string;
    clear: string;
    shake: string;
    quit: string;
  };
  dock: {
    autohide: boolean;
    x: number;
    y: number;
  };
  system: {
    autostart: boolean;
    autoPauseFullscreen: boolean;
    /** Экономия: 30 FPS и меньше хлопьев от батареи (auto) или всегда (on). */
    economy: 'off' | 'auto' | 'on';
    saveScene: boolean;
  };
}

export const DEFAULT_PRESETS: Record<Phase, DayPreset> = {
  dawn: { skyTop: '#3b4a7a', skyBottom: '#f2a37a', skyAlpha: 60, tint: '#ffb59a', tintAlpha: 10, snowColor: '#ffeae2', fog: 25, windowLight: 50, garland: 40, stars: 15, moon: 20, sun: 40, aurora: 0 },
  morning: { skyTop: '#8fb8e8', skyBottom: '#e8f1fb', skyAlpha: 50, tint: '#fff4e0', tintAlpha: 3, snowColor: '#ffffff', fog: 15, windowLight: 10, garland: 10, stars: 0, moon: 0, sun: 70, aurora: 0 },
  day: { skyTop: '#7fb2f0', skyBottom: '#dcecff', skyAlpha: 45, tint: '#ffffff', tintAlpha: 0, snowColor: '#ffffff', fog: 5, windowLight: 0, garland: 0, stars: 0, moon: 0, sun: 100, aurora: 0 },
  sunset: { skyTop: '#4a5a9a', skyBottom: '#ff9a62', skyAlpha: 60, tint: '#ff9e6e', tintAlpha: 12, snowColor: '#ffe3cf', fog: 20, windowLight: 60, garland: 50, stars: 10, moon: 10, sun: 60, aurora: 0 },
  evening: { skyTop: '#1c2850', skyBottom: '#5a5a8f', skyAlpha: 70, tint: '#4a5a9a', tintAlpha: 22, snowColor: '#dfe6ff', fog: 15, windowLight: 100, garland: 100, stars: 60, moon: 60, sun: 0, aurora: 20 },
  night: { skyTop: '#060b1e', skyBottom: '#1a2448', skyAlpha: 80, tint: '#1c2a5a', tintAlpha: 32, snowColor: '#cbd8ff', fog: 10, windowLight: 100, garland: 100, stars: 100, moon: 100, sun: 0, aurora: 50 },
};

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  lang: 'ru',
  paused: false,
  mode: 'overlay',
  groundLevel: 'taskbar',
  monitors: 'all',
  fpsLimit: 60,
  gpu: true,
  firstRun: true,
  snow: { intensity: 45, wind: 18, gusts: 45, flakeSize: 100, layers: 4, soft: true, crystal: true, fluffy: true, glitter: true },
  drift: { unevenness: 70, maxHeight: 90, accumulation: 100, melt: 0, windTransport: 50, repose: 36 },
  tools: { current: 'shovel', size: 50, softness: 40, ballSize: 26, strength: 100, handSweep: true },
  balls: { capSnow: true, max: 40 },
  snowmen: { limit: 12, speech: true, blink: true, wave: true },
  plow: { enabled: true, speed: 55, size: 100, color: '#f4c430', count: 1, interval: 480, direction: 'alternate' },
  day: { mode: 'auto', phase: 'day', hour: 12, skyOpacity: 0, celestial: 60, presets: structuredClone(DEFAULT_PRESETS) },
  decor: { enabled: true, scale: 100, house: true, trees: true, garland: true, lantern: true, fence: true },
  effects: { splats: true, windowSnow: false },
  topGarland: { enabled: true, style: 'multi', mode: 'twinkle', brightness: 80 },
  wallpaper: { scene: 'none', original: '' },
  sound: { enabled: false, master: 70, wind: 50, effects: 70, motor: 50 },
  hotkeys: { toggle: 'Ctrl+Alt+S', pause: 'Ctrl+Alt+P', clear: 'Ctrl+Alt+C', shake: 'Ctrl+Alt+G', quit: 'Ctrl+Alt+Q' },
  dock: { autohide: true, x: 0, y: 0 },
  system: { autostart: false, autoPauseFullscreen: true, economy: 'auto', saveScene: true },
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
  'tools.size': [10, 200],
  'tools.softness': [0, 100],
  'tools.ballSize': [8, 90],
  'tools.strength': [10, 200],
  'balls.max': [1, 100],
  'snowmen.limit': [1, 30],
  'plow.speed': [20, 150],
  'plow.size': [60, 160],
  'plow.count': [1, 3],
  'plow.interval': [20, 900],
  'day.hour': [0, 24],
  'day.skyOpacity': [0, 100],
  'day.celestial': [0, 100],
  'decor.scale': [50, 200],
  'sound.master': [0, 100],
  'sound.wind': [0, 100],
  'sound.effects': [0, 100],
  'sound.motor': [0, 100],
  'dock.x': [-4000, 4000],
  'dock.y': [-2000, 0],
  'topGarland.brightness': [10, 100],
};
const ENUMS: Record<string, readonly unknown[]> = {
  lang: ['ru', 'en'],
  mode: ['overlay', 'windowed'],
  groundLevel: ['taskbar', 'screen'],
  monitors: ['all', 'primary'],
  fpsLimit: [60, 30],
  version: [1],
  'tools.current': TOOLS,
  'plow.direction': ['ltr', 'rtl', 'alternate'],
  'day.mode': ['auto', 'manual', 'slider', 'demo'],
  'day.phase': PHASES,
  'system.economy': ['off', 'auto', 'on'],
  'topGarland.style': ['multi', 'warm', 'cold', 'candy'],
  'topGarland.mode': ['twinkle', 'chase', 'steady'],
  'wallpaper.scene': WALLPAPERS,
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Путь без ключа конкретного пресета: day.presets.night.stars → day.presets.*.stars */
function rangeKey(path: string): string {
  return path.replace(/^day\.presets\.[a-z]+\./, 'day.presets.*.');
}

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
    const rk = rangeKey(path);
    const r = RANGES[rk] ?? (rk.startsWith('day.presets.*.') ? ([0, 100] as const) : undefined);
    return r ? Math.min(r[1], Math.max(r[0], val)) : val;
  }
  if (typeof def === 'string' && def.startsWith('#')) {
    return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val) ? val.toLowerCase() : def;
  }
  if (typeof def === typeof val) return val;
  return def;
}

export function sanitizeSettings(val: unknown): Settings {
  return sanitizeNode(DEFAULT_SETTINGS, val, '') as Settings;
}

export function deepMerge(a: unknown, b: unknown): unknown {
  if (isObj(a) && isObj(b)) {
    const out: Record<string, unknown> = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

/** Глубокое слияние патча в настройки (с последующей санитизацией). */
export function mergeSettings(base: Settings, patch: unknown): Settings {
  return sanitizeSettings(deepMerge(base, patch));
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

/** Готовые пресеты (патчи настроек). */
export const PRESETS: Record<string, { ru: string; en: string; patch: () => Record<string, unknown> }> = {
  light: {
    ru: 'Лёгкий снегопад',
    en: 'Light snowfall',
    patch: () => ({ snow: { intensity: 25, wind: 8, gusts: 20, flakeSize: 90, layers: 4 }, drift: { accumulation: 60, windTransport: 25 } }),
  },
  blizzard: {
    ru: 'Метель',
    en: 'Blizzard',
    patch: () => ({ snow: { intensity: 95, wind: 85, gusts: 90, flakeSize: 110, layers: 4 }, drift: { accumulation: 160, windTransport: 90, unevenness: 85 } }),
  },
  evening: {
    ru: 'Тихий вечер',
    en: 'Quiet evening',
    patch: () => ({ snow: { intensity: 35, wind: 3, gusts: 10, flakeSize: 130 }, day: { mode: 'manual', phase: 'evening' }, drift: { windTransport: 10 } }),
  },
  newyear: {
    ru: 'Новогодняя ночь',
    en: 'New Year night',
    patch: () => ({ snow: { intensity: 55, wind: 10, gusts: 30, glitter: true }, day: { mode: 'manual', phase: 'night' }, decor: { enabled: true, garland: true, house: true, trees: true, lantern: true } }),
  },
  random: {
    ru: 'Случайный',
    en: 'Random',
    patch: () => {
      const r = (a: number, b: number) => Math.round(a + Math.random() * (b - a));
      const phases = PHASES;
      return {
        snow: { intensity: r(15, 95), wind: r(-80, 80), gusts: r(0, 100), flakeSize: r(70, 160), layers: r(2, 4) },
        drift: { unevenness: r(30, 100), windTransport: r(10, 90), accumulation: r(50, 200) },
        day: { mode: 'manual', phase: phases[r(0, phases.length - 1)] },
      };
    },
  },
};
