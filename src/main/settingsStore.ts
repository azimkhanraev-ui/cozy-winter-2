// Хранение настроек в JSON (%APPDATA%/CozyWinter2/settings.json) с защитой от повреждения.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Settings, parseSettingsText, mergeSettings } from '../shared/settings';

export class SettingsStore {
  readonly file: string;
  settings: Settings;
  private timer: NodeJS.Timeout | null = null;
  /** Был ли файл повреждён при загрузке (для лога/уведомления). */
  recoveredFromCorrupt = false;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'settings.json');
    this.settings = this.load();
  }

  private read(file: string): string | null {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  }

  private load(): Settings {
    const main = parseSettingsText(this.read(this.file));
    if (!main.corrupt) return main.settings;
    // Повреждён: сохраняем копию для разбора, пробуем резервную копию, иначе — по умолчанию.
    this.recoveredFromCorrupt = true;
    try {
      fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
    } catch {
      /* ignore */
    }
    const bak = parseSettingsText(this.read(this.file + '.bak'));
    const s = bak.corrupt ? main.settings : bak.settings;
    this.writeNow(s);
    return s;
  }

  update(patch: unknown): Settings {
    this.settings = mergeSettings(this.settings, patch);
    this.scheduleSave();
    return this.settings;
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.writeNow(this.settings);
  }

  /** Атомарная запись: tmp → rename; предыдущая версия → .bak */
  private writeNow(s: Settings): void {
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
      if (fs.existsSync(this.file)) {
        try {
          fs.copyFileSync(this.file, this.file + '.bak');
        } catch {
          /* ignore */
        }
      }
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('[settings] не удалось сохранить:', e);
    }
  }
}
