// Общие типы IPC между main и рендерерами.
import type { Settings } from './settings';

export interface InitInfo {
  settings: Settings;
  windowed: boolean;
  /** Тестовый сценарий (npm run selftest / --scenario=...). */
  scenario: string | null;
  displayIndex: number;
  debug: boolean;
  seed: number;
}

export type Command =
  | { type: 'dustNow' }
  | { type: 'clearSnow' }
  | { type: 'pause'; paused: boolean };

export interface CozyApi {
  init(): Promise<InitInfo>;
  onSettings(cb: (s: Settings) => void): void;
  onCommand(cb: (c: Command) => void): void;
  patchSettings(patch: unknown): void;
  setMouseCapture(capture: boolean): void;
  scenarioDone(name: string, info: unknown): void;
  command(c: Command): void;
}
