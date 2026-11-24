// Рендерер сцены (оверлей или отладочное окно): цикл, отрисовка, ввод, тестовые сценарии.
import type { CozyApi, InitInfo, Command } from '../shared/ipc';
import type { Settings } from '../shared/settings';
import { Scene, FIXED_DT } from '../sim/scene';
import { GroundRenderer } from '../render/ground';
import { SnowRenderer } from '../render/snow';
import { sceneParamsFrom } from './mapSettings';

declare global {
  interface Window {
    cozy: CozyApi;
  }
}

const api = window.cozy;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
/** Отдельный холст для дальних слоёв: они двигаются < 1 px за кадр и обновляются через кадр. */
const farCanvas = document.getElementById('far') as HTMLCanvasElement;
let ctx: CanvasRenderingContext2D = null as unknown as CanvasRenderingContext2D;
let farCtx: CanvasRenderingContext2D = null as unknown as CanvasRenderingContext2D;
let frameNo = 0;
const fpsEl = document.getElementById('fps') as HTMLDivElement;

let info: InitInfo;
let settings: Settings;
let scene: Scene;
const ground = new GroundRenderer();
const snowR = new SnowRenderer();
let W = 0;
let H = 0;
let dpr = 1;
let running = false;
let rafId = 0;
let last = 0;
let lastDraw = 0;
let acc = 0;
let timeScale = 1;
let mouseCaptured = false;

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  for (const c of [canvas, farCanvas]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    c.style.width = W + 'px';
    c.style.height = H + 'px';
  }
  if (scene) scene.resize(W, H);
  ensureGround();
}

function ensureGround(): void {
  if (!scene) return;
  let peak = 0;
  const f = scene.field;
  for (let i = 0; i < f.n; i++) peak = Math.max(peak, f.visibleHeight(i));
  ground.ensure(W, Math.max(settings.drift.maxHeight * 1.7 + 30, peak + 40), dpr);
}

function applySettings(s: Settings): void {
  const prevPaused = settings?.paused;
  settings = s;
  scene.apply(sceneParamsFrom(s));
  ensureGround();
  if (s.paused && !prevPaused) stop();
  else if (!s.paused && (prevPaused || !running)) start();
  if (s.paused) render(0);
}

function render(dt: number, full = true): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (info.exp.includes('blank')) return; // эксперимент: стоимость пустого кадра
  const t = scene.wind.time;
  const fl = scene.snowfall.flakes;
  // дальние слои (свой холст, через кадр) → снег на земле → средний слой → пыль/искорки → ближний слой
  if (full || (frameNo++ & 1) === 0) {
    farCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    farCtx.clearRect(0, 0, W, H);
    snowR.drawFlakes(farCtx, fl, [0, 1], t, dpr);
  }
  ground.update(scene.field, performance.now());
  ground.draw(ctx, H);
  snowR.drawFlakes(ctx, fl, [2], t, dpr);
  snowR.drawParticles(ctx, scene.particles);
  snowR.drawSparkles(ctx, scene.field, H, W, dt);
  snowR.drawFlakes(ctx, fl, [3], t, dpr);
}

let fpsFrames = 0;
let fpsT = 0;
function frame(now: number): void {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  const minDt = 1000 / settings.fpsLimit - 1.5;
  if (now - lastDraw < minDt) return;
  const dtMs = Math.min(100, now - last);
  last = now;
  lastDraw = now;
  acc += (dtMs / 1000) * timeScale;
  let steps = 0;
  while (acc >= FIXED_DT && steps < 8 * timeScale) {
    scene.step(FIXED_DT);
    acc -= FIXED_DT;
    steps++;
  }
  if (acc > FIXED_DT * 4) acc = 0; // не догоняем после долгих пауз
  if (scene.field.revision % 30 === 0) ensureGround();
  render(dtMs / 1000, settings.fpsLimit <= 30);
  if (info.debug) {
    fpsFrames++;
    if (now - fpsT > 1000) {
      fpsEl.textContent = `${fpsFrames} fps · ${scene.snowfall.flakes.length} хлопьев`;
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

function onCommand(c: Command): void {
  if (c.type === 'dustNow') {
    scene.dustNow();
    ensureGround();
  } else if (c.type === 'clearSnow') {
    scene.field.clear();
  }
  if (!running) render(0);
}

// ---------- пассивный режим: hit-test → захват мыши ----------
// Пока интерактивных объектов нет — мышь всегда проходит насквозь.
function hitTest(_x: number, _y: number): boolean {
  return false;
}
window.addEventListener('mousemove', (e) => {
  const want = hitTest(e.clientX, e.clientY);
  if (want !== mouseCaptured) {
    mouseCaptured = want;
    api.setMouseCapture(want);
  }
});

// ---------- тестовые сценарии ----------
async function runScenario(name: string): Promise<void> {
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  if (name === 'snow60') {
    // 60 секунд «ускоренной» симуляции: ×20 → 20 минут снегопада.
    const t0 = performance.now();
    scene.fastForward(60 * 20);
    const ms = Math.round(performance.now() - t0);
    ensureGround();
    ground.update(scene.field, performance.now(), 0, true);
    render(FIXED_DT);
    await nextFrame();
    await nextFrame();
    const f = scene.field;
    let min = Infinity, max = 0, sum = 0;
    for (let i = 0; i < f.n; i++) {
      min = Math.min(min, f.snow[i]);
      max = Math.max(max, f.snow[i]);
      sum += f.snow[i];
    }
    api.scenarioDone(name, { simMs: ms, mean: +(sum / f.n).toFixed(1), min: +min.toFixed(1), max: +max.toFixed(1), slopeViolation: +f.maxSlopeViolation().toFixed(3) });
    return;
  }
  if (name === 'blizzard') {
    // Метель: сильный ветер с порывами поверх накопленного снега — намёты, пыль с гребней.
    scene.apply({ windBase: 200, gustiness: 0.9, snowfall: { intensity: 0.9 } });
    scene.fastForward(600);
    ensureGround();
    ground.update(scene.field, performance.now(), 0, true);
    render(FIXED_DT);
    await nextFrame();
    api.scenarioDone(name, { particles: scene.particles.length, wind: Math.round(scene.wind.value) });
    return;
  }
  if (name === 'dustnow') {
    // «Присыпать сразу» на пустой земле.
    scene.field.clear();
    scene.dustNow();
    ensureGround();
    ground.update(scene.field, performance.now(), 0, true);
    render(FIXED_DT);
    await nextFrame();
    const f = scene.field;
    let max = 0, sum = 0;
    for (let i = 0; i < f.n; i++) { max = Math.max(max, f.snow[i]); sum += f.snow[i]; }
    api.scenarioDone(name, { mean: +(sum / f.n).toFixed(1), max: +max.toFixed(1), slopeViolation: +f.maxSlopeViolation().toFixed(3) });
    return;
  }
  if (name === 'idle') {
    for (let i = 0; i < 90; i++) await nextFrame();
    api.scenarioDone(name, { flakes: scene.snowfall.flakes.length });
    return;
  }
  api.scenarioDone(name, { error: 'unknown scenario' });
}

// ---------- старт ----------
(async () => {
  info = await api.init();
  settings = info.settings;
  ctx = canvas.getContext('2d', { alpha: true })!;
  farCtx = farCanvas.getContext('2d', { alpha: true })!;
  if (info.windowed) document.body.classList.add('windowed');
  if (info.debug) fpsEl.style.display = 'block';
  resize();
  scene = new Scene(W, H, info.seed || 1);
  scene.apply(sceneParamsFrom(settings));
  scene.snowfall.prefill();
  ensureGround();
  window.addEventListener('resize', resize);
  api.onSettings(applySettings);
  api.onCommand(onCommand);
  if (info.scenario) {
    await runScenario(info.scenario);
    if (!settings.paused) start();
    return;
  }
  if (!settings.paused) start();
  else render(0);
})();

export {};
