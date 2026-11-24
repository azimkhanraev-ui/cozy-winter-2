// Перевод пользовательских настроек в параметры симуляции.
import type { Settings } from '../shared/settings';
import type { SceneParams } from '../sim/scene';

export function sceneParamsFrom(s: Settings): SceneParams {
  return {
    windBase: s.snow.wind * 2.2,
    gustiness: s.snow.gusts / 100,
    snowfall: {
      intensity: s.snow.intensity / 100,
      sizeScale: s.snow.flakeSize / 100,
      layers: s.snow.layers,
      types: [s.snow.soft, s.snow.crystal, s.snow.fluffy, s.snow.glitter],
    },
    drift: {
      unevenness: s.drift.unevenness / 100,
      maxHeight: s.drift.maxHeight,
      accumulation: s.drift.accumulation / 100,
      melt: s.drift.melt / 100,
      windTransport: s.drift.windTransport / 100,
      reposeDeg: s.drift.repose,
    },
  };
}
