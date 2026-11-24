// Окно настроек: вкладки, ползунки с цифрами, «Сбросить» в каждом разделе. Изменения применяются сразу.
import type { CozyApi } from '../shared/ipc';
import { DEFAULT_SETTINGS, Settings } from '../shared/settings';

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
  | { kind: 'button'; label: L; run: () => void; hint?: L };

interface Section {
  id: string;
  title: L;
  /** Префиксы путей, которые сбрасывает «Сбросить». */
  resets: string[];
  controls: Ctl[];
}

const api = window.cozy;
let settings: Settings;
let lang: 'ru' | 'en' = 'ru';
const tr = (l: L) => (lang === 'en' ? l[1] : l[0]);

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
      { kind: 'button', label: ['Присыпать сразу', 'Add snow now'], run: () => api.command({ type: 'dustNow' }) },
      { kind: 'button', label: ['Убрать весь снег', 'Clear all snow'], run: () => api.command({ type: 'clearSnow' }) },
    ],
  },
  {
    id: 'system',
    title: ['Система', 'System'],
    resets: ['fpsLimit', 'groundLevel', 'monitors', 'gpu', 'mode'],
    controls: [
      { kind: 'select', path: 'mode', label: ['Режим', 'Mode'], options: [['overlay', 'Поверх рабочего стола', 'Desktop overlay'], ['windowed', 'Отладочное окно', 'Debug window']] },
      { kind: 'select', path: 'groundLevel', label: ['Земля', 'Ground'], options: [['taskbar', 'Верх панели задач', 'Top of taskbar'], ['screen', 'Самый низ экрана', 'Screen bottom']] },
      { kind: 'select', path: 'monitors', label: ['Мониторы', 'Monitors'], options: [['all', 'Все', 'All'], ['primary', 'Только основной', 'Primary only']] },
      { kind: 'select', path: 'fpsLimit', label: ['Лимит FPS', 'FPS limit'], options: [[60, '60 (плавно)', '60 (smooth)'], [30, '30 (экономно)', '30 (saver)']] },
      { kind: 'check', path: 'gpu', label: ['Аппаратное ускорение (после перезапуска)', 'Hardware acceleration (restart)'] },
      { kind: 'select', path: 'lang', label: ['Язык', 'Language'], options: [['ru', 'Русский', 'Russian'], ['en', 'English', 'English']] },
    ],
  },
];

function get(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], settings);
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
  const p = patchFor(path, value);
  pending = deepMerge(pending ?? {}, p);
  if (!timer)
    timer = window.setTimeout(() => {
      api.patchSettings(pending);
      pending = null;
      timer = 0;
    }, 40);
}
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const o = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    const av = a[k];
    o[k] = bv && typeof bv === 'object' && av && typeof av === 'object' ? deepMerge(av as Record<string, unknown>, bv as Record<string, unknown>) : bv;
  }
  return o;
}

let activeTab = 'snow';

function render(): void {
  const root = document.getElementById('app')!;
  root.innerHTML = '';
  const tabs = document.createElement('nav');
  for (const s of SECTIONS) {
    const b = document.createElement('button');
    b.textContent = tr(s.title);
    b.className = s.id === activeTab ? 'tab active' : 'tab';
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
    for (const p of sec.resets) patch = deepMerge(patch, patchFor(p, structuredClone((DEFAULT_SETTINGS as unknown as Record<string, unknown>)[p])));
    api.patchSettings(patch);
  };
  h.appendChild(reset);
  panel.appendChild(h);

  for (const c of sec.controls) {
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
      sel.onchange = () => {
        const opt = c.options.find((o) => String(o[0]) === sel.value)!;
        send(c.path, opt[0]);
      };
      row.appendChild(sel);
    } else {
      const b = document.createElement('button');
      b.textContent = tr(c.label);
      b.onclick = c.run;
      row.appendChild(b);
    }
    panel.appendChild(row);
  }
  root.appendChild(panel);
}

(async () => {
  const info = await api.init();
  settings = info.settings;
  lang = settings.lang;
  render();
  api.onSettings((s) => {
    const langChanged = s.lang !== lang;
    settings = s;
    lang = s.lang;
    // Не перерисовываем во время перетаскивания ползунка — только при смене языка/сбросе.
    if (langChanged || document.activeElement?.tagName !== 'INPUT') render();
  });
})();

export {};
