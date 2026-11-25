// Рендерер сцены (оверлей или отладочное окно): цикл, отрисовка, ввод (пассивный/интерактивный),
// док, история Undo/Redo, команды, тестовые сценарии. Модули (шары, снеговики, декор…) подключаются через app.ts.
import type { CozyApi, Command, UiState } from '../shared/ipc';
import type { Settings, ToolId } from '../shared/settings';
import { t } from '../shared/i18n';
import { Scene, FIXED_DT, Snapshot } from '../sim/scene';
import { History } from '../sim/tools';
import { GroundRenderer } from '../render/ground';
import { SnowRenderer } from '../render/snow';
import { cursorCSS, IconId } from '../render/icons';
import { sceneParamsFrom } from './mapSettings';
import { toolRegistry, brushSize, PointerInfo, ToolHost } from './tools';
import { Dock, BALL_PRESETS } from './dock';
import { App, Hit, Light, overlayModules } from './app';
import './modules';

declare global {
  interface Window {
    cozy: CozyApi;
    __test: Record<string, (...a: never[]) => unknown>;
  }
}

const api = window.cozy;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
/** Дальние слои: двигаются < 1 px за кадр и обновляются через кадр. */
const farCanvas = document.getElementById('far') as HTMLCanvasElement;
/** Небо (звёзды, луна, сияние) — обновляется ~10 раз/с. */
const skyCanvas = document.getElementById('sky') as HTMLCanvasElement;
let ctx: CanvasRenderingContext2D = null as unknown as CanvasRenderingContext2D;
let farCtx: CanvasRenderingContext2D = null as unknown as CanvasRenderingContext2D;
let skyCtx: CanvasRenderingContext2D = null as unknown as CanvasRenderingContext2D;
const fpsEl = document.getElementById('fps') as HTMLDivElement;

const ground = new GroundRenderer();
const snowR = new SnowRenderer();
const history = new History<Snapshot>(40);

const DAY_LIGHT: Light = {
  skyTop: '#7fb2f0', skyBottom: '#dcecff', skyAlpha: 0, tint: '#ffffff', tintAlpha: 0, snowColor: '#ffffff', fog: 0,
  windowLight: 0, garland: 0, stars: 0, moon: 0, sun: 0, aurora: 0, hour: 12, night: 0,
};

/** Подменяется модулем звука. */
let sfxHook: (name: string, power: number) => void = () => {};
export function setSfxHook(f: (name: string, power: number) => void): void {
  sfxHook = f;
}

const app: App = {
  api,
  info: null as never,
  scene: null as never,
  settings: null as never,
  ui: null as never,
  W: 0,
  H: 0,
  dpr: 1,
  now: 0,
  light: { ...DAY_LIGHT },
  cursor: null,
  pushHistory() {
    history.push(app.scene.snapshot());
    api.historyPushed();
  },
  sfx(name, power = 1) {
    sfxHook(name, power);
  },
  toast(text) {
    showToast(text);
  },
};
(window as unknown as { __setSfx: typeof setSfxHook }).__setSfx = setSfxHook;

let dock: Dock | null = null;
let running = false;
let rafId = 0;
let last = 0;
let lastDraw = 0;
let acc = 0;
let frameNo = 0;
let lastSky = -1e9;
let lastRects = 0;
let lastSave = 0;

// ---------- размеры ----------

function resize(): void {
  app.dpr = Math.min(2, window.devicePixelRatio || 1);
  app.W = window.innerWidth;
  app.H = window.innerHeight;
  for (const c of [canvas, farCanvas, skyCanvas]) {
    c.width = Math.round(app.W * app.dpr);
    c.height = Math.round(app.H * app.dpr);
    c.style.width = app.W + 'px';
    c.style.height = app.H + 'px';
  }
  if (app.scene) app.scene.resize(app.W, app.H);
  ensureGround();
  lastSky = -1e9;
}

function ensureGround(): void {
  if (!app.scene) return;
  let peak = 0;
  const f = app.scene.field;
  for (let i = 0; i < f.n; i++) peak = Math.max(peak, f.visibleHeight(i));
  ground.ensure(app.W, Math.max(app.settings.drift.maxHeight * 1.7 + 30, peak + 40), app.dpr);
}

// ---------- настройки / состояние интерфейса ----------

function effectiveParams(s: Settings) {
  const p = sceneParamsFrom(s);
  if (app.ui?.economy) p.snowfall.intensity = (p.snowfall.intensity ?? 0) * 0.7;
  return p;
}

function applySettings(s: Settings): void {
  app.settings = s;
  app.scene.apply(effectiveParams(s));
  ensureGround();
  for (const m of overlayModules) m.onSettings?.(app);
  dock?.update();
  updateCursor();
  updateRunState();
}

function applyUi(u: UiState): void {
  const prev = app.ui;
  app.ui = { ...u };
  if (!u.interactive) {
    endPointer();
    app.scene.activeTool = null;
  }
  updateCursor();
  if (prev && prev.economy !== u.economy) app.scene.apply(effectiveParams(app.settings));
  dock?.update();
  updateRunState();
}

function updateRunState(): void {
  const shouldRun = !app.settings.paused && !app.ui.autoPaused;
  if (shouldRun && !running) start();
  else if (!shouldRun && running) stop();
  if (!shouldRun) render(0, true);
}

function fpsLimit(): number {
  return app.ui.economy ? 30 : app.settings.fpsLimit;
}

// ---------- отрисовка ----------

function render(dt: number, full = true): void {
  const { W, H, dpr, scene } = app;
  const L = app.light;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (app.info.exp.includes('blank')) return; // эксперимент: стоимость пустого кадра
  const t = scene.wind.time;
  const fl = scene.snowfall.flakes;
  // небо (свой холст, ~10 раз/с)
  if (full || app.now - lastSky > 0.1) {
    lastSky = app.now;
    skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    skyCtx.clearRect(0, 0, W, H);
    for (const m of overlayModules) m.draw?.(skyCtx, 'sky', app);
  }
  // дальние слои (свой холст, через кадр)
  if (full || (frameNo++ & 1) === 0) {
    farCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    farCtx.clearRect(0, 0, W, H);
    snowR.drawFlakes(farCtx, fl, [0, 1], t, dpr);
  }
  for (const m of overlayModules) m.draw?.(ctx, 'back', app);
  ground.setTint(L.snowColor);
  ground.update(scene.field, performance.now());
  ground.draw(ctx, H);
  for (const m of overlayModules) m.draw?.(ctx, 'mid', app);
  snowR.drawFlakes(ctx, fl, [2], t, dpr);
  snowR.drawParticles(ctx, scene.particles);
  for (const m of overlayModules) m.draw?.(ctx, 'front', app);
  // тонирование времени суток: только по уже нарисованному (source-atop), рабочий стол не трогаем
  if (L.tintAlpha > 0.005) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = L.tintAlpha;
    ctx.fillStyle = L.tint;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const m of overlayModules) m.draw?.(ctx, 'glow', app);
  snowR.drawSparkles(ctx, scene.field, H, W, dt, 1 + L.night * 0.6);
  snowR.drawFlakes(ctx, fl, [3], t, dpr);
  for (const m of overlayModules) m.draw?.(ctx, 'glass', app);
  drawToolOverlay();
}

function drawToolOverlay(): void {
  if (!app.ui.interactive || !app.cursor) return;
  const h = toolRegistry[app.ui.tool];
  const c = app.cursor;
  if (h?.brush) {
    const R = brushSize(app.settings);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(30,50,80,0.6)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, R + 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (app.ui.tool === 'ball' && !pointer) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, app.settings.tools.ballSize, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  h?.overlay?.(ctx, pointer ? cur : { x: c.x, y: c.y, vx: 0, vy: 0, button: 0 }, !!pointer);
}

// ---------- цикл ----------

let fpsFrames = 0;
let fpsT = 0;
function frame(now: number): void {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  const minDt = 1000 / fpsLimit() - 1.5;
  if (now - lastDraw < minDt) return;
  const dtMs = Math.min(100, now - last);
  last = now;
  lastDraw = now;
  const dt = dtMs / 1000;
  app.now += dt;
  const timeScale = app.ui.winterUntil > Date.now() ? 25 : 1;
  acc += dt * timeScale;
  let steps = 0;
  if (pointer) holdTool(dt);
  while (acc >= FIXED_DT && steps < 8 * timeScale) {
    app.scene.step(FIXED_DT);
    acc -= FIXED_DT;
    steps++;
  }
  if (acc > FIXED_DT * 4) acc = 0; // не догоняем после долгих пауз
  if (app.scene.field.revision % 30 === 0) ensureGround();
  for (const m of overlayModules) m.frame?.(app, dt);
  flushEvents();
  dock?.tick(now);
  render(dt, fpsLimit() <= 30);
  if (dock && now - lastRects > 300) {
    lastRects = now;
    api.reportRects(dock.rects());
  }
  if (now - lastSave > 60000) {
    lastSave = now;
    saveScene();
  }
  if (app.info.debug) {
    fpsFrames++;
    if (now - fpsT > 1000) {
      fpsEl.textContent = `${fpsFrames} fps · ${app.scene.snowfall.flakes.length} хлопьев`;
      fpsFrames = 0;
      fpsT = now;
    }
  }
}

function start(): void {
  if (running) return;
  running = true;
  last = lastDraw = performance.now();
  rafId = requestAnimationFrame(frame);
}

function stop(): void {
  running = false;
  cancelAnimationFrame(rafId);
}

/** События сцены → звуки (модуль звука подменяет sfxHook). */
function flushEvents(): void {
  const ev = app.scene.events;
  for (const e of ev) app.sfx(e.type, e.power ?? 1);
  ev.length = 0;
}

// ---------- ввод ----------

let pointer: { tool: ToolId | null; hit: Hit | null } | null = null;
let cur: PointerInfo = { x: 0, y: 0, vx: 0, vy: 0, button: 0 };
let lastMoveT = 0;
let hovering: Hit | null = null;
let captured = false;
let lastDown = { t: 0, x: 0, y: 0 };

const host: ToolHost = {
  get scene() {
    return app.scene;
  },
  settings: () => app.settings,
  pushHistory: () => app.pushHistory(),
  sfx: (n, p) => app.sfx(n, p),
  toast: (s) => app.toast(s),
};

function hitAt(x: number, y: number): Hit | null {
  let best: Hit | null = null;
  for (const m of overlayModules) {
    const h = m.hit?.(x, y, app);
    if (h && (!best || (h.priority ?? 10) < (best.priority ?? 10))) best = h;
  }
  return best;
}

/** Точка над элементами интерфейса (док, окна, подсказки) — их обрабатывает DOM. */
function overUi(x: number, y: number, target: EventTarget | null): boolean {
  if (dock?.contains(x, y)) return true;
  const el = target as HTMLElement | null;
  return !!el?.closest?.('.popup, .tour, .dock, .dock-tab');
}

function setCapture(v: boolean): void {
  if (v === captured) return;
  captured = v;
  api.setMouseCapture(v);
}

function updateCursor(): void {
  if (!app.ui) return;
  if (app.ui.interactive) {
    const icon = (app.ui.tool === 'ball' ? (Object.entries(BALL_PRESETS).find(([, r]) => r === app.settings.tools.ballSize)?.[0] ?? 'ball') : app.ui.tool) as IconId;
    document.body.style.cursor = hovering?.cursor && app.ui.tool === 'hand' ? hovering.cursor : cursorCSS(icon);
  } else document.body.style.cursor = hovering?.cursor ?? 'default';
}

function trackVelocity(e: MouseEvent): void {
  const now = performance.now();
  const dt = Math.max(1, now - lastMoveT) / 1000;
  const vx = (e.clientX - cur.x) / dt;
  const vy = (e.clientY - cur.y) / dt;
  const k = Math.min(1, dt * 12);
  cur = { x: e.clientX, y: e.clientY, vx: cur.vx + (vx - cur.vx) * k, vy: cur.vy + (vy - cur.vy) * k, button: cur.button };
  lastMoveT = now;
}

window.addEventListener('mousemove', (e) => {
  const prev = { ...cur };
  trackVelocity(e);
  app.cursor = { x: e.clientX, y: e.clientY };
  if (pointer) {
    if (pointer.hit) pointer.hit.drag?.(cur);
    else if (pointer.tool) toolRegistry[pointer.tool]?.move?.(host, cur, prev);
    return;
  }
  // пассивный режим: ловим мышь только над объектами и интерфейсом
  const ui = overUi(e.clientX, e.clientY, e.target);
  hovering = ui ? null : hitAt(e.clientX, e.clientY);
  if (!app.ui.interactive) setCapture(ui || !!hovering);
  updateCursor();
});

document.addEventListener('mouseleave', () => {
  app.cursor = null;
  if (!pointer) {
    hovering = null;
    if (!app.ui.interactive) setCapture(false);
  }
});

window.addEventListener('mousedown', (e) => {
  if (overUi(e.clientX, e.clientY, e.target)) return;
  trackVelocity(e);
  cur.button = e.button;
  cur.vx = cur.vy = 0;
  const hit = hitAt(e.clientX, e.clientY);
  if (e.button === 2) {
    if (hit?.rightClick) hit.rightClick();
    else if (app.ui.interactive) api.ui({ interactive: false });
    return;
  }
  if (e.button !== 0) return;
  // двойной клик определяем сами: в окне без фокуса dblclick приходит ненадёжно
  const now = performance.now();
  if (hit?.dblClick && now - lastDown.t < 450 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 8) {
    lastDown.t = 0;
    if (pointer) endPointer();
    hit.dblClick();
    return;
  }
  lastDown = { t: now, x: e.clientX, y: e.clientY };
  const tool = app.ui.interactive ? app.ui.tool : null;
  // Рука и пассивный режим берут объект; кисти и шары работают поверх объектов, кроме «бросаемых» объектов
  const grabbing = hit && hit.dragStart && (tool === null || tool === 'hand' || tool === 'shovel' || tool === 'eraser' || tool === 'ball' || tool === 'steps' || tool === 'angel' || tool === 'tree');
  if (hit && (tool === null || tool === 'hand' || grabbing)) {
    pointer = { tool: null, hit };
    hit.dragStart?.(cur);
    return;
  }
  if (!tool) return;
  pointer = { tool, hit: null };
  toolRegistry[tool]?.down?.(host, cur);
});

function endPointer(): void {
  if (!pointer) return;
  if (pointer.hit) pointer.hit.dragEnd?.(cur);
  else if (pointer.tool) toolRegistry[pointer.tool]?.up?.(host, cur);
  pointer = null;
}

window.addEventListener('mouseup', (e) => {
  if (!pointer) return;
  trackVelocity(e);
  endPointer();
});

function holdTool(dt: number): void {
  if (!pointer?.tool) return;
  // мышь стоит — скорость затухает (важно для «бросков» и направления струи)
  if (performance.now() - lastMoveT > 60) {
    cur.vx *= 0.8;
    cur.vy *= 0.8;
  }
  toolRegistry[pointer.tool]?.hold?.(host, cur, dt);
}

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('wheel', (e) => {
  if (!app.ui.interactive) return;
  const s = app.settings;
  const d = e.deltaY < 0 ? 1 : -1;
  if (app.ui.tool === 'ball') api.patchSettings({ tools: { ballSize: Math.max(8, Math.min(90, s.tools.ballSize + d * 2)) } });
  else api.patchSettings({ tools: { size: Math.max(10, Math.min(200, s.tools.size + d * 6)) } });
});

// ---------- команды ----------

function digit(key: string): void {
  if (!app.info.hasDock) return; // клавишу обрабатывает одно окно, остальные получат новое состояние от main
  const balls: Record<string, keyof typeof BALL_PRESETS> = { '1': 'ballS', '2': 'ballM', '3': 'ballL', '4': 'ballXL' };
  const tools: Record<string, ToolId> = { '5': 'shovel', '6': 'eraser', '7': 'blower', '8': 'heat', '9': 'add', '0': 'hand', R: 'roll', F: 'steps', N: 'angel', T: 'tree', B: 'throw', D: 'drive' };
  if (balls[key]) {
    api.patchSettings({ tools: { ballSize: BALL_PRESETS[balls[key]] } });
    api.ui({ tool: 'ball' });
  } else if (tools[key]) api.ui({ tool: tools[key] });
}

function onCommand(c: Command): void {
  const sc = app.scene;
  switch (c.type) {
    case 'dustNow':
      app.pushHistory();
      sc.dustNow();
      ensureGround();
      break;
    case 'clearSnow':
      app.pushHistory();
      sc.startClearAll();
      break;
    case 'clearSnowInstant':
      sc.field.clear();
      break;
    case 'undo': {
      const s = history.undo(sc.snapshot());
      if (s) sc.restore(s);
      break;
    }
    case 'redo': {
      const s = history.redo(sc.snapshot());
      if (s) sc.restore(s);
      break;
    }
    case 'digit':
      digit(c.key);
      break;
    case 'toast':
      if (app.info.hasDock) showToast(c.text);
      break;
    case 'saveNow':
      saveScene();
      break;
  }
  for (const m of overlayModules) m.onCommand?.(c, app);
  if (!running) render(0, true);
}

// ---------- тосты ----------

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
function showToast(text: string): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl && (toastEl.style.opacity = '0'), 3500);
}

// ---------- сохранение сцены ----------

function saveScene(): void {
  if (!app.settings?.system.saveScene || !app.scene) return;
  api.saveScene(app.info.sceneKey, app.scene.serialize());
}

// ---------- тестовые сценарии ----------

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
function fieldStats() {
  const f = app.scene.field;
  let min = Infinity, max = 0, sum = 0;
  for (let i = 0; i < f.n; i++) {
    min = Math.min(min, f.snow[i]);
    max = Math.max(max, f.snow[i]);
    sum += f.snow[i];
  }
  return { mean: +(sum / f.n).toFixed(1), min: +min.toFixed(1), max: +max.toFixed(1), slopeViolation: +f.maxSlopeViolation().toFixed(3), volume: Math.round(f.totalSnow()) };
}
async function settle(): Promise<void> {
  ensureGround();
  ground.update(app.scene.field, performance.now(), 0, true);
  render(FIXED_DT, true);
  await nextFrame();
  await nextFrame();
}

async function runScenario(name: string): Promise<void> {
  const sc = app.scene;
  if (name === 'snow60') {
    // 60 секунд «ускоренной» симуляции: ×20 → 20 минут снегопада.
    const t0 = performance.now();
    sc.fastForward(60 * 20);
    const ms = Math.round(performance.now() - t0);
    await settle();
    api.scenarioDone(name, { simMs: ms, ...fieldStats() });
    return;
  }
  if (name === 'blizzard') {
    sc.apply({ windBase: 200, gustiness: 0.9, snowfall: { intensity: 0.9 } });
    sc.fastForward(600);
    await settle();
    api.scenarioDone(name, { particles: sc.particles.length, wind: Math.round(sc.wind.value) });
    return;
  }
  if (name === 'dustnow') {
    sc.field.clear();
    sc.dustNow();
    await settle();
    api.scenarioDone(name, fieldStats());
    return;
  }
  if (name === 'shovel') {
    // Лопата убирает полосу: 20 минут снегопада, затем проход лопатой через середину.
    sc.fastForward(60 * 20);
    sc.apply({ snowfall: { intensity: 0 } });
    const before = sc.field.totalSnow();
    const x0 = app.W * 0.3, x1 = app.W * 0.6;
    let y = 0;
    for (let x = x0; x <= x1; x += 4) y = Math.max(y, sc.surfaceY(x));
    y += 20;
    app.pushHistory();
    // ход лопатой как мышью: серия коротких движений
    sc.beginShovel(x0);
    for (let x = x0; x < x1; x += 12) sc.shovelStroke(x, y, Math.min(x1, x + 12), y, 28);
    sc.endShovel();
    const after = sc.field.totalSnow();
    await settle();
    const f = sc.field;
    // середина полосы (края полосы законно засыпает осевший валик)
    let stripMax = 0;
    const mid = (x0 + x1) / 2;
    for (let x = mid - 60; x < mid + 60; x += 2) stripMax = Math.max(stripMax, f.snow[f.col(x)]);
    api.scenarioDone(name, { volumeBefore: Math.round(before), volumeAfter: Math.round(after), volumeDelta: +(after / before - 1).toFixed(4), stripMax: +stripMax.toFixed(1), slopeViolation: +f.maxSlopeViolation().toFixed(3) });
    return;
  }
  if (name === 'blowfx' || name === 'clearfx' || name === 'heatfx') {
    // кадр посреди действия: частицы снегодува / фронт «очистить всё» / капли фена
    sc.fastForward(60 * 15);
    if (name === 'clearfx') {
      sc.startClearAll();
      for (let k = 0; k < 50; k++) sc.step();
    } else {
      const x = app.W * 0.5;
      const kind = name === 'blowfx' ? 'blower' : 'heat';
      sc.activeTool = { kind, x, y: sc.surfaceY(x) - (kind === 'heat' ? 15 : -4), R: 30, softness: 0.4, strength: 1, dirX: 1, dirY: -0.2 };
      for (let k = 0; k < 40; k++) sc.step();
    }
    await settle();
    api.scenarioDone(name, { particles: sc.particles.length, kinds: [...new Set(sc.particles.map((p) => p.kind))], ...fieldStats() });
    return;
  }
  for (const m of overlayModules) {
    const r = m.scenario?.(name, app);
    if (r) {
      const info = await r;
      await settle();
      api.scenarioDone(name, info);
      return;
    }
  }
  api.scenarioDone(name, { error: 'unknown scenario' });
}

window.__test = Object.assign(window.__test ?? {}, {
  prepare: () => {
    app.scene.fastForward(600);
    // для точных замеров объёма в тестах ввода снегопад останавливаем
    app.scene.apply({ snowfall: { intensity: 0 } });
    app.scene.snowfall.flakes.length = 0;
    ensureGround();
  },
  surfaceY: (x: number) => app.scene.surfaceY(x),
  volume: () => app.scene.field.totalSnow(),
  dockOpen: () => !!dock?.isOpen,
  interactive: () => app.ui.interactive,
  setTool: (tool: ToolId) => api.ui({ interactive: true, tool }),
  setBallSize: (r: number) => api.patchSettings({ tools: { ballSize: r } }),
  info: () => ({ ...fieldStats(), ...app.scene.testInfo() }),
  run: (name: string) => runScenario(name),
}) as unknown as Window['__test'];

// ---------- старт ----------

(async () => {
  const info = await api.init();
  app.info = info;
  app.settings = info.settings;
  app.ui = info.ui;
  ctx = canvas.getContext('2d', { alpha: true })!;
  farCtx = farCanvas.getContext('2d', { alpha: true })!;
  skyCtx = skyCanvas.getContext('2d', { alpha: true })!;
  if (info.windowed) document.body.classList.add('windowed');
  if (info.debug) fpsEl.style.display = 'block';
  resize();
  app.scene = new Scene(app.W, app.H, info.seed || 1);
  app.scene.apply(effectiveParams(app.settings));
  for (const m of overlayModules) m.attach?.(app);
  if (info.savedScene) {
    try {
      app.scene.deserialize(info.savedScene);
    } catch (e) {
      console.warn('сохранённая сцена не загрузилась:', e);
    }
  }
  app.scene.snowfall.prefill();
  ensureGround();
  if (info.hasDock) {
    dock = new Dock({
      api,
      settings: () => app.settings,
      ui: () => app.ui,
      command: (type) => api.command({ type } as Command),
      toggleWinterMinute: () => {
        const on = app.ui.winterUntil > Date.now();
        api.ui({ winterUntil: on ? 0 : Date.now() + 60000 });
        if (!on) showToast(t(app.settings.lang, 'winterOn'));
      },
    });
  }
  window.addEventListener('resize', resize);
  api.onSettings(applySettings);
  api.onCommand(onCommand);
  api.onUi(applyUi);
  updateCursor();
  for (const m of overlayModules) m.onSettings?.(app);
  if (info.scenario) {
    await runScenario(info.scenario);
    updateRunState();
    return;
  }
  updateRunState();
})();

export {};
