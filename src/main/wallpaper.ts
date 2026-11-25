// Зимние обои рабочего стола: PNG рисует окно настроек (render/wallpaper.ts), main сохраняет его и ставит
// через маленькую утилиту cozytool.exe (SystemParametersInfo), собранную встроенным в Windows csc.exe.
// Перед первой заменой текущие обои пользователя копируются к нам — чтобы их можно было вернуть
// (картинки «Windows: интересное» система со временем удаляет).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';

const TOOL_VERSION = 1;

export class Wallpaper {
  private dir: string;
  constructor(private userDir: string, private staticDir: string) {
    this.dir = path.join(userDir, 'wallpapers');
  }

  private toolExe(): string | null {
    const exe = path.join(this.userDir, `cozytool-${TOOL_VERSION}.exe`);
    if (fs.existsSync(exe)) return exe;
    const src = path.join(this.staticDir, 'cozytool.cs').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    const win = process.env.WINDIR || 'C:\\Windows';
    const csc = [path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), path.join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')].find((p) => fs.existsSync(p));
    if (!csc || !fs.existsSync(src)) return null;
    try {
      execFileSync(csc, ['-nologo', `-out:${exe}`, src], { windowsHide: true, timeout: 60000, stdio: 'ignore' });
    } catch {
      return null;
    }
    return fs.existsSync(exe) ? exe : null;
  }

  current(): string {
    const exe = this.toolExe();
    if (!exe) return '';
    try {
      return execFileSync(exe, ['wallpaper-get'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
    } catch {
      return '';
    }
  }

  private set(file: string): Promise<boolean> {
    const exe = this.toolExe();
    if (!exe) return Promise.resolve(false);
    return new Promise((resolve) => execFile(exe, ['wallpaper-set', file], { windowsHide: true, timeout: 20000 }, (err, out) => resolve(!err && String(out).includes('ok'))));
  }

  /** Сохранить копию текущих обоев пользователя (один раз). Возвращает путь к копии. */
  backupOriginal(): string {
    fs.mkdirSync(this.dir, { recursive: true });
    const cur = this.current();
    if (!cur || cur.startsWith(this.dir)) return '';
    try {
      const dst = path.join(this.dir, 'original' + (path.extname(cur) || '.jpg'));
      fs.copyFileSync(cur, dst);
      return dst;
    } catch {
      return cur; // не скопировалось — запомним хотя бы путь
    }
  }

  /** Поставить нарисованные обои. Имя файла уникальное: иначе Windows может показать старую картинку из кэша. */
  async apply(scene: string, png: Buffer): Promise<string | null> {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const f of fs.readdirSync(this.dir)) if (f.startsWith('cozy-')) fs.rmSync(path.join(this.dir, f), { force: true });
    const file = path.join(this.dir, `cozy-${scene}-${Date.now()}.png`);
    fs.writeFileSync(file, png);
    return (await this.set(file)) ? file : null;
  }

  async restore(original: string): Promise<boolean> {
    if (!original || !fs.existsSync(original)) return false;
    return this.set(original);
  }
}
