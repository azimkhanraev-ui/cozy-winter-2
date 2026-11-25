// Снег убирается рукой без всяких инструментов: курсор над сугробом становится рукой,
// зажать и тянуть — снег сгребается в сторону (как лопатой, объём сохраняется).
// В режиме инструментов работает только с «Рукой» — остальные инструменты главнее.
import { registerModule, App, Hit } from './app';
import type { PointerInfo } from './tools';

function sweepRadius(app: App): number {
  return Math.max(16, app.settings.tools.size * 0.4);
}

/** Курсор над снегом: внутри сугроба (или у самой его поверхности), и снега там хотя бы 1.5 px. */
export function overSnow(app: App, x: number, y: number): boolean {
  const f = app.scene.field;
  if (x < 0 || x > app.W) return false;
  if (y < app.scene.surfaceY(x) - 4) return false;
  return f.snow[f.col(x)] >= 1.5;
}

registerModule({
  name: 'handSweep',
  hit(x, y, app) {
    if (!app.settings.tools.handSweep) return null;
    if (app.ui.interactive && app.ui.tool !== 'hand') return null;
    if (!overSnow(app, x, y)) return null;
    let last: PointerInfo | null = null;
    const h: Hit = {
      kind: 'snow',
      priority: 20, // шары, снеговики и декор — важнее
      cursor: 'grab',
      dragStart(p) {
        app.pushHistory();
        app.scene.beginShovel(p.x);
        last = { ...p };
        document.body.style.cursor = 'grabbing';
      },
      drag(p) {
        if (!last) return;
        app.scene.shovelStroke(last.x, last.y, p.x, p.y, sweepRadius(app));
        last = { ...p };
      },
      dragEnd() {
        app.scene.endShovel();
        last = null;
        document.body.style.cursor = '';
      },
    };
    return h;
  },
});
