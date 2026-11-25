// Главный процесс: окна (оверлей на каждый монитор / отладочное окно), трей, настройки, режимы ввода,
// горячие клавиши, Undo/Redo-маршрутизация, снимки, сохранение сцены, системные функции.
import {
  app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage, desktopCapturer, globalShortcut, dialog,
  powerMonitor, Notification, Display, Rectangle, MenuItemConstructorOptions, WebContents,
} from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn as spawnChild, execFileSync } from 'node:child_process';
import { SettingsStore } from './settingsStore';
import { snowflakeBitmap } from './icon';
import { WinHelper } from './winhelper';
import { Wallpaper } from './wallpaper';
import type { InitInfo, Command, UiState, WinRect } from '../shared/ipc';
import { Settings, ToolId, sanitizeSettings } from '../shared/settings';

// ---------- аргументы ----------
const argv = process.argv.slice(1);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string): string | null => {
  const p = argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
};
const ARGS = {
  windowed: flag('windowed'),
  overlay: flag('overlay'),
  scenario: opt('scenario'),
  exitAfter: flag('exit'),
  shotAfter: opt('shot-after') ? Number(opt('shot-after')) : null,
  shotName: opt('shot-name') ?? 'shot',
  shotDir: path.resolve(opt('shot-dir') ?? path.join(process.cwd(), 'tests', 'shots')),
  desktopShot: flag('desktop-shot'),
  debug: flag('verbose'),
  trayCheck: flag('tray-check'),
  settingsCheck: flag('settings-check'),
  helperCheck: flag('helper-check'),
  ledgeTest: flag('ledge-test'),
  mouseTest: flag('mouse-test'),
  hotkeyCheck: flag('hotkey-check'),
  systemCheck: flag('system-check'),
  inputTest: opt('input-test'),
  seed: Number(opt('seed') ?? 0) || 0,
};
const TEST_MODE = !!(ARGS.scenario || ARGS.shotAfter !== null || ARGS.trayCheck || ARGS.settingsCheck || ARGS.inputTest || ARGS.helperCheck || ARGS.ledgeTest || ARGS.mouseTest || ARGS.hotkeyCheck || ARGS.systemCheck);

// ---------- профиль ----------
const userDir = opt('user-data') ? path.resolve(opt('user-data')!) : path.join(app.getPath('appData'), 'CozyWinter2');
app.setPath('userData', userDir);
const store = new SettingsStore(userDir);
if (store.recoveredFromCorrupt) console.warn('[settings] файл настроек был повреждён — восстановлены значения по умолчанию/резервная копия');
if (!store.settings.gpu) app.disableHardwareAcceleration();
app.setAppUserModelId('app.cozywinter2');
// звуки без жеста пользователя (окно оверлея не получает кликов до первого взаимодействия)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const STATIC = path.join(ROOT, 'static');
const PRELOAD = path.join(__dirname, 'preload.js');
const SCENES = path.join(userDir, 'scenes');

let tray: Tray | null = null;
let settingsWin: BrowserWindow | null = null;
interface SceneWin {
  win: BrowserWindow;
  displayIndex: number;
  overlay: boolean;
  displayId: number | null;
  sceneKey: string;
  hoverCapture: boolean;
  hasDock: boolean;
}
/** Окна сцены: ключ — id дисплея (или 'windowed'). */
const sceneWins = new Map<string, SceneWin>();
let quitting = false;
let savedBeforeQuit = false;
const ui: UiState = { interactive: false, tool: store.settings.tools.current, winterUntil: 0, autoPaused: false, economy: false };
let lastRects: Record<string, [number, number, number, number]> = {};

function effectiveMode(): 'overlay' | 'windowed' {
  if (ARGS.windowed) return 'windowed';
  if (ARGS.overlay) return 'overlay';
  return store.settings.mode;
}

const T = (ru: string, en: string) => (store.settings.lang === 'en' ? en : ru);

// ---------- окна ----------

/** Окно = рабочая область (без панели задач). Если она равна всему экрану — на 1 px меньше,
 *  чтобы Windows не принял оверлей за полноэкранное приложение. */
export function overlayBounds(d: Display, ground: Settings['groundLevel']): Rectangle {
  const full = d.bounds;
  const wa = ground === 'screen' ? full : d.workArea;
  const r = { ...wa };
  if (r.width === full.width && r.height === full.height) r.height -= 1;
  return r;
}

function sceneKeyFor(d: Display | null): string {
  if (!d) return 'windowed';
  const b = d.bounds;
  return `d${b.x}_${b.y}_${b.width}x${b.height}`;
}

function wireCommon(win: BrowserWindow, tag: string) {
  win.webContents.on('console-message', (...a: unknown[]) => {
    const e = a[0] as { message?: string; level?: string | number };
    const msg = e?.message ?? (a[2] as string);
    const level = e?.level ?? a[1];
    if (ARGS.debug || TEST_MODE || level === 'error' || level === 3) console.log(`[${tag}] ${msg}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error(`[${tag}] renderer gone:`, d.reason));
}

const webPrefs = () => ({ preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, sandbox: true });

function createOverlay(d: Display, index: number): BrowserWindow {
  const b = overlayBounds(d, store.settings.groundLevel);
  const win = new BrowserWindow({
    ...b,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    title: 'Cozy Winter 2',
    webPreferences: webPrefs(),
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setBounds(b); // на смешанных DPI повторная установка даёт точный размер
  wireCommon(win, `overlay${index}`);
  win.loadFile(path.join(STATIC, 'overlay.html'));
  win.once('ready-to-show', () => {
    if (!ui.autoPaused) win.showInactive();
  });
  return win;
}

function createWindowed(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    backgroundColor: '#101826',
    title: 'Cozy Winter 2 — отладочное окно',
    show: false,
    autoHideMenuBar: true,
    webPreferences: webPrefs(),
  });
  wireCommon(win, 'windowed');
  win.loadFile(path.join(STATIC, 'overlay.html'), { query: { windowed: '1' } });
  win.once('ready-to-show', () => (TEST_MODE ? win.showInactive() : win.show()));
  win.on('closed', () => {
    sceneWins.delete('windowed');
    if (!quitting && effectiveMode() === 'windowed' && !TEST_MODE) app.quit();
  });
  return win;
}

function targetDisplays(): Display[] {
  const prim = screen.getPrimaryDisplay();
  if (store.settings.monitors === 'primary') return [prim];
  // основной монитор первым — на нём док
  return [prim, ...screen.getAllDisplays().filter((d) => d.id !== prim.id)];
}

/** Привести набор окон к текущему режиму/мониторам без лишнего пересоздания. */
function reconcileWindows(): void {
  const mode = effectiveMode();
  const want = new Map<string, { d?: Display; index: number }>();
  if (mode === 'windowed') want.set('windowed', { index: 0 });
  else targetDisplays().forEach((d, i) => want.set(String(d.id), { d, index: i }));

  for (const [key, w] of sceneWins) {
    if (!want.has(key)) {
      sceneWins.delete(key);
      if (!w.win.isDestroyed()) {
        w.win.webContents.send('command', { type: 'saveNow' } satisfies Command);
        const ww = w.win;
        setTimeout(() => !ww.isDestroyed() && ww.destroy(), 400);
      }
    }
  }
  for (const [key, t] of want) {
    const ex = sceneWins.get(key);
    if (ex && !ex.win.isDestroyed()) {
      if (t.d) ex.win.setBounds(overlayBounds(t.d, store.settings.groundLevel));
      ex.displayIndex = t.index;
      continue;
    }
    const win = t.d ? createOverlay(t.d, t.index) : createWindowed();
    sceneWins.set(key, { win, displayIndex: t.index, overlay: !!t.d, displayId: t.d?.id ?? null, sceneKey: sceneKeyFor(t.d ?? null), hoverCapture: false, hasDock: t.index === 0 });
  }
  applyMouseMode();
}

function openSettings(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 640,
    height: 840,
    minWidth: 540,
    minHeight: 520,
    title: T('Cozy Winter 2 — Настройки', 'Cozy Winter 2 — Settings'),
    backgroundColor: '#152031',
    autoHideMenuBar: true,
    show: false,
    icon: trayImage(false),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  wireCommon(settingsWin, 'settings');
  settingsWin.loadFile(path.join(STATIC, 'settings.html'));
  settingsWin.once('ready-to-show', () => (TEST_MODE ? settingsWin?.showInactive() : settingsWin?.show()));
  settingsWin.on('closed', () => (settingsWin = null));
}

// ---------- режимы ввода ----------

function applyMouseMode(): void {
  for (const s of sceneWins.values()) {
    if (!s.overlay || s.win.isDestroyed()) continue;
    const capture = ui.interactive || s.hoverCapture;
    s.win.setIgnoreMouseEvents(!capture, { forward: true });
  }
}

/** Клавиши, которые работают, пока открыт интерактивный режим (рендерер решает, что они значат). */
const TOOL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'R', 'F', 'N', 'T', 'B', 'D'];
let interactiveKeys: string[] = [];

function registerInteractiveKeys(): void {
  unregisterInteractiveKeys();
  if (!ui.interactive) return;
  const reg = (acc: string, fn: () => void) => {
    try {
      if (globalShortcut.register(acc, fn)) interactiveKeys.push(acc);
    } catch {
      /* занято другим приложением — не критично */
    }
  };
  reg('Escape', () => setUi({ interactive: false }));
  reg('CommandOrControl+Z', () => routeHistory('undo'));
  reg('CommandOrControl+Y', () => routeHistory('redo'));
  reg('CommandOrControl+Shift+Z', () => routeHistory('redo'));
  if (ui.tool === 'drive') {
    const drive = (key: 'left' | 'right' | 'up' | 'down' | 'horn') => () => broadcastCommand({ type: 'drive', key });
    for (const [acc, k] of [['Left', 'left'], ['A', 'left'], ['Right', 'right'], ['D', 'right'], ['Up', 'up'], ['W', 'up'], ['Down', 'down'], ['S', 'down'], ['Space', 'horn']] as const) reg(acc, drive(k));
    for (const k of TOOL_KEYS.filter((k) => /\d/.test(k))) reg(k, () => broadcastCommand({ type: 'digit', key: k }));
  } else {
    for (const k of TOOL_KEYS) reg(k, () => broadcastCommand({ type: 'digit', key: k }));
  }
}

function unregisterInteractiveKeys(): void {
  for (const k of interactiveKeys) globalShortcut.unregister(k);
  interactiveKeys = [];
}

function setUi(patch: Partial<UiState>): void {
  const prevInteractive = ui.interactive;
  const prevTool = ui.tool;
  Object.assign(ui, patch);
  if (patch.tool && patch.tool !== store.settings.tools.current) store.update({ tools: { current: patch.tool } });
  if (prevInteractive !== ui.interactive || prevTool !== ui.tool) registerInteractiveKeys();
  applyMouseMode();
  for (const s of sceneWins.values()) if (!s.win.isDestroyed()) s.win.webContents.send('ui', ui);
  refreshTray();
}

// ---------- глобальные горячие клавиши ----------

const hotkeyOk: Record<string, boolean> = {};
let registeredHot: Record<string, string> = {};
function registerHotkeys(): void {
  for (const acc of Object.values(registeredHot)) {
    try {
      globalShortcut.unregister(acc);
    } catch {
      /* ignore */
    }
  }
  registeredHot = {};
  const h = store.settings.hotkeys;
  const actions: Record<keyof Settings['hotkeys'], () => void> = {
    toggle: () => setUi({ interactive: !ui.interactive }),
    pause: () => applyPatch({ paused: !store.settings.paused }),
    clear: () => broadcastCommand({ type: 'clearSnow' }),
    shake: () => broadcastCommand({ type: 'shake' }),
    quit: () => app.quit(),
  };
  for (const k of Object.keys(actions) as (keyof Settings['hotkeys'])[]) {
    const acc = h[k].trim();
    hotkeyOk[k] = false;
    if (!acc) continue;
    try {
      hotkeyOk[k] = globalShortcut.register(acc, actions[k]);
      if (hotkeyOk[k]) registeredHot[k] = acc;
    } catch {
      hotkeyOk[k] = false;
    }
    if (!hotkeyOk[k]) console.warn(`[hotkeys] не удалось зарегистрировать ${k}: ${acc}`);
  }
}

// ---------- трей ----------

function trayImage(paused: boolean) {
  const img = nativeImage.createFromBitmap(snowflakeBitmap(32, paused), { width: 32, height: 32, scaleFactor: 2 });
  img.addRepresentation({ scaleFactor: 1, width: 16, height: 16, buffer: snowflakeBitmap(16, paused) });
  return img;
}

function buildTrayMenu(): Menu {
  const s = store.settings;
  const mode = effectiveMode();
  const acc = (a: string) => a || undefined;
  const tpl: MenuItemConstructorOptions[] = [
    { label: 'Cozy Winter 2', enabled: false },
    { type: 'separator' },
    { label: T('Инструменты', 'Tools'), type: 'checkbox', checked: ui.interactive, accelerator: acc(s.hotkeys.toggle), registerAccelerator: false, click: (m) => setUi({ interactive: m.checked }) },
    { label: T('Пауза', 'Pause'), type: 'checkbox', checked: s.paused, accelerator: acc(s.hotkeys.pause), registerAccelerator: false, click: (m) => applyPatch({ paused: m.checked }) },
    { label: T('Настройки…', 'Settings…'), click: openSettings },
    {
      label: T('Режим', 'Mode'),
      submenu: [
        { label: T('Поверх рабочего стола', 'Desktop overlay'), type: 'radio', checked: mode === 'overlay', click: () => setMode('overlay') },
        { label: T('Отладочное окно', 'Debug window'), type: 'radio', checked: mode === 'windowed', click: () => setMode('windowed') },
      ],
    },
    {
      label: T('Земля', 'Ground'),
      submenu: [
        { label: T('Верх панели задач', 'Top of taskbar'), type: 'radio', checked: s.groundLevel === 'taskbar', click: () => applyPatch({ groundLevel: 'taskbar' }) },
        { label: T('Самый низ экрана', 'Screen bottom'), type: 'radio', checked: s.groundLevel === 'screen', click: () => applyPatch({ groundLevel: 'screen' }) },
      ],
    },
    {
      label: T('Мониторы', 'Monitors'),
      submenu: [
        { label: T('Все', 'All'), type: 'radio', checked: s.monitors === 'all', click: () => applyPatch({ monitors: 'all' }) },
        { label: T('Только основной', 'Primary only'), type: 'radio', checked: s.monitors === 'primary', click: () => applyPatch({ monitors: 'primary' }) },
      ],
    },
    { type: 'separator' },
    { label: T('Присыпать снегом', 'Add snow now'), click: () => broadcastCommand({ type: 'dustNow' }) },
    { label: T('Убрать весь снег', 'Clear all snow'), accelerator: acc(s.hotkeys.clear), registerAccelerator: false, click: () => broadcastCommand({ type: 'clearSnow' }) },
    { label: T('Встряхнуть', 'Shake'), accelerator: acc(s.hotkeys.shake), registerAccelerator: false, click: () => broadcastCommand({ type: 'shake' }) },
    { label: T('Снимок экрана', 'Screenshot'), click: () => void takeScreenshot() },
    { type: 'separator' },
    { label: T('Выход', 'Quit'), accelerator: acc(s.hotkeys.quit), registerAccelerator: false, click: () => app.quit() },
  ];
  return Menu.buildFromTemplate(tpl);
}

function refreshTray(): void {
  if (!tray) return;
  tray.setImage(trayImage(store.settings.paused));
  tray.setToolTip(store.settings.paused ? T('Cozy Winter 2 — пауза', 'Cozy Winter 2 — paused') : 'Cozy Winter 2');
  tray.setContextMenu(buildTrayMenu());
}

function createTray(): void {
  tray = new Tray(trayImage(store.settings.paused));
  tray.on('click', openSettings);
  refreshTray();
}

// ---------- настройки и команды ----------

function allWindows(): BrowserWindow[] {
  const ws = [...sceneWins.values()].map((w) => w.win);
  if (settingsWin) ws.push(settingsWin);
  return ws.filter((w) => !w.isDestroyed());
}

function applyPatch(patch: Partial<Settings> | Record<string, unknown>): void {
  const prev = store.settings;
  const s = store.update(patch);
  for (const w of allWindows()) w.webContents.send('settings', s);
  if (s.mode !== prev.mode || s.monitors !== prev.monitors || s.groundLevel !== prev.groundLevel) reconcileWindows();
  if (s.gpu !== prev.gpu) console.log('[settings] изменение GPU вступит в силу после перезапуска');
  if (JSON.stringify(s.hotkeys) !== JSON.stringify(prev.hotkeys) && !TEST_MODE) registerHotkeys();
  if (s.system.autostart !== prev.system.autostart) applyAutostart();
  if (s.system.economy !== prev.system.economy) updateEconomy();
  if (s.effects.windowSnow !== prev.effects.windowSnow || s.system.autoPauseFullscreen !== prev.system.autoPauseFullscreen) updateHelper();
  refreshTray();
}

function setMode(mode: 'overlay' | 'windowed') {
  ARGS.windowed = false;
  ARGS.overlay = false;
  applyPatch({ mode });
}

function broadcastCommand(c: Command): void {
  for (const { win } of sceneWins.values()) if (!win.isDestroyed()) win.webContents.send('command', c);
}

// ---------- Undo/Redo: история живёт в каждом окне, main помнит порядок правок ----------

const undoRoute: number[] = [];
const redoRoute: number[] = [];
function routeHistory(kind: 'undo' | 'redo'): void {
  const from = kind === 'undo' ? undoRoute : redoRoute;
  const to = kind === 'undo' ? redoRoute : undoRoute;
  const id = from.pop();
  if (id === undefined) return;
  to.push(id);
  for (const s of sceneWins.values()) if (!s.win.isDestroyed() && s.win.webContents.id === id) s.win.webContents.send('command', { type: kind } satisfies Command);
}

// ---------- скриншоты ----------

async function capture(win: BrowserWindow, name: string): Promise<string> {
  // Сценарий может закончиться раньше, чем окно показано, — тогда снимок был бы пустым.
  if (!win.isVisible()) await new Promise((r) => win.once('show', () => r(null)));
  await new Promise((r) => setTimeout(r, 250));
  const img = await win.webContents.capturePage();
  fs.mkdirSync(ARGS.shotDir, { recursive: true });
  const file = path.join(ARGS.shotDir, `${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  const sz = img.getSize();
  console.log(`[shot] ${file} (${sz.width}x${sz.height})`);
  return file;
}

/** Снимок реального экрана через desktopCapturer (DXGI/WGC видит прозрачные DirectComposition-окна, GDI — нет). */
async function grabDisplay(d: Display): Promise<Electron.NativeImage | null> {
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0];
  return src ? src.thumbnail : null;
}

async function captureDesktop(name: string): Promise<void> {
  for (const d of screen.getAllDisplays()) {
    const img = await grabDisplay(d);
    if (!img) continue;
    fs.mkdirSync(ARGS.shotDir, { recursive: true });
    const file = path.join(ARGS.shotDir, `desktop-${name}-${d.id}.png`);
    fs.writeFileSync(file, img.toPNG());
    console.log(`[shot] ${file} (desktop)`);
  }
}

/** Кнопка-фотоаппарат: PNG сцены в «Изображения/CozyWinter». */
async function takeScreenshot(): Promise<string | null> {
  try {
    const dir = opt('pictures-dir') ? path.resolve(opt('pictures-dir')!) : path.join(app.getPath('pictures'), 'CozyWinter');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    let img: Electron.NativeImage | null = null;
    if (effectiveMode() === 'windowed') {
      const w = sceneWins.get('windowed')?.win;
      if (w) img = await w.webContents.capturePage();
    } else {
      // монитор под курсором: рабочий стол вместе со снегом
      const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      img = await grabDisplay(d);
      if (!img || img.isEmpty()) {
        const s = [...sceneWins.values()].find((x) => x.displayId === d.id);
        if (s) img = await s.win.webContents.capturePage();
      }
    }
    if (!img || img.isEmpty()) throw new Error('пустой снимок');
    const file = path.join(dir, `CozyWinter-${stamp}.png`);
    fs.writeFileSync(file, img.toPNG());
    console.log(`[camera] ${file}`);
    broadcastCommand({ type: 'toast', text: `${T('Снимок сохранён', 'Screenshot saved')}: ${file}` });
    if (Notification.isSupported() && !TEST_MODE) new Notification({ title: 'Cozy Winter 2', body: file, silent: true }).show();
    return file;
  } catch (e) {
    console.error('[camera] ошибка:', e);
    return null;
  }
}

// ---------- сохранение сцены ----------

function sceneFile(key: string): string {
  return path.join(SCENES, `${key.replace(/[^a-z0-9_x-]/gi, '_')}.json`);
}
function loadScene(key: string): unknown {
  if (!store.settings.system.saveScene || (TEST_MODE && !flag('load-scene'))) return null;
  try {
    return JSON.parse(fs.readFileSync(sceneFile(key), 'utf8'));
  } catch {
    return null;
  }
}
function saveScene(key: string, data: unknown): void {
  if (!store.settings.system.saveScene || (TEST_MODE && !flag('save-scene'))) return;
  try {
    fs.mkdirSync(SCENES, { recursive: true });
    const f = sceneFile(key);
    fs.writeFileSync(f + '.tmp', JSON.stringify(data));
    fs.renameSync(f + '.tmp', f);
    if (TEST_MODE) console.log(`[scene] saved ${f}`);
  } catch (e) {
    console.error('[scene] не удалось сохранить:', e);
  }
}

// ---------- система: автозапуск, экономия, автопауза, снег на окнах ----------

const RUN_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`;
const RUN_NAME = 'Cozy Winter 2';

/** Есть ли запись автозапуска (значение в HKCU\...\Run). */
function autostartEnabled(): boolean {
  try {
    const out = execFileSync('reg.exe', ['query', RUN_KEY, '/v', RUN_NAME], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.includes(RUN_NAME);
  } catch {
    return false;
  }
}

/**
 * Автозапуск: значение «Cozy Winter 2» в HKCU\Software\Microsoft\Windows\CurrentVersion\Run.
 * Пишем через reg.exe напрямую: app.setLoginItemSettings на этой машине молча ничего не записывал.
 */
function applyAutostart(): void {
  if (!app.isPackaged) {
    // в режиме разработки в автозапуск попал бы голый electron.exe — не трогаем реестр
    console.log(`[autostart] (dev) openAtLogin=${store.settings.system.autostart} — применится в установленной версии`);
    return;
  }
  // portable-сборка запускается из временной папки — для неё берём путь исходного exe
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const want = store.settings.system.autostart;
  try {
    if (want) execFileSync('reg.exe', ['add', RUN_KEY, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', `"${exe}"`, '/f'], { windowsHide: true, stdio: 'ignore' });
    else if (autostartEnabled()) execFileSync('reg.exe', ['delete', RUN_KEY, '/v', RUN_NAME, '/f'], { windowsHide: true, stdio: 'ignore' });
  } catch (e) {
    console.warn('[autostart] не удалось изменить автозапуск:', e);
  }
}

function updateEconomy(): void {
  const e = store.settings.system.economy;
  let on = e === 'on';
  if (e === 'auto') {
    try {
      on = powerMonitor.isOnBatteryPower();
    } catch {
      on = false;
    }
  }
  if (on !== ui.economy) setUi({ economy: on });
}

const helper = new WinHelper(userDir);
function updateHelper(): void {
  const need = store.settings.effects.windowSnow || store.settings.system.autoPauseFullscreen;
  if (need && (!TEST_MODE || ARGS.helperCheck || ARGS.ledgeTest || ARGS.systemCheck)) helper.start();
  else helper.stop();
}

helper.onState = (st) => {
  // автопауза при полноэкранном приложении/игре: оверлеи прячутся, чтобы не висеть поверх игры
  if (store.settings.system.autoPauseFullscreen && !ARGS.helperCheck && !ARGS.ledgeTest) {
    const busy = st.fullscreen;
    if (busy !== ui.autoPaused) {
      setUi({ autoPaused: busy });
      for (const s of sceneWins.values()) {
        if (!s.overlay || s.win.isDestroyed()) continue;
        if (busy) s.win.hide();
        else s.win.showInactive();
      }
    }
  }
  // снег на верхних краях окон
  if (store.settings.effects.windowSnow) {
    for (const s of sceneWins.values()) {
      if (!s.overlay || s.win.isDestroyed()) continue;
      const b = s.win.getBounds();
      const rects: WinRect[] = [];
      for (const w of st.windows) {
        const dip = screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h });
        const y = dip.y - b.y;
        if (y < 4 || y > b.height - 30) continue; // кромка у самого верха/низа не интересна
        if (dip.x + dip.width < b.x || dip.x > b.x + b.width) continue;
        const k = dip.width / Math.max(1, w.w);
        const top: [number, number][] = w.top.map(([x0, x1]) => [dip.x + (x0 - w.x) * k - b.x, dip.x + (x1 - w.x) * k - b.x]);
        rects.push({ id: w.id, x: dip.x - b.x, y, w: dip.width, h: dip.height, top });
      }
      s.win.webContents.send('windows', rects);
    }
  }
};

// ---------- IPC ----------

function entryFor(sender: WebContents): SceneWin | undefined {
  for (const w of sceneWins.values()) if (!w.win.isDestroyed() && w.win.webContents === sender) return w;
  return undefined;
}

function infoFor(sender: WebContents): InitInfo {
  const entry = entryFor(sender);
  const key = entry?.sceneKey ?? 'settings';
  return {
    settings: store.settings,
    windowed: entry ? !entry.overlay : false,
    scenario: ARGS.scenario,
    displayIndex: entry?.displayIndex ?? 0,
    hasDock: !!entry?.hasDock,
    debug: ARGS.debug,
    seed: ARGS.seed || (entry?.displayIndex ?? 0) * 101 + (TEST_MODE ? 7 : Date.now() % 100000),
    exp: argv.filter((a) => a.startsWith('--exp-')).map((a) => a.slice(6)),
    ui,
    savedScene: entry ? loadScene(key) : null,
    sceneKey: key,
  };
}

ipcMain.handle('init', (e) => infoFor(e.sender));
ipcMain.handle('hotkey-status', () => hotkeyOk);
ipcMain.on('settings:patch', (_e, patch) => applyPatch(patch));
ipcMain.on('command', (_e, c: Command) => {
  if (c.type === 'undo' || c.type === 'redo') routeHistory(c.type);
  else broadcastCommand(c);
});
ipcMain.on('ui', (_e, patch: Partial<UiState>) => setUi(patch));
ipcMain.on('history-pushed', (e) => {
  undoRoute.push(e.sender.id);
  if (undoRoute.length > 200) undoRoute.shift();
  redoRoute.length = 0;
});
ipcMain.on('open-settings', () => openSettings());
ipcMain.on('screenshot', () => void takeScreenshot());
ipcMain.on('scene:save', (_e, key: string, data: unknown) => saveScene(key, data));
ipcMain.on('rects', (_e, r) => (lastRects = r));
ipcMain.on('mouse-capture', (e, capture: boolean) => {
  const s = entryFor(e.sender);
  if (!s) return;
  s.hoverCapture = capture;
  applyMouseMode();
});
ipcMain.on('set-focus', (e, focus: boolean) => {
  const s = entryFor(e.sender);
  if (!s || !s.overlay) return;
  s.win.setFocusable(focus);
  if (focus) s.win.focus();
  else s.win.blur();
});
// ---------- зимние обои ----------
const wallpaper = new Wallpaper(userDir, STATIC);
ipcMain.handle('wallpaper:apply', async (_e, scene: string, png: Uint8Array) => {
  try {
    let original = store.settings.wallpaper.original;
    if (!original || !fs.existsSync(original)) {
      original = wallpaper.backupOriginal();
      if (original) applyPatch({ wallpaper: { original } });
    }
    const file = await wallpaper.apply(scene, Buffer.from(png));
    if (!file) return { ok: false, error: 'не удалось установить обои' };
    applyPatch({ wallpaper: { scene } });
    console.log(`[wallpaper] ${scene} → ${file}`);
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
ipcMain.handle('wallpaper:restore', async () => {
  const ok = await wallpaper.restore(store.settings.wallpaper.original);
  applyPatch({ wallpaper: { scene: 'none' } });
  return { ok, original: store.settings.wallpaper.original };
});

ipcMain.on('settings:export', async () => {
  const r = await dialog.showSaveDialog({ title: T('Экспорт настроек', 'Export settings'), defaultPath: 'cozy-winter-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!r.canceled && r.filePath) fs.writeFileSync(r.filePath, JSON.stringify(store.settings, null, 2));
});
ipcMain.on('settings:import', async () => {
  const r = await dialog.showOpenDialog({ title: T('Импорт настроек', 'Import settings'), properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    const s = sanitizeSettings(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')));
    applyPatch(s);
  } catch {
    dialog.showErrorBox('Cozy Winter 2', T('Файл не похож на настройки Cozy Winter', 'Not a Cozy Winter settings file'));
  }
});
ipcMain.on('scenario-done', async (e, name: string, info: unknown) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  const entry = entryFor(e.sender);
  const tag = `${name}-${entry?.overlay ? 'overlay' + entry.displayIndex : 'windowed'}`;
  await capture(w, tag);
  if (ARGS.desktopShot) await captureDesktop(tag);
  console.log(`[scenario] ${tag} ${JSON.stringify(info)}`);
  if (ARGS.exitAfter) {
    quitting = true;
    app.quit();
  }
});

// ---------- самопроверки (тестовый режим) ----------

/** Самопроверка трея: нажимает реальные пункты меню и проверяет результат. */
async function trayCheck(): Promise<boolean> {
  const results: [string, boolean][] = [];
  const menu = buildTrayMenu();
  const find = (label: string) => menu.items.find((i) => i.label === label);
  results.push(['tray exists', !!tray && !tray.isDestroyed()]);
  const pause = find(T('Пауза', 'Pause'));
  results.push(['menu has pause/settings/mode/quit', !!pause && !!find(T('Настройки…', 'Settings…')) && !!find(T('Режим', 'Mode')) && !!find(T('Выход', 'Quit'))]);
  const fire = (item: Electron.MenuItem | undefined) => {
    if (!item) return;
    (item as unknown as { click: (e: unknown, w: unknown, c: unknown) => void }).click(undefined, undefined, undefined);
  };
  fire(pause);
  results.push(['pause on', store.settings.paused === true]);
  fire(buildTrayMenu().items.find((i) => i.label === T('Пауза', 'Pause')));
  results.push(['pause off', store.settings.paused === false]);
  fire(buildTrayMenu().items.find((i) => i.label === T('Инструменты', 'Tools')));
  results.push(['tools → interactive', ui.interactive === true]);
  setUi({ interactive: false });
  fire(find(T('Настройки…', 'Settings…')));
  for (let i = 0; i < 80 && !(settingsWin && settingsWin.isVisible()); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  results.push(['settings window opened', !!settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()]);
  const modeSub = find(T('Режим', 'Mode'))?.submenu;
  fire(modeSub?.items[1]);
  await new Promise((r) => setTimeout(r, 1500));
  results.push(['mode → windowed', sceneWins.has('windowed') && sceneWins.size === 1]);
  fire(buildTrayMenu().items.find((i) => i.label === T('Режим', 'Mode'))?.submenu?.items[0]);
  await new Promise((r) => setTimeout(r, 1500));
  results.push(['mode → overlay', !sceneWins.has('windowed') && sceneWins.size >= 1]);
  let ok = true;
  for (const [name, pass] of results) {
    console.log(`[tray-check] ${pass ? 'PASS' : 'FAIL'} ${name}`);
    ok &&= pass;
  }
  return ok;
}

/** Снимки всех вкладок окна настроек. */
async function settingsCheck(): Promise<void> {
  openSettings();
  for (let i = 0; i < 80 && !(settingsWin && settingsWin.isVisible()); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 1500));
  const w = settingsWin!;
  const tabs: string[] = await w.webContents.executeJavaScript('Array.from(document.querySelectorAll("nav .tab")).map(b => b.dataset.id)');
  for (const id of tabs) {
    const err = await w.webContents.executeJavaScript(`(() => { try { document.querySelector('nav .tab[data-id="${id}"]').click(); return document.querySelector('nav .tab.active')?.dataset.id; } catch (e) { return 'ERR ' + e.message + ' ' + e.stack; } })()`);
    if (err !== id) console.log(`[settings-check] вкладка ${id}: ${err}`);
    await new Promise((r) => setTimeout(r, 600));
    await capture(w, `settings-${id}`);
  }
  console.log(`[settings-check] tabs=${tabs.join(',')}`);
}

/**
 * Тест реального ввода: клики и перетаскивания мышью через sendInputEvent в окно сцены
 * (тот же путь, что и мышь пользователя: DOM-события → док → инструменты).
 */
async function inputTest(name: string): Promise<void> {
  const s = [...sceneWins.values()][0];
  const wc = s.win.webContents;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && Object.keys(lastRects).length === 0; i++) await wait(100);
  await wait(800);
  const center = (k: string): [number, number] => {
    const r = lastRects[k];
    if (!r) throw new Error(`нет элемента ${k}`);
    return [Math.round(r[0] + r[2] / 2), Math.round(r[1] + r[3] / 2)];
  };
  const move = (x: number, y: number, held = false) => wc.sendInputEvent({ type: 'mouseMove', x, y, modifiers: held ? ['leftbuttondown'] : [] });
  const down = (x: number, y: number, button: 'left' | 'right' = 'left', clickCount = 1) => wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount });
  const up = (x: number, y: number, button: 'left' | 'right' = 'left', clickCount = 1) => wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount });
  const click = async (x: number, y: number, button: 'left' | 'right' = 'left') => {
    move(x, y);
    await wait(80);
    down(x, y, button);
    await wait(60);
    up(x, y, button);
    await wait(150);
  };
  const dblclick = async (x: number, y: number) => {
    move(x, y);
    await wait(80);
    down(x, y, 'left', 1);
    up(x, y, 'left', 1);
    await wait(40);
    down(x, y, 'left', 2);
    up(x, y, 'left', 2);
    await wait(300);
  };
  const drag = async (x0: number, y0: number, x1: number, y1: number, steps = 30, ms = 16) => {
    move(x0, y0);
    await wait(50);
    down(x0, y0);
    for (let k = 1; k <= steps; k++) {
      move(Math.round(x0 + ((x1 - x0) * k) / steps), Math.round(y0 + ((y1 - y0) * k) / steps), true);
      await wait(ms);
    }
    up(x1, y1);
    await wait(150);
  };
  const js = <R = unknown>(code: string) => wc.executeJavaScript(code) as Promise<R>;
  const ground = (x: number) => js<number>(`window.__test.surfaceY(${x})`);
  const W = s.win.getContentBounds().width;
  const H = s.win.getContentBounds().height;
  console.log(`[input-test] start ${name}`);
  await js(`window.__test.prepare(${JSON.stringify(name)})`);
  await wait(300);
  /** открыть док кликом по вкладке-снежинке и выбрать инструмент кликом по кнопке */
  const pick = async (tool: string) => {
    if (!(await js<boolean>('window.__test.dockOpen()'))) {
      await click(...center('tab'));
      await wait(350);
    }
    await click(...center(`tool-${tool}`));
    await wait(200);
  };
  const results: Record<string, unknown> = {};
  if (name === 'tools') {
    await pick('shovel');
    let y = (await ground(W * 0.3)) + 14;
    const v0 = await js<number>('window.__test.volume()');
    await drag(Math.round(W * 0.22), Math.round(y), Math.round(W * 0.42), Math.round(y), 40);
    results.shovelVolumeDelta = +((await js<number>('window.__test.volume()')) / v0 - 1).toFixed(4);
    await pick('eraser');
    y = (await ground(W * 0.58)) + 6;
    await drag(Math.round(W * 0.54), Math.round(y), Math.round(W * 0.6), Math.round(y), 12, 30);
    await pick('blower');
    y = (await ground(W * 0.72)) + 4;
    await drag(Math.round(W * 0.66), Math.round(y), Math.round(W * 0.74), Math.round(y - 8), 30, 40);
    await pick('heat');
    y = (await ground(W * 0.86)) - 12;
    await drag(Math.round(W * 0.84), Math.round(y), Math.round(W * 0.88), Math.round(y), 40, 50);
    await pick('add');
    y = (await ground(W * 0.08)) - 14;
    await drag(Math.round(W * 0.05), Math.round(y), Math.round(W * 0.12), Math.round(y), 40, 40);
    await wait(400);
  } else if (name === 'undo') {
    await pick('eraser');
    const v0 = await js<number>('window.__test.volume()');
    for (let k = 0; k < 22; k++) {
      const x = Math.round(W * 0.1 + k * W * 0.035);
      const y = (await ground(x)) + 6;
      await drag(x, Math.round(y), x + 10, Math.round(y), 4, 16);
    }
    const v1 = await js<number>('window.__test.volume()');
    for (let k = 0; k < 22; k++) {
      routeHistory('undo');
      await wait(60);
    }
    const v2 = await js<number>('window.__test.volume()');
    for (let k = 0; k < 22; k++) {
      routeHistory('redo');
      await wait(60);
    }
    const v3 = await js<number>('window.__test.volume()');
    Object.assign(results, { v0, v1, v2, v3, undoRestored: Math.abs(v2 - v0) / v0 < 0.02, redoRestored: Math.abs(v3 - v1) / Math.max(1, v1) < 0.02 });
  } else if (name === 'escape') {
    await pick('shovel');
    const a = await js<boolean>('window.__test.interactive()');
    // ПКМ по пустому месту возвращает в пассивный режим
    await click(Math.round(W / 2), Math.round(H / 3), 'right');
    await wait(300);
    Object.assign(results, { interactiveAfterPick: a, interactiveAfterRmb: await js<boolean>('window.__test.interactive()') });
  } else if (name === 'balls') {
    for (const [t, fx] of [['ballS', 0.2], ['ballM', 0.3], ['ballL', 0.42], ['ballXL', 0.56]] as const) {
      await pick(t);
      await click(Math.round(W * fx), Math.round(H * 0.3));
    }
    await wait(2500);
    // перетащить средний шар рукой и бросить вправо
    await pick('hand');
    const b = await js<[number, number]>('window.__test.ballPos(1)');
    await drag(Math.round(b[0]), Math.round(b[1]), Math.round(b[0] + 260), Math.round(b[1] - 160), 12, 16);
    await wait(2500);
    // катать ком
    await pick('roll');
    const x0 = Math.round(W * 0.7);
    const yy = (await ground(x0)) + 2;
    await drag(x0, Math.round(yy), Math.round(W * 0.93), Math.round(yy), 60, 30);
    await wait(2000);
    // ПКМ по шару — тает
    const inf0 = await js<{ balls: number; radii: number[] }>('window.__test.info()');
    const before = inf0.balls;
    results.radiiBeforeMelt = inf0.radii;
    const s0 = await js<[number, number]>('window.__test.ballPos(0)');
    await click(Math.round(s0[0]), Math.round(s0[1]), 'right');
    await wait(2500);
    results.ballsBeforeMelt = before;
    Object.assign(results, await js('window.__test.info()'));
  } else if (name === 'snowman') {
    // собрать снеговика руками: три шара мышью, ставим друг на друга
    // ровное место для стопки
    let x = Math.round(W * 0.5);
    let bestV = Infinity;
    for (let xx = Math.round(W * 0.25); xx < W * 0.75; xx += 10) {
      const v = Math.abs((await ground(xx - 60)) - (await ground(xx))) + Math.abs((await ground(xx + 60)) - (await ground(xx)));
      if (v < bestV) {
        bestV = v;
        x = xx;
      }
    }
    await pick('ballXL');
    await js('window.__test.setBallSize(48)');
    await click(x, Math.round(H * 0.4));
    await wait(2500);
    // целимся туда, где шар реально лёг (он мог чуть откатиться)
    const p0 = await js<[number, number]>('window.__test.ballPos(0)');
    await js('window.__test.setBallSize(34)');
    await click(Math.round(p0[0]) + 4, Math.round(H * 0.2));
    await wait(2500);
    const p1 = await js<[number, number]>('window.__test.ballPos(1)');
    await js('window.__test.setBallSize(24)');
    await click(Math.round(p1[0]) + 2, Math.round(H * 0.05));
    await wait(3500);
    const sm = await js<[number, number] | null>('window.__test.snowmanPos(0)');
    results.snowmen = await js('window.__test.snowmen()');
    if (sm) {
      // двойной клик открывает окно кастомизации
      await js('window.__test.setTool("hand")');
      await wait(300);
      results.hitBefore = await js(`window.__test.hitAt(${Math.round(sm[0])}, ${Math.round(sm[1])})`);
      results.overUi = await js(`window.__test.overUi(${Math.round(sm[0])}, ${Math.round(sm[1])})`);
      await dblclick(Math.round(sm[0]), Math.round(sm[1]));
      results.customizeOpen = await js('window.__test.customizeOpen()');
      await capture(s.win, 'input-snowman-customize');
      // закрыть окошко «Готово», перетащить снеговика, затем растопить ПКМ
      await js(`document.querySelector('.popup [data-a="done"]').click()`);
      await wait(300);
      const x0 = Math.round(sm[0]);
      const x1 = x0 + (x0 < W / 2 ? 180 : -180);
      await drag(x0, Math.round(sm[1]), x1, Math.round(sm[1]), 20, 20);
      await wait(800);
      const moved = await js<[number, number] | null>('window.__test.snowmanPos(0)');
      results.dragDx = moved ? Math.round(moved[0] - sm[0]) : null;
      await click(Math.round(moved![0]), Math.round(moved![1]), 'right');
      await wait(3500);
      results.snowmenAfterMelt = await js('window.__test.snowmen()');
    }
  } else if (name === 'hand') {
    // без режима инструментов: навести на сугроб и провести мышью — снег сгребается рукой
    results.interactiveBefore = ui.interactive;
    const x0 = Math.round(W * 0.3);
    const x1 = Math.round(W * 0.6);
    let y = 0;
    for (let x = x0; x <= x1; x += 20) y = Math.max(y, await ground(x));
    y = Math.round(y + 12);
    const strip = async () => js<number>(`(() => { const f = window.__test.field(); let s = 0; for (let x = ${x0 + 60}; x < ${x1 - 60}; x += 2) s += f.snow[f.col(x)]; return s; })()`);
    const v0 = await js<number>('window.__test.volume()');
    const s0 = await strip();
    move(x0, y);
    await wait(300);
    results.hoverHit = await js(`window.__test.hitAt(${x0}, ${y})`);
    await drag(x0, y, x1, y, 40, 25);
    await wait(500);
    const s1 = await strip();
    results.stripBefore = Math.round(s0);
    results.stripAfter = Math.round(s1);
    results.volumeDelta = +((await js<number>('window.__test.volume()')) / v0 - 1).toFixed(4);
    results.interactiveAfter = ui.interactive;
  } else if (name === 'tour') {
    // подсказка первого запуска: три шага кликами по кнопке
    results.stepAtStart = await js('window.__test.tourStep()');
    for (let k = 0; k < 3; k++) {
      const r = await js<[number, number, number, number] | null>(`(() => { const b = document.querySelector('.tour button'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
      if (!r) break;
      await click(Math.round(r[0] + r[2] / 2), Math.round(r[1] + r[3] / 2));
      await wait(250);
    }
    await wait(500);
    results.stepAtEnd = await js('window.__test.tourStep()');
    results.firstRunSaved = store.settings.firstRun;
  } else if (name === 'fx') {
    // следы — перетаскиванием
    await pick('steps');
    let y = (await ground(W * 0.1)) - 5;
    await drag(Math.round(W * 0.08), Math.round(y), Math.round(W * 0.32), Math.round(y), 40, 25);
    // ангел — кликом
    await pick('angel');
    y = (await ground(W * 0.45)) + 4;
    await click(Math.round(W * 0.45), Math.round(y));
    // снежок: оттянуть и отпустить
    await pick('throw');
    results.toolAtThrow = ui.tool;
    results.interactiveAtThrow = ui.interactive;
    await drag(Math.round(W * 0.6), Math.round(H * 0.55), Math.round(W * 0.52), Math.round(H * 0.7), 15, 20);
    // ждём, пока снежок долетит (на загруженной машине кадров меньше — фиксированной паузы мало)
    for (let k = 0; k < 50; k++) {
      await wait(200);
      const inf = await js<{ projectiles: number; splats: number }>('window.__test.info()');
      if (inf.projectiles === 0 && k > 3) break;
    }
    results.afterThrow = await js('window.__test.info()');
    // кнопки дока: камера, «зима за минуту», встряхнуть
    await click(...center('camera'));
    await wait(1500);
    await click(...center('winter'));
    await wait(400);
    results.winterOn = ui.winterUntil > Date.now();
    const t0 = await js<number>('window.__test.simTime()');
    await wait(2000);
    results.simSpeed = +(((await js<number>('window.__test.simTime()')) - t0) / 2).toFixed(1);
    await click(...center('winter'));
    await click(...center('shake'));
    await wait(700);
    results.afterShake = await js('window.__test.info()');
    // звук: включить и сыграть события без ошибок
    applyPatch({ sound: { enabled: true } });
    await wait(500);
    await js(`window.__test.sfxAll()`);
    results.audio = await js('window.__test.audioState()');
    applyPatch({ sound: { enabled: false } });
  } else {
    await js(`window.__test.run(${JSON.stringify(name)})`);
  }
  await wait(300);
  Object.assign(results, await js('window.__test.info()'));
  await capture(s.win, `input-${name}`);
  console.log(`[input-test] ${name} ${JSON.stringify(results)}`);
}

// ---------- жизненный цикл ----------

app.on('second-instance', () => openSettings());
app.on('before-quit', (e) => {
  quitting = true;
  store.flush();
  helper.stop();
  if (!savedBeforeQuit && store.settings.system.saveScene && (!TEST_MODE || flag('save-scene')) && sceneWins.size > 0) {
    // дать окнам сохранить сцену
    e.preventDefault();
    savedBeforeQuit = true;
    broadcastCommand({ type: 'saveNow' });
    setTimeout(() => app.quit(), 700);
  }
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  /* остаёмся в трее */
});

app.whenReady().then(() => {
  createTray();
  reconcileWindows();
  if (!TEST_MODE) registerHotkeys();
  applyAutostart();
  updateEconomy();
  updateHelper();
  powerMonitor.on('on-battery', updateEconomy);
  powerMonitor.on('on-ac', updateEconomy);
  let t: NodeJS.Timeout | null = null;
  const onDisplays = () => {
    if (t) clearTimeout(t);
    t = setTimeout(reconcileWindows, 300);
  };
  screen.on('display-added', onDisplays);
  screen.on('display-removed', onDisplays);
  screen.on('display-metrics-changed', onDisplays);

  const finish = (code = 0) => {
    quitting = true;
    app.exit(code);
  };
  if (ARGS.trayCheck) setTimeout(async () => finish((await trayCheck()) ? 0 : 1), 1500);
  if (ARGS.settingsCheck)
    setTimeout(async () => {
      await settingsCheck();
      finish(0);
    }, 1500);
  if (ARGS.helperCheck) {
    // проверка помощника Windows API: ждём первое состояние
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (helper.last || Date.now() - t0 > 60000) {
        clearInterval(iv);
        const st = helper.last;
        console.log(`[helper-check] t=${Date.now() - t0}ms ${st ? 'PASS' : 'FAIL'} ${JSON.stringify(st ? { fullscreen: st.fullscreen, quns: st.quns, windows: st.windows.length, sample: st.windows.slice(0, 3).map((w) => ({ w: w.w, h: w.h, segs: w.top.length })) } : null)}`);
        finish(st ? 0 : 1);
      }
    }, 200);
  }
  if (ARGS.systemCheck) {
    // автопауза при полноэкранном окне другого процесса + режим экономии + автозапуск (в установленной версии)
    setTimeout(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const res: Record<string, unknown> = {};
      const ov = [...sceneWins.values()].find((x) => x.overlay);
      const js = <R = unknown>(code: string) => ov!.win.webContents.executeJavaScript(code) as Promise<R>;
      for (let i = 0; i < 100 && !helper.last; i++) await wait(200);
      res.helperReady = !!helper.last;
      const testwin = path.join(ROOT, 'scripts', 'testwin.cjs');
      // в собранной версии тестового окна нет — нельзя запускать exe с незнакомым аргументом
      // (запустился бы обычный экземпляр программы с настоящим профилем)
      if (!fs.existsSync(testwin)) {
        res.fullscreen = 'skip: нет scripts/testwin.cjs (собранная версия)';
      } else {
      const env: NodeJS.ProcessEnv = { ...process.env, FULLSCREEN: '1', CLOSE_AFTER: '9000' };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawnChild(process.execPath, [testwin], { env, stdio: 'ignore' });
      let paused = false;
      for (let i = 0; i < 40 && !paused; i++) {
        await wait(200);
        paused = ui.autoPaused;
      }
      res.autoPausedWithFullscreen = paused;
      res.overlayHidden = ov ? !ov.win.isVisible() : null;
      res.rendererPaused = ov ? await js('window.__test.running()') === false : null;
      await new Promise((r) => child.once('exit', r));
      let resumed = false;
      for (let i = 0; i < 40 && !resumed; i++) {
        await wait(200);
        resumed = !ui.autoPaused;
      }
      res.resumedAfterClose = resumed;
      res.overlayVisibleAgain = ov ? ov.win.isVisible() : null;
      }
      // экономия
      applyPatch({ system: { economy: 'on' } });
      await wait(300);
      res.economyFps = ov ? await js('window.__test.fps()') : null;
      applyPatch({ system: { economy: 'off' } });
      await wait(300);
      res.normalFps = ov ? await js('window.__test.fps()') : null;
      // автозапуск (HKCU\Software\Microsoft\Windows\CurrentVersion\Run) — только в установленной версии; сразу возвращаем как было
      if (app.isPackaged) {
        const was = autostartEnabled();
        applyPatch({ system: { autostart: true } });
        res.autostartOn = autostartEnabled();
        applyPatch({ system: { autostart: false } });
        res.autostartOff = !autostartEnabled();
        if (was) {
          store.update({ system: { autostart: true } });
          applyAutostart();
        }
      } else res.autostart = 'dev: проверяется в собранной версии';
      console.log(`[system-check] ${JSON.stringify(res)}`);
      finish(0);
    }, 1500);
  }
  if (ARGS.hotkeyCheck) {
    // регистрация глобальных клавиш (сами клавиши не нажимаем — они ушли бы в чужое активное окно)
    setTimeout(() => {
      registerHotkeys();
      const ok1 = { ...hotkeyOk };
      // смена сочетания из настроек перерегистрирует клавишу
      applyPatch({ hotkeys: { shake: 'Ctrl+Alt+F9' } });
      registerHotkeys(); // в обычном режиме это делает applyPatch, в тестовом он клавиши не трогает
      const ok2 = { ...hotkeyOk, registered: Object.values(registeredHot) };
      console.log(`[hotkey-check] ${JSON.stringify({ defaults: ok1, afterChange: ok2 })}`);
      globalShortcut.unregisterAll();
      finish(0);
    }, 1500);
  }
  if (ARGS.mouseTest) {
    // Кто получает клик: оверлей (pid этого процесса) или то, что под ним. Зонд — маленький exe (csc).
    setTimeout(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const win = process.env.WINDIR || 'C:\Windows';
      const csc = path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
      const probeExe = path.join(userDir, 'probe.exe');
      const { execFileSync } = await import('node:child_process');
      execFileSync(csc, ['-nologo', `-out:${probeExe}`, path.join(ROOT, 'scripts', 'probe.cs')], { windowsHide: true });
      const ov = [...sceneWins.values()].find((x) => x.overlay)!;
      const b = ov.win.getBounds();
      const d = screen.getDisplayMatching(b);
      const phys = (x: number, y: number) => screen.dipToScreenPoint({ x: b.x + x, y: b.y + y });
      const owner = (x: number, y: number) => {
        const p = phys(x, y);
        const out = execFileSync(probeExe, [String(Math.round(p.x)), String(Math.round(p.y))], { encoding: 'utf8', windowsHide: true });
        return Number(out.trim().split(' ')[1]) === process.pid ? 'overlay' : 'under';
      };
      const center: [number, number] = [Math.round(b.width / 2), Math.round(b.height / 3)];
      const res: Record<string, string> = {};
      await wait(2500);
      res.passive = owner(...center);
      setUi({ interactive: true, tool: 'shovel' });
      await wait(600);
      res.interactive = owner(...center);
      setUi({ interactive: false });
      await wait(600);
      res.afterEsc = owner(...center);
      // курсор над вкладкой дока (события мыши пересылаются даже в пассивном режиме)
      // док после режима инструментов ещё открыт — ждём автоскрытия, чтобы осталась одна вкладка-снежинка
      const js = <R = unknown>(code: string) => ov.win.webContents.executeJavaScript(code) as Promise<R>;
      for (let i = 0; i < 60 && (await js<boolean>('window.__test.dockOpen()')); i++) await wait(100);
      await wait(500);
      const t = lastRects.tab;
      if (t) {
        const tx = Math.round(t[0] + t[2] / 2);
        const ty = Math.round(t[1] + t[3] / 2);
        let got = 'under';
        for (let i = 0; i < 15 && got !== 'overlay'; i++) {
          ov.win.webContents.sendInputEvent({ type: 'mouseMove', x: tx + (i % 2), y: ty });
          await wait(200);
          got = owner(tx, ty);
        }
        res.overDockTab = got;
        let away = 'overlay';
        for (let i = 0; i < 15 && away !== 'under'; i++) {
          ov.win.webContents.sendInputEvent({ type: 'mouseMove', x: center[0] + (i % 2), y: center[1] });
          await wait(200);
          away = owner(...center);
        }
        res.awayFromDock = away;
      }
      console.log(`[mouse-test] ${JSON.stringify(res)} scale=${d.scaleFactor}`);
      finish(0);
    }, 1500);
  }
  if (ARGS.ledgeTest) {
    // Снег на краях настоящего окна: обычное окно поверх всех, снег копится на его верхней кромке,
    // потом окно сдвигаем — снег должен осыпаться.
    setTimeout(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // окно другого процесса (свои окна помощник намеренно пропускает)
      const env: NodeJS.ProcessEnv = { ...process.env, MOVE_AFTER: '28000' };
      delete env.ELECTRON_RUN_AS_NODE;
      const tw = path.join(ROOT, 'scripts', 'testwin.cjs');
      if (!fs.existsSync(tw)) {
        console.log('[ledge-test] skip: нет scripts/testwin.cjs (собранная версия)');
        finish(0);
        return;
      }
      const child = spawnChild(process.execPath, [tw], { env, stdio: 'ignore' });
      const ov = [...sceneWins.values()].find((x) => x.overlay)!;
      await wait(2500);
      await ov.win.webContents.executeJavaScript('window.__test.boostSnow()');
      await wait(24000);
      const before = await ov.win.webContents.executeJavaScript('window.__test.info()');
      await captureDesktop('ledges-before');
      await wait(4500); // окно сдвигается на 28-й секунде
      const after = await ov.win.webContents.executeJavaScript('window.__test.info()');
      await captureDesktop('ledges-after');
      console.log(`[ledge-test] before=${JSON.stringify({ ledges: before.ledges, snow: before.ledgeSnow })} after=${JSON.stringify({ ledges: after.ledges, snow: after.ledgeSnow })}`);
      child.kill();
      finish(0);
    }, 2000);
  }
  if (ARGS.inputTest)
    setTimeout(async () => {
      try {
        await inputTest(ARGS.inputTest!);
        finish(0);
      } catch (err) {
        console.error('[input-test] FAIL', err);
        finish(1);
      }
    }, 1500);
  if (ARGS.shotAfter !== null) {
    setTimeout(async () => {
      for (const s of sceneWins.values()) {
        await capture(s.win, `${ARGS.shotName}-${s.overlay ? 'overlay' + s.displayIndex : 'windowed'}`);
      }
      if (ARGS.desktopShot) await captureDesktop(ARGS.shotName);
      if (ARGS.exitAfter) finish(0);
    }, ARGS.shotAfter);
  }
});
