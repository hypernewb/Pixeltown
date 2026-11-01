// Roofs, dormers, porches, bays, balconies, turrets, wall gables and towers.
// Ported from Kinstead's render/forms.js (MIT) and extended with the roof
// forms and ridge details Japanese buildings need.

import * as THREE from 'three';
import type { BuildContext } from './context';
import { shade } from '../geo';
import { win, GLASS, WARM, IRON, TRIM, STONE, TIMBER } from './facade';

// A gable roof (as GeoBuilder.gable) whose slabs overhang the ends by endA
// (local -x: the front when the ridge runs back) and endB.
export function gableRoof(c: BuildContext, x: number, y: number, z: number, w: number, d: number, h: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, oh: number, alongZ: boolean, endA = oh, endB = oh, t = 0.035): void {
  const { gb } = c;
  gb.push(x, y, z, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  gb.roof(0, 0, 0, w, d, h, w, wall);
  const hd = d / 2, a = Math.atan2(h, hd), L = Math.hypot(hd, h) + oh;
  const cz = (hd + oh * Math.cos(a)) / 2 + (t / 2) * Math.sin(a);
  const cy = (h - oh * Math.sin(a)) / 2 + (t / 2) * Math.cos(a);
  const sw = w + endA + endB, sx = (endB - endA) / 2;
  gb.boxC(sx, cy, cz, sw, t, L, roof, a);
  gb.boxC(sx, cy, -cz, sw, t, L, roof, -a);
  gb.boxC(sx, h + t * 0.4, 0, sw + 0.005, t * 1.1, t * 1.6, shade(roof, 0.85));
  gb.pop();
}

// The rounded ridge cap that runs along a Japanese tiled roof.
function ridgeCap(c: BuildContext, y: number, len: number, color: THREE.ColorRepresentation): void {
  const { gb } = c;
  gb.boxC(0, y, 0, len, 0.03, 0.045, shade(color, 0.9));
  const n = Math.max(2, Math.round(len / 0.06));
  for (let i = 0; i <= n; i++) {
    gb.boxC(-len / 2 + (i * len) / n, y - 0.004, 0, 0.014, 0.036, 0.05, shade(color, 0.78));
  }
}

// A tiled Japanese roof: a gable whose slopes carry tile courses and a
// rounded ridge, with the deep eaves that keep the rain off the walls.
export function tiledRoof(c: BuildContext, x: number, y: number, z: number, w: number, d: number, h: number, tile: THREE.ColorRepresentation, oh: number, alongZ: boolean, ridge = true): void {
  const { gb, pal } = c;
  gb.push(x, y, z, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  const eave = pal.trim;
  gb.roof(0, 0, 0, w, d, h, w, tile);
  const hd = d / 2, a = Math.atan2(h, hd), L = Math.hypot(hd, h) + oh;
  const t = 0.03;
  const cz = (hd + oh * Math.cos(a)) / 2 + (t / 2) * Math.sin(a);
  const cy = (h - oh * Math.sin(a)) / 2 + (t / 2) * Math.cos(a);
  for (const s of [-1, 1]) {
    // the slope itself; the tile courses are painted by the surface shader on
    // a two-art-pixel grid, which is cleaner than sub-pixel geometry strips
    gb.boxC(0, cy, s * cz, w + oh * 2, t, L, tile, s * a);
    // the eave board, in trim colour, one solid piece
    gb.boxC(0, cy - Math.sin(a) * (L / 2) + t * 0.5, s * (cz + Math.cos(a) * (L / 2)), w + oh * 2 + 0.01, 0.022, 0.05, eave, s * a);
  }
  if (ridge) ridgeCap(c, h + t * 0.5, w + oh * 2, shade(tile, 1.02));
  gb.pop();
}

// A mansard: steep lower slopes all round up to a curb, a low hipped top
// over them, a cornice at the eaves.
export function mansardRoof(c: BuildContext, w: number, d: number, h: number, rh: number, roof: THREE.ColorRepresentation, trim: THREE.ColorRepresentation): { h1: number; h2: number; inset: number; top: number } {
  const { gb } = c;
  const h1 = rh * 0.78, h2 = Math.max(0.05, rh * 0.3), i = Math.min(h1 * 0.34, Math.min(w, d) * 0.22);
  gb.box(0, h - 0.025, 0, w + 0.045, 0.03, d + 0.045, trim);
  gb.frustum(0, h, 0, w + 0.02, d + 0.02, h1, w - 2 * i, d - 2 * i, roof);
  gb.box(0, h + h1 - 0.008, 0, w - 2 * i + 0.03, 0.016, d - 2 * i + 0.03, shade(roof, 0.8));
  gb.hip(0, h + h1 + 0.008, 0, w - 2 * i, d - 2 * i, h2, shade(roof, 1.08), 0.006);
  return { h1, h2, inset: i, top: h + h1 + h2 };
}

// A gambrel: two slopes a side, the lower steep, the upper low.
export function gambrelRoof(c: BuildContext, w: number, d: number, h: number, rh: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, alongZ: boolean, oh = 0.05): { top: number; knee: number } {
  const { gb } = c;
  gb.push(0, h, 0, alongZ ? Math.PI / 2 : 0);
  if (alongZ) [w, d] = [d, w];
  const hd = d / 2, kz = hd * 0.52, ky = rh * 0.66;
  const prof: number[][] = [[hd, 0], [kz, ky], [0, rh], [-kz, ky], [-hd, 0]];
  gb.prism(0, 0, 0, w, prof, wall);
  const t = 0.03;
  const edges: [number[], number[], number][] = [[prof[0], prof[1], 1], [prof[1], prof[2], 0], [prof[3], prof[4], 1], [prof[2], prof[3], 0]];
  for (const [p, q, eave] of edges) {
    const dz = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dz, dy), nz = dy / len, ny = -dz / len;
    const s = Math.sign((p[0] + q[0]) / 2) || 1, out = [s * Math.abs(nz), Math.abs(ny)];
    const ext = eave ? oh : 0.012;
    const mz = (p[0] + q[0]) / 2 + (eave ? s * (ext / 2) * Math.abs(dz / len) : 0) + (out[0] * t) / 2;
    const my = (p[1] + q[1]) / 2 - (eave ? (ext / 2) * Math.abs(dy / len) : 0) + (out[1] * t) / 2;
    gb.boxC(0, my, mz, w + oh * 2, t, len + ext + 0.01, roof, Math.atan2(-dy, dz) + (dz < 0 ? Math.PI : 0));
  }
  gb.boxC(0, rh + t * 0.4, 0, w + oh * 2 + 0.005, t * 1.1, t * 1.6, shade(roof, 0.85));
  gb.pop();
  return { top: h + rh, knee: ky };
}

// A flat roof behind a parapet.
export function parapetRoof(c: BuildContext, w: number, d: number, h: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, trim: THREE.ColorRepresentation, ph = 0.06): { top: number } {
  const { gb } = c;
  gb.box(0, h - 0.03, 0, w + 0.04, 0.03, d + 0.04, trim);
  gb.box(0, h - 0.004, 0, w - 0.02, 0.02, d - 0.02, shade(roof, 0.75));
  const t = 0.025;
  for (const s of [-1, 1]) {
    gb.box(0, h, s * (d / 2 - t / 2), w, ph, t, wall);
    gb.box(s * (w / 2 - t / 2), h, 0, t, ph, d, wall);
  }
  gb.box(0, h + ph, 0, w + 0.012, 0.012, d + 0.012, trim);
  gb.box(0, h + ph + 0.004, 0, w - 2 * t, 0.012, d - 2 * t, shade(roof, 0.75));
  return { top: h + ph + 0.012 };
}

// A shaped parapet over a gable facing the street.
export function shapedGable(c: BuildContext, kind: string, z: number, y: number, w: number, h: number, wall: THREE.ColorRepresentation, trim: THREE.ColorRepresentation): number {
  const { gb } = c, t = 0.026, zc = z + t / 2;
  if (kind === 'stepped') {
    const n = 4;
    for (let k = 0; k < n; k++) {
      const hw = (w / 2) * (1 - k / n) + 0.008, y0 = y + (h * k) / n, sh = h / n + 0.035;
      gb.box(0, y0, zc, hw * 2, sh, t, wall);
      for (const s of [-1, 1]) gb.box(s * (hw - 0.02), y0 + sh, zc, 0.044, 0.01, t + 0.008, trim);
    }
    gb.box(0, y + h + 0.035, zc, 0.04, 0.04, t, wall);
    return y + h + 0.075;
  }
  if (kind === 'dutch') {
    const mw = w * 0.42, sh = h * 0.42;
    gb.box(0, y, zc, w + 0.01, sh, t, wall);
    gb.box(0, y + sh, zc, mw, h - sh + 0.06, t, wall);
    for (const s of [-1, 1]) {
      gb.box(s * (w / 2 - 0.02), y + sh, zc, 0.05, 0.012, t + 0.008, trim);
      gb.arch(s * (mw / 2 + 0.03), y + sh, z, 0.03, t, 6, wall);
    }
    gb.gable(0, y + h + 0.06, zc, mw + 0.02, t + 0.01, 0.045, trim, trim, 0.005);
    return y + h + 0.105;
  }
  const mw = w * 0.36;
  gb.box(0, y, zc, w + 0.01, h * 0.34, t, wall);
  gb.box(0, y + h * 0.34, zc, w * 0.62, h * 0.3, t, wall);
  gb.box(0, y + h * 0.64, zc, mw, h * 0.36, t, wall);
  gb.arch(0, y + h, z, mw / 2, t, 8, wall);
  gb.arch(0, y + h, z - 0.004, mw / 2 + 0.01, t + 0.008, 8, trim);
  return y + h + mw / 2;
}

// Dormers along the front slope of a roof.
export function dormers(c: BuildContext, kind: string, n: number, w: number, ez: number, h: number, rz: number, ry: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, lit: number): void {
  const { gb } = c;
  const ww = kind === 'flat' ? Math.min(0.22, (w / n) * 0.7) : 0.12;
  const t = 0.3, zf = ez - (ez - rz) * t, base = h + (ry - h) * t - 0.03, wh = 0.12, dd = 0.14;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n), zc = zf - dd / 2;
    gb.cbox(x, base, zc, ww, wh, dd, wall, 0, 0.01);
    if (kind === 'flat') {
      gb.wedge(x, base + wh, zc - 0.01, ww + 0.03, dd + 0.04, 0.025, roof, 0);
      for (const s of ww > 0.16 ? [-1, 1] : [0]) win(c, x + s * ww * 0.24, base + 0.035, zf, 0.05, 0.065, 'f', lit);
    } else if (kind === 'hip') {
      gb.hip(x, base + wh, zc, ww, dd, 0.06, roof, 0.018);
      win(c, x, base + 0.035, zf, 0.06, 0.07, 'f', lit);
    } else {
      gb.gable(x, base + wh, zc, ww, dd, 0.075, wall, roof, 0.022, true, 0.022);
      win(c, x, base + 0.035, zf, 0.06, 0.07, 'f', lit);
    }
  }
}

export function mansardDormers(c: BuildContext, n: number, w: number, d: number, h: number, M: { h1: number; inset: number }, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, lit: number): void {
  const { gb } = c;
  const zf = d / 2 - M.inset * 0.35 + 0.01, wh = M.h1 * 0.62;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    gb.box(x, h + 0.012, zf - 0.04, 0.09, wh, 0.08, wall);
    gb.gable(x, h + 0.012 + wh, zf - 0.04, 0.1, 0.08, 0.04, wall, roof, 0.012, true, 0.016);
    win(c, x, h + 0.03, zf, 0.05, Math.min(0.08, wh - 0.03), 'f', lit);
  }
}

// The entrance canopy at a door.
export function porchOf(c: BuildContext, kind: string, x: number, z: number, dh: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, w: number, y1: number): void {
  const { gb } = c;
  const trim = c.pal.trim, white = TRIM;
  if (kind === 'canopy') {
    for (const sd of [-1, 1]) gb.box(x + sd * 0.075, 0, z + 0.1, 0.014, 0.2, 0.014, trim);
    gb.wedge(x, 0.2, z + 0.06, 0.2, 0.13, 0.05, roof, 0);
  } else if (kind === 'gabled') {
    for (const sd of [-1, 1]) gb.box(x + sd * 0.075, 0, z + 0.11, 0.016, dh + 0.03, 0.016, c.pal.timber ? TIMBER : trim);
    for (const sd of [-1, 1]) gb.box(x + sd * 0.075, 0.02, z + 0.06, 0.012, 0.05, 0.1, c.pal.timber ? TIMBER : trim);
    gb.gable(x, dh + 0.03, z + 0.06, 0.19, 0.13, 0.07, wall, roof, 0.02, true, 0.02);
  } else if (kind === 'hood') {
    gb.box(x, dh + 0.03, z + 0.035, 0.17, 0.014, 0.07, white);
    for (const sd of [-1, 1]) gb.boxC(x + sd * 0.07, dh + 0.012, z + 0.02, 0.012, 0.03, 0.03, white, 0.6);
  } else if (kind === 'pediment') {
    for (const sd of [-1, 1]) gb.box(x + sd * 0.065, 0, z + 0.008, 0.02, dh + 0.04, 0.02, white);
    gb.box(x, dh + 0.04, z + 0.012, 0.17, 0.02, 0.03, white);
    gb.gable(x, dh + 0.06, z + 0.012, 0.18, 0.03, 0.05, white, white, 0.006);
  } else if (kind === 'fanlight' || kind === 'arch') {
    const r = 0.055;
    gb.arch(x, dh, z - 0.004, r + 0.016, 0.022, 8, kind === 'arch' ? shade(STONE, 1.15) : white);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.1);
    gb.arch(x, dh, z + 0.002, r - 0.008, 0.02, 8, GLASS);
    gb.noGlow();
    if (kind === 'arch') for (const sd of [-1, 1]) gb.box(x + sd * 0.064, 0, z + 0.006, 0.024, dh, 0.02, shade(STONE, 1.15));
  } else if (kind === 'portico') {
    for (const sd of [-1, 1]) gb.cyl(x + sd * 0.08, 0.02, z + 0.12, 0.013, 0.015, dh + 0.02, 8, white);
    gb.box(x, dh + 0.04, z + 0.07, 0.21, 0.024, 0.15, white);
    gb.gable(x, dh + 0.064, z + 0.07, 0.21, 0.15, 0.06, white, roof, 0.012);
    gb.cbox(x, -0.02, z + 0.08, 0.24, 0.04, 0.16, STONE, 0, 0.008);
  } else if (kind === 'veranda') {
    const vw = w + 0.02, vd = 0.13, vy = Math.min(y1, 0.24), n = Math.max(2, Math.round(vw / 0.2));
    gb.cbox(0, -0.01, z + vd / 2, vw, 0.025, vd, shade(c.pal.wood, 1.1), 0, 0.006);
    for (let i = 0; i <= n; i++) gb.box(-vw / 2 + 0.01 + (i * (vw - 0.02)) / n, 0.015, z + vd - 0.01, 0.014, vy - 0.015, 0.014, white);
    gb.box(0, 0.075, z + vd - 0.01, vw, 0.008, 0.008, white);
    gb.wedge(0, vy, z + vd / 2, vw + 0.04, vd + 0.04, 0.045, roof, 0);
  } else if (kind === 'stoop') {
    gb.cbox(x, -0.02, z + 0.06, 0.14, 0.035, 0.12, STONE, 0, 0.006);
    gb.cbox(x, -0.02, z + 0.04, 0.14, 0.05, 0.08, STONE, 0, 0.006);
    for (const sd of [-1, 1]) {
      gb.box(x + sd * 0.07, 0.03, z + 0.11, 0.005, 0.07, 0.005, IRON);
      gb.boxC(x + sd * 0.07, 0.085, z + 0.07, 0.005, 0.005, 0.09, IRON, -0.35);
    }
  }
}

// A bay window the height of two storeys, or an oriel carried on a corbel.
export function tallBay(c: BuildContext, x: number, z: number, fh: number, floors: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, lit: number, oriel = false, n = Math.min(floors, 2), bw = 0.17): void {
  const { gb } = c;
  const bd = 0.065, f0 = oriel ? 1 : 0, f1 = oriel ? Math.max(2, n) : n;
  const y0 = oriel ? fh + 0.02 : 0.02, top = f1 * fh - 0.03;
  if (oriel) gb.frustum(x, fh - 0.05, z + bd / 2, 0.03, 0.02, 0.07, bw, bd, shade(wall, 0.85));
  gb.cbox(x, y0, z + bd / 2, bw, top - y0, bd, wall, 0, 0.008);
  gb.hip(x, top, z + bd / 2, bw, bd, 0.05, roof, 0.014);
  for (let f = f0; f < f1; f++) {
    const wy = f * fh + fh * 0.3;
    if (c.rng.chance(lit)) gb.glow(WARM[0], WARM[1], WARM[2], 1 + c.rng.float(0.02, 0.9));
    else gb.noGlow();
    gb.box(x, wy, z + bd + 0.004, bw - 0.05, fh * 0.42, 0.008, GLASS);
    for (const s of [-1, 1]) gb.box(x + s * (bw / 2 + 0.003), wy, z + bd / 2, 0.008, fh * 0.42, bd - 0.025, GLASS);
    gb.noGlow();
  }
}

// A gable rising from the front wall through the eaves.
export function wallGable(c: BuildContext, kind: string, x: number, z: number, w: number, y: number, h: number, dd: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, trim: THREE.ColorRepresentation, lit: number): void {
  const { gb } = c;
  gb.push(x, 0, 0);
  gb.box(0, y - 0.02, z - 0.015, w, 0.03, 0.03, wall);
  if (kind && kind !== 'plain') {
    gableRoof(c, 0, y, z - dd / 2, w, dd, h, wall, roof, 0.03, true, 0.008, 0.03);
    shapedGable(c, kind, z, y - 0.01, w, h, wall, trim);
  } else gb.gable(0, y, z - dd / 2, w, dd, h, wall, roof, 0.03, true, 0.03);
  win(c, 0, y + h * 0.18, z + (kind && kind !== 'plain' ? 0.026 : 0.002), Math.min(0.07, w * 0.35), Math.min(0.09, h * 0.4), 'f', lit);
  gb.pop();
}

// What stands on a roof's ridge.
export function crest(c: BuildContext, kind: string, y: number, z: number, len: number, wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation): void {
  const { gb } = c;
  if (kind === 'cupola') {
    gb.cbox(0, y - 0.03, z, 0.11, 0.07, 0.11, wall, 0, 0.008);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.04, y + 0.04, z + sz * 0.04, 0.012, 0.07, 0.012, TRIM);
    gb.glow(WARM[0], WARM[1], WARM[2], 1.05);
    gb.box(0, y + 0.05, z, 0.06, 0.04, 0.06, GLASS);
    gb.noGlow();
    gb.box(0, y + 0.11, z, 0.12, 0.012, 0.12, TRIM);
    gb.cone(0, y + 0.122, z, 0.075, 0.07, 8, shade(roof, 1.1), Math.PI / 8);
    gb.box(0, y + 0.19, z, 0.006, 0.04, 0.006, IRON);
  } else if (kind === 'finials') {
    for (const s of [-1, 1]) {
      gb.box((s * len) / 2, y, z, 0.008, 0.05, 0.008, IRON);
      gb.sphere((s * len) / 2, y + 0.052, z, 0.01, IRON, 0);
    }
  } else if (kind === 'vane') {
    const x = len / 2 - 0.02;
    gb.box(x, y, z, 0.006, 0.1, 0.006, IRON);
    gb.box(x, y + 0.075, z, 0.06, 0.004, 0.004, IRON);
    gb.box(x, y + 0.075, z, 0.004, 0.004, 0.06, IRON);
    gb.box(x + 0.012, y + 0.095, z, 0.05, 0.022, 0.004, '#c9a43a');
  }
}
