// Модуль снеговиков: сборка, отрисовка, перетаскивание, двойной клик — окошко кастомизации,
// ПКМ — растопить, фразы в облачке, подсказка о неправильной стопке, тёплый отсвет ночью.
import { SnowmanModule, Snowman, partCenters, HatType, NoseType } from '../sim/snowman';
import { drawSnowman, drawSnowmanGlow } from '../render/snowman';
import { registerModule, App, Hit } from './app';
import { balls } from './mod-balls';
import { t, PHRASES, NAMES, Lang } from '../shared/i18n';

let mod: SnowmanModule | null = null;
let appRef: App | null = null;
export function snowmen(): SnowmanModule | null {
  return mod;
}

const bubbles = new Map<number, HTMLDivElement>();
let hintEl: HTMLDivElement | null = null;
let popup: { el: HTMLDivElement; id: number } | null = null;
let lastCursor: { x: number; y: number; t: number } | null = null;

function snowmanAt(x: number, y: number): Snowman | null {
  if (!mod) return null;
  for (let i = mod.snowmen.length - 1; i >= 0; i--) {
    const s = mod.snowmen[i];
    if (s.melting > 0) continue;
    for (const p of partCenters(s)) if (Math.hypot(x - p.x, y - p.y) <= p.r + 3) return s;
  }
  return null;
}

function hitFor(s: Snowman, app: App): Hit {
  let ox = 0;
  return {
    kind: 'snowman',
    priority: 4,
    cursor: 'grab',
    dragStart(p) {
      app.pushHistory();
      s.dragging = true;
      ox = s.x - p.x;
      document.body.style.cursor = 'grabbing';
    },
    drag(p) {
      const r = s.parts[0].r;
      const nx = Math.max(r, Math.min(app.W - r, p.x + ox));
      s.swayV += (nx - s.x) * -0.02; // инерция: верх отстаёт
      s.x = nx;
      s.y = app.scene.surfaceY(s.x) + Math.max(0, Math.min(s.sink, r * 0.3)) - 6;
    },
    dragEnd() {
      s.dragging = false;
      s.born = 0.6; // маленький «плюх» при постановке
      app.sfx('thud', 0.5);
      document.body.style.cursor = '';
    },
    rightClick() {
      app.pushHistory();
      s.melting = 0.001;
      app.sfx('melt');
    },
    dblClick() {
      openCustomize(s, app);
    },
  };
}

// ---------- окошко кастомизации ----------

function closeCustomize(): void {
  if (!popup) return;
  popup.el.remove();
  popup = null;
  appRef?.api.setFocus(false);
}

function openCustomize(s: Snowman, app: App): void {
  closeCustomize();
  const lang = app.settings.lang as Lang;
  const L = s.look;
  const el = document.createElement('div');
  el.className = 'popup';
  const opt = (v: string, label: string, cur: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  el.innerHTML = `
    <h3>${t(lang, 'customize')}</h3>
    <label>${t(lang, 'name')} <input type="text" data-k="name" maxlength="24" value="${L.name.replace(/"/g, '&quot;')}"></label>
    <label>${t(lang, 'hat')} <select data-k="hat">
      ${opt('bucket', t(lang, 'hatBucket'), L.hat)}${opt('top', t(lang, 'hatTop'), L.hat)}${opt('knit', t(lang, 'hatKnit'), L.hat)}${opt('none', t(lang, 'hatNone'), L.hat)}
    </select></label>
    <label>${t(lang, 'hatColor')} <input type="color" data-k="hatColor" value="${L.hatColor}"></label>
    <label>${t(lang, 'scarf')} <span><input type="color" data-k="scarfColor" value="${L.scarfColor}"> <input type="color" data-k="scarfStripe" value="${L.scarfStripe}"></span></label>
    <label>${t(lang, 'nose')} <select data-k="nose">
      ${opt('carrot', t(lang, 'noseCarrot'), L.nose)}${opt('long', t(lang, 'noseLong'), L.nose)}${opt('button', t(lang, 'noseButton'), L.nose)}
    </select></label>
    <label>${t(lang, 'broom')} <input type="checkbox" data-k="broom" ${L.broom ? 'checked' : ''}></label>
    <div class="row"><button data-a="melt">${t(lang, 'melt')}</button><button data-a="done">${t(lang, 'done')}</button></div>`;
  document.body.appendChild(el);
  const head = partCenters(s)[2];
  const pw = 250;
  el.style.left = `${Math.max(8, Math.min(app.W - pw - 8, head.x + 40))}px`;
  el.style.top = `${Math.max(8, Math.min(app.H - el.offsetHeight - 8, head.y - el.offsetHeight - 20))}px`;
  el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) => {
    const apply = () => {
      const k = inp.dataset.k!;
      if (k === 'broom') L.broom = (inp as HTMLInputElement).checked;
      else if (k === 'hat') L.hat = inp.value as HatType;
      else if (k === 'nose') L.nose = inp.value as NoseType;
      else if (k === 'name') L.name = inp.value.slice(0, 24);
      else (L as unknown as Record<string, string>)[k] = inp.value;
    };
    inp.addEventListener('input', apply);
    inp.addEventListener('change', apply);
  });
  el.querySelector('[data-a="done"]')!.addEventListener('click', closeCustomize);
  el.querySelector('[data-a="melt"]')!.addEventListener('click', () => {
    app.pushHistory();
    s.melting = 0.001;
    closeCustomize();
  });
  popup = { el, id: s.id };
  // для ввода имени окно должно принимать клавиатуру
  app.api.setFocus(true);
}

// ---------- облачка и подсказка ----------

function updateDom(app: App): void {
  if (!mod) return;
  const lang = app.settings.lang as Lang;
  const phrases = PHRASES[lang];
  const alive = new Set<number>();
  for (const s of mod.snowmen) {
    if (s.talk <= 0 || s.melting > 0) continue;
    alive.add(s.id);
    let b = bubbles.get(s.id);
    if (!b) {
      b = document.createElement('div');
      b.className = 'bubble';
      document.body.appendChild(b);
      bubbles.set(s.id, b);
    }
    b.textContent = phrases[s.phrase % phrases.length];
    const head = partCenters(s)[2];
    b.style.left = `${Math.max(6, Math.min(app.W - b.offsetWidth - 6, head.x - 18))}px`;
    b.style.top = `${Math.max(6, head.y - head.r * 2.1 - b.offsetHeight - 10)}px`;
    b.style.opacity = s.talk < 0.4 ? String(s.talk / 0.4) : '1';
  }
  for (const [id, b] of bubbles) {
    if (!alive.has(id)) {
      b.remove();
      bubbles.delete(id);
    }
  }
  // подсказка «большой шар должен быть снизу»: у стопки и у курсора
  const h = mod.hint;
  if (h) {
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.className = 'hint';
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = t(lang, h.reason === 'order' ? 'hintOrder' : h.reason === 'crooked' ? 'hintCrooked' : 'limitSnowmen');
    const c = app.cursor;
    const near = c && Math.hypot(c.x - h.x, c.y - h.y) < 220;
    const x = near ? c!.x + 16 : h.x - hintEl.offsetWidth / 2;
    const y = near ? c!.y + 18 : h.y - 40;
    hintEl.style.left = `${Math.max(6, Math.min(app.W - hintEl.offsetWidth - 6, x))}px`;
    hintEl.style.top = `${Math.max(6, y)}px`;
    hintEl.style.opacity = '1';
  } else if (hintEl) hintEl.style.opacity = '0';
}

registerModule({
  name: 'snowmen',
  attach(app) {
    appRef = app;
    const w = balls();
    if (!w) return;
    mod = new SnowmanModule(app.scene, w);
    app.scene.modules.snowmen = mod;
    this.onSettings?.(app);
  },
  onSettings(app) {
    if (!mod) return;
    mod.limit = app.settings.snowmen.limit;
    mod.speech = app.settings.snowmen.speech;
    const lang = app.settings.lang as Lang;
    mod.names = NAMES[lang];
    mod.phrasesCount = PHRASES[lang].length;
  },
  frame(app) {
    if (!mod) return;
    // курсор и его скорость (для взмаха и касаний) — даже в пассивном режиме
    const c = app.cursor;
    if (c) {
      const now = performance.now();
      const dt = lastCursor ? Math.max(1, now - lastCursor.t) / 1000 : 1;
      mod.cursor = { x: c.x, y: c.y, vx: lastCursor ? (c.x - lastCursor.x) / dt : 0, vy: lastCursor ? (c.y - lastCursor.y) / dt : 0 };
      lastCursor = { x: c.x, y: c.y, t: now };
    } else mod.cursor = null;
    if (!app.settings.snowmen.wave && mod.cursor) mod.cursor = { ...mod.cursor, x: -9999, y: -9999 };
    if (!app.settings.snowmen.blink) for (const s of mod.snowmen) s.blink = 0;
    if (popup && !mod.snowmen.some((s) => s.id === popup!.id)) closeCustomize();
    updateDom(app);
  },
  draw(ctx, layer, app) {
    if (!mod) return;
    if (layer === 'mid') for (const s of mod.snowmen) drawSnowman(ctx, s, app.now, app.dpr, app.scene.surfaceY(s.x));
    else if (layer === 'glow') for (const s of mod.snowmen) drawSnowmanGlow(ctx, s, app.light.night);
  },
  hit(x, y, app) {
    const s = snowmanAt(x, y);
    return s ? hitFor(s, app) : null;
  },
  scenario(name, app) {
    if (name !== 'snowman' && name !== 'snowmen') return null;
    return (async () => {
      const sc = app.scene;
      const w = balls()!;
      sc.fastForward(60 * 12);
      const W = app.W;
      const put = (x: number, r: [number, number, number], off = [0, 3, 5]) => {
        const g = sc.surfaceY(x);
        w.add(x + off[0], g - r[0], r[0]);
        for (let k = 0; k < 90; k++) sc.step();
        w.add(x + off[1], sc.surfaceY(x) - r[0] * 2 - r[1] - 20, r[1]);
        for (let k = 0; k < 120; k++) sc.step();
        w.add(x + off[2], sc.surfaceY(x) - r[0] * 2 - r[1] * 2 - r[2] - 20, r[2]);
        for (let k = 0; k < 160; k++) sc.step();
      };
      /** Самое ровное место в диапазоне (стопку у склона сугроба шары законно «кривят»). */
      const flat = (a: number, b: number, half = 70) => {
        let best = a, bestV = Infinity;
        for (let x = a; x <= b; x += 8) {
          const v = Math.abs(sc.surfaceY(x - half) - sc.surfaceY(x)) + Math.abs(sc.surfaceY(x + half) - sc.surfaceY(x));
          if (v < bestV) { bestV = v; best = x; }
        }
        return best;
      };
      if (name === 'snowman') {
        put(flat(W * 0.15, W * 0.5), [44, 32, 22]);
        // неправильная стопка рядом — подсказка
        put(flat(W * 0.6, W * 0.9), [30, 30, 20]);
        return { ...mod!.testInfo(), looks: mod!.snowmen.map((s) => s.look.hat + '/' + s.look.nose) };
      }
      // разнообразие: малыш, обычный, великан, и ещё несколько
      const sizes: [number, number, number][] = [[18, 13, 9], [40, 30, 21], [70, 52, 36], [34, 26, 18], [50, 36, 26]];
      sizes.forEach((r, k) => put(flat(W * (0.04 + k * 0.19), W * (0.16 + k * 0.19)), r));
      mod!.snowmen.forEach((s, k) => {
        s.talk = k === 1 ? 4 : 0;
        s.wave = k === 2 ? 1 : 0;
        s.wavePhase = 1.2;
        s.hatSnow = 0.6;
      });
      for (let k = 0; k < 2; k++) sc.step();
      updateDom(app);
      return { ...mod!.testInfo(), looks: mod!.snowmen.map((s) => `${s.look.hat}/${s.look.nose}/${s.look.broom ? 'broom' : '-'}`) };
    })();
  },
});

// тестовые хуки
const T = ((window as unknown as { __test: Record<string, unknown> }).__test ??= {});
Object.assign(T, {
  snowmanPos: (i: number) => {
    const s = mod?.snowmen[i];
    if (!s) return null;
    // нижний шар (средний в маленьком окне может оказаться под доком)
    const p = partCenters(s)[0];
    return [p.x, p.y + p.r * 0.3];
  },
  snowmen: () => mod?.snowmen.length ?? 0,
  customizeOpen: () => !!popup,
});
