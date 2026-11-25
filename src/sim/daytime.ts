// Время суток: шесть редактируемых пресетов и плавное смешивание между ними. Чистый TS.
import type { DayPreset, Phase, Settings } from '../shared/settings';

/** Час, в который начинается каждая фаза (полностью «в силе»). */
export const ANCHORS: [Phase, number][] = [
  ['dawn', 6.5],
  ['morning', 9],
  ['day', 13],
  ['sunset', 17],
  ['evening', 19],
  ['night', 22],
];

/** «Ночность» фазы (для фар, отсветов, яркости дальнего снега). */
const NIGHTNESS: Record<Phase, number> = { dawn: 0.4, morning: 0, day: 0, sunset: 0.3, evening: 0.75, night: 1 };

export interface LightState {
  skyTop: string;
  skyBottom: string;
  skyAlpha: number;
  tint: string;
  tintAlpha: number;
  snowColor: string;
  fog: number;
  windowLight: number;
  garland: number;
  stars: number;
  moon: number;
  sun: number;
  aurora: number;
  hour: number;
  night: number;
  phase: Phase;
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const m = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t);
  return '#' + [m(0), m(1), m(2)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Пресет в «рабочих» единицах (0..1). */
function norm(p: DayPreset, phase: Phase, hour: number): LightState {
  return {
    skyTop: p.skyTop,
    skyBottom: p.skyBottom,
    skyAlpha: p.skyAlpha / 100,
    tint: p.tint,
    tintAlpha: p.tintAlpha / 100,
    snowColor: p.snowColor,
    fog: p.fog / 100,
    windowLight: p.windowLight / 100,
    garland: p.garland / 100,
    stars: p.stars / 100,
    moon: p.moon / 100,
    sun: p.sun / 100,
    aurora: p.aurora / 100,
    hour,
    night: NIGHTNESS[phase],
    phase,
  };
}

function mix(a: LightState, b: LightState, t: number): LightState {
  const n = (k: keyof LightState) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t;
  return {
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyBottom: mixHex(a.skyBottom, b.skyBottom, t),
    skyAlpha: n('skyAlpha'),
    tint: mixHex(a.tint, b.tint, t),
    tintAlpha: n('tintAlpha'),
    snowColor: mixHex(a.snowColor, b.snowColor, t),
    fog: n('fog'),
    windowLight: n('windowLight'),
    garland: n('garland'),
    stars: n('stars'),
    moon: n('moon'),
    sun: n('sun'),
    aurora: n('aurora'),
    hour: a.hour,
    night: n('night'),
    phase: t < 0.5 ? a.phase : b.phase,
  };
}

/**
 * Освещение для часа 0..24. Каждая фаза держится после своего часа, а за ~1.5 ч до следующей
 * плавно перетекает в неё (smoothstep), так что переходы непрерывны.
 */
export function lightAt(hour: number, presets: Record<Phase, DayPreset>): LightState {
  const h = ((hour % 24) + 24) % 24;
  let i = ANCHORS.length - 1;
  for (let k = 0; k < ANCHORS.length; k++) if (h >= ANCHORS[k][1]) i = k;
  const [ph, h0] = ANCHORS[i];
  const [nph, h1raw] = ANCHORS[(i + 1) % ANCHORS.length];
  const h1 = h1raw <= h0 ? h1raw + 24 : h1raw;
  const hh = h < h0 ? h + 24 : h;
  const span = h1 - h0;
  const w = Math.min(1.5, span * 0.6);
  const x = Math.max(0, Math.min(1, (hh - (h1 - w)) / w));
  const t = x * x * (3 - 2 * x);
  const out = mix(norm(presets[ph], ph, h), norm(presets[nph], nph, h), t);
  out.hour = h;
  return out;
}

/** Текущий час по режиму из настроек. now — системное время (мс), sceneTime — время сцены (с). */
export function hourFor(s: Settings['day'], nowMs: number, sceneTime: number): number {
  switch (s.mode) {
    case 'manual': {
      const a = ANCHORS.find(([p]) => p === s.phase)!;
      return a[1] + 0.25; // ровно в фазе, без перехода
    }
    case 'slider':
      return s.hour;
    case 'demo':
      return (12 + (sceneTime / 60) * 24) % 24; // сутки за 60 секунд
    default: {
      const d = new Date(nowMs);
      return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    }
  }
}
