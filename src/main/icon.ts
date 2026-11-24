// Иконка-снежинка, нарисованная кодом (BGRA-битмап для nativeImage).

type Seg = [number, number, number, number];

function distSeg(px: number, py: number, s: Seg): number {
  const [ax, ay, bx, by] = s;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const x = ax + dx * t - px;
  const y = ay + dy * t - py;
  return Math.sqrt(x * x + y * y);
}

export function snowflakeBitmap(size: number, paused = false): Buffer {
  const c = size / 2;
  const L = size * 0.43;
  const segs: Seg[] = [];
  for (let a = 0; a < 6; a++) {
    const ang = (a * Math.PI) / 3 - Math.PI / 2;
    const ex = c + Math.cos(ang) * L;
    const ey = c + Math.sin(ang) * L;
    segs.push([c, c, ex, ey]);
    for (const along of [0.55]) {
      const bx = c + Math.cos(ang) * L * along;
      const by = c + Math.sin(ang) * L * along;
      for (const s of [-1, 1]) {
        const ba = ang + s * (Math.PI / 4);
        segs.push([bx, by, bx + Math.cos(ba) * L * 0.36, by + Math.sin(ba) * L * 0.36]);
      }
    }
  }
  const w = Math.max(0.8, size / 22);
  const buf = Buffer.alloc(size * size * 4);
  const light = paused ? [190, 190, 200] : [255, 236, 190]; // B,G,R → голубовато-белый
  const dark = [90, 50, 30];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d = 1e9;
      for (const s of segs) d = Math.min(d, distSeg(x + 0.5, y + 0.5, s));
      const aOut = Math.max(0, Math.min(1, w + 1.3 - d));
      const aIn = Math.max(0, Math.min(1, w + 0.5 - d));
      const o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) buf[o + k] = Math.round(dark[k] + (light[k] - dark[k]) * aIn);
      buf[o + 3] = Math.round(aOut * 255);
    }
  }
  return buf;
}
