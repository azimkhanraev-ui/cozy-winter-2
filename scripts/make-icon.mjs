// Иконка приложения, нарисованная кодом: снежинка на скруглённом квадрате «зимней ночи».
// Пишет build/icon.png (256×256) и build/icon.ico (256/64/48/32/16, PNG внутри ICO). Без зависимостей.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function distSeg(px, py, [ax, ay, bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

function draw(size) {
  const S = 4; // суперсэмплинг для гладких краёв
  const out = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const L = size * 0.33;
  const segs = [];
  for (let a = 0; a < 6; a++) {
    const ang = (a * Math.PI) / 3 - Math.PI / 2;
    const ex = c + Math.cos(ang) * L;
    const ey = c + Math.sin(ang) * L;
    segs.push([c, c, ex, ey]);
    for (const [along, len] of [[0.5, 0.3], [0.78, 0.2]]) {
      const bx = c + Math.cos(ang) * L * along;
      const by = c + Math.sin(ang) * L * along;
      for (const s of [-1, 1]) {
        const ba = ang + s * (Math.PI / 4);
        segs.push([bx, by, bx + Math.cos(ba) * L * len, by + Math.sin(ba) * L * len]);
      }
    }
  }
  const w = Math.max(0.9, size / 34);
  const rad = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          // скруглённый квадрат
          const qx = Math.max(Math.abs(px - c) - (c - rad), 0);
          const qy = Math.max(Math.abs(py - c) - (c - rad), 0);
          if (Math.hypot(qx, qy) > rad - 0.5) continue;
          // фон: ночное небо сверху вниз
          const t = py / size;
          let cr = 22 + 30 * t, cg = 38 + 40 * t, cb = 74 + 50 * t;
          // снежинка
          let d = 1e9;
          for (const s of segs) d = Math.min(d, distSeg(px, py, s));
          if (d < w) {
            cr = 236; cg = 246; cb = 255;
          } else if (d < w + size / 40) {
            const k = 1 - (d - w) / (size / 40);
            cr += (160 - cr) * k * 0.6; cg += (215 - cg) * k * 0.6; cb += (255 - cb) * k * 0.6;
          }
          // сугроб внизу
          const sn = size * (0.86 + 0.03 * Math.sin(px / size * 9));
          if (py > sn) {
            cr = 232; cg = 241; cb = 252;
          }
          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = S * S;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / Math.max(1, a / 255));
      out[o + 1] = Math.round(g / Math.max(1, a / 255));
      out[o + 2] = Math.round(b / Math.max(1, a / 255));
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

mkdirSync('build', { recursive: true });
const sizes = [256, 64, 48, 32, 16];
const pngs = sizes.map((s) => png(s, draw(s)));
writeFileSync('build/icon.png', pngs[0]);
// ICO: заголовок + каталог + PNG-образы
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = 6 + dir.length;
sizes.forEach((s, i) => {
  const e = i * 16;
  dir[e] = s >= 256 ? 0 : s;
  dir[e + 1] = s >= 256 ? 0 : s;
  dir[e + 2] = 0;
  dir[e + 3] = 0;
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(pngs[i].length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync('build/icon.ico', Buffer.concat([head, dir, ...pngs]));
console.log('build/icon.ico, build/icon.png готовы');
