// Окно настроек: 8 вкладок, живой предпросмотр, цифры у ползунков, «Сбросить» в каждом разделе,
// пресеты, экспорт/импорт, редактор пресетов времени суток, горячие клавиши. Изменения применяются сразу.
import type { CozyApi } from '../shared/ipc';
import { DEFAULT_SETTINGS, DEFAULT_PRESETS, PRESETS, PHASES, Phase, Settings, deepMerge } from '../shared/settings';
import { Scene, FIXED_DT } from '../sim/scene';
import { lightAt, hourFor } from '../sim/daytime';
import { GroundRenderer } from '../render/ground';
import { SnowRenderer } from '../render/snow';
import { sceneParamsFrom } from './mapSettings';

declare global {
  interface Window {
    cozy: CozyApi;
  }
}

type L = [string, string];
type Ctl =
  | { kind: 'slider'; path: string; label: L; min: number; max: number; step?: number; unit?: string }
  | { kind: 'check'; path: string; label: L }
  | { kind: 'select'; path: string; label: L; options: [string | number, string, string][] }
  | { kind: 'color'; path: string; label: L }
  | { kind: 'hotkey'; path: string; label: L }
  | { kind: 'button'; label: L; run: () => void }
  | { kind: 'note'; label: L }
  | { kind: 'presetEditor' };

interface Section {
  id: string;
  title: L;
  resets: string[];
  controls: Ctl[];
}

const api = window.cozy;
let settings: Settings;
let lang: 'ru' | 'en' = 'ru';
const tr = (l: L) => (lang === 'en' ? l[1] : l[0]);
let editPhase: Phase = 'night';
let hotkeyOk: Record<string, boolean> = {};

const PHASE_NAMES: Record<Phase, L> = {
  dawn: ['Рассвет', 'Dawn'],
  morning: ['Утро', 'Morning'],
  day: ['День', 'Day'],
  sunset: ['Закат', 'Sunset'],
  evening: ['Вечер', 'Evening'],
  night: ['Ночь', 'Night'],
};

const SECTIONS: Section[] = [
  {
    id: 'snow',
    title: ['Снег', 'Snow'],
    resets: ['snow'],
    controls: [
      { kind: 'slider', path: 'snow.intensity', label: ['Интенсивность снегопада', 'Snowfall intensity'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'snow.wind', label: ['Ветер (← / →)', 'Wind (← / →)'], min: -100, max: 100 },
      { kind: 'slider', path: 'snow.gusts', label: ['Порывы ветра', 'Wind gusts'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'snow.flakeSize', label: ['Размер хлопьев', 'Flake size'], min: 50, max: 200, unit: '%' },
      { kind: 'slider', path: 'snow.layers', label: ['Слои глубины', 'Depth layers'], min: 1, max: 4 },
      { kind: 'check', path: 'snow.soft', label: ['Мягкие круглые', 'Soft round'] },
      { kind: 'check', path: 'snow.crystal', label: ['Кристаллы', 'Crystals'] },
      { kind: 'check', path: 'snow.fluffy', label: ['Пушистые', 'Fluffy'] },
      { kind: 'check', path: 'snow.glitter', label: ['Блёстки', 'Glitter'] },
    ],
  },
  {
    id: 'ground',
    title: ['Земля и сугробы', 'Ground & drifts'],
    resets: ['drift'],
    controls: [
      { kind: 'slider', path: 'drift.unevenness', label: ['Неравномерность', 'Unevenness'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'drift.maxHeight', label: ['Максимальная высота сугробов', 'Max drift height'], min: 10, max: 300, unit: ' px' },
      { kind: 'slider', path: 'drift.accumulation', label: ['Скорость накопления', 'Accumulation speed'], min: 0, max: 400, unit: '%' },
      { kind: 'slider', path: 'drift.windTransport', label: ['Перенос снега ветром', 'Wind transport'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'drift.melt', label: ['Таяние', 'Melting'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'drift.repose', label: ['Угол откоса', 'Angle of repose'], min: 20, max: 50, unit: '°' },
      { kind: 'select', path: 'groundLevel', label: ['Земля', 'Ground'], options: [['taskbar', 'Верх панели задач', 'Top of taskbar'], ['screen', 'Самый низ экрана', 'Screen bottom']] },
      { kind: 'button', label: ['Присыпать сразу', 'Add snow now'], run: () => api.command({ type: 'dustNow' }) },
      { kind: 'button', label: ['Очистить снег', 'Clear snow'], run: () => api.command({ type: 'clearSnow' }) },
    ],
  },
  {
    id: 'tools',
    title: ['Инструменты', 'Tools'],
    resets: ['tools', 'balls'],
    controls: [
      { kind: 'slider', path: 'tools.size', label: ['Размер кисти', 'Brush size'], min: 10, max: 200, unit: ' px' },
      { kind: 'slider', path: 'tools.softness', label: ['Мягкость края', 'Edge softness'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'tools.strength', label: ['Сила снегодува/фена/насыпания', 'Blower/heat/add strength'], min: 10, max: 200, unit: '%' },
      { kind: 'slider', path: 'tools.ballSize', label: ['Радиус шара', 'Ball radius'], min: 8, max: 90, unit: ' px' },
      { kind: 'slider', path: 'balls.max', label: ['Максимум шаров', 'Max balls'], min: 1, max: 100 },
      { kind: 'check', path: 'balls.capSnow', label: ['Снег копится на шарах', 'Snow caps on balls'] },
      { kind: 'check', path: 'dock.autohide', label: ['Автоскрытие дока', 'Auto-hide dock'] },
      { kind: 'button', label: ['Вернуть док на место', 'Reset dock position'], run: () => api.patchSettings({ dock: { x: 0, y: 0 } }) },
    ],
  },
  {
    id: 'snowmen',
    title: ['Снеговики', 'Snowmen'],
    resets: ['snowmen'],
    controls: [
      { kind: 'slider', path: 'snowmen.limit', label: ['Лимит снеговиков', 'Snowman limit'], min: 1, max: 30 },
      { kind: 'check', path: 'snowmen.speech', label: ['Говорят фразы', 'Speak phrases'] },
      { kind: 'check', path: 'snowmen.blink', label: ['Моргают', 'Blink'] },
      { kind: 'check', path: 'snowmen.wave', label: ['Машут, когда курсор рядом', 'Wave at the cursor'] },
      { kind: 'note', label: ['Собрать: три шара друг на друге, большой внизу. Двойной клик — внешность и имя, ПКМ — растопить.', 'Build: three balls stacked, biggest at the bottom. Double-click to customize, right-click to melt.'] },
    ],
  },
  {
    id: 'day',
    title: ['Время суток', 'Time of day'],
    resets: ['day'],
    controls: [
      { kind: 'select', path: 'day.mode', label: ['Режим', 'Mode'], options: [['auto', 'Авто (по часам Windows)', 'Auto (system clock)'], ['manual', 'Ручной', 'Manual'], ['slider', 'Ползунок', 'Slider'], ['demo', 'Демо: сутки за 60 с', 'Demo: a day in 60 s']] },
      { kind: 'select', path: 'day.phase', label: ['Фаза (ручной режим)', 'Phase (manual)'], options: PHASES.map((p) => [p, PHASE_NAMES[p][0], PHASE_NAMES[p][1]] as [string, string, string]) },
      { kind: 'slider', path: 'day.hour', label: ['Час (режим «Ползунок»)', 'Hour (slider mode)'], min: 0, max: 24, step: 0.25, unit: ' ч' },
      { kind: 'slider', path: 'day.skyOpacity', label: ['Небо поверх рабочего стола', 'Sky over desktop'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'day.celestial', label: ['Звёзды, луна, солнце, сияние', 'Stars, moon, sun, aurora'], min: 0, max: 100, unit: '%' },
      { kind: 'presetEditor' },
    ],
  },
  {
    id: 'scene',
    title: ['Сцена и декор', 'Scene & decor'],
    resets: ['decor', 'plow', 'effects', 'sound'],
    controls: [
      { kind: 'check', path: 'decor.enabled', label: ['Декор', 'Decor'] },
      { kind: 'slider', path: 'decor.scale', label: ['Масштаб декора', 'Decor scale'], min: 50, max: 200, unit: '%' },
      { kind: 'check', path: 'decor.house', label: ['Домик', 'House'] },
      { kind: 'check', path: 'decor.trees', label: ['Ёлки', 'Fir trees'] },
      { kind: 'check', path: 'decor.garland', label: ['Гирлянда', 'Garland'] },
      { kind: 'check', path: 'decor.lantern', label: ['Фонарь', 'Lantern'] },
      { kind: 'check', path: 'decor.fence', label: ['Забор', 'Fence'] },
      { kind: 'check', path: 'plow.enabled', label: ['Снегоуборщик ездит сам', 'Snowplow drives by itself'] },
      { kind: 'slider', path: 'plow.speed', label: ['Скорость снегоуборщика', 'Plow speed'], min: 20, max: 150, unit: ' px/с' },
      { kind: 'slider', path: 'plow.size', label: ['Размер снегоуборщика', 'Plow size'], min: 60, max: 160, unit: '%' },
      { kind: 'color', path: 'plow.color', label: ['Цвет снегоуборщика', 'Plow colour'] },
      { kind: 'slider', path: 'plow.count', label: ['Сколько снегоуборщиков', 'Plow count'], min: 1, max: 3 },
      { kind: 'slider', path: 'plow.interval', label: ['Интервал выездов', 'Interval'], min: 20, max: 900, step: 10, unit: ' с' },
      { kind: 'select', path: 'plow.direction', label: ['Направление', 'Direction'], options: [['alternate', 'По очереди', 'Alternate'], ['ltr', 'Слева направо', 'Left to right'], ['rtl', 'Справа налево', 'Right to left']] },
      { kind: 'check', path: 'effects.splats', label: ['Брызги снежков на «стекле»', 'Snowball splats on the glass'] },
      { kind: 'check', path: 'effects.windowSnow', label: ['Снег на верхних краях окон (экспериментально)', 'Snow on window tops (experimental)'] },
      { kind: 'check', path: 'sound.enabled', label: ['Звуки', 'Sounds'] },
      { kind: 'slider', path: 'sound.master', label: ['Громкость', 'Volume'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'sound.wind', label: ['Ветер', 'Wind'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'sound.effects', label: ['Эффекты (хруст, удары, гудок)', 'Effects (crunch, thuds, horn)'], min: 0, max: 100, unit: '%' },
      { kind: 'slider', path: 'sound.motor', label: ['Мотор снегоуборщика', 'Plow engine'], min: 0, max: 100, unit: '%' },
    ],
  },
  {
    id: 'hotkeys',
    title: ['Горячие клавиши', 'Hotkeys'],
    resets: ['hotkeys'],
    controls: [
      { kind: 'hotkey', path: 'hotkeys.toggle', label: ['Док / режим инструментов', 'Dock / tools mode'] },
      { kind: 'hotkey', path: 'hotkeys.pause', label: ['Пауза', 'Pause'] },
      { kind: 'hotkey', path: 'hotkeys.clear', label: ['Очистить снег', 'Clear snow'] },
      { kind: 'hotkey', path: 'hotkeys.shake', label: ['Встряхнуть', 'Shake'] },
      { kind: 'hotkey', path: 'hotkeys.quit', label: ['Выход', 'Quit'] },
      { kind: 'note', label: ['В режиме инструментов: 1–4 — шары S/M/L/XL, 5 лопата, 6 ластик, 7 снегодув, 8 тепло, 9 насыпать, 0 рука, R катать, F шаги, N ангел, T ёлка, B снежок, D рулить; Ctrl+Z / Ctrl+Y; Esc — выйти. Снегоуборщик: ←/→ (A/D), ↑ быстрее, ↓ стоп, пробел — гудок.', 'In tools mode: 1–4 balls S/M/L/XL, 5 shovel, 6 eraser, 7 blower, 8 heat, 9 add, 0 hand, R roll, F steps, N angel, T tree, B snowball, D drive; Ctrl+Z / Ctrl+Y; Esc to exit. Plow: ←/→ (A/D), ↑ faster, ↓ stop, Space horn.'] },
    ],
  },
  {
    id: 'system',
    title: ['Система', 'System'],
    resets: ['fpsLimit', 'monitors', 'gpu', 'mode', 'system'],
    controls: [
      { kind: 'select', path: 'lang', label: ['Язык', 'Language'], options: [['ru', 'Русский', 'Russian'], ['en', 'English', 'English']] },
      { kind: 'select', path: 'mode', label: ['Режим', 'Mode'], options: [['overlay', 'Поверх рабочего стола', 'Desktop overlay'], ['windowed', 'Отладочное окно', 'Debug window']] },
      { kind: 'select', path: 'monitors', label: ['Мониторы', 'Monitors'], options: [['all', 'Все', 'All'], ['primary', 'Только основной', 'Primary only']] },
      { kind: 'select', path: 'fpsLimit', label: ['Лимит FPS', 'FPS limit'], options: [[60, '60 (плавно)', '60 (smooth)'], [30, '30 (экономно)', '30 (saver)']] },
      { kind: 'select', path: 'system.economy', label: ['Режим экономии', 'Power saving'], options: [['auto', 'От батареи', 'On battery'], ['on', 'Всегда', 'Always'], ['off', 'Выключен', 'Off']] },
      { kind: 'check', path: 'system.autoPauseFullscreen', label: ['Пауза при полноэкранных играх и видео', 'Pause for full-screen games and video'] },
      { kind: 'check', path: 'system.autostart', label: ['Запускать вместе с Windows', 'Start with Windows'] },
      { kind: 'check', path: 'system.saveScene', label: ['Сохранять сцену между запусками', 'Keep the scene between launches'] },
      { kind: 'check', path: 'gpu', label: ['Аппаратное ускорение (после перезапуска)', 'Hardware acceleration (restart)'] },
      { kind: 'button', label: ['Экспорт настроек…', 'Export settings…'], run: () => api.exportSettings() },
      { kind: 'button', label: ['Импорт настроек…', 'Import settings…'], run: () => api.importSettings() },
      { kind: 'button', label: ['Показать подсказку первого запуска', 'Show first-run tips'], run: () => api.patchSettings({ firstRun: true }) },
    ],
  },
];

function get(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], settings);
}
function getDefault(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], DEFAULT_SETTINGS);
}
function patchFor(path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const out: Record<string, unknown> = {};
  let cur = out;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else cur = cur[k] = {} as Record<string, unknown>;
  });
  return out;
}

let pending: Record<string, unknown> | null = null;
let timer = 0;
function send(path: string, value: unknown): void {
  pending = deepMerge(pending ?? {}, patchFor(path, value)) as Record<string, unknown>;
  // предпросмотр — сразу
  settings = deepMerge(settings, patchFor(path, value)) as Settings;
  preview.apply();
  if (!timer)
    timer = window.setTimeout(() => {
      api.patchSettings(pending);
      pending = null;
      timer = 0;
    }, 40);
}

let activeTab = 'snow';

function hotkeyFromEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  let key = '';
  if (/^[a-zA-Z0-9]$/.test(k)) key = k.toUpperCase();
  else if (/^F\d{1,2}$/.test(k)) key = k;
  else if (e.code.startsWith('Key')) key = e.code.slice(3);
  else if (e.code.startsWith('Digit')) key = e.code.slice(5);
  else if (['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete'].includes(k)) key = k;
  if (!key) return null;
  if (!mods.length && !/^F\d/.test(key)) return null; // одиночные буквы как глобальные клавиши — нельзя
  return [...mods, key].join('+');
}

function row(c: Ctl): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row ' + c.kind;
  if (c.kind === 'slider') {
    const v = get(c.path) as number;
    row.innerHTML = `<label>${tr(c.label)}<span class="val">${v}${c.unit ?? ''}</span></label>`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(c.min);
    inp.max = String(c.max);
    inp.step = String(c.step ?? 1);
    inp.value = String(v);
    inp.oninput = () => {
      (row.querySelector('.val') as HTMLElement).textContent = inp.value + (c.unit ?? '');
      send(c.path, Number(inp.value));
    };
    row.appendChild(inp);
  } else if (c.kind === 'check') {
    const id = 'c_' + c.path.replace(/\./g, '_');
    row.innerHTML = `<input type="checkbox" id="${id}" ${get(c.path) ? 'checked' : ''}><label for="${id}">${tr(c.label)}</label>`;
    (row.querySelector('input') as HTMLInputElement).onchange = (e) => send(c.path, (e.target as HTMLInputElement).checked);
  } else if (c.kind === 'select') {
    row.innerHTML = `<label>${tr(c.label)}</label>`;
    const sel = document.createElement('select');
    for (const [val, ru, en] of c.options) {
      const o = document.createElement('option');
      o.value = String(val);
      o.textContent = lang === 'en' ? en : ru;
      if (String(get(c.path)) === String(val)) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => send(c.path, c.options.find((o) => String(o[0]) === sel.value)![0]);
    row.appendChild(sel);
  } else if (c.kind === 'color') {
    row.innerHTML = `<label>${tr(c.label)}</label>`;
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = String(get(c.path));
    inp.oninput = () => send(c.path, inp.value);
    row.appendChild(inp);
  } else if (c.kind === 'hotkey') {
    const key = c.path.split('.')[1];
    const ok = hotkeyOk[key];
    row.innerHTML = `<label>${tr(c.label)}</label>`;
    const wrap = document.createElement('span');
    wrap.className = 'hk';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.readOnly = true;
    inp.value = String(get(c.path));
    inp.placeholder = tr(['нажмите сочетание', 'press keys']);
    inp.onkeydown = (e) => {
      e.preventDefault();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        inp.value = '';
        send(c.path, '');
        return;
      }
      const acc = hotkeyFromEvent(e);
      if (acc) {
        inp.value = acc;
        send(c.path, acc);
        setTimeout(refreshHotkeys, 300);
      }
    };
    const st = document.createElement('span');
    st.className = 'hkst';
    st.textContent = ok === undefined ? '' : ok ? '✓' : tr(['⚠ занято', '⚠ taken']);
    st.title = ok === false ? tr(['Это сочетание уже занято другой программой или недопустимо', 'Taken by another program or invalid']) : '';
    wrap.append(inp, st);
    row.appendChild(wrap);
  } else if (c.kind === 'button') {
    const b = document.createElement('button');
    b.textContent = tr(c.label);
    b.onclick = c.run;
    row.appendChild(b);
  } else if (c.kind === 'note') {
    row.innerHTML = `<p>${tr(c.label)}</p>`;
  } else if (c.kind === 'presetEditor') {
    row.appendChild(presetEditor());
  }
  return row;
}

/** Редактор пресета выбранной фазы суток. */
function presetEditor(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'preset';
  const head = document.createElement('div');
  head.className = 'phases';
  for (const p of PHASES) {
    const b = document.createElement('button');
    b.textContent = tr(PHASE_NAMES[p]);
    b.className = p === editPhase ? 'ph active' : 'ph';
    b.dataset.phase = p;
    b.onclick = () => {
      editPhase = p;
      // показать фазу в предпросмотре и на экране
      send('day.mode', 'manual');
      send('day.phase', p);
      render();
    };
    head.appendChild(b);
  }
  box.appendChild(head);
  const fields: { k: string; label: L; color?: boolean }[] = [
    { k: 'skyTop', label: ['Небо вверху', 'Sky top'], color: true },
    { k: 'skyBottom', label: ['Небо внизу', 'Sky bottom'], color: true },
    { k: 'skyAlpha', label: ['Плотность неба', 'Sky opacity'] },
    { k: 'tint', label: ['Тонирование', 'Tint'], color: true },
    { k: 'tintAlpha', label: ['Сила тонирования', 'Tint strength'] },
    { k: 'snowColor', label: ['Цвет снега', 'Snow colour'], color: true },
    { k: 'fog', label: ['Туман', 'Fog'] },
    { k: 'windowLight', label: ['Свет в окнах', 'Window light'] },
    { k: 'garland', label: ['Яркость гирлянд', 'Garland brightness'] },
    { k: 'stars', label: ['Звёзды', 'Stars'] },
    { k: 'moon', label: ['Луна', 'Moon'] },
    { k: 'sun', label: ['Солнце', 'Sun'] },
    { k: 'aurora', label: ['Северное сияние', 'Aurora'] },
  ];
  for (const f of fields) {
    const path = `day.presets.${editPhase}.${f.k}`;
    box.appendChild(row(f.color ? { kind: 'color', path, label: f.label } : { kind: 'slider', path, label: f.label, min: 0, max: 100, unit: '%' }));
  }
  const reset = document.createElement('button');
  reset.className = 'ghost';
  reset.textContent = tr(['Сбросить эту фазу', 'Reset this phase']);
  reset.onclick = () => api.patchSettings({ day: { presets: { [editPhase]: structuredClone(DEFAULT_PRESETS[editPhase]) } } });
  box.appendChild(reset);
  return box;
}

function render(): void {
  const root = document.getElementById('app')!;
  root.innerHTML = '';
  // пресеты
  const pre = document.createElement('div');
  pre.className = 'presets';
  pre.innerHTML = `<span>${tr(['Пресеты:', 'Presets:'])}</span>`;
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = lang === 'en' ? p.en : p.ru;
    b.dataset.preset = id;
    b.onclick = () => {
      const patch = p.patch();
      settings = deepMerge(settings, patch) as Settings;
      preview.apply();
      api.patchSettings(patch);
    };
    pre.appendChild(b);
  }
  root.appendChild(pre);
  const tabs = document.createElement('nav');
  for (const s of SECTIONS) {
    const b = document.createElement('button');
    b.textContent = tr(s.title);
    b.className = s.id === activeTab ? 'tab active' : 'tab';
    b.dataset.id = s.id;
    b.onclick = () => {
      activeTab = s.id;
      render();
    };
    tabs.appendChild(b);
  }
  root.appendChild(tabs);
  const sec = SECTIONS.find((s) => s.id === activeTab)!;
  const panel = document.createElement('section');
  const h = document.createElement('div');
  h.className = 'head';
  h.innerHTML = `<h2>${tr(sec.title)}</h2>`;
  const reset = document.createElement('button');
  reset.className = 'ghost';
  reset.textContent = tr(['Сбросить', 'Reset']);
  reset.onclick = () => {
    let patch: Record<string, unknown> = {};
    for (const p of sec.resets) patch = deepMerge(patch, patchFor(p, structuredClone(getDefault(p)))) as Record<string, unknown>;
    api.patchSettings(patch);
  };
  h.appendChild(reset);
  panel.appendChild(h);
  for (const c of sec.controls) panel.appendChild(row(c));
  root.appendChild(panel);
}

async function refreshHotkeys(): Promise<void> {
  hotkeyOk = await api.hotkeyStatus();
  if (activeTab === 'hotkeys') render();
}

// ---------- живой предпросмотр ----------

const preview = (() => {
  const cv = document.getElementById('preview') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  let scene: Scene | null = null;
  const ground = new GroundRenderer();
  const snowR = new SnowRenderer();
  let W = 0;
  let H = 0;
  let dpr = 1;
  let last = performance.now();
  let acc = 0;
  const size = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    if (scene) scene.resize(W, H);
    ground.ensure(W, 80, dpr);
  };
  const apply = () => {
    if (!scene || !settings) return;
    const p = sceneParamsFrom(settings);
    // в маленьком окне сугробы масштабируем, чтобы было видно
    p.drift.maxHeight = Math.min(H * 0.45, (p.drift.maxHeight ?? 90) * 0.6);
    p.drift.accumulation = (p.drift.accumulation ?? 1) * 4;
    scene.apply(p);
  };
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!scene || !settings) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= FIXED_DT) {
      scene.step(FIXED_DT);
      acc -= FIXED_DT;
    }
    const L = lightAt(hourFor(settings.day, Date.now(), scene.time), settings.day.presets);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, L.skyTop);
    sky.addColorStop(1, L.skyBottom);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    snowR.drawFlakes(g, scene.snowfall.flakes, [0, 1, 2], scene.wind.time, dpr);
    ground.setTint(L.snowColor);
    ground.ensure(W, 80, dpr);
    ground.update(scene.field, now, 120);
    ground.draw(g, H);
    snowR.drawFlakes(g, scene.snowfall.flakes, [3], scene.wind.time, dpr);
    if (L.tintAlpha > 0.01) {
      g.globalAlpha = L.tintAlpha * 0.6;
      g.fillStyle = L.tint;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  };
  const init = () => {
    size();
    scene = new Scene(W, H, 5);
    apply();
    scene.snowfall.prefill();
    scene.fastForward(20);
    window.addEventListener('resize', size);
    requestAnimationFrame(frame);
  };
  return { init, apply };
})();

(async () => {
  const info = await api.init();
  settings = info.settings;
  lang = settings.lang;
  hotkeyOk = await api.hotkeyStatus();
  render();
  preview.init();
  api.onSettings((s) => {
    const langChanged = s.lang !== lang;
    settings = s;
    lang = s.lang;
    document.title = lang === 'en' ? 'Cozy Winter 2 — Settings' : 'Cozy Winter 2 — Настройки';
    preview.apply();
    // не перерисовываем во время перетаскивания ползунка — только при смене языка/сбросе/пресете
    if (langChanged || document.activeElement?.tagName !== 'INPUT') render();
  });
})();

export {};
