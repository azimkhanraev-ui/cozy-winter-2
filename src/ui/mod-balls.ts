// Модуль шаров: физика в сцене, отрисовка, взять/перетащить/бросить мышью, ПКМ — растопить,
// инструменты «Шар» (быстро) и «Катать» (ком растёт, собирая снег).
import { BallWorld, Ball } from '../sim/physics';
import { drawBall, drawBallShadow } from '../render/balls';
import { registerModule, App, Hit } from './app';
import { registerTool, PointerInfo } from './tools';
import { t } from '../shared/i18n';

let world: BallWorld | null = null;
let appRef: App | null = null;
export function balls(): BallWorld | null {
  return world;
}

function ballAt(x: number, y: number): Ball | null {
  if (!world) return null;
  for (let i = world.balls.length - 1; i >= 0; i--) {
    const b = world.balls[i];
    if (b.melting > 0) continue;
    if (Math.hypot(x - b.x, y - b.y) <= b.r + 2) return b;
  }
  return null;
}

function grabHit(b: Ball, app: App): Hit {
  let ox = 0;
  let oy = 0;
  return {
    kind: 'ball',
    priority: 5,
    cursor: 'grab',
    dragStart(p) {
      app.pushHistory();
      b.held = true;
      b.sleeping = false;
      ox = b.x - p.x;
      oy = b.y - p.y;
      document.body.style.cursor = 'grabbing';
    },
    drag(p) {
      const tx = p.x + ox;
      let ty = p.y + oy;
      // нельзя затащить шар в снег — он идёт по поверхности
      ty = Math.min(ty, app.scene.surfaceY(tx) - b.r * 0.9);
      b.vx = (tx - b.x) * 60;
      b.vy = (ty - b.y) * 60;
      b.x = Math.max(b.r, Math.min(app.W - b.r, tx));
      b.y = ty;
      b.angle += (tx - b.x) / b.r;
    },
    dragEnd(p) {
      b.held = false;
      // бросок по инерции движения мыши
      const sp = Math.hypot(p.vx, p.vy);
      const k = sp > 2200 ? 2200 / sp : 1;
      b.vx = p.vx * k;
      b.vy = p.vy * k;
      b.w = b.vx / b.r;
      for (const o of world!.balls) if (o !== b) world!.wakeNear(b.x, b.y, b.r);
      document.body.style.cursor = '';
    },
    rightClick() {
      app.pushHistory();
      b.melting = 0.001;
      app.sfx('melt');
    },
  };
}

registerModule({
  name: 'balls',
  attach(app) {
    appRef = app;
    world = new BallWorld(app.scene);
    world.capSnow = app.settings.balls.capSnow;
    app.scene.modules.balls = world;
  },
  onSettings(app) {
    if (world) world.capSnow = app.settings.balls.capSnow;
  },
  draw(ctx, layer, app) {
    if (!world || layer !== 'mid') return;
    for (const b of world.balls) drawBallShadow(ctx, b, app.scene.surfaceY(b.x));
    // большие сзади, маленькие спереди — стопки выглядят естественно
    const sorted = [...world.balls].sort((a, b) => b.r - a.r);
    for (const b of sorted) drawBall(ctx, b, app.dpr);
  },
  hit(x, y, app) {
    const b = ballAt(x, y);
    return b ? grabHit(b, app) : null;
  },
  scenario(name, app) {
    if (name !== 'balls') return null;
    return (async () => {
      const sc = app.scene;
      sc.fastForward(60 * 12);
      sc.apply({ snowfall: { intensity: 0.45 } });
      const W = app.W;
      const w = world!;
      // все размеры S/M/L/XL и стопка из трёх
      [14, 26, 42, 60].forEach((r, k) => w.add(W * (0.12 + k * 0.1), 80 + k * 40, r));
      const gx = W * 0.62;
      w.add(gx, sc.surfaceY(gx) - 60, 42);
      for (let k = 0; k < 120; k++) sc.step();
      w.add(gx + 4, 60, 26);
      for (let k = 0; k < 150; k++) sc.step();
      w.add(gx + 6, 20, 15);
      for (let k = 0; k < 200; k++) sc.step();
      // ком, скатанный по снегу
      const rb = w.add(W * 0.8, sc.surfaceY(W * 0.8) - 8, 8);
      rb.rolling = true;
      const v0 = sc.field.totalSnow();
      const a0 = Math.PI * rb.r * rb.r;
      w.rollTo(rb, W * 0.97);
      const collected = v0 - sc.field.totalSnow();
      rb.rolling = false;
      // снег на шарах
      for (let k = 0; k < 60 * 20; k++) sc.step();
      const stack = w.balls.slice(4, 7);
      return {
        balls: w.balls.length,
        allSleeping: w.balls.every((b) => b.sleeping),
        stackOrdered: stack[2].y < stack[1].y && stack[1].y < stack[0].y,
        rollR: +rb.r.toFixed(1),
        rollVolumeErr: +Math.abs(collected - (Math.PI * rb.r * rb.r - a0)).toFixed(2),
        caps: w.balls.map((b) => +b.cap.toFixed(1)),
      };
    })();
  },
});

// ---------- инструменты ----------

registerTool('ball', {
  down(h, p) {
    if (!world || !appRef) return;
    const s = h.settings();
    if (world.balls.length >= s.balls.max) {
      h.toast(`${t(s.lang, 'ball')}: max ${s.balls.max}`);
      return;
    }
    h.pushHistory();
    const r = s.tools.ballSize;
    const y = Math.min(p.y, h.scene.surfaceY(p.x) - r);
    world.add(Math.max(r, Math.min(appRef.W - r, p.x)), y, r);
    h.sfx('puff', 0.4);
  },
});

let rolling: Ball | null = null;
registerTool('roll', {
  down(h, p) {
    if (!world || !appRef) return;
    const sy = h.scene.surfaceY(p.x);
    // начинать нужно на снегу: курсор у поверхности или в сугробе
    if (p.y < sy - 45 || h.scene.field.snow[h.scene.field.col(p.x)] < 0.5) return;
    if (world.balls.length >= h.settings().balls.max) return;
    h.pushHistory();
    rolling = world.add(p.x, sy - 8, 8);
    rolling.rolling = true;
  },
  move(h, p) {
    if (!rolling || !world) return;
    const got = world.rollTo(rolling, p.x, 90);
    if (got > 0 && Math.random() < 0.3) h.sfx('crunch', Math.min(1, got / 200));
  },
  up(_h, p: PointerInfo) {
    if (!rolling) return;
    rolling.rolling = false;
    rolling.vx = Math.max(-300, Math.min(300, p.vx * 0.3));
    rolling.w = rolling.vx / rolling.r;
    rolling = null;
  },
});

// ---------- тестовые хуки ----------
const T = (window as unknown as { __test: Record<string, unknown> }).__test ?? {};
(window as unknown as { __test: Record<string, unknown> }).__test = T;
Object.assign(T, {
  ballPos: (i: number) => {
    const b = world?.balls[i];
    return b ? [b.x, b.y] : null;
  },
});
