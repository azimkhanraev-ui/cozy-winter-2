// Время суток (свет, небо, туман), снегоуборщик и декор — модули рендерера.
import { lightAt, hourFor } from '../sim/daytime';
import { PlowModule } from '../sim/plow';
import { DecorModule, DecorItem } from '../sim/decor';
import { SkyRenderer } from '../render/sky';
import { drawPlow, drawPlowLights } from '../render/plow';
import { drawHouse, drawHouseGlow, drawTree, drawLantern, drawLanternGlow, drawFence, drawGarland } from '../render/decor';
import { registerModule, App, Hit } from './app';
import { registerTool } from './tools';
import { balls } from './mod-balls';
import { snowmen } from './mod-snowmen';
import type { Phase } from '../shared/settings';

/** Тесты ввода снега/шаров: без снегоуборщика и декора. */
let calm = false;
const TT = ((window as unknown as { __test: Record<string, unknown> }).__test ??= {});
TT.calm = () => {
  calm = true;
  if (plows) {
    plows.settings.enabled = false;
    plows.plows.length = 0;
  }
  if (decor) decor.flags.enabled = false;
};

// ---------- время суток ----------

const sky = new SkyRenderer();
let forcedHour: number | null = null;

function updateLight(app: App): void {
  const ds = app.settings.day;
  const hour = forcedHour ?? hourFor(ds, Date.now(), app.scene.time);
  const l = lightAt(hour, ds.presets);
  Object.assign(app.light, l);
}

registerModule({
  name: 'daytime',
  attach(app) {
    updateLight(app);
  },
  onSettings(app) {
    updateLight(app);
  },
  frame(app) {
    updateLight(app);
  },
  draw(ctx, layer, app) {
    const L = app.light;
    if (layer === 'sky') {
      const windowed = app.info.windowed;
      // в окне небо непрозрачное (полупрозрачность пресета — для поверх рабочего стола)
      sky.draw(ctx, app.W, app.H, L, app.now, windowed ? 1 / Math.max(0.01, L.skyAlpha) : app.settings.day.skyOpacity / 100, windowed ? 1 : app.settings.day.celestial / 100);
    } else if (layer === 'front' && L.fog > 0.01) {
      // морозная дымка у земли (только по нарисованному — рабочий стол не мутнеет)
      const fh = Math.min(app.H * 0.25, 160);
      const gr = ctx.createLinearGradient(0, app.H - fh, 0, app.H);
      gr.addColorStop(0, 'rgba(220,230,250,0)');
      gr.addColorStop(1, `rgba(220,230,250,${(L.fog * 0.45).toFixed(3)})`);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = gr;
      ctx.fillRect(0, app.H - fh, app.W, fh);
      ctx.globalCompositeOperation = 'source-over';
    }
  },
  scenario(name, app) {
    const m = /^day-(dawn|morning|day|sunset|evening|night)$/.exec(name);
    if (!m && name !== 'daycycle') return null;
    return (async () => {
      app.scene.fastForward(60 * 10);
      if (m) {
        const hours: Record<Phase, number> = { dawn: 6.75, morning: 9.25, day: 13.25, sunset: 17.25, evening: 19.25, night: 23 };
        forcedHour = hours[m[1] as Phase];
      }
      updateLight(app);
      return { phase: app.light.phase, hour: +app.light.hour.toFixed(2), night: +app.light.night.toFixed(2) };
    })();
  },
});

// ---------- снегоуборщик ----------

let plows: PlowModule | null = null;

registerModule({
  name: 'plow',
  attach(app) {
    plows = new PlowModule(app.scene, balls(), snowmen());
    app.scene.modules.plow = plows;
    this.onSettings?.(app);
  },
  onSettings(app) {
    if (!plows) return;
    Object.assign(plows.settings, app.settings.plow);
    // в тестах не про снегоуборщик он не должен приезжать и разглаживать снег
    if (calm || (app.info.scenario && !app.info.scenario.startsWith('plow'))) plows.settings.enabled = false;
    // ручное управление — только пока выбран инструмент «Рулить»
    if (!(app.ui.interactive && app.ui.tool === 'drive')) plows.releaseManual();
  },
  onCommand(c, app) {
    if (!plows) return;
    if (c.type === 'drive' && app.info.hasDock) plows.drive(c.key);
  },
  frame(app) {
    if (!plows) return;
    if (app.ui.interactive && app.ui.tool === 'drive' && app.info.hasDock && !plows.plows.some((p) => p.manual)) plows.spawn(1, true);
    if (!(app.ui.interactive && app.ui.tool === 'drive')) plows.releaseManual();
  },
  draw(ctx, layer, app) {
    if (!plows) return;
    if (layer === 'back') for (const p of plows.plows) if (p.lane >= 0.5) drawPlow(ctx, p, app.now);
    if (layer === 'front') for (const p of plows.plows) if (p.lane < 0.5) drawPlow(ctx, p, app.now);
    if (layer === 'glow') for (const p of plows.plows) drawPlowLights(ctx, p, app.now, app.light.night);
  },
  scenario(name, app) {
    if (name !== 'plow' && name !== 'plow-night') return null;
    return (async () => {
      const sc = app.scene;
      sc.fastForward(60 * 15);
      if (name === 'plow-night') forcedHour = 23;
      updateLight(app);
      plows!.settings.speed = 90;
      const p = plows!.spawn(1);
      for (let k = 0; k < 60 * 6; k++) sc.step();
      return { ...plows!.testInfo(), x: Math.round(p.x) };
    })();
  },
});

// ---------- декор ----------

let decor: DecorModule | null = null;

function decorAt(x: number, y: number, app: App): DecorItem | null {
  if (!decor) return null;
  for (let i = decor.items.length - 1; i >= 0; i--) {
    const it = decor.items[i];
    if (!decor.visible(it)) continue;
    const [w, h] = decor.dims(it);
    if (Math.abs(x - it.x) < w / 2 && y > app.H - h && y < app.H) return it;
  }
  return null;
}

registerModule({
  name: 'decor',
  attach(app) {
    decor = new DecorModule(app.scene, balls());
    app.scene.modules.decor = decor;
    this.onSettings?.(app);
  },
  onSettings(app) {
    if (!decor) return;
    Object.assign(decor.flags, app.settings.decor);
    // в тестах снега/шаров/снеговиков декор не мешает (у него свои проверки)
    const sc = app.info.scenario ?? '';
    if (calm || (sc && !/^(decor|day|plow)/.test(sc))) decor.flags.enabled = false;
  },
  frame(app) {
    if (decor) decor.smokeAmount = 0.3 + app.light.night * 0.7;
  },
  draw(ctx, layer, app) {
    if (!decor) return;
    const H = app.H;
    const L = app.light;
    const lampLight = Math.max(L.windowLight, L.night);
    if (layer === 'back') {
      drawGarland(ctx, decor, app.now, L.garland, false);
      for (const it of decor.items) {
        if (!decor.visible(it)) continue;
        const [w, h] = decor.dims(it);
        if (it.kind === 'house') drawHouse(ctx, it, w, h, H, L.windowLight);
        else if (it.kind === 'tree') drawTree(ctx, it, w, h, H, app.now, app.scene.wind.value);
        else if (it.kind === 'lantern') drawLantern(ctx, it, w, h, H, lampLight);
        else drawFence(ctx, it, w, h, H);
      }
    } else if (layer === 'glow') {
      for (const it of decor.items) {
        if (!decor.visible(it)) continue;
        const [w, h] = decor.dims(it);
        if (it.kind === 'house') drawHouseGlow(ctx, it, w, h, H, L.windowLight);
        else if (it.kind === 'lantern') drawLanternGlow(ctx, it, w, h, H, lampLight);
      }
      drawGarland(ctx, decor, app.now, L.garland, true);
    }
  },
  hit(x, y, app) {
    // декор двигается только «рукой» в режиме инструментов — в пассивном режиме не мешает кликам
    if (!app.ui.interactive || app.ui.tool !== 'hand') return null;
    const it = decorAt(x, y, app);
    if (!it) return null;
    let ox = 0;
    const h: Hit = {
      kind: 'decor',
      priority: 8,
      cursor: 'ew-resize',
      dragStart(p) {
        app.pushHistory();
        ox = it.x - p.x;
      },
      drag(p) {
        it.x = Math.max(10, Math.min(app.W - 10, p.x + ox));
      },
      rightClick() {
        if (it.user && decor) {
          app.pushHistory();
          decor.items = decor.items.filter((d) => d !== it);
        }
      },
    };
    return h;
  },
  scenario(name, app) {
    if (name !== 'decor' && name !== 'decor-night') return null;
    return (async () => {
      const sc = app.scene;
      forcedHour = name === 'decor-night' ? 21 : 12.5;
      updateLight(app);
      sc.fastForward(60 * 20);
      return decor!.testInfo();
    })();
  },
});

registerTool('tree', {
  down(h, p) {
    if (!decor) return;
    h.pushHistory();
    if (!decor.addTree(p.x)) h.toast('max 20');
    h.sfx('puff', 0.3);
  },
});

export function decorModule(): DecorModule | null {
  return decor;
}
