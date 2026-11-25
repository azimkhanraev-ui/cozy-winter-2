// Иконки инструментов и кнопок, нарисованные кодом (для дока и курсоров).

export type IconId =
  | 'hand' | 'shovel' | 'eraser' | 'blower' | 'heat' | 'add' | 'ballS' | 'ballM' | 'ballL' | 'ballXL' | 'ball'
  | 'roll' | 'steps' | 'angel' | 'tree' | 'throw' | 'drive' | 'undo' | 'redo' | 'clear' | 'dust' | 'pause' | 'play'
  | 'gear' | 'camera' | 'shake' | 'winterMinute' | 'close' | 'flake' | 'grip';

const WHITE = '#f4f8ff';
const ICE = '#9fd0ff';
const DARK = '#22324a';

function ball(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.7, '#e4eefb');
  gr.addColorStop(1, '#a9c2e4');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function flake(g: CanvasRenderingContext2D, x: number, y: number, r: number, w = 1.6) {
  g.save();
  g.translate(x, y);
  g.lineWidth = w;
  g.lineCap = 'round';
  for (let a = 0; a < 6; a++) {
    g.rotate(Math.PI / 3);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -r);
    g.moveTo(0, -r * 0.55);
    g.lineTo(-r * 0.25, -r * 0.8);
    g.moveTo(0, -r * 0.55);
    g.lineTo(r * 0.25, -r * 0.8);
    g.stroke();
  }
  g.restore();
}

/** Нарисовать иконку в квадрат s×s с началом в (0,0). */
export function drawIcon(g: CanvasRenderingContext2D, id: IconId, s: number): void {
  g.save();
  g.scale(s / 32, s / 32);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = WHITE;
  g.fillStyle = WHITE;
  g.lineWidth = 2;
  const P = (pts: number[], close = false) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    if (close) g.closePath();
  };
  switch (id) {
    case 'hand': {
      // варежка
      g.fillStyle = '#d9534f';
      g.beginPath();
      g.moveTo(10, 27);
      g.lineTo(10, 12);
      g.quadraticCurveTo(10, 5, 16, 5);
      g.quadraticCurveTo(23, 5, 23, 12);
      g.lineTo(23, 27);
      g.closePath();
      g.fill();
      g.beginPath();
      g.ellipse(8, 17, 3, 5, -0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = WHITE;
      g.fillRect(9, 24, 15, 5);
      g.fillStyle = '#ffffff88';
      g.fillRect(12, 9, 2, 2);
      g.fillRect(17, 13, 2, 2);
      g.fillRect(13, 17, 2, 2);
      break;
    }
    case 'shovel': {
      g.strokeStyle = '#c8955c';
      g.lineWidth = 3;
      P([24, 4, 15, 17]);
      g.stroke();
      g.strokeStyle = '#c8955c';
      P([21, 3, 27, 6]);
      g.stroke();
      g.fillStyle = ICE;
      g.beginPath();
      g.moveTo(16, 15);
      g.lineTo(6, 22);
      g.quadraticCurveTo(4, 28, 10, 29);
      g.lineTo(19, 22);
      g.closePath();
      g.fill();
      g.fillStyle = WHITE;
      g.beginPath();
      g.ellipse(10, 24, 4, 2.4, -0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'eraser': {
      g.save();
      g.translate(16, 16);
      g.rotate(-0.6);
      g.fillStyle = '#f08ba8';
      g.fillRect(-11, -6, 13, 12);
      g.fillStyle = WHITE;
      g.fillRect(2, -6, 9, 12);
      g.strokeStyle = DARK;
      g.lineWidth = 1;
      g.strokeRect(-11, -6, 22, 12);
      g.restore();
      g.fillStyle = WHITE;
      for (const [x, y] of [[6, 27], [10, 29], [3, 24]]) g.fillRect(x, y, 2, 2);
      break;
    }
    case 'blower': {
      g.fillStyle = '#ff9f43';
      g.beginPath();
      g.roundRect(4, 11, 15, 11, 3);
      g.fill();
      g.fillStyle = '#5f6b7a';
      g.fillRect(9, 21, 5, 7);
      g.fillStyle = '#ffd08a';
      P([19, 13, 27, 11, 27, 22, 19, 20], true);
      g.fill();
      g.strokeStyle = ICE;
      g.lineWidth = 1.6;
      for (const y of [8, 16, 24]) {
        P([28, y, 31, y - 1]);
        g.stroke();
      }
      break;
    }
    case 'heat': {
      g.fillStyle = '#7c5cff';
      g.beginPath();
      g.arc(11, 13, 7, 0, Math.PI * 2);
      g.fill();
      g.fillRect(11, 9, 12, 8);
      g.fillRect(7, 17, 5, 11);
      g.strokeStyle = '#ff7b54';
      g.lineWidth = 1.8;
      for (const y of [9, 13, 17]) {
        g.beginPath();
        g.moveTo(25, y);
        g.quadraticCurveTo(27, y - 2, 29, y);
        g.quadraticCurveTo(31, y + 2, 32, y);
        g.stroke();
      }
      g.fillStyle = WHITE;
      g.beginPath();
      g.arc(11, 13, 2.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'add': {
      // ведёрко со снегом
      g.fillStyle = '#4aa3df';
      P([7, 13, 25, 13, 22, 28, 10, 28], true);
      g.fill();
      g.fillStyle = WHITE;
      g.beginPath();
      g.ellipse(16, 13, 10, 4, 0, Math.PI, 0);
      g.arc(11, 10, 4, 0, Math.PI * 2);
      g.arc(17, 8, 5, 0, Math.PI * 2);
      g.arc(22, 10, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2d6ea0';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(16, 18);
      g.lineTo(16, 24);
      g.moveTo(13, 21);
      g.lineTo(19, 21);
      g.stroke();
      break;
    }
    case 'ball':
    case 'ballS':
    case 'ballM':
    case 'ballL':
    case 'ballXL': {
      const r = id === 'ballS' ? 6 : id === 'ballM' ? 8.5 : id === 'ballL' ? 11 : id === 'ballXL' ? 13.5 : 10;
      ball(g, 16, 30 - r, r);
      if (id !== 'ball') {
        g.fillStyle = DARK;
        g.font = 'bold 9px Segoe UI, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(id.slice(4), 16, 30 - r + 0.5);
      }
      break;
    }
    case 'roll': {
      ball(g, 19, 19, 9);
      g.strokeStyle = ICE;
      g.lineWidth = 1.8;
      for (const [y, l] of [[14, 8], [19, 10], [24, 7]]) {
        P([8 - l * 0.3, y, 8 - l * 0.3 - l * 0.6, y]);
        g.stroke();
      }
      g.strokeStyle = '#7f9cc4';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(19, 19, 5, 0.3, 2.2);
      g.stroke();
      g.fillStyle = WHITE;
      g.fillRect(2, 28, 28, 2);
      break;
    }
    case 'steps': {
      g.fillStyle = ICE;
      for (const [x, y, a] of [[11, 20, -0.25], [21, 11, 0.2]] as const) {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.beginPath();
        g.ellipse(0, -3, 3.6, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(0, 5.5, 2.8, 3, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      break;
    }
    case 'angel': {
      g.fillStyle = ICE;
      g.beginPath();
      g.arc(16, 7, 4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(16, 10);
      g.quadraticCurveTo(4, 8, 3, 16);
      g.quadraticCurveTo(10, 15, 12, 17);
      g.lineTo(9, 29);
      g.lineTo(23, 29);
      g.lineTo(20, 17);
      g.quadraticCurveTo(22, 15, 29, 16);
      g.quadraticCurveTo(28, 8, 16, 10);
      g.fill();
      break;
    }
    case 'tree': {
      g.fillStyle = '#2f8f5b';
      P([16, 3, 24, 13, 20, 13, 27, 22, 5, 22, 12, 13, 8, 13], true);
      g.fill();
      g.fillStyle = '#7a5230';
      g.fillRect(14, 22, 4, 6);
      g.fillStyle = WHITE;
      P([16, 3, 20, 8, 12, 8], true);
      g.fill();
      g.fillRect(9, 13, 6, 2);
      g.fillRect(18, 18, 7, 2);
      break;
    }
    case 'throw': {
      g.strokeStyle = ICE;
      g.setLineDash([2, 3]);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(4, 28);
      g.quadraticCurveTo(12, 2, 24, 10);
      g.stroke();
      g.setLineDash([]);
      ball(g, 24, 11, 6);
      break;
    }
    case 'drive': {
      g.fillStyle = '#f4c430';
      g.beginPath();
      g.roundRect(8, 12, 18, 10, 2);
      g.fill();
      g.fillStyle = '#9fd0ff';
      g.fillRect(17, 6, 7, 7);
      g.strokeStyle = '#f4c430';
      g.lineWidth = 2;
      g.strokeRect(17, 6, 7, 7);
      g.fillStyle = '#2b2f36';
      g.beginPath();
      g.roundRect(8, 21, 18, 7, 3.5);
      g.fill();
      g.fillStyle = '#9aa5b5';
      P([3, 13, 8, 13, 8, 27, 2, 27], true);
      g.fill();
      g.fillStyle = '#ff8c1a';
      g.fillRect(20, 3, 3, 3);
      break;
    }
    case 'undo':
    case 'redo': {
      g.save();
      if (id === 'redo') {
        g.translate(32, 0);
        g.scale(-1, 1);
      }
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(9, 13);
      g.lineTo(20, 13);
      g.quadraticCurveTo(27, 13, 27, 20);
      g.quadraticCurveTo(27, 27, 20, 27);
      g.lineTo(13, 27);
      g.stroke();
      P([13, 7, 7, 13, 13, 19]);
      g.stroke();
      g.restore();
      break;
    }
    case 'clear': {
      // порыв ветра
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(3, 12);
      g.lineTo(20, 12);
      g.quadraticCurveTo(26, 12, 26, 7);
      g.quadraticCurveTo(26, 3, 22, 4);
      g.moveTo(3, 18);
      g.lineTo(26, 18);
      g.moveTo(3, 24);
      g.lineTo(17, 24);
      g.quadraticCurveTo(22, 24, 22, 28);
      g.stroke();
      break;
    }
    case 'dust': {
      g.fillStyle = WHITE;
      g.beginPath();
      g.arc(11, 13, 5, 0, Math.PI * 2);
      g.arc(17, 10, 6, 0, Math.PI * 2);
      g.arc(23, 13, 5, 0, Math.PI * 2);
      g.rect(9, 13, 16, 5);
      g.fill();
      g.strokeStyle = ICE;
      flake(g, 10, 25, 3.5, 1.2);
      flake(g, 22, 26, 3.5, 1.2);
      break;
    }
    case 'pause':
      g.fillRect(9, 7, 5, 18);
      g.fillRect(18, 7, 5, 18);
      break;
    case 'play':
      P([10, 6, 25, 16, 10, 26], true);
      g.fill();
      break;
    case 'gear': {
      g.save();
      g.translate(16, 16);
      for (let a = 0; a < 8; a++) {
        g.rotate(Math.PI / 4);
        g.fillRect(-2.5, -13, 5, 6);
      }
      g.beginPath();
      g.arc(0, 0, 8.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = DARK;
      g.beginPath();
      g.arc(0, 0, 3.5, 0, Math.PI * 2);
      g.fill();
      g.restore();
      break;
    }
    case 'camera': {
      g.beginPath();
      g.roundRect(4, 10, 24, 16, 3);
      g.fill();
      g.fillRect(11, 7, 9, 4);
      g.fillStyle = DARK;
      g.beginPath();
      g.arc(16, 18, 5.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ICE;
      g.beginPath();
      g.arc(16, 18, 3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'shake': {
      // снежный шар
      g.fillStyle = '#8a5a35';
      P([8, 25, 24, 25, 26, 30, 6, 30], true);
      g.fill();
      g.strokeStyle = ICE;
      g.lineWidth = 1.8;
      g.beginPath();
      g.arc(16, 14, 11, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = WHITE;
      for (const [x, y] of [[12, 10], [18, 8], [20, 15], [11, 17], [16, 13]]) g.fillRect(x, y, 2, 2);
      g.beginPath();
      g.arc(16, 21, 3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'winterMinute': {
      g.lineWidth = 2;
      P([8, 4, 24, 4, 16, 16, 24, 28, 8, 28, 16, 16], true);
      g.stroke();
      g.fillStyle = ICE;
      P([11, 26, 21, 26, 16, 20], true);
      g.fill();
      break;
    }
    case 'close':
      g.lineWidth = 2.6;
      P([9, 9, 23, 23]);
      g.stroke();
      P([23, 9, 9, 23]);
      g.stroke();
      break;
    case 'flake':
      g.strokeStyle = ICE;
      flake(g, 16, 16, 12, 2);
      break;
    case 'grip':
      for (const y of [9, 16, 23]) for (const x of [12, 20]) g.fillRect(x - 1.5, y - 1.5, 3, 3);
      break;
  }
  g.restore();
}

const cache = new Map<string, string>();

/** dataURL иконки (кэшируется). */
export function iconURL(id: IconId, size = 32, bg?: string): string {
  const key = `${id}|${size}|${bg ?? ''}`;
  const c = cache.get(key);
  if (c) return c;
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = Math.round(size * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    g.fill();
  }
  drawIcon(g, id, size);
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

/** CSS-курсор с иконкой инструмента (с тёмной подложкой, чтобы был виден на любом фоне). */
export function cursorCSS(id: IconId): string {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(20,30,48,0.55)';
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  g.translate(4, 4);
  drawIcon(g, id, 24);
  return `url(${cv.toDataURL()}) 16 16, crosshair`;
}
