// Модуль эффектов: следы, «ангел», снежковый бой, брызги на стекле, «снежный шар», снег на краях окон.
import { EffectsModule } from '../sim/effects';
import { LedgeModule } from '../sim/ledges';
import { drawDecal, drawProjectile, drawSplat, drawSlingshot, drawLedge } from '../render/effects';
import { registerModule, App } from './app';
import { registerTool } from './tools';
import { balls } from './mod-balls';
import { snowmen } from './mod-snowmen';
import { decorModule } from './mod-world';
import type { WinRect } from '../shared/ipc';

let fx: EffectsModule | null = null;
let ledges: LedgeModule | null = null;
let appRef: App | null = null;
const SLING_K = 4.5;

registerModule({
  name: 'fx',
  attach(app) {
    appRef = app;
    fx = new EffectsModule(app.scene, balls(), snowmen(), decorModule());
    ledges = new LedgeModule(app.scene);
    app.scene.modules.fx = fx;
    app.scene.modules.ledges = ledges;
    app.api.onWindows((rects: WinRect[]) => ledges?.update(rects));
    this.onSettings?.(app);
  },
  onSettings(app) {
    if (fx) fx.splatsOn = app.settings.effects.splats;
    if (ledges) {
      const on = app.settings.effects.windowSnow && !app.info.windowed;
      if (!on && ledges.enabled) ledges.clear();
      ledges.enabled = on || (ledges.enabled && !!app.info.scenario);
    }
  },
  onCommand(c, app) {
    if (c.type === 'shake' && fx) {
      app.pushHistory();
      fx.shake();
    }
  },
  draw(ctx, layer, app) {
    if (!fx) return;
    if (layer === 'mid') {
      for (const d of fx.decals) drawDecal(ctx, d, app.scene.surfaceY(d.x), fx.decalAlpha(d));
    } else if (layer === 'front' && ledges?.enabled) {
      for (const l of ledges.ledges.values()) drawLedge(ctx, l);
    } else if (layer === 'glass') {
      for (const p of fx.projectiles) drawProjectile(ctx, p);
      for (const s of fx.splats) drawSplat(ctx, s);
    }
  },
  scenario(name, app) {
    if (name !== 'fx' && name !== 'shake' && name !== 'ledges') return null;
    return (async () => {
      const sc = app.scene;
      sc.fastForward(60 * 15);
      const W = app.W;
      if (name === 'fx') {
        // следы через пол-экрана, ангел, три брызги на стекле
        fx!.resetWalk();
        for (let x = W * 0.08; x < W * 0.4; x += 4) fx!.walk(x);
        fx!.angel(W * 0.5);
        fx!.splat(W * 0.65, app.H * 0.35, 22);
        fx!.splat(W * 0.8, app.H * 0.25, 16);
        for (let k = 0; k < 60 * 4; k++) sc.step();
        fx!.splat(W * 0.72, app.H * 0.5, 26);
        fx!.throwBall(W * 0.3, app.H * 0.6, 500, -700);
        for (let k = 0; k < 20; k++) sc.step();
      } else if (name === 'shake') {
        fx!.shake();
        for (let k = 0; k < 70; k++) sc.step();
      } else {
        // снег на кромках «окон» (в окне отладки — нарисованные прямоугольники)
        ledges!.enabled = true;
        const rects: WinRect[] = [
          { id: 'a', x: W * 0.1, y: app.H * 0.3, w: W * 0.35, h: 300, top: [[W * 0.1, W * 0.45]] },
          { id: 'b', x: W * 0.35, y: app.H * 0.45, w: W * 0.45, h: 250, top: [[W * 0.45, W * 0.8]] },
        ];
        ledges!.update(rects);
        sc.apply({ snowfall: { intensity: 1 } });
        for (let k = 0; k < 60 * 120; k++) sc.step();
      }
      return { ...fx!.testInfo(), ...ledges!.testInfo(), swirl: sc.particles.filter((p) => p.kind === 'swirl').length };
    })();
  },
});

// тест: сильный снегопад для быстрой проверки снега на окнах
const TT = ((window as unknown as { __test: Record<string, unknown> }).__test ??= {});
TT.boostSnow = () => {
  if (!appRef) return;
  appRef.scene.apply({ snowfall: { intensity: 1, sizeScale: 1.6 } });
};

// ---------- инструменты ----------

registerTool('steps', {
  down(h, p) {
    if (!fx) return;
    h.pushHistory();
    fx.resetWalk();
    fx.walk(p.x);
  },
  move(_h, p) {
    fx?.walk(p.x);
  },
});

registerTool('angel', {
  down(h, p) {
    if (!fx) return;
    h.pushHistory();
    fx.angel(p.x);
  },
});

let sling: { x: number; y: number } | null = null;
registerTool('throw', {
  down(_h, p) {
    sling = { x: p.x, y: p.y };
  },
  up(_h, p) {
    if (!fx || !sling) return;
    let vx = (sling.x - p.x) * SLING_K;
    let vy = (sling.y - p.y) * SLING_K;
    // просто клик — бросок вверх-вперёд
    if (Math.hypot(vx, vy) < 120) {
      vx = (p.x < (appRef?.W ?? 1000) / 2 ? 1 : -1) * 350;
      vy = -650;
    }
    fx.throwBall(p.x, p.y, vx, vy);
    sling = null;
  },
  overlay(ctx, p, pressed) {
    if (pressed && sling && p) drawSlingshot(ctx, sling.x, sling.y, p.x, p.y, SLING_K);
  },
});
