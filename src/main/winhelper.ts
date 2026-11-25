// Запуск и чтение PowerShell-помощника (static/winhelper.ps1): полноэкранные приложения и прямоугольники окон.
// Любая ошибка помощника не роняет приложение: функции просто отключаются.
import { spawn, ChildProcess } from 'node:child_process';
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

export class WinHelper {
  onState: (s: HelperState) => void = () => {};
  private proc: ChildProcess | null = null;
  private buf = '';
  private restarts = 0;
  private wanted = false;
  /** Последнее состояние (для тестов/отладки). */
  last: HelperState | null = null;

  constructor(private script = path.join(__dirname, '..', 'static', 'winhelper.ps1')) {}

  start(): void {
    this.wanted = true;
    if (this.proc || process.platform !== 'win32') return;
    try {
      // В установленной версии static/ лежит внутри app.asar — PowerShell не прочитает его оттуда.
      const script = this.script.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ParentPid', String(process.pid)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      console.warn('[winhelper] не запустился:', e);
      this.proc = null;
      return;
    }
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
