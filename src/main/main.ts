// Главный процесс: окна (оверлей на каждый монитор / отладочное окно), трей, настройки, IPC.
import { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage, desktopCapturer, Display, Rectangle, MenuItemConstructorOptions } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SettingsStore } from './settingsStore';
import { snowflakeBitmap } from './icon';
import type { InitInfo, Command } from '../shared/ipc';
import type { Settings } from '../shared/settings';

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
  /** Дополнительно снять весь рабочий стол (как его видит пользователь, с композицией DWM). */
  desktopShot: flag('desktop-shot'),
  shotDir: path.resolve(opt('shot-dir') ?? path.join(process.cwd(), 'tests', 'shots')),
  debug: flag('verbose'),
  trayCheck: flag('tray-check'),
  seed: Number(opt('seed') ?? 0) || 0,
};
const TEST_MODE = !!(ARGS.scenario || ARGS.shotAfter !== null || ARGS.trayCheck);

// ---------- профиль ----------
const userDir = opt('user-data') ? path.resolve(opt('user-data')!) : path.join(app.getPath('appData'), 'CozyWinter2');
app.setPath('userData', userDir);
const store = new SettingsStore(userDir);
if (store.recoveredFromCorrupt) console.warn('[settings] файл настроек был повреждён — восстановлены значения по умолчанию/резервная копия');
if (!store.settings.gpu) app.disableHardwareAcceleration();
app.setAppUserModelId('app.cozywinter2');

if (!TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const STATIC = path.join(ROOT, 'static');
const PRELOAD = path.join(__dirname, 'preload.js');

let tray: Tray | null = null;
let settingsWin: BrowserWindow | null = null;
/** Окна сцены: ключ — id дисплея (или 'windowed'). */
const sceneWins = new Map<string, { win: BrowserWindow; displayIndex: number; overlay: boolean }>();
let quitting = false;

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

function wireCommon(win: BrowserWindow, tag: string) {
  win.webContents.on('console-message', (...a: unknown[]) => {
    const e = a[0] as { message?: string; level?: string | number };
    const msg = e?.message ?? (a[2] as string);
    const level = e?.level ?? a[1];
    if (ARGS.debug || TEST_MODE || level === 'error' || level === 3) console.log(`[${tag}] ${msg}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error(`[${tag}] renderer gone:`, d.reason));
}

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
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setBounds(b); // на смешанных DPI повторная установка даёт точный размер
  wireCommon(win, `overlay${index}`);
  win.loadFile(path.join(STATIC, 'overlay.html'));
  win.once('ready-to-show', () => win.showInactive());
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
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, sandbox: true },
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
  const all = screen.getAllDisplays();
  if (store.settings.monitors === 'primary') return [screen.getPrimaryDisplay()];
  return all;
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
      if (!w.win.isDestroyed()) w.win.destroy();
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
    sceneWins.set(key, { win, displayIndex: t.index, overlay: !!t.d });
  }
}

function openSettings(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 460,
    minHeight: 500,
    title: T('Cozy Winter 2 — Настройки', 'Cozy Winter 2 — Settings'),
    backgroundColor: '#152031',
    autoHideMenuBar: true,
    show: false,
    icon: trayImage(false),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  wireCommon(settingsWin, 'settings');
  settingsWin.loadFile(path.join(STATIC, 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin?.show());
  settingsWin.on('closed', () => (settingsWin = null));
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
  const tpl: MenuItemConstructorOptions[] = [
    { label: 'Cozy Winter 2', enabled: false },
    { type: 'separator' },
    { label: T('Пауза', 'Pause'), type: 'checkbox', checked: s.paused, click: (m) => applyPatch({ paused: m.checked }) },
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
    { label: T('Убрать весь снег', 'Clear all snow'), click: () => broadcastCommand({ type: 'clearSnow' }) },
    { type: 'separator' },
    { label: T('Выход', 'Quit'), click: () => app.quit() },
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
async function captureDesktop(name: string): Promise<void> {
  for (const d of screen.getAllDisplays()) {
    const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0];
    if (!src) continue;
    fs.mkdirSync(ARGS.shotDir, { recursive: true });
    const file = path.join(ARGS.shotDir, `desktop-${name}-${d.id}.png`);
    fs.writeFileSync(file, src.thumbnail.toPNG());
    console.log(`[shot] ${file} (desktop)`);
  }
}

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
  fire(find(T('Настройки…', 'Settings…')));
  // ждём, пока окно реально покажется (до 8 с), а не фиксированную паузу
  for (let i = 0; i < 80 && !(settingsWin && settingsWin.isVisible()); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  results.push(['settings window opened', !!settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()]);
  if (settingsWin) await capture(settingsWin, 'stage1-settings');
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

// ---------- IPC ----------

function infoFor(sender: Electron.WebContents): InitInfo {
  let entry: { displayIndex: number; overlay: boolean } | undefined;
  for (const w of sceneWins.values()) if (!w.win.isDestroyed() && w.win.webContents === sender) entry = w;
  return {
    settings: store.settings,
    windowed: entry ? !entry.overlay : false,
    scenario: ARGS.scenario,
    displayIndex: entry?.displayIndex ?? 0,
    debug: ARGS.debug,
    exp: argv.filter((a) => a.startsWith('--exp-')).map((a) => a.slice(6)),
    seed: ARGS.seed || (entry?.displayIndex ?? 0) * 101 + (TEST_MODE ? 7 : (Date.now() % 100000)),
  };
}

ipcMain.handle('init', (e) => infoFor(e.sender));
ipcMain.on('settings:patch', (_e, patch) => applyPatch(patch));
ipcMain.on('command', (_e, c: Command) => broadcastCommand(c));
ipcMain.on('mouse-capture', (e, capture: boolean) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  for (const s of sceneWins.values()) {
    if (s.win === w && s.overlay) w.setIgnoreMouseEvents(!capture, { forward: true });
  }
});
ipcMain.on('scenario-done', async (e, name: string, info: unknown) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  const entry = [...sceneWins.values()].find((s) => s.win === w);
  const tag = `${name}-${entry?.overlay ? 'overlay' + entry.displayIndex : 'windowed'}`;
  await capture(w, tag);
  if (ARGS.desktopShot) await captureDesktop(tag);
  console.log(`[scenario] ${tag} ${JSON.stringify(info)}`);
  if (ARGS.exitAfter) {
    quitting = true;
    app.quit();
  }
});

// ---------- жизненный цикл ----------

app.on('second-instance', () => openSettings());
app.on('before-quit', () => {
  quitting = true;
  store.flush();
});
app.on('window-all-closed', () => {
  /* остаёмся в трее */
});

app.whenReady().then(() => {
  createTray();
  reconcileWindows();
  let t: NodeJS.Timeout | null = null;
  const onDisplays = () => {
    if (t) clearTimeout(t);
    t = setTimeout(reconcileWindows, 300);
  };
  screen.on('display-added', onDisplays);
  screen.on('display-removed', onDisplays);
  screen.on('display-metrics-changed', onDisplays);

  if (ARGS.trayCheck) {
    setTimeout(async () => {
      const ok = await trayCheck();
      quitting = true;
      app.exit(ok ? 0 : 1);
    }, 1500);
  }

  if (ARGS.shotAfter !== null) {
    setTimeout(async () => {
      for (const s of sceneWins.values()) {
        await capture(s.win, `${ARGS.shotName}-${s.overlay ? 'overlay' + s.displayIndex : 'windowed'}`);
      }
      if (ARGS.desktopShot) await captureDesktop(ARGS.shotName);
      if (ARGS.exitAfter) {
        quitting = true;
        app.quit();
      }
    }, ARGS.shotAfter);
  }
});
