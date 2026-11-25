// Инструменты уборки снега. Чистые функции над SnowField.
// Координаты инструментов — экранные (y вниз); H — y земли. Высоты в карте — вверх от земли.
import { SnowField, COL_W } from './terrain';
import { clamp } from './rng';

/** Вес кисти по горизонтальному расстоянию: 1 в ядре, плавно до 0 на краю. */
export function brushWeight(dx: number, R: number, softness: number): number {
  const a = Math.abs(dx);
  if (a >= R) return 0;
  const core = R * (1 - clamp(softness, 0, 1));
  if (a <= core) return 1;
  const t = (a - core) / Math.max(1e-6, R - core);
  return 1 - t * t * (3 - 2 * t);
}

function columnsIn(f: SnowField, cx: number, R: number): [number, number] {
  return [Math.max(0, Math.floor((cx - R) / COL_W)), Math.min(f.n - 1, Math.ceil((cx + R) / COL_W))];
}

/**
 * Срезать снег, попадающий в круг (cx,cy,R): в колонке поверхность опускается до нижней кромки круга.
 * Снег — карта высот, поэтому вырезать «середину» нельзя: всё выше нижней кромки круга убирается.
 * Возвращает убранный объём (px²) и массив снятой высоты по колонкам (для лопаты).
 */
export function cutCircle(f: SnowField, H: number, cx: number, cy: number, R: number, softness = 0, strength = 1): { volume: number; i0: number; removed: Float32Array } {
  const [i0, i1] = columnsIn(f, cx, R);
  const removed = new Float32Array(i1 - i0 + 1);
  let vol = 0;
  for (let i = i0; i <= i1; i++) {
    const dx = i * COL_W - cx;
    if (Math.abs(dx) >= R) continue;
    const w = brushWeight(dx, R, softness) * strength;
    if (w <= 0) continue;
    const half = Math.sqrt(R * R - dx * dx);
    const bottomH = H - (cy + half); // высота нижней кромки круга над землёй
    const top = f.base[i] + f.snow[i];
    if (top <= bottomH) continue;
    const want = (top - Math.max(bottomH, f.base[i])) * Math.min(1, w);
    const take = Math.min(f.snow[i], Math.max(0, want));
    if (take <= 0) continue;
    const fr = f.snow[i] > 0 ? (f.fresh[i] / f.snow[i]) * take : 0;
    f.snow[i] -= take;
    f.fresh[i] = Math.max(0, f.fresh[i] - fr);
    removed[i - i0] = take;
    vol += take * COL_W;
  }
  if (vol > 0) f.revision++;
  return { volume: vol, i0, removed };
}

/** Ластик: просто удаляет снег в круге (мягкий край). */
export function erase(f: SnowField, H: number, cx: number, cy: number, R: number, softness: number): number {
  return cutCircle(f, H, cx, cy, R, softness, 1).volume;
}

/** Положить объём vol (px²) «валиком» с центром в x и полушириной hw (треугольный профиль). */
export function depositRidge(f: SnowField, x: number, hw: number, vol: number): void {
  if (vol <= 0) return;
  const c = clamp(Math.round(x / COL_W), 0, f.n - 1);
  const k = Math.max(1, Math.round(hw / COL_W));
  let wsum = 0;
  for (let d = -k; d <= k; d++) {
    const i = c + d;
    if (i < 0 || i >= f.n) continue;
    wsum += k + 1 - Math.abs(d);
  }
  if (wsum <= 0) return;
  const per = vol / COL_W / wsum;
  for (let d = -k; d <= k; d++) {
    const i = c + d;
    if (i < 0 || i >= f.n) continue;
    const a = per * (k + 1 - Math.abs(d));
    f.snow[i] += a;
    f.fresh[i] += a * 0.3; // отброшенный снег плотнее свежего
  }
  f.revision++;
}

/**
 * Лопата: срезает снег под лопатой и толкает его валиком вперёд по ходу движения;
 * у края экрана — отбрасывает назад. Объём сохраняется точно.
 */
export function shovel(f: SnowField, H: number, cx: number, cy: number, R: number, dir: number, backX?: number): number {
  const { volume } = cutCircle(f, H, cx, cy, R, 0.15, 1);
  if (volume <= 0) return 0;
  const d = dir >= 0 ? 1 : -1;
  const W = (f.n - 1) * COL_W;
  // Часть снега толкается вперёд (валик перед лопатой, в конце хода остаётся сугроб),
  // часть отбрасывается «через плечо» за начало хода — по обе стороны расчищенной полосы.
  // Если сторона упирается в край экрана — весь снег уходит на другую (объём не теряется).
  let front = volume * 0.55;
  let back = volume - front;
  const fx = cx + d * (R + 10);
  const bx = backX ?? cx - d * (R + 10);
  if (fx < 0 || fx > W) {
    back += front;
    front = 0;
  }
  if (bx < 0 || bx > W) {
    front += back;
    back = 0;
  }
  depositRidge(f, clamp(fx, 0, W), 8 + R * 0.25, front);
  depositRidge(f, clamp(bx, 0, W), 10 + R * 0.4, back);
  return volume;
}

/** Насыпать: добавляет свежий снег под кистью (rate — px высоты в секунду). */
export function addSnow(f: SnowField, H: number, cx: number, cy: number, R: number, softness: number, rate: number, dt: number): number {
  const [i0, i1] = columnsIn(f, cx, R);
  let vol = 0;
  for (let i = i0; i <= i1; i++) {
    const w = brushWeight(i * COL_W - cx, R, softness);
    if (w <= 0) continue;
    // насыпаем только до уровня курсора: под кистью вырастает холмик, а не бесконечная колонна
    const top = f.base[i] + f.snow[i];
    const limit = H - cy + R * 0.3;
    if (top >= limit) continue;
    const a = Math.min(limit - top, rate * w * dt);
    f.snow[i] += a;
    f.fresh[i] += a;
    vol += a * COL_W;
  }
  if (vol > 0) f.revision++;
  return vol;
}

/** Тепло: плавно растапливает снег в круге. Возвращает растаявший объём. */
export function melt(f: SnowField, H: number, cx: number, cy: number, R: number, softness: number, rate: number, dt: number): number {
  const [i0, i1] = columnsIn(f, cx, R * 1.2);
  let vol = 0;
  for (let i = i0; i <= i1; i++) {
    const dx = i * COL_W - cx;
    const w = brushWeight(dx, R * 1.2, softness);
    if (w <= 0) continue;
    // тепло слабеет с расстоянием от фена до поверхности
    const top = f.base[i] + f.snow[i];
    const dist = Math.max(0, H - top - cy);
    const fall = 1 / (1 + (dist / (R * 1.5)) ** 2);
    const a = Math.min(f.snow[i], rate * w * fall * dt);
    if (a <= 0) continue;
    f.snow[i] -= a;
    f.fresh[i] = Math.min(f.fresh[i], f.snow[i]);
    vol += a * COL_W;
  }
  if (vol > 0) f.revision++;
  return vol;
}

/** Снегодув: снимает снег в круге со скоростью rate; объём возвращается для частиц. */
export function blow(f: SnowField, H: number, cx: number, cy: number, R: number, softness: number, rate: number, dt: number): { volume: number; perCol: [number, number][] } {
  const [i0, i1] = columnsIn(f, cx, R);
  const perCol: [number, number][] = [];
  let vol = 0;
  for (let i = i0; i <= i1; i++) {
    const dx = i * COL_W - cx;
    const w = brushWeight(dx, R, softness);
    if (w <= 0) continue;
    const half = Math.sqrt(Math.max(0, R * R - dx * dx));
    const top = f.base[i] + f.snow[i];
    if (top < H - (cy + half)) continue; // поверхность ниже струи
    const a = Math.min(f.snow[i], rate * w * dt);
    if (a <= 0) continue;
    f.snow[i] -= a;
    f.fresh[i] = Math.min(f.fresh[i], f.snow[i]);
    vol += a * COL_W;
    perCol.push([i * COL_W, a * COL_W]);
  }
  if (vol > 0) f.revision++;
  return { volume: vol, perCol };
}

/** Вдавленный след: опускает снег на глубину depth в окне halfW и выдавливает его бортиками. Объём сохраняется. */
export function press(f: SnowField, x: number, halfW: number, depth: number): number {
  const [i0, i1] = columnsIn(f, x, halfW);
  let vol = 0;
  for (let i = i0; i <= i1; i++) {
    const dx = i * COL_W - x;
    const w = 1 - (dx / halfW) ** 2;
    if (w <= 0) continue;
    const a = Math.min(f.snow[i] * 0.6, depth * w);
    if (a <= 0) continue;
    f.snow[i] -= a;
    f.fresh[i] = Math.min(f.fresh[i], f.snow[i]);
    vol += a * COL_W;
  }
  depositRidge(f, x - halfW - 3, 3, vol / 2);
  depositRidge(f, x + halfW + 3, 3, vol / 2);
  return vol;
}

// ---------- история (Undo/Redo) ----------

export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  constructor(public limit = 40) {}
  /** Запомнить состояние ПЕРЕД изменением. */
  push(state: T): void {
    this.undoStack.push(state);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  /** current — текущее состояние (уйдёт в redo); вернёт состояние для восстановления. */
  undo(current: T): T | null {
    const s = this.undoStack.pop();
    if (s === undefined) return null;
    this.redoStack.push(current);
    return s;
  }
  redo(current: T): T | null {
    const s = this.redoStack.pop();
    if (s === undefined) return null;
    this.undoStack.push(current);
    return s;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get size(): number {
    return this.undoStack.length;
  }
}
