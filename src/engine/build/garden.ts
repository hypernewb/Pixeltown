// Front-garden content, ported from Kinstead's cottageYard set (MIT): the
// boundary a household keeps, the gravel path to its door, and what it plants
// either side of that path. Scaled to the studio's Japanese streets — a fence
// and a hedge rather than a picket and a parterre.
//
// Everything here draws into the building's own geometry under the prop tag, so
// it bakes into the building's sprite and is exported as part of it. Foliage is
// marked with the leaf attribute, so hedges and garden trees turn with the
// seasons exactly as street trees do.

import type { BuildContext } from './context';
import type { Palette } from '../types';
import { shade } from '../geo';
import { FLOWER } from './facade';

const GRAVEL = '#b9a888';
const RAIL = '#8a6a48';

// A clipped hedge: the low green boundary that reads as tended ground.
export function gardenHedge(c: BuildContext, x: number, z: number, w: number, d: number, h = 0.11): void {
  if (w < 0.08 || d < 0.08) return;
  c.gb.cbox(x, -0.01, z, w, h + 0.01, d, '#4a7036', 0, 0.02);
}

// A gravel path or terrace: a flat pale rectangle a hair above the ground.
export function gravelPath(c: BuildContext, x: number, z: number, w: number, d: number): void {
  if (w < 0.05 || d < 0.05) return;
  c.gb.box(x, -0.008, z, w, 0.012, d, GRAVEL);
}

// A run of wooden post-and-rail fence between two points. Every member is at
// least one art pixel thick: a fence post drawn at half a pixel does not read
// as a thin post, it aliases into a sprinkle of dots along the plot line.
export function fenceRun(c: BuildContext, x0: number, z0: number, x1: number, z1: number, color = RAIL): void {
  const { gb, rng } = c;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.12) return;
  const ry = Math.atan2(dx, dz);
  const n = Math.max(1, Math.round(len / 0.3));
  for (let i = 0; i <= n; i++) {
    const px = x0 + dx * (i / n), pz = z0 + dz * (i / n);
    gb.box(px, 0, pz, 0.032, 0.085, 0.032, color, rng.float(-0.15, 0.15));
  }
  // two rails the whole length, at staggered heights
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  for (const hy of [0.034, 0.064]) {
    gb.boxC(mx, hy, mz, 0.03, 0.014, len + 0.02, shade(color, 1.08), 0, ry);
  }
}

// A small garden tree: slim trunk and a three-blob crown, all marked as
// foliage so it recolors with the season.
export function gardenTree(c: BuildContext, x: number, z: number, s = 1): void {
  const { gb, rng, pal } = c;
  gb.cyl(x, 0, z, 0.016 * s, 0.026 * s, 0.2 * s, 6, '#5e432c');
  const blobs: [number, number, number, number][] = [
    [0, 0.27, 0, 0.115],
    [0.05, 0.32, -0.02, 0.075],
    [-0.05, 0.22, 0.04, 0.07],
  ];
  for (const [bx, by, bz, r] of blobs) {
    gb.leaf(rng.float(0.15, 0.9));
    gb.sphere(x + bx * s, by * s, z + bz * s, r * s, pal.leaf, 0);
  }
  gb.noGlow();
}

// A shrub: a squashed leafy ball at the ground.
export function bush(c: BuildContext, x: number, z: number, s = 1): void {
  const { gb, rng, pal } = c;
  gb.leaf(rng.float(0.1, 0.85));
  gb.sphere(x, 0.05 * s, z, 0.08 * s, pal.leaf, 0, 0.75);
  gb.leaf(rng.float(0.3, 1));
  gb.sphere(x + 0.04 * s, 0.04 * s, z + 0.03 * s, 0.05 * s, pal.leaf, 0, 0.8);
  gb.noGlow();
}

// A loose bed of flowers by the path. The stems are a pixel thick on purpose:
// anything thinner dissolves.
export function flowerBed(c: BuildContext, x: number, z: number, n = 5, spread = 0.07): void {
  const { gb, rng } = c;
  for (let i = 0; i < n; i++) {
    const fx = x + rng.float(-spread, spread), fz = z + rng.float(-spread, spread);
    gb.box(fx, 0, fz, 0.014, 0.032, 0.014, '#4f7a3a');
    gb.sphere(fx, 0.038, fz, 0.017, rng.pick(FLOWER));
  }
  gb.noGlow();
}

// ------------------------------------------------------------------ family
// The structures that make one family of building recognisable as itself. They
// are here with the garden because all three attach to the building at ground
// level and read as part of its plot.

// The veranda along the garden side of a farmhouse. It is raised on posts a
// little above the ground and roofed by a lean-to under the main eaves, so the
// building gains a band of shadow and a row of posts at its foot — which is
// most of what makes a country house read as one.
export function engawa(c: BuildContext, pal: Palette, w: number, d: number, fh: number): void {
  const { gb } = c;
  const depth = 0.28;
  const z = d / 2 + depth / 2;
  const h = 0.055;
  const posts = Math.max(2, Math.round(w / 0.42));

  // the deck, its boards running out from the wall
  gb.cbox(0, 0, z, w + 0.02, h, depth, shade(pal.wood, 1.14), 0, 0.008);
  for (let i = 0; i <= posts; i++) {
    const x = -w / 2 + (i * w) / posts;
    gb.box(x, h - 0.008, z, 0.016, 0.008, depth - 0.02, shade(pal.wood, 0.82));
  }
  // posts, and the beam they carry
  for (let i = 0; i <= posts; i++) {
    const x = -w / 2 + (i * w) / posts;
    gb.box(x, 0, z + depth / 2 - 0.03, 0.028, fh * 0.62, 0.028, shade(pal.wood, 0.92));
  }
  gb.box(0, fh * 0.62, z + depth / 2 - 0.03, w + 0.04, 0.03, 0.034, shade(pal.wood, 0.86));
  // the lean-to roof over it, high at the wall and low at the posts
  gb.wedge(0, fh * 0.65, z - 0.02, w + 0.08, depth + 0.06, 0.07, pal.tile, Math.PI);
}

// The open access walkway on a town block: a slab running the length of each
// upper floor, a railing in front of it, and a screen of windows behind. This
// is the one thing that makes a mid-rise read as Japanese rather than as a
// generic office, and it also gives the facade a band of shadow per floor.
export function walkways(c: BuildContext, pal: Palette, w: number, d: number, fh: number, floors: number): void {
  const { gb } = c;
  const depth = 0.24;
  const z = d / 2 + depth / 2;
  const t = 0.02;

  for (let f = 1; f < floors; f++) {
    const y = f * fh;
    // the slab, and the lip along its edge that catches the light
    gb.box(0, y, z, w + 0.03, t, depth, shade(pal.wall, 0.88));
    gb.box(0, y + t, z + depth / 2 - 0.012, w + 0.03, 0.03, 0.024, pal.trim);
    // the railing: a top rail on posts, one art pixel thick at the least
    gb.box(0, y + 0.11, z + depth / 2 - 0.012, w + 0.02, 0.016, 0.016, pal.metal ?? '#7d8285');
    gb.box(0, y + 0.055, z + depth / 2 - 0.012, w + 0.02, 0.012, 0.014, shade(pal.metal ?? '#7d8285', 1.1));
    const n = Math.max(2, Math.round(w / 0.38));
    for (let i = 0; i <= n; i++) {
      gb.box(-w / 2 + (i * w) / n, y + t, z + depth / 2 - 0.012, 0.012, 0.11, 0.012, pal.metal ?? '#7d8285');
    }
    // the drying rail a household actually hangs things from
    gb.box(0, y + 0.2, z + depth / 2 - 0.03, w * 0.7, 0.01, 0.01, shade(pal.metal ?? '#7d8285', 0.9));
  }
}

// A courtyard garden let into the front of a narrow townhouse. The plot is only
// a few tiles wide, so there is no room for a garden beside the building: the
// garden goes in front of it, behind a low wall, which is exactly why the
// machiya looks the way it does. It reads as a recess in the facade with
// planting in it, and it is the strongest cue that this building is not a shop.
export function courtyard(c: BuildContext, pal: Palette, w: number, d: number): void {
  const { gb, rng } = c;
  const cw = Math.min(0.9, w * 0.34);
  const cd = 0.5;
  const cx = -w / 2 + cw / 2;
  const z = d / 2 + cd / 2;

  // a flagged apron, a low wall around it, and a gap for the gate
  gb.box(cx, 0, z, cw, 0.014, cd, '#b0aa9c');
  gb.box(cx, 0, z + cd / 2 - 0.03, cw + 0.06, 0.14, 0.06, shade(pal.wall, 0.94));
  gb.box(cx - cw / 2 - 0.03, 0, z, 0.06, 0.14, cd, shade(pal.wall, 0.9));
  gb.box(cx, 0.14, z + cd / 2 - 0.03, cw + 0.08, 0.022, 0.08, pal.trim);

  // and what is planted in it: a small tree if there is room, a shrub if not
  if (rng.chance(0.55) && cw > 0.55) gardenTree(c, cx, z - 0.04, rng.float(0.7, 0.95));
  else bush(c, cx, z - 0.06, rng.float(0.8, 1.05));
  if (rng.chance(0.5)) flowerBed(c, cx + cw * 0.2, z + 0.06, rng.int(3, 5), 0.05);
}
