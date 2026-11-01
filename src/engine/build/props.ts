// Street-level details: the fittings that make a Japanese facade read as one.
// Air-conditioning units, utility meters and pipes, drainpipes and gutters,
// vending machines, bicycle parking, electrical poles and the wires between
// them, lanterns, and the small signage that gathers round a doorway.

import * as THREE from 'three';
import type { BuildContext } from './context';
import { shade } from '../geo';
import { GLASS, IRON, WARM } from './facade';

const METAL = '#b9bcbd';
const METAL_D = '#7d8285';

// The outdoor unit of an air conditioner, bolted to the wall or on the roof.
export function acUnit(c: BuildContext, x: number, y: number, z: number, w = 0.16, h = 0.11, d = 0.1, metal = METAL): void {
  const { gb } = c;
  gb.cbox(x, y, z + d / 2, w, h, d, metal, 0, 0.006);
  const r = Math.min(h, w) * 0.32;
  gb.cyl(x - w * 0.16, y + h / 2, z + d + 0.004, r, r, 0.012, 10, shade(metal, 0.72), 0, Math.PI / 2);
  gb.cyl(x - w * 0.16, y + h / 2, z + d + 0.01, r * 0.6, r * 0.6, 0.01, 10, shade(metal, 0.55), 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) gb.box(x + w * 0.28, y + 0.02 + i * 0.028, z + d + 0.004, 0.02, 0.012, 0.008, shade(metal, 0.7));
  gb.box(x, y - 0.02, z + 0.03, w * 0.9, 0.014, 0.014, METAL_D);
  gb.box(x, y - 0.02, z + d - 0.03, w * 0.9, 0.014, 0.014, METAL_D);
}

// A wall-mounted unit with its pipe run down the wall.
export function acWithPipes(c: BuildContext, x: number, y: number, z: number, drop: number): void {
  acUnit(c, x, y, z);
  c.gb.box(x + 0.055, y - drop, z + 0.02, 0.014, drop, 0.014, shade(METAL_D, 0.9));
}

// The gas or water meter box on a front wall.
export function meter(c: BuildContext, x: number, y: number, z: number, w = 0.1, h = 0.13): void {
  const { gb } = c;
  gb.cbox(x, y, z + 0.035, w, h, 0.07, '#c6c9c4', 0, 0.005);
  gb.box(x, y + h * 0.55, z + 0.072, w * 0.66, h * 0.3, 0.006, '#8e938c');
  gb.cyl(x, y + h * 0.2, z + 0.072, 0.016, 0.016, 0.006, 8, '#e8e4d8', 0, Math.PI / 2);
  gb.box(x - w * 0.36, y - 0.03, z + 0.02, 0.012, 0.03, 0.012, METAL_D);
  gb.box(x + w * 0.36, y - 0.03, z + 0.02, 0.012, 0.03, 0.012, METAL_D);
}

// A drainpipe and the gutter it empties from, with the brackets that hold it.
export function downpipe(c: BuildContext, x: number, y0: number, y1: number, z: number, color = METAL_D): void {
  const { gb } = c;
  gb.cyl(x, y0, z, 0.016, 0.016, y1 - y0, 8, color);
  for (let y = y0 + 0.1; y < y1; y += 0.22) gb.box(x, y, z + 0.012, 0.03, 0.012, 0.024, shade(color, 0.85));
  gb.cyl(x, y1, z, 0.018, 0.018, 0.02, 8, shade(color, 1.1));
  gb.cyl(x, y0 - 0.02, z, 0.02, 0.024, 0.04, 8, shade(color, 0.8));
}

// A horizontal gutter along an eave.
export function gutter(c: BuildContext, x: number, y: number, z: number, w: number, color = METAL_D): void {
  const { gb } = c;
  gb.cyl(x, y, z, 0.018, 0.018, w, 8, color, 0, 0, Math.PI / 2);
}

// A vending machine: the single most recognisable piece of Japanese street
// furniture. Back panel, lit display, product rows, and a coin slot.
export function vendingMachine(c: BuildContext, x: number, z: number, ry = 0, body?: string): void {
  const { gb, rng, pal } = c;
  const shell = body ?? rng.pick(['#c8392f', '#2f5fa8', '#d8a52a', '#3f8a4a', '#d8d4cc']);
  const w = 0.24, h = 0.46, d = 0.2;
  gb.push(x, 0, z, ry);
  gb.cbox(0, 0, 0, w, h, d, shell, 0, 0.008);
  gb.box(0, h, 0, w + 0.01, 0.02, d + 0.01, shade(shell, 0.72));
  // the lit display window
  gb.glow(1.5, 1.35, 0.95, 1.1);
  gb.box(0, h * 0.44, d - 0.004, w - 0.03, h * 0.5, 0.012, '#f2ead6');
  gb.noGlow();
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3; i++) {
      gb.box(-w * 0.3 + i * w * 0.3, h * 0.5 + row * h * 0.14, d + 0.004, w * 0.2, h * 0.09, 0.006, rng.pick(pal.accent ? ['#3f6a8f', '#c8423a', '#4f7a45', '#d8a52a', '#7a5a8a'] : ['#c8423a']));
    }
  }
  gb.box(0, h * 0.4, d + 0.006, w - 0.03, 0.012, 0.008, shade(shell, 0.7));
  // coin slot and the flap at the bottom
  gb.box(w * 0.32, h * 0.56, d + 0.006, 0.03, 0.05, 0.012, shade(shell, 0.6));
  gb.box(0, 0.06, d - 0.01, w - 0.06, 0.12, 0.02, shade(shell, 0.55));
  gb.pop();
}

// A bicycle, parked or leaning.
export function bicycle(c: BuildContext, x: number, z: number, ry = 0, frame?: string): void {
  const { gb, rng } = c;
  const col = frame ?? rng.pick(['#3f4a52', '#8a3a34', '#2f5a4a', '#5a5a62', '#c8b44a']);
  gb.push(x, 0, z, ry);
  for (const s of [-1, 1]) {
    gb.cyl(0, 0.07, s * 0.24, 0.072, 0.072, 0.014, 12, '#22242a', 0, 0, Math.PI / 2);
    gb.cyl(0, 0.07, s * 0.24, 0.03, 0.03, 0.016, 8, '#4a4e54', 0, 0, Math.PI / 2);
  }
  gb.box(0, 0.09, 0.24, 0.012, 0.012, 0.44, col, 0, 0.5);
  gb.box(0, 0.14, -0.02, 0.012, 0.14, 0.012, col, 0, -0.25);
  gb.box(0, 0.2, -0.22, 0.012, 0.012, 0.2, col, 0, 0.4);
  gb.box(0, 0.27, -0.24, 0.14, 0.014, 0.014, '#22242a');
  gb.box(0, 0.29, 0.2, 0.11, 0.03, 0.16, '#2a2c30');
  gb.box(0, 0.34, -0.3, 0.09, 0.02, 0.06, '#3a3c42');
  gb.box(0, 0.28, -0.3, 0.02, 0.12, 0.02, '#3a3c42');
  gb.pop();
}

// An electrical pole: the concrete shaft, its cross-arms, transformers, and
// the insulators the wires are strung from.
export function utilityPole(c: BuildContext, x: number, z: number, h = 1.5, wires = true): void {
  const { gb } = c;
  const shaft = '#b4b0a6';
  gb.cyl(x, -0.02, z, 0.05, 0.07, h, 8, shaft);
  gb.cyl(x, 0, z, 0.075, 0.075, 0.05, 8, shade(shaft, 0.85));
  gb.cbox(x, h - 0.03, z, 0.13, 0.06, 0.13, shade(shaft, 0.9), 0, 0.008);
  // two cross-arms near the top
  for (const [dy, w] of [[0.06, 0.34], [0.16, 0.28]] as const) {
    gb.box(x, h - dy, z, w, 0.022, 0.03, '#8e8a80');
    const n = w > 0.3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + ((i + 0.5) * w) / n;
      gb.cyl(px, h - dy + 0.022, z, 0.014, 0.016, 0.05, 6, '#6a5f52');
      gb.cyl(px, h - dy + 0.072, z, 0.02, 0.016, 0.016, 6, '#d8d2c4');
    }
  }
  // a transformer drum on the lower arm
  gb.cyl(x + 0.16, h - 0.22, z, 0.05, 0.05, 0.1, 8, '#9aa0a4');
  gb.box(x + 0.16, h - 0.28, z, 0.02, 0.07, 0.02, '#7a8084');
  if (wires) {
    // the cables running away from each insulator, sagging
    const arms: [number, number][] = [[-0.17, h + 0.06], [0, h + 0.06], [0.17, h + 0.06], [-0.14, h + 0.16], [0.14, h + 0.16]];
    for (const [ox, oy] of arms) {
      for (const s of [-1, 1]) {
        gb.push(x + ox, oy, z);
        const len = 0.9;
        for (let i = 0; i < 6; i++) {
          const t0 = i / 6, t1 = (i + 1) / 6;
          const sag = (t: number): number => -Math.sin(t * Math.PI) * 0.09;
          const x0 = s * len * t0, x1 = s * len * t1;
          const y0 = sag(t0), y1 = sag(t1);
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          const l = Math.hypot(x1 - x0, y1 - y0);
          const ang = Math.atan2(y1 - y0, x1 - x0);
          gb.boxC(mx, my, 0, l, 0.012, 0.012, '#3a3a3e', 0, 0, ang);
        }
        gb.pop();
      }
    }
  }
}

// A wire run between two points at a given height, sagging under its own
// weight. Used to connect poles along a street.
export function wireRun(c: BuildContext, x0: number, z0: number, x1: number, z1: number, y: number, sag = 0.08): void {
  const { gb } = c;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  gb.push(x0, y, z0, ry);
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const zz0 = len * t0, zz1 = len * t1;
    const yy0 = -Math.sin(t0 * Math.PI) * sag, yy1 = -Math.sin(t1 * Math.PI) * sag;
    const mz = (zz0 + zz1) / 2, my = (yy0 + yy1) / 2;
    const l = Math.hypot(zz1 - zz0, yy1 - yy0);
    const ang = Math.atan2(yy1 - yy0, zz1 - zz0);
    gb.boxC(0, my, mz, 0.012, 0.012, l, '#3a3a3e', -ang);
  }
  gb.pop();
}

// A paper lantern on its bracket.
export function lantern(c: BuildContext, x: number, y: number, z: number, color = '#d8453a', r = 0.05): void {
  const { gb } = c;
  gb.box(x, y, z + 0.07, 0.012, 0.012, 0.14, IRON);
  gb.box(x, y - 0.02, z + 0.14, 0.012, 0.04, 0.012, IRON);
  gb.glow(1.6, 1.15, 0.6, 3.0);
  gb.sphere(x, y - 0.06, z + 0.14, r, color, 1, 1.2);
  gb.noGlow();
  gb.cyl(x, y - 0.06 - r * 0.6, z + 0.14, r * 0.7, r * 0.7, 0.008, 8, shade(color, 0.7), 0, 0, 0);
  gb.cyl(x, y - 0.06 + r * 0.6, z + 0.14, r * 0.7, r * 0.7, 0.008, 8, shade(color, 0.7));
  gb.cyl(x, y - 0.06 - r * 0.6, z + 0.14, 0.008, 0.008, 0.03, 6, IRON);
}

// A small shrine-like marker or post sign by an entrance.
export function postSign(c: BuildContext, x: number, z: number, h = 0.4, color?: string): void {
  const { gb, pal } = c;
  const face = color ?? pal.accent;
  gb.box(x, 0, z, 0.03, h, 0.03, pal.wood);
  gb.boxC(x, h, z, 0.02, 0.16, 0.12, face);
  gb.boxC(x, h, z + 0.005, 0.006, 0.11, 0.08, shade(face, 0.7));
  gb.box(x, h + 0.08, z, 0.05, 0.02, 0.14, pal.wood);
}

// A curb-side bollard or short post.
export function bollard(c: BuildContext, x: number, z: number, h = 0.16, color = METAL_D): void {
  c.gb.cyl(x, 0, z, 0.022, 0.026, h, 8, color);
  c.gb.cyl(x, h, z, 0.03, 0.022, 0.02, 8, shade(color, 1.15));
}

// A bicycle parking bay: the rack, and the bikes left in it.
export function bikePark(c: BuildContext, x: number, z: number, n = 3, ry = 0): void {
  const { gb } = c;
  gb.push(x, 0, z, ry);
  for (let i = 0; i < n; i++) {
    const bx = (i - (n - 1) / 2) * 0.34;
    gb.box(bx, 0, 0, 0.03, 0.2, 0.03, METAL_D);
    gb.box(bx, 0.2, 0, 0.03, 0.03, 0.22, METAL_D);
  }
  gb.pop();
  for (let i = 0; i < n; i++) {
    const bx = (i - (n - 1) / 2) * 0.34;
    const c2 = Math.cos(ry), s2 = Math.sin(ry);
    bicycle(c, x + bx * c2, z - bx * s2, ry + Math.PI / 2);
  }
}

// The small clutter that gathers by a shop door: crates, a bin, a bucket.
export function shopClutter(c: BuildContext, x: number, z: number, ry = 0): void {
  const { gb, rng, pal } = c;
  gb.push(x, 0, z, ry);
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 0.13;
    gb.cbox(cx, 0, 0, 0.11, 0.09, 0.11, rng.pick(['#b8a882', '#8a7a5a', '#c8bfa8']), rng.float(-0.3, 0.3), 0.006);
    gb.box(cx, 0.09, 0, 0.115, 0.008, 0.115, shade('#b8a882', 0.8));
  }
  if (rng.chance(0.6)) {
    gb.cyl(0.16, 0, 0.06, 0.06, 0.055, 0.16, 8, rng.pick(['#4a5a4a', '#5a4a3a']));
    gb.cyl(0.16, 0.16, 0.06, 0.062, 0.062, 0.012, 8, shade(pal.accent, 0.9));
  }
  gb.pop();
}

// A fire extinguisher cabinet, the small red box on so many walls.
export function fireBox(c: BuildContext, x: number, y: number, z: number): void {
  const { gb } = c;
  gb.cbox(x, y, z + 0.025, 0.09, 0.14, 0.05, '#c0392f', 0, 0.004);
  gb.box(x, y + 0.1, z + 0.052, 0.06, 0.05, 0.006, '#e8e0d0');
}

// A knee-high garden wall with its coping, marking a plot boundary.
export function plotWall(c: BuildContext, x0: number, z0: number, x1: number, z1: number, h = 0.14, color = '#a8a294'): void {
  const { gb } = c;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  gb.push((x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
  gb.cbox(0, 0, 0, 0.06, h, len, color, 0, 0.008);
  gb.box(0, h, 0, 0.075, 0.018, len, shade(color, 1.12));
  gb.pop();
}

export { GLASS, IRON, METAL, METAL_D, WARM };

// A street tree: a tapered trunk with a rounded crown of leafy blobs. The
// crown's spread and shade come from the build context's RNG, so the same
// tree is reproducible from its seed while a row of them varies.
export function streetTree(c: BuildContext, x: number, z: number, scale = 1): void {
  const { gb, rng, pal } = c;
  const h = 0.55 * scale * rng.float(0.85, 1.2);
  const trunk = shade('#6e5238', rng.float(0.9, 1.1));
  gb.cyl(x, 0, z, 0.035 * scale, 0.05 * scale, h, 6, trunk);
  // the crown: every blob is marked as foliage and told where it sits between
  // the season's two greens, so the whole tree turns with the year
  const blobs = 3 + Math.floor(rng.float(0, 3));
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rng.float(0, 1);
    const r = 0.16 * scale * rng.float(0.7, 1.15);
    const bx = x + Math.cos(a) * 0.09 * scale * rng.float(0.3, 1);
    const bz = z + Math.sin(a) * 0.09 * scale * rng.float(0.3, 1);
    const by = h + r * 0.55 + rng.float(-0.02, 0.05) * scale;
    gb.leaf(rng.float(0.15, 0.9));
    gb.sphere(bx, by, bz, r, pal.leaf, 0);
  }
  gb.leaf(0.95);
  gb.sphere(x, h + 0.1 * scale, z, 0.15 * scale, pal.leaf, 0);
  gb.noGlow();
}
