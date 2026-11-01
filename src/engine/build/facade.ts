// Facade primitives: windows, doors, footings, awnings, signboards, balconies,
// shutters and lattice screens. Ported from Kinstead's render/buildings.js
// (MIT) and extended with the street-level details a Japanese facade needs.

import * as THREE from 'three';
import type { BuildContext } from './context';
import { shade } from '../geo';

export const GLASS = '#2f3a44';
export const WARM: [number, number, number] = [1.7, 1.2, 0.55];
export const IRON = '#2f2c2a';
export const TRIM = '#ece6da';
export const STONE = '#8f877a';
export const TIMBER = '#4e3a2a';
export const FLOWER = ['#d9536b', '#e8b84a', '#e88fae', '#f2ede0', '#9c74c9', '#e8823f', '#d9363a', '#6a8ad9'];

export type Face = 'f' | 'b' | 'l' | 'r';

// A window, with an optional arched head, shutters and a flower box.
export function win(c: BuildContext, x: number, y: number, z: number, w: number, h: number, face: Face, lit = 0.75): void {
  const { gb, rng } = c;
  // the frame has to be a whole art pixel thick or it vanishes into the wall
  const t = 0.042, o = 0.012, b = 0.04;
  const fr = c.frame || '#5a4330';
  h *= c.winH || 1;
  // an arched window keeps its size: the top of it, frame and glass, is
  // rounded off rather than capped with a disc over the pane
  const R = c.arched && (face === 'f' || face === 'b') && h > w * 0.8 ? w / 2 : 0;
  const hr = h - R;
  if (face === 'f') gb.box(x, y - 0.012, z + 0.002, w + b * 2, hr + (R ? 0.012 : 0.024), t, fr);
  else if (face === 'b') gb.box(x, y - 0.012, z - 0.002, w + b * 2, hr + (R ? 0.012 : 0.024), t, fr);
  else if (face === 'r') gb.box(x + 0.002, y - 0.012, z, t, h + 0.024, w + b * 2, fr);
  else gb.box(x - 0.002, y - 0.012, z, t, h + 0.024, w + b * 2, fr);
  if (R) gb.arch(x, y + hr, face === 'f' ? z - 0.007 : z - 0.011, R + 0.024, t, 8, fr);
  if (rng.chance(lit)) gb.glow(WARM[0], WARM[1], WARM[2], 1 + rng.float(0.02, 0.95));
  else gb.noGlow();
  if (face === 'f') gb.box(x, y, z + o, w, hr, t, GLASS);
  else if (face === 'b') gb.box(x, y, z - o, w, hr, t, GLASS);
  else if (face === 'r') gb.box(x + o, y, z, t, h, w, GLASS);
  else gb.box(x - o, y, z, t, h, w, GLASS);
  if (R) gb.arch(x, y + hr, face === 'f' ? z - 0.002 : z - 0.022, R, t, 8, GLASS);
  gb.noGlow();
  if (c.shutters && rng.chance(0.5) && (face === 'f' || face === 'b')) {
    const sz = face === 'f' ? z + 0.012 : z - 0.012;
    gb.box(x - w / 2 - 0.022, y - 0.006, sz, 0.026, h + 0.012, 0.01, c.shutters);
    gb.box(x + w / 2 + 0.022, y - 0.006, sz, 0.026, h + 0.012, 0.01, c.shutters);
  }
  if (c.flowerBoxes && face === 'f' && rng.chance(0.55)) {
    gb.box(x, y - 0.032, z + 0.022, w + 0.01, 0.024, 0.026, '#6b4a2f');
    for (let i = -1; i <= 1; i++) gb.sphere(x + i * w * 0.32, y - 0.004, z + 0.026, 0.015, rng.pick(FLOWER));
  }
}

// Remember where the way in is, in world coordinates, so a map can place a
// path to the front door.
function entrance(c: BuildContext, x: number, z: number): void {
  if (c.doorAt) return;
  const p = new THREE.Vector3(x, 0, z + 0.015).applyMatrix4(c.gb.M);
  const q = new THREE.Vector3(x, 0, z + 1).applyMatrix4(c.gb.M);
  const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
  c.doorAt = { x: p.x, y: p.y, z: p.z, dx: (q.x - p.x) / len, dz: (q.z - p.z) / len };
}

export function door(c: BuildContext, x: number, z: number, w: number, h: number, color: THREE.ColorRepresentation): void {
  const { gb } = c;
  if (!c.doorAt) {
    const p = new THREE.Vector3(x, 0, z + 0.015).applyMatrix4(gb.M);
    const q = new THREE.Vector3(x, 0, z + 1).applyMatrix4(gb.M);
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    c.doorAt = { x: p.x, y: p.y, z: p.z, dx: (q.x - p.x) / len, dz: (q.z - p.z) / len };
  }
  gb.box(x, 0, z + 0.004, w + 0.026, h + 0.018, 0.014, '#5a4330');
  gb.box(x, 0, z + 0.01, w, h, 0.014, color);
  const g = c.gy(x, z + 0.07);
  const top = 0.02;
  gb.cbox(x, Math.min(g, top) - 0.03, z + 0.06, w + 0.07, top - Math.min(g, top) + 0.03, 0.08, STONE, 0, 0.01);
}

// A sliding door: two panels, one pushed back, with a recessed track. The
// standard way into a Japanese shop or house.
export function slidingDoor(c: BuildContext, x: number, z: number, w: number, h: number, panel: string, frameCol: string): void {
  const { gb } = c;
  entrance(c, x, z);
  gb.box(x, 0, z + 0.004, w + 0.03, h + 0.03, 0.016, frameCol);
  const half = w / 2;
  gb.box(x - half / 2, 0, z + 0.012, half - 0.004, h, 0.012, panel);
  gb.box(x + half / 2, 0, z + 0.024, half - 0.004, h, 0.012, shade(panel, 0.86));
  // the glazed upper half of each panel
  for (const s of [-1, 1]) {
    const px = x + (s * half) / 2;
    gb.box(px, h * 0.42, z + (s < 0 ? 0.019 : 0.031), half - 0.016, h * 0.46, 0.006, GLASS);
  }
  gb.box(x, h, z + 0.004, w + 0.04, 0.02, 0.03, shade(frameCol, 0.9));
}

// A lattice screen (koshi): the vertical timber grid that fronts so many
// shopfronts and entranceways.
export function lattice(c: BuildContext, x: number, y: number, z: number, w: number, h: number, color: THREE.ColorRepresentation, bars = 7): void {
  const { gb } = c;
  gb.box(x, y, z, w, h, 0.01, shade(color, 0.85));
  const step = w / bars;
  for (let i = 0; i <= bars; i++) gb.box(x - w / 2 + i * step, y, z + 0.008, 0.008, h, 0.012, color);
  for (let j = 1; j < 3; j++) gb.box(x, y + (h * j) / 3, z + 0.008, w, 0.008, 0.012, color);
}

// A noren: the short split curtain hung over a doorway.
export function noren(c: BuildContext, x: number, y: number, z: number, w: number, h: number, color: THREE.ColorRepresentation): void {
  const { gb } = c;
  gb.box(x, y, z, w, 0.012, 0.012, shade(color, 0.8));
  const panels = 3, pw = w / panels;
  for (let i = 0; i < panels; i++) {
    gb.box(x - w / 2 + pw * (i + 0.5), y - h, z + 0.008, pw - 0.008, h, 0.008, i === 1 ? shade(color, 0.94) : color);
  }
}

// A shopfront frame: pilasters either side, a transom, and a stall riser.
export function shopfront(c: BuildContext, x: number, z: number, w: number, h: number, kind: string): void {
  const { gb, pal } = c;
  const trim = pal.trim;
  if (kind === 'pilasters' || kind === 'recessed') {
    const inset = kind === 'recessed' ? 0.03 : 0;
    for (const s of [-1, 1]) {
      gb.box(x + s * (w / 2 - 0.014), 0, z - inset, 0.028, h, 0.05, trim);
      // a console under each pilaster's head: the little bracket that turns a
      // plain post into a shopfront, and the reason a pilaster reads as built
      // rather than as a stripe painted on the wall
      gb.box(x + s * (w / 2 - 0.014), h - 0.09, z - inset + 0.006, 0.05, 0.026, 0.062, shade(trim, 1.04));
    }
    gb.box(x, h - 0.03, z - inset, w, 0.03, 0.05, trim);
    gb.box(x, 0, z - inset, w, 0.06, 0.045, shade(trim, 0.8));
    gb.box(x, 0.06, z - inset + 0.01, w - 0.08, h - 0.1, 0.01, GLASS);
    // a transom bar across the glazing, whether or not the head is recessed
    gb.box(x, h * 0.6, z - inset + 0.008, w - 0.06, 0.022, 0.014, shade(trim, 0.94));
  } else {
    gb.box(x, h - 0.028, z + 0.006, w, 0.028, 0.03, trim);
    if (kind === 'transom') gb.box(x, h * 0.62, z + 0.006, w, 0.022, 0.03, trim);
    for (const s of [-1, 1]) gb.box(x + s * (w / 2 - 0.01), 0, z + 0.004, 0.02, h, 0.03, trim);
    gb.box(x, 0, z + 0.004, w - 0.04, h * 0.58, 0.012, GLASS);
    gb.box(x, 0, z + 0.004, w - 0.04, 0.07, 0.016, shade(trim, 0.82));
  }
}

// A fabric awning over a shopfront, with its valance and support arms.
export function awning(c: BuildContext, x: number, y: number, z: number, w: number, out: number, color: THREE.ColorRepresentation): void {
  const { gb } = c;
  const drop = 0.07;
  gb.wedge(x, y, z + out / 2, w, out, drop, color, Math.PI);
  gb.box(x, y - drop - 0.004, z + out - 0.02, w, 0.028, 0.014, shade(color, 0.85));
  for (const s of [-1, 1]) gb.box(x + s * (w / 2 - 0.02), y - drop, z + out / 2, 0.012, 0.012, out, IRON);
}

// A signboard: a flat plate on the wall, or a projecting blade sign.
export function signboard(c: BuildContext, x: number, y: number, z: number, w: number, h: number, kind: string, color: THREE.ColorRepresentation): void {
  const { gb } = c;
  const face = shade(color, 1.06);
  if (kind === 'blade') {
    gb.box(x, y, z + 0.09, 0.012, 0.012, 0.18, IRON);
    gb.boxC(x, y, z + 0.17, 0.016, h, w, face);
    gb.boxC(x, y, z + 0.178, 0.006, h * 0.72, w * 0.72, shade(color, 0.7));
  } else if (kind === 'band') {
    gb.box(x, y, z + 0.014, w, h, 0.014, face);
    gb.box(x, y + h * 0.2, z + 0.022, w * 0.8, h * 0.3, 0.006, shade(color, 0.72));
  } else {
    gb.box(x, y, z + 0.012, w, h, 0.012, face);
    gb.box(x, y, z + 0.019, w * 0.82, h * 0.66, 0.005, shade(color, 0.7));
  }
}

// A balcony: a slab, a rail, and the posts that carry it.
export function balcony(c: BuildContext, x: number, y: number, z: number, w: number, kind: string): void {
  const { gb, pal } = c;
  const rail = pal.metal ?? IRON;
  const d = 0.16;
  gb.cbox(x, y, z + d / 2, w, 0.03, d, shade(pal.trim, 0.92), 0, 0.008);
  if (kind === 'gallery') {
    gb.box(x, y + 0.03, z + d - 0.012, w, 0.026, 0.014, rail);
    const n = Math.max(3, Math.round(w / 0.07));
    for (let i = 0; i <= n; i++) gb.box(x - w / 2 + (i * w) / n, y + 0.03, z + d - 0.012, 0.008, 0.09, 0.01, rail);
  } else {
    gb.box(x, y + 0.03, z + d - 0.01, w, 0.02, 0.012, rail);
    gb.box(x, y + 0.09, z + d - 0.01, w, 0.012, 0.012, rail);
    const n = Math.max(2, Math.round(w / 0.05));
    for (let i = 0; i <= n; i++) {
      gb.box(x - w / 2 + (i * w) / n, y + 0.03, z + d - 0.01, 0.006, 0.07, 0.008, rail);
    }
    // laundry poles, a fixture of a Japanese balcony
    for (const s of [-1, 1]) gb.box(x + s * (w / 2 - 0.03), y + 0.1, z + 0.06, 0.01, 0.05, 0.01, rail);
  }
  if (kind === 'gallery') for (const s of [-1, 1]) gb.box(x + s * (w / 2 - 0.02), y - 0.1, z + d - 0.02, 0.012, 0.1, 0.012, rail);
}

// A roller shutter pulled down over a closed bay.
export function shutter(c: BuildContext, x: number, z: number, w: number, h: number, color: THREE.ColorRepresentation): void {
  const { gb } = c;
  const rows = Math.max(4, Math.round(h / 0.045));
  gb.box(x, 0, z, w, h, 0.014, shade(color, 0.9));
  for (let i = 1; i < rows; i++) {
    gb.box(x, (h * i) / rows, z + 0.008, w - 0.008, 0.006, 0.008, shade(color, i % 2 ? 1.08 : 0.78));
  }
  gb.box(x, h, z, w + 0.03, 0.035, 0.05, shade(color, 0.7));
}

// Stone footing from the ground up to y=0 under a rectangle, drawn only when
// the ground actually falls away (always flat in the studio).
export function footing(c: BuildContext, x: number, z: number, w: number, d: number, color: THREE.ColorRepresentation = STONE): void {
  let lo = 0;
  for (const [px, pz] of [
    [x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z],
  ]) lo = Math.min(lo, c.gy(px, pz));
  if (lo > -0.015) return;
  const { gb } = c;
  if (lo > -0.12) {
    gb.cbox(x, lo - 0.04, z, w + 0.04, -lo + 0.045, d + 0.04, color, 0, 0.018);
    return;
  }
  gb.cbox(x, lo - 0.04, z, w + 0.012, -lo + 0.045, d + 0.012, shade(color, 1.16), 0, 0.012);
  gb.box(x, -0.024, z, w + 0.05, 0.024, d + 0.05, shade(color, 1.32));
}
