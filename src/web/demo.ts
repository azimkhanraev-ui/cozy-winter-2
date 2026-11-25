// Живое демо для сайта: та же симуляция и отрисовка, что в приложении (без Electron).
// Клик по снегу — шар (по очереди большой → средний → маленький); шары можно перетаскивать;
// три шара друг на друге (большой внизу) → снеговик. Кнопки меняют время суток.
import { Scene, FIXED_DT } from '../sim/scene';
import { BallWorld, Ball } from '../sim/physics';
import { SnowmanModule, partCenters } from '../sim/snowman';
import { DecorModule } from '../sim/decor';
import { lightAt } from '../sim/daytime';
import { DEFAULT_PRESETS, DEFAULT_SETTINGS } from '../shared/settings';
import { sceneParamsFrom } from '../ui/mapSettings';
import { GroundRenderer } from '../render/ground';
import { SnowRenderer } from '../render/snow';
import { drawBall, drawBallShadow } from '../render/balls';
import { drawSnowman, drawSnowmanGlow } from '../render/snowman';
import { SkyRenderer } from '../render/sky';
import { drawHouse, drawHouseGlow, drawTree, drawLantern, drawLanternGlow, drawFence, drawGarland } from '../render/decor';
import { NAMES, PHRASES } from '../shared/i18n';

const cv = document.getElementById('demo') as HTMLCanvasElement;
const g = cv.getContext('2d')!;
const hintEl = document.getElementById('demo-hint');
const ground = new GroundRenderer();
const snowR = new SnowRenderer();
const sky = new SkyRenderer();
let W = 0;
let H = 0;
let dpr = 1;
let scene: Scene;
let balls: BallWorld;
let men: SnowmanModule;
let decor: DecorModule;
let hour = 21;
const SIZES = [34, 25, 17];
let nextSize = 0;

function size(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth;
  H = cv.clientHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  scene?.resize(W, H);
  ground.ensure(W, 160, dpr);
}

function init(): void {
  size();
  scene = new Scene(W, H, 11);
  const p = sceneParamsFrom(DEFAULT_SETTINGS);
  p.drift.maxHeight = Math.min(60, H * 0.16);
  scene.apply(p);
  balls = new BallWorld(scene);
  men = new SnowmanModule(scene, balls);
  men.names = NAMES.ru;
  men.phrasesCount = PHRASES.ru.length;
  decor = new DecorModule(scene, balls);
  decor.flags.scale = Math.round(Math.max(55, Math.min(95, W / 12)));
  decor.items = decor.items.filter((i) => i.kind !== 'fence'); // в узком окне — место для снеговиков
  scene.modules.balls = balls;
  scene.modules.snowmen = men;
  scene.modules.decor = decor;
  scene.snowfall.prefill();
  scene.dustNow(400);
}

function updateHint(): void {
  if (!hintEl) return;
  if (men.snowmen.length) {
    hintEl.textContent = 'Снеговик готов! Двигайте шары мышью, слепите ещё одного.';
    return;
  }
  const name = ['большой', 'средний', 'маленький'][nextSize];
  hintEl.textContent = `Кликните по снегу — появится ${name} шар. Поставьте три шара друг на друга, большой внизу.`;
}

// ---------- мышь / касание ----------
let held: { b: Ball; ox: number; oy: number; vx: number; vy: number; lx: number; ly: number; lt: number } | null = null;
const pos = (e: PointerEvent) => {
  const r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
cv.addEventListener('pointerdown', (e) => {
  const p = pos(e);
  cv.setPointerCapture(e.pointerId);
  const b = balls.balls.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < b.r);
  if (b) {
    b.held = true;
    held = { b, ox: b.x - p.x, oy: b.y - p.y, vx: 0, vy: 0, lx: p.x, ly: p.y, lt: performance.now() };
    return;
  }
  if (balls.balls.length > 12) balls.remove(balls.balls[0].id);
  const r = SIZES[nextSize];
  nextSize = (nextSize + 1) % SIZES.length;
  balls.add(Math.max(r, Math.min(W - r, p.x)), Math.min(p.y, scene.surfaceY(p.x) - r), r);
  updateHint();
});
cv.addEventListener('pointermove', (e) => {
  const p = pos(e);
  men.cursor = { x: p.x, y: p.y, vx: 0, vy: 0 };
  if (!held) return;
  const now = performance.now();
  const dt = Math.max(1, now - held.lt) / 1000;
  held.vx = (p.x - held.lx) / dt;
  held.vy = (p.y - held.ly) / dt;
  held.lx = p.x;
  held.ly = p.y;
  held.lt = now;
  held.b.x = Math.max(held.b.r, Math.min(W - held.b.r, p.x + held.ox));
  held.b.y = Math.min(p.y + held.oy, scene.surfaceY(held.b.x) - held.b.r * 0.9);
});
const release = () => {
  if (!held) return;
  held.b.held = false;
  held.b.vx = Math.max(-1500, Math.min(1500, held.vx));
  held.b.vy = Math.max(-1500, Math.min(1500, held.vy));
  held = null;
};
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
cv.addEventListener('pointerleave', () => (men.cursor = null));

document.querySelectorAll<HTMLButtonElement>('[data-hour]').forEach((b) =>
  b.addEventListener('click', () => {
    hour = Number(b.dataset.hour);
    document.querySelectorAll('[data-hour]').forEach((x) => x.classList.toggle('active', x === b));
  }),
);

// ---------- кадр ----------
let last = performance.now();
let acc = 0;
let t = 0;
let hadSnowman = false;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  acc += dt;
  let n = 0;
  while (acc >= FIXED_DT && n++ < 6) {
    scene.step(FIXED_DT);
    acc -= FIXED_DT;
  }
  if (acc > FIXED_DT * 4) acc = 0;
  if (!hadSnowman && men.snowmen.length) {
    hadSnowman = true;
    updateHint();
  }
  const L = lightAt(hour, DEFAULT_PRESETS);
  const lamp = Math.max(L.windowLight, L.night);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  sky.draw(g, W, H, L, t, 1 / Math.max(0.01, L.skyAlpha), 1);
  snowR.drawFlakes(g, scene.snowfall.flakes, [0, 1], scene.wind.time, dpr);
  drawGarland(g, decor, t, L.garland, false);
  for (const it of decor.items) {
    if (!decor.visible(it)) continue;
    const [w, h] = decor.dims(it);
    if (it.kind === 'house') drawHouse(g, it, w, h, H, L.windowLight);
    else if (it.kind === 'tree') drawTree(g, it, w, h, H, t, scene.wind.value);
    else if (it.kind === 'lantern') drawLantern(g, it, w, h, H, lamp);
    else drawFence(g, it, w, h, H);
  }
  ground.setTint(L.snowColor);
  ground.ensure(W, 160, dpr);
  ground.update(scene.field, now);
  ground.draw(g, H);
  for (const b of balls.balls) drawBallShadow(g, b, scene.surfaceY(b.x));
  for (const b of [...balls.balls].sort((a, b) => b.r - a.r)) drawBall(g, b, dpr);
  for (const s of men.snowmen) drawSnowman(g, s, t, dpr, scene.surfaceY(s.x));
  snowR.drawFlakes(g, scene.snowfall.flakes, [2], scene.wind.time, dpr);
  snowR.drawParticles(g, scene.particles);
  if (L.tintAlpha > 0.01) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = L.tintAlpha;
    g.fillStyle = L.tint;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  for (const it of decor.items) {
    if (!decor.visible(it)) continue;
    const [w, h] = decor.dims(it);
    if (it.kind === 'house') drawHouseGlow(g, it, w, h, H, L.windowLight);
    else if (it.kind === 'lantern') drawLanternGlow(g, it, w, h, H, lamp);
  }
  drawGarland(g, decor, t, L.garland, true);
  for (const s of men.snowmen) drawSnowmanGlow(g, s, L.night);
  snowR.drawSparkles(g, scene.field, H, W, dt, 1 + L.night * 0.6);
  snowR.drawFlakes(g, scene.snowfall.flakes, [3], scene.wind.time, dpr);
  // облачко с фразой снеговика
  for (const s of men.snowmen) {
    if (s.talk <= 0) continue;
    const head = partCenters(s)[2];
    const txt = PHRASES.ru[s.phrase % PHRASES.ru.length];
    g.font = '13px Segoe UI, system-ui, sans-serif';
    const tw = g.measureText(txt).width + 18;
    const bx = Math.min(W - tw - 6, Math.max(6, head.x - 16));
    const by = Math.max(6, head.y - head.r * 2.2 - 30);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.roundRect(bx, by, tw, 26, 10);
    g.fill();
    g.fillStyle = '#1d2a3d';
    g.fillText(txt, bx + 9, by + 17);
  }
}

init();
updateHint();
window.addEventListener('resize', size);
requestAnimationFrame(frame);

// для автоматической проверки сайта (только чтение)
(window as unknown as { __demo: unknown }).__demo = {
  snowmen: () => men.snowmen.length,
  balls: () => balls.balls.map((b) => [Math.round(b.x), Math.round(b.y), b.r]),
  surfaceY: (x: number) => scene.surfaceY(x),
};
