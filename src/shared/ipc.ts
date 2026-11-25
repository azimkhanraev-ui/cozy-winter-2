// Общие типы IPC между main и рендерерами.
import type { Settings, ToolId } from './settings';

export interface InitInfo {
  settings: Settings;
  windowed: boolean;
  /** Тестовый сценарий (npm run selftest / --scenario=...). */
  scenario: string | null;
  displayIndex: number;
  /** На этом окне показывается док (основной монитор или отладочное окно). */
  hasDock: boolean;
  debug: boolean;
  seed: number;
  /** Экспериментальные флаги рендера (из командной строки). */
  exp: string[];
  ui: UiState;
  /** Сохранённая сцена этого монитора (или null). */
  savedScene: unknown;
  /** Ключ для сохранения сцены. */
  sceneKey: string;
}

/** Глобальное состояние интерфейса (общее для всех мониторов). */
export interface UiState {
  /** Интерактивный режим: весь экран ловит мышь, работает инструмент. */
  interactive: boolean;
  tool: ToolId;
  /** «Зима за минуту» активна до этого времени (Date.now()), 0 — выкл. */
  winterUntil: number;
  /** Автопауза (полноэкранное приложение). */
  autoPaused: boolean;
  /** Режим экономии сейчас активен (30 FPS, меньше хлопьев). */
  economy: boolean;
}

export interface WinRect {
  id: string;
  /** Координаты в CSS-пикселях окна сцены. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Видимые (не перекрытые) отрезки верхней кромки: [x0, x1] в координатах сцены. */
  top: [number, number][];
}

export type Command =
  | { type: 'dustNow' }
  | { type: 'clearSnow' }
  | { type: 'clearSnowInstant' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'shake' }
  | { type: 'digit'; key: string }
  | { type: 'drive'; key: 'left' | 'right' | 'up' | 'down' | 'horn' }
  | { type: 'saveNow' }
  | { type: 'toast'; text: string }
  | { type: 'resetScene' };

export interface CozyApi {
  init(): Promise<InitInfo>;
  onSettings(cb: (s: Settings) => void): void;
  onCommand(cb: (c: Command) => void): void;
  onUi(cb: (u: UiState) => void): void;
  onWindows(cb: (rects: WinRect[]) => void): void;
  patchSettings(patch: unknown): void;
  /** Захват мыши в пассивном режиме (курсор над шаром/снеговиком/доком). */
  setMouseCapture(capture: boolean): void;
  scenarioDone(name: string, info: unknown): void;
  /** Команда всем окнам сцены (через main). */
  command(c: Command): void;
  ui(patch: Partial<UiState>): void;
  /** Сообщить main, что это окно записало шаг истории (для маршрутизации Undo/Redo). */
  historyPushed(): void;
  openSettings(): void;
  screenshot(): void;
  saveScene(key: string, data: unknown): void;
  exportSettings(): void;
  importSettings(): void;
  hotkeyStatus(): Promise<Record<string, boolean>>;
  /** Для тестов: прямоугольники элементов дока (имя → x,y,w,h). */
  reportRects(rects: Record<string, [number, number, number, number]>): void;
}
