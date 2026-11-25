// Общий контекст рендерера сцены и интерфейс модулей (шары, снеговики, декор, небо, эффекты…).
import type { Scene } from '../sim/scene';
import type { Settings } from '../shared/settings';
import type { CozyApi, InitInfo, UiState, Command } from '../shared/ipc';
import type { PointerInfo } from './tools';

/** Освещение текущего момента суток (смешанный пресет, значения 0..1). */
export interface Light {
  skyTop: string;
  skyBottom: string;
  skyAlpha: number;
  tint: string;
  tintAlpha: number;
  snowColor: string;
  fog: number;
  windowLight: number;
  garland: number;
  stars: number;
  moon: number;
  sun: number;
  aurora: number;
  /** Час 0..24. */
  hour: number;
  /** «Ночность» 0..1 (для фар, отсветов). */
  night: number;
}

export interface App {
  api: CozyApi;
  info: InitInfo;
  scene: Scene;
  settings: Settings;
  ui: UiState;
  W: number;
  H: number;
  dpr: number;
  /** Время рендерера, с. */
  now: number;
  light: Light;
  /** Последняя позиция курсора (даже в пассивном режиме) или null. */
  cursor: { x: number; y: number } | null;
  pushHistory(): void;
  sfx(name: string, power?: number): void;
  toast(text: string): void;
}

/** Объект под курсором, с которым можно взаимодействовать. */
export interface Hit {
  kind: string;
  /** Чем меньше, тем выше приоритет при перекрытии. */
  priority?: number;
  cursor?: string;
  dragStart?(p: PointerInfo): void;
  drag?(p: PointerInfo): void;
  dragEnd?(p: PointerInfo): void;
  rightClick?(): void;
  dblClick?(): void;
}

export type Layer = 'sky' | 'back' | 'mid' | 'front' | 'glow' | 'glass';

export interface OverlayModule {
  name: string;
  attach?(app: App): void;
  /** back — перед снегом на земле; mid — после него; front — над объектами (до тонирования);
   *  glow — светящееся после тонирования; glass — «стекло» поверх всего. */
  draw?(ctx: CanvasRenderingContext2D, layer: Layer, app: App): void;
  hit?(x: number, y: number, app: App): Hit | null;
  frame?(app: App, dt: number): void;
  onCommand?(c: Command, app: App): void;
  onSettings?(app: App): void;
  /** Вызвать для тестовых сценариев. */
  scenario?(name: string, app: App): Promise<unknown> | null;
}

export const overlayModules: OverlayModule[] = [];
export function registerModule(m: OverlayModule): void {
  overlayModules.push(m);
}
