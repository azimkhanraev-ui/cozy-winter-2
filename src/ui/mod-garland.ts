// Гирлянда вдоль верхнего края экрана (рисуется на холсте неба ~10 раз/с — почти бесплатно для CPU).
import { registerModule } from './app';
import { drawTopGarland } from '../render/topGarland';

registerModule({
  name: 'topGarland',
  draw(ctx, layer, app) {
    if (layer !== 'sky') return;
    const s = app.settings.topGarland;
    if (!s.enabled) return;
    drawTopGarland(ctx, app.W, app.now, {
      style: s.style,
      mode: s.mode,
      brightness: s.brightness / 100,
      night: app.light.night,
      wind: app.scene.wind.value,
    });
  },
});
