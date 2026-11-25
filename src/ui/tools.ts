// Реестр инструментов: каждый инструмент — обработчики нажатия/движения/отпускания мыши.
// Этапы добавляют свои инструменты через registerTool (шары, катание, шаги, бой…).
import type { Scene } from '../sim/scene';
import type { Settings, ToolId } from '../shared/settings';

export interface PointerInfo {
  x: number;
  y: number;
  /** Скорость курсора, px/s (сглаженная). */
  vx: number;
  vy: number;
  button: number;
}

export interface ToolHost {
  scene: Scene;
  settings(): Settings;
  /** Запомнить состояние для Undo (вызывать один раз в начале действия). */
  pushHistory(): void;
  /** Звук/эффект. */
  sfx(name: string, power?: number): void;
  toast(text: string): void;
}

export interface ToolHandler {
  /** Иконка/курсор берутся по id инструмента. Кисть — рисовать кольцо размера. */
  brush?: boolean;
  down?(h: ToolHost, p: PointerInfo): void;
  move?(h: ToolHost, p: PointerInfo, prev: PointerInfo): void;
  up?(h: ToolHost, p: PointerInfo): void;
  /** Вызывается каждый кадр, пока кнопка зажата. */
  hold?(h: ToolHost, p: PointerInfo, dt: number): void;
  /** Предпросмотр (рисуется поверх сцены, например «резинка» рогатки). */
  overlay?(ctx: CanvasRenderingContext2D, p: PointerInfo | null, pressed: boolean): void;
}

export const toolRegistry: Partial<Record<ToolId, ToolHandler>> = {};
export function registerTool(id: ToolId, h: ToolHandler): void {
  toolRegistry[id] = h;
}

export function brushSize(s: Settings): number {
  return s.tools.size / 2; // в настройках — диаметр, в инструментах — радиус
}
const soft = (s: Settings) => s.tools.softness / 100;
const strength = (s: Settings) => s.tools.strength / 100;

// ---------- этап 3: уборка снега ----------

registerTool('shovel', {
  brush: true,
  down(h, p) {
    h.pushHistory();
    h.scene.beginShovel(p.x);
  },
  move(h, p, prev) {
    h.scene.shovelStroke(prev.x, prev.y, p.x, p.y, Math.max(12, brushSize(h.settings()) * 0.8));
  },
  up(h) {
    h.scene.endShovel();
  },
});

registerTool('eraser', {
  brush: true,
  down(h, p) {
    h.pushHistory();
    h.scene.eraseStroke(p.x, p.y, p.x, p.y, brushSize(h.settings()), soft(h.settings()));
  },
  move(h, p, prev) {
    h.scene.eraseStroke(prev.x, prev.y, p.x, p.y, brushSize(h.settings()), soft(h.settings()));
  },
});

function continuous(kind: 'blower' | 'heat' | 'add'): ToolHandler {
  const set = (h: ToolHost, p: PointerInfo) => {
    const s = h.settings();
    const sp = Math.hypot(p.vx, p.vy);
    const prev = h.scene.activeTool;
    // направление струи — по движению мыши; если мышь стоит, сохраняем последнее (или по ветру)
    let dx = prev?.dirX ?? (h.scene.wind.value >= 0 ? 1 : -1);
    let dy = prev?.dirY ?? 0;
    if (sp > 30) {
      dx = p.vx / sp;
      dy = p.vy / sp;
    }
    h.scene.activeTool = { kind, x: p.x, y: p.y, R: brushSize(s), softness: soft(s), strength: strength(s), dirX: dx, dirY: dy };
  };
  return {
    brush: true,
    down(h, p) {
      h.pushHistory();
      set(h, p);
    },
    move(h, p) {
      set(h, p);
    },
    up(h) {
      h.scene.activeTool = null;
    },
  };
}
registerTool('blower', continuous('blower'));
registerTool('heat', continuous('heat'));
registerTool('add', continuous('add'));
