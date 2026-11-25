// Запуск и чтение PowerShell-помощника (static/winhelper.ps1): полноэкранные приложения и прямоугольники окон.
// Любая ошибка помощника не роняет приложение: функции просто отключаются.
import { spawn, execFile, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HelperWindow {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Видимые отрезки верхней кромки (физические пиксели экрана). */
  top: [number, number][];
}

export interface HelperState {
  fullscreen: boolean;
  quns: number;
  windows: HelperWindow[];
}

/** Меняется при изменении C#-кода помощника (сбрасывает кэш сборки). */
const HELPER_VERSION = 2;
const DEBUG = process.argv.includes('--helper-check') || process.argv.includes('--verbose');

export class WinHelper {
  onState: (s: HelperState) => void = () => {};
  private proc: ChildProcess | null = null;
  private buf = '';
  private restarts = 0;
  private wanted = false;
  private t0 = 0;
  /** Последнее состояние (для тестов/отладки). */
  last: HelperState | null = null;

  /** cacheDir — куда положить скомпилированную сборку помощника (папка профиля). */
  constructor(private cacheDir = '', private script = path.join(__dirname, '..', 'static', 'winhelper.ps1')) {}

  private starting = false;

  /**
   * Собрать маленький helper.exe встроенным в Windows компилятором C# (один раз, ~1 с).
   * PowerShell на некоторых машинах стартует 10–20 с, а exe — мгновенно. null — компилятора нет.
   */
  private ensureExe(): Promise<string | null> {
    const unpacked = (p: string) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    const src = unpacked(this.script.replace(/\.ps1$/, '.cs'));
    if (!this.cacheDir || !fs.existsSync(src)) return Promise.resolve(null);
    const exe = path.join(this.cacheDir, `cozywin-helper-${HELPER_VERSION}.exe`);
    if (fs.existsSync(exe)) return Promise.resolve(exe);
    const win = process.env.WINDIR || 'C:\\Windows';
    const csc = [path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), path.join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')].find((p) => fs.existsSync(p));
    if (!csc) return Promise.resolve(null);
    return new Promise((resolve) => {
      execFile(csc, ['-nologo', '-target:exe', '-optimize+', `-out:${exe}`, src], { windowsHide: true, timeout: 60000 }, (err) => {
        if (err || !fs.existsSync(exe)) {
          console.warn('[winhelper] csc не собрал помощник, будет PowerShell:', err?.message?.slice(0, 200));
          resolve(null);
        } else resolve(exe);
      });
    });
  }

  start(): void {
    this.wanted = true;
    if (this.proc || this.starting || process.platform !== 'win32') return;
    this.starting = true;
    void this.ensureExe().then((exe) => {
      this.starting = false;
      if (this.wanted && !this.proc) this.launch(exe);
    });
  }

  private launch(exe: string | null): void {
    try {
      if (exe) {
        this.proc = spawn(exe, ['-ParentPid', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } else {
        // запасной путь: тот же код через PowerShell (медленный старт).
        // В установленной версии static/ лежит внутри app.asar — PowerShell не прочитает его оттуда.
        const script = this.script.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
        const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ParentPid', String(process.pid)];
        if (this.cacheDir) args.push('-Cache', path.join(this.cacheDir, `cozywin-helper-${HELPER_VERSION}.dll`));
        this.proc = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      }
    } catch (e) {
      console.warn('[winhelper] не запустился:', e);
      this.proc = null;
      return;
    }
    this.t0 = Date.now();
    if (DEBUG) console.log(`[winhelper] запущен pid=${this.proc.pid} через ${exe ? 'exe' : 'PowerShell'}`);
    this.proc.on('error', (e) => console.warn('[winhelper] ошибка запуска:', e));
    this.proc.stdout?.setEncoding('utf8');
    this.proc.stdout?.on('data', (d: string) => this.onData(d));
    this.proc.stderr?.on('data', (d) => console.warn('[winhelper] stderr:', String(d).slice(0, 300)));
    this.proc.on('exit', (code) => {
      this.proc = null;
      if (this.wanted && this.restarts < 3) {
        this.restarts++;
        console.warn(`[winhelper] завершился (${code}), перезапуск ${this.restarts}/3`);
        setTimeout(() => this.wanted && this.start(), 2000 * this.restarts);
      }
    });
  }

  stop(): void {
    this.wanted = false;
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  private onData(d: string): void {
    if (DEBUG && !this.last) console.log(`[winhelper] +${Date.now() - this.t0}ms данные: ${d.slice(0, 120).trim()}`);
    this.buf += d;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try {
        const j = JSON.parse(line);
        if (j.error) {
          console.warn('[winhelper]', j.error);
          continue;
        }
        if (!Array.isArray(j.windows)) continue;
        this.restarts = 0;
        this.last = j as HelperState;
        this.onState(this.last);
      } catch {
        /* неполная строка — пропускаем */
      }
    }
  }
}
