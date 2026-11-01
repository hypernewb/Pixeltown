// Wall surfaces. A flat coloured box reads as a flat coloured box however good
// the lighting is, so each material gets the surface treatment it would really
// have: boarding on a timber wall, a mortar grid on a storehouse, posts and
// braces where the frame shows through, dressed corner stones, climbing
// foliage, and a string course at every floor line. These are geometry rather
// than texture, so they survive the pixel pass as crisp one-art-pixel lines
// instead of smearing into noise.
//
// Only the faces a bake can see are detailed: the camera looks along +x and +z,
// so those two are the only ones worth drawing on.

import type { BuildContext } from './context';
import { shade } from '../geo';
import type { Palette } from '../types';

// How far a surface detail stands proud of the wall.
const RELIEF = 0.01;
// One art pixel is 1/32 of a world unit. A line drawn thinner than this either
// disappears in the pixel pass or flickers between neighbouring pixels as the
// sprite is scaled, so every line a wall carries is at least a pixel thick.
const PX = 1 / 32;
// Every vertical dimension below is a whole number of art pixels, so a course
// of boarding or mortar lands on the pixel grid instead of between it.
const COURSE = PX * 4;

// A deterministic 0..1 from three inputs. Wall dressing needs a few small
// choices of its own, and taking them from the form — which is drawn before any
// of this — rather than from the build's random stream keeps the rest of the
// building's random draws exactly where they were.
function pick3(a: number, b: number, i: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7 + i * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

// Horizontal boarding: a cedar-clad wall, and the charred cladding that is the
// same wall in black.
function siding(c: BuildContext, pal: Palette, w: number, d: number, H: number, faceZ: number): void {
  const { gb } = c;
  const line = shade(pal.wall, 0.68);
  const n = Math.max(2, Math.round(H / COURSE));
  const step = H / n;
  for (let i = 1; i < n; i++) {
    const y = i * step;
    gb.box(0, y - PX / 2, faceZ, w + 0.004, PX, RELIEF, line);
    gb.box(w / 2, y - PX / 2, 0, RELIEF, PX, d + 0.004, line);
  }
  // a vertical joint every so often, so the boards are not impossibly long
  const joints = Math.max(1, Math.round(w / 1.1));
  for (let i = 1; i < joints; i++) {
    const x = -w / 2 + (i * w) / joints;
    gb.box(x, 0, faceZ, PX, H, RELIEF, shade(pal.wall, 0.78));
  }
}

// A namako wall: dark tiles bedded in white mortar, so what reads at a distance
// is the pale grid, not the tiles. Drawn as the mortar joints only.
function namako(c: BuildContext, pal: Palette, w: number, d: number, H: number, faceZ: number): void {
  const { gb } = c;
  const joint = '#ded4c0';
  const rows = Math.max(2, Math.round(H / COURSE));
  const step = H / rows;
  const cols = Math.max(2, Math.round(w / COURSE));
  const cstep = w / cols;
  for (let i = 1; i < rows; i++) {
    const y = i * step;
    gb.box(0, y - PX / 2, faceZ, w + 0.004, PX, RELIEF, joint);
    gb.box(w / 2, y - PX / 2, 0, RELIEF, PX, d + 0.004, joint);
  }
  for (let i = 0; i < rows; i++) {
    // the vertical joints, staggered row to row like real bedding
    for (let k = 0; k < cols; k++) {
      const x = -w / 2 + ((k + (i % 2 ? 0.5 : 0)) * w) / cols;
      if (x < -w / 2 + cstep * 0.5 || x > w / 2 - cstep * 0.5) continue;
      gb.box(x - PX / 2, i * step, faceZ, PX, step, RELIEF, joint);
    }
  }
}

// A visible frame: the corner posts, the rails and the studs a timber building
// shows, which is what stops a plaster wall reading as a poured slab. The upper
// floor gets a pair of braces, the way a real frame carries its load out to the
// corners.
function timberFrame(c: BuildContext, pal: Palette, w: number, d: number, H: number, fh: number, floors: number, faceZ: number): void {
  const { gb } = c;
  const post = shade(pal.wood, 0.86);
  const t = PX * 1.6;
  for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) {
    gb.box(x, 0, faceZ, t, H, RELIEF * 1.6, post);
    gb.box(x, 0, 0, RELIEF * 1.6, H, t, post);
  }
  // a rail at every floor line
  for (let f = 1; f < floors; f++) {
    const y = f * fh;
    gb.box(0, y - PX, faceZ, w, PX * 2, RELIEF * 1.4, post);
    gb.box(w / 2, y - PX, 0, RELIEF * 1.4, PX * 2, d, post);
  }
  gb.box(0, H - t, faceZ, w, t, RELIEF * 1.6, post);
  // studs between the corner posts, spaced so a whole number of art pixels
  // falls between them
  const bays = Math.max(2, Math.round(w / (PX * 8)));
  const bay = w / bays;
  for (let i = 1; i < bays; i++) {
    const x = -w / 2 + i * bay;
    gb.box(x - PX * 0.6, 0, faceZ, PX * 1.2, H - t, RELIEF * 1.2, post);
  }
  // the braces, on the floor above the ground one
  if (floors > 1) {
    const y0 = fh;
    const len = Math.hypot(bay, fh) * 0.92;
    const ang = Math.atan2(bay, fh);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - bay / 2);
      gb.boxC(x, y0 + fh / 2, faceZ + RELIEF, PX * 1.1, len, PX * 1.1, post, 0, 0, -s * ang);
    }
  }
}

// A string course: the thin projecting band that marks each floor, which is
// what gives a tall building its storeys when the windows alone do not.
function stringCourse(c: BuildContext, pal: Palette, w: number, d: number, fh: number, floors: number, faceZ: number): void {
  const { gb } = c;
  const band = shade(pal.trim, 0.9);
  for (let f = 1; f < floors; f++) {
    const y = f * fh - PX;
    gb.box(0, y, faceZ, w + 0.016, PX * 2, RELIEF * 2, band);
    gb.box(w / 2, y, 0, RELIEF * 2, PX * 2, d + 0.016, band);
  }
}

// Dressed corner stones: the blocks a rendered or plastered wall is quoined
// with. They alternate long and short up the corner, and it is that rhythm,
// more than the colour, that stops a corner reading as a fold in a sheet of
// paper. Only the three corners the camera can see are dressed.
function quoins(c: BuildContext, pal: Palette, w: number, d: number, H: number, faceZ: number): void {
  const { gb } = c;
  const col = shade(pal.stoneWall, 1.14);
  const row = PX * 2.5;
  const rows = Math.max(1, Math.round(H / row));
  const step = H / rows;
  for (let k = 0; k < rows; k++) {
    const y = k * step;
    const l = (k % 2 ? 2.5 : 1.6) * PX;
    for (const sx of [-1, 1]) {
      gb.box(sx * (w / 2 - l / 2 + 0.004), y, faceZ + RELIEF, l, step * 0.94, RELIEF * 1.4, col);
    }
    for (const sz of [-1, 1]) {
      gb.box(w / 2 + RELIEF, y, sz * (d / 2 - l / 2 + 0.004), RELIEF * 1.4, step * 0.94, l, col);
    }
  }
}

// Climbing foliage. Drawn as the season's green rather than a colour of its
// own: every leaf is repainted for the time of year being baked, so ivy turns
// with the trees and never sits as a fixed summer green on a winter wall.
function ivy(c: BuildContext, pal: Palette, w: number, d: number, H: number, faceZ: number): void {
  const { gb } = c;
  const a = c.form.a;
  const b = c.form.b;
  const clumps = 1 + Math.floor(pick3(a, b, 1) * 3);
  for (let i = 0; i < clumps; i++) {
    const front = pick3(a, b, i * 3 + 2) < 0.62;
    const ph = Math.min(H * 0.85, Math.max(PX * 6, H * (0.2 + pick3(a, b, i * 3 + 3) * 0.5)));
    const pw = Math.max(PX * 3, 0.24 + pick3(a, b, i * 3 + 4) * 0.7);
    if (front) {
      const x = -w / 2 + pw / 2 + pick3(a, b, i * 3 + 5) * Math.max(0, w - pw);
      gb.leaf(pick3(a, b, i * 3 + 6));
      gb.box(x, 0, faceZ + RELIEF, pw, ph, RELIEF, pal.leaf);
      // a couple of smaller blocks at the crown, so the top edge is ragged
      // rather than cut off square
      for (let k = 0; k < 2; k++) {
        const j = pick3(a, b, i * 7 + k + 11);
        gb.box(x - pw / 2 + pw * (0.2 + j * 0.6), ph, faceZ + RELIEF, pw * (0.3 + j * 0.3), PX * 2.5, RELIEF, pal.leaf);
      }
    } else {
      const z = -d / 2 + pw / 2 + pick3(a, b, i * 3 + 5) * Math.max(0, d - pw);
      gb.leaf(pick3(a, b, i * 3 + 6));
      gb.box(w / 2 + RELIEF, 0, z, RELIEF, ph, pw, pal.leaf);
      for (let k = 0; k < 2; k++) {
        const j = pick3(a, b, i * 7 + k + 11);
        gb.box(w / 2 + RELIEF, ph, z - pw / 2 + pw * (0.2 + j * 0.6), RELIEF, PX * 2.5, pw * (0.3 + j * 0.3), pal.leaf);
      }
    }
  }
  gb.noGlow();
}

// The whole surface pass for one building, dispatched by the material it was
// built from.
export function wallDetail(c: BuildContext, pal: Palette, w: number, d: number, H: number, fh: number, floors: number): void {
  const faceZ = d / 2;
  const style = pal.style;
  if (style === 'itabari' || style === 'yakisugi') siding(c, pal, w, d, H, faceZ);
  else if (style === 'namako') namako(c, pal, w, d, H, faceZ);
  if (pal.timber && style !== 'namako') timberFrame(c, pal, w, d, H, fh, floors, faceZ);
  stringCourse(c, pal, w, d, fh, floors, faceZ);
  // dressed corners belong to a rendered wall; boarding and tiles do not have
  // them, and neither does a storehouse
  const rendered = !pal.timber && style !== 'namako';
  if (rendered && c.form.a > 0.58) quoins(c, pal, w, d, H, faceZ);
  if (style !== 'namako' && c.form.b > 0.66) ivy(c, pal, w, d, H, faceZ);
}
