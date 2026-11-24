// Отрисовка падающих хлопьев, снежной пыли и искорок на снегу.
import { Flake, FlakeType, LAYERS } from '../sim/snowfall';
import { Particle } from '../sim/scene';
import { SnowField } from '../sim/terrain';
import { Rng } from '../sim/rng';
import { FlakeSprites, sparkleSprite } from './sprites';

export class SnowRenderer {
  private sprites = new FlakeSprites();
  private spark = sparkleSprite();
  private sparkles: { x: number; life: number; max: number; size: number; depth: number }[] = [];
  private rng = new Rng(4242);

  /** Нарисовать хлопья слоёв из списка. */
  drawFlakes(ctx: CanvasRenderingContext2D, flakes: Flake[], layers: number[], t: number, dpr: number): void {
    for (const f of flakes) {
      if (!layers.includes(f.layer)) continue;
      if (f.alpha <= 0.01) continue;
      const L = LAYERS[f.layer];
      const sp = this.sprites.get(f.type, f.seed, L.blur > 1);
      const d = f.r * sp.scale;
      let a = f.alpha;
      if (f.type === FlakeType.Glitter) a *= 0.45 + 0.55 * Math.max(0, Math.sin(t * 5 + f.phase * 3));
      ctx.globalAlpha = a;
      if (f.type === FlakeType.Crystal || f.type === FlakeType.Fluffy) {
        const c = Math.cos(f.rot);
        const s = Math.sin(f.rot);
        ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, f.x * dpr, f.y * dpr);
        ctx.drawImage(sp.canvas, -d / 2, -d / 2, d, d);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(sp.canvas, f.x - d / 2, f.y - d / 2, d, d);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]): void {
    ctx.fillStyle = '#ffffff';
    for (const p of ps) {
      const k = p.life / p.maxLife;
      ctx.globalAlpha = 0.6 * Math.sin(Math.PI * k);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Искорки: короткие вспышки в случайных местах поверхности, где есть снег. */
  drawSparkles(ctx: CanvasRenderingContext2D, field: SnowField, groundY: number, width: number, dt: number, intensity = 1): void {
    const r = this.rng;
    const want = Math.round((width / 1920) * 34 * intensity);
    while (this.sparkles.length < want) {
      this.sparkles.push({ x: r.range(0, width), life: -r.range(0, 4), max: r.range(0.35, 1.1), size: r.range(3, 7), depth: r.range(0.5, 6) });
    }
    for (const s of this.sparkles) {
      s.life += dt;
      if (s.life > s.max) {
        s.x = r.range(0, width);
        s.life = -r.range(0.2, 4);
        s.max = r.range(0.35, 1.1);
        s.size = r.range(3, 8);
        s.depth = r.range(0.5, 6);
      }
      if (s.life < 0) continue;
      const i = field.col(s.x);
      if (field.snow[i] < 2) continue;
      const k = Math.sin((Math.PI * s.life) / s.max);
      ctx.globalAlpha = k * k * 0.95;
      const y = groundY - field.heightAt(s.x) + Math.min(s.depth, field.snow[i] * 0.5);
      const d = s.size * (0.6 + 0.4 * k);
      ctx.drawImage(this.spark, s.x - d / 2, y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }
}
