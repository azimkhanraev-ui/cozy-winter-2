// Док: плавающая панель внизу по центру. Перетаскивается, автоскрывается в «снежинку».
import type { Settings, ToolId } from '../shared/settings';
import type { UiState, CozyApi } from '../shared/ipc';
import { t, Key, Lang } from '../shared/i18n';
import { iconURL, IconId } from '../render/icons';

export const BALL_PRESETS: Record<'ballS' | 'ballM' | 'ballL' | 'ballXL', number> = { ballS: 14, ballM: 26, ballL: 42, ballXL: 60 };

interface Item {
  id: string;
  icon: IconId;
  label: Key;
  key?: string;
  tool?: ToolId;
  ball?: keyof typeof BALL_PRESETS;
  action?: () => void;
}

export interface DockHost {
  api: CozyApi;
  settings(): Settings;
  ui(): UiState;
  /** Команда этому окну и остальным (через main). */
  command(type: 'clearSnow' | 'dustNow' | 'shake' | 'undo' | 'redo'): void;
  toggleWinterMinute(): void;
}

export class Dock {
  readonly root = document.createElement('div');
  private panel = document.createElement('div');
  private tab = document.createElement('button');
  private tip = document.createElement('div');
  private sizeInput = document.createElement('input');
  private sizeVal = document.createElement('span');
  private buttons = new Map<string, HTMLButtonElement>();
  private open = false;
  private lastNear = 0;
  private dragging: { x0: number; y0: number; ox: number; oy: number } | null = null;
  private lang: Lang = 'ru';

  constructor(private host: DockHost) {
    this.root.id = 'dock-root';
    this.panel.className = 'dock';
    this.tab.className = 'dock-tab';
    this.tab.innerHTML = `<img src="${iconURL('flake', 26)}" alt="">`;
    this.tab.onclick = () => this.setOpen(true);
    this.tip.className = 'dock-tip';
    this.root.append(this.panel, this.tab, this.tip);
    document.body.appendChild(this.root);
    this.build();
    window.addEventListener('mousemove', (e) => this.onMove(e), true);
    window.addEventListener('mouseup', () => this.endDrag(), true);
  }

  private items(): (Item | '|' | 'size')[] {
    const h = this.host;
    return [
      { id: 'grip', icon: 'grip', label: 'hand' },
      '|',
      { id: 'tool-hand', icon: 'hand', label: 'hand', key: '0', tool: 'hand' },
      { id: 'tool-shovel', icon: 'shovel', label: 'shovel', key: '5', tool: 'shovel' },
      { id: 'tool-eraser', icon: 'eraser', label: 'eraser', key: '6', tool: 'eraser' },
      { id: 'tool-blower', icon: 'blower', label: 'blower', key: '7', tool: 'blower' },
      { id: 'tool-heat', icon: 'heat', label: 'heat', key: '8', tool: 'heat' },
      { id: 'tool-add', icon: 'add', label: 'add', key: '9', tool: 'add' },
      '|',
      { id: 'tool-ballS', icon: 'ballS', label: 'ballS', key: '1', tool: 'ball', ball: 'ballS' },
      { id: 'tool-ballM', icon: 'ballM', label: 'ballM', key: '2', tool: 'ball', ball: 'ballM' },
      { id: 'tool-ballL', icon: 'ballL', label: 'ballL', key: '3', tool: 'ball', ball: 'ballL' },
      { id: 'tool-ballXL', icon: 'ballXL', label: 'ballXL', key: '4', tool: 'ball', ball: 'ballXL' },
      { id: 'tool-roll', icon: 'roll', label: 'roll', key: 'R', tool: 'roll' },
      '|',
      { id: 'tool-steps', icon: 'steps', label: 'steps', key: 'F', tool: 'steps' },
      { id: 'tool-angel', icon: 'angel', label: 'angel', key: 'N', tool: 'angel' },
      { id: 'tool-tree', icon: 'tree', label: 'tree', key: 'T', tool: 'tree' },
      { id: 'tool-throw', icon: 'throw', label: 'throw', key: 'B', tool: 'throw' },
      { id: 'tool-drive', icon: 'drive', label: 'drive', key: 'D', tool: 'drive' },
      '|',
      'size',
      '|',
      { id: 'undo', icon: 'undo', label: 'undo', action: () => h.command('undo') },
      { id: 'redo', icon: 'redo', label: 'redo', action: () => h.command('redo') },
      { id: 'clear', icon: 'clear', label: 'clear', key: h.settings().hotkeys.clear, action: () => h.command('clearSnow') },
      { id: 'dust', icon: 'dust', label: 'dust', action: () => h.command('dustNow') },
      { id: 'shake', icon: 'shake', label: 'shake', key: h.settings().hotkeys.shake, action: () => h.command('shake') },
      { id: 'winter', icon: 'winterMinute', label: 'winterMinute', action: () => h.toggleWinterMinute() },
      '|',
      { id: 'pause', icon: 'pause', label: 'pause', key: h.settings().hotkeys.pause, action: () => h.api.patchSettings({ paused: !h.settings().paused }) },
      { id: 'camera', icon: 'camera', label: 'camera', action: () => h.api.screenshot() },
      { id: 'gear', icon: 'gear', label: 'settings', action: () => h.api.openSettings() },
      { id: 'close', icon: 'close', label: 'close', key: 'Esc', action: () => this.close() },
    ];
  }

  private build(): void {
    this.panel.innerHTML = '';
    this.buttons.clear();
    this.lang = this.host.settings().lang;
    for (const it of this.items()) {
      if (it === '|') {
        const s = document.createElement('div');
        s.className = 'sep';
        this.panel.appendChild(s);
        continue;
      }
      if (it === 'size') {
        const w = document.createElement('div');
        w.className = 'size';
        w.dataset.tip = t(this.lang, 'size');
        this.sizeInput.type = 'range';
        this.sizeInput.oninput = () => this.onSize();
        w.append(this.sizeInput, this.sizeVal);
        this.panel.appendChild(w);
        this.buttons.set('size', w as unknown as HTMLButtonElement);
        continue;
      }
      const b = document.createElement('button');
      b.className = it.id === 'grip' ? 'grip' : 'btn';
      b.innerHTML = `<img src="${iconURL(it.icon, 26)}" alt="">`;
      b.dataset.tip = it.id === 'grip' ? '' : t(this.lang, it.label) + (it.key ? `   [${it.key}]` : '');
      if (it.id === 'grip') b.onmousedown = (e) => this.startDrag(e);
      else
        b.onclick = () => {
          if (it.tool) {
            if (it.ball) this.host.api.patchSettings({ tools: { ballSize: BALL_PRESETS[it.ball] } });
            this.host.api.ui({ interactive: true, tool: it.tool });
          } else it.action?.();
        };
      b.onmouseenter = () => this.showTip(b);
      b.onmouseleave = () => (this.tip.style.opacity = '0');
      this.panel.appendChild(b);
      this.buttons.set(it.id, b);
    }
    this.update();
  }

  private showTip(b: HTMLElement): void {
    const txt = b.dataset.tip;
    if (!txt) return;
    this.tip.textContent = txt;
    const r = b.getBoundingClientRect();
    this.tip.style.opacity = '1';
    const tw = this.tip.offsetWidth;
    this.tip.style.left = `${Math.max(4, Math.min(window.innerWidth - tw - 4, r.left + r.width / 2 - tw / 2))}px`;
    this.tip.style.top = `${r.top - 34}px`;
  }

  private onSize(): void {
    const s = this.host.settings();
    const v = Number(this.sizeInput.value);
    if (this.host.ui().tool === 'ball') this.host.api.patchSettings({ tools: { ballSize: v } });
    else this.host.api.patchSettings({ tools: { size: v } });
    this.sizeVal.textContent = String(v);
    void s;
  }

  /** Обновить подсветку инструмента, ползунок и видимость. */
  update(): void {
    const s = this.host.settings();
    const u = this.host.ui();
    if (s.lang !== this.lang) return this.build();
    for (const [id, b] of this.buttons) {
      if (!id.startsWith('tool-')) continue;
      const tool = id.slice(5);
      let active = u.interactive && u.tool === tool;
      if (tool.startsWith('ball')) active = u.interactive && u.tool === 'ball' && BALL_PRESETS[tool as keyof typeof BALL_PRESETS] === s.tools.ballSize;
      b.classList.toggle('active', active);
    }
    const ballTool = u.tool === 'ball';
    this.sizeInput.min = ballTool ? '8' : '10';
    this.sizeInput.max = ballTool ? '90' : '200';
    const v = ballTool ? s.tools.ballSize : s.tools.size;
    if (document.activeElement !== this.sizeInput) this.sizeInput.value = String(v);
    this.sizeVal.textContent = String(v);
    const pause = this.buttons.get('pause');
    if (pause) {
      pause.innerHTML = `<img src="${iconURL(s.paused ? 'play' : 'pause', 26)}" alt="">`;
      pause.dataset.tip = t(this.lang, s.paused ? 'resume' : 'pause') + `   [${s.hotkeys.pause}]`;
    }
    this.buttons.get('winter')?.classList.toggle('active', u.winterUntil > Date.now());
    if (u.interactive) this.setOpen(true);
    this.place();
  }

  private place(): void {
    const s = this.host.settings();
    const vis = this.open || !s.dock.autohide;
    this.panel.classList.toggle('hidden', !vis);
    this.tab.classList.toggle('hidden', vis);
    const pw = this.panel.offsetWidth || 900;
    const cx = window.innerWidth / 2 + s.dock.x;
    const left = Math.max(4, Math.min(window.innerWidth - pw - 4, cx - pw / 2));
    // док висит над сугробами (не закрывает снег на панели задач); dock.y — смещение перетаскиванием
    const above = Math.min(window.innerHeight * 0.35, s.drift.maxHeight * 1.15 + 34);
    const bottom = Math.max(4, Math.round(above - s.dock.y));
    this.panel.style.left = `${left}px`;
    this.panel.style.bottom = `${bottom}px`;
    this.tab.style.left = `${Math.max(4, Math.min(window.innerWidth - 48, cx - 22))}px`;
    this.tab.style.bottom = `${bottom}px`;
  }

  setOpen(v: boolean): void {
    if (this.open === v) return;
    this.open = v;
    this.lastNear = performance.now();
    this.place();
  }

  get isOpen(): boolean {
    return this.open || !this.host.settings().dock.autohide;
  }

  close(): void {
    this.host.api.ui({ interactive: false });
    this.setOpen(false);
  }

  /** Точка над доком/вкладкой (для захвата мыши в пассивном режиме). */
  contains(x: number, y: number): boolean {
    const els = [this.isOpen ? this.panel : this.tab];
    if (this.tip.style.opacity === '1') els.push(this.tip);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return true;
    }
    return false;
  }

  private onMove(e: MouseEvent): void {
    if (this.dragging) {
      const d = this.dragging;
      this.host.api.patchSettings({ dock: { x: Math.round(d.ox + e.clientX - d.x0), y: Math.min(0, Math.round(d.oy + e.clientY - d.y0)) } });
      return;
    }
    if (this.contains(e.clientX, e.clientY)) this.lastNear = performance.now();
  }

  /** Автоскрытие: вызывается каждый кадр. */
  tick(now: number): void {
    const s = this.host.settings();
    if (this.open && s.dock.autohide && !this.host.ui().interactive && !this.dragging && now - this.lastNear > 2500) this.setOpen(false);
  }

  private startDrag(e: MouseEvent): void {
    e.preventDefault();
    const s = this.host.settings();
    this.dragging = { x0: e.clientX, y0: e.clientY, ox: s.dock.x, oy: s.dock.y };
  }
  private endDrag(): void {
    this.dragging = null;
  }

  /** Прямоугольники кнопок (для тестов ввода). */
  rects(): Record<string, [number, number, number, number]> {
    const out: Record<string, [number, number, number, number]> = {};
    const add = (k: string, el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) out[k] = [r.left, r.top, r.width, r.height];
    };
    add('tab', this.tab);
    for (const [k, b] of this.buttons) add(k, b);
    return out;
  }
}
