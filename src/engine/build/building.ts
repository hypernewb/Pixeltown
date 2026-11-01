// Assembling a whole building from a plan. This is the one place that knows the
// order parts go together in: walls, then openings, then the shopfront and its
// fittings, then the roof, then the street-level details. Every step is
// parameterised, so the studio can swap any one part without touching the rest.

import * as THREE from 'three';
import type { BuildContext } from './context';
import type { BuildPlan } from '../packs/pack';
import type { Form, Palette, PartSlot } from '../types';
import { TAG } from '../tags';
import { SURFACE } from '../geo';

// Plaster, render and paint are a smooth skin; boards and charred cedar are
// timber; the storehouse and tile cladding keep their courses.
const SURFACE_BY_STYLE: Record<string, number> = {
  shikkui: SURFACE.render,
  stucco: SURFACE.render,
  painted: SURFACE.render,
  itabari: SURFACE.board,
  yakisugi: SURFACE.board,
  namako: SURFACE.brick,
  tileclad: SURFACE.brick,
  concrete: SURFACE.formwork,
  corrugated: SURFACE.rib,
};
import { shade } from '../geo';
import {
  win, door, slidingDoor, lattice, noren, shopfront, awning, signboard,
  balcony as railBalcony, shutter, footing, GLASS, WARM, IRON,
} from './facade';
import {
  gableRoof, tiledRoof, mansardRoof, gambrelRoof, parapetRoof, dormers,
  mansardDormers, porchOf, wallGable, tallBay, crest,
} from './roofs';
import {
  acUnit, acWithPipes, meter, downpipe, gutter, vendingMachine, bicycle,
  utilityPole, lantern, postSign, bollard, bikePark, shopClutter, fireBox,
} from './props';
import { wallDetail } from './walls';
import { flatBuilding, isFlatFamily } from './flats';
import { bush, courtyard, engawa, fenceRun, flowerBed, gardenHedge, gardenTree, gravelPath, walkways } from './garden';

export interface BuildResult {
  // footprint of the solid mass, in world units, centred on the origin
  width: number;
  depth: number;
  height: number;
  doorAt: { x: number; y: number; z: number; dx: number; dz: number } | null;
  // a standoff box the map can use for collision, in local units
  collision: { w: number; d: number };
}

// How many windows fit along a wall of this width.
function windowCount(w: number, rng: { next: () => number }): number {
  const n = Math.max(1, Math.round((w - 0.5) / 0.42));
  return rng.next() < 0.25 && n > 1 ? n - 1 : n;
}

// winH values read best with panes around 0.5 wide on the front face; side and
// back windows are allowed to stay narrower since they sit away from the eye
function windowFor(c: BuildContext, w: number, fh: number): { w: number; h: number } {
  return {
    w: Math.max(c.pal.winW, 0.42),
    h: Math.min(fh * 0.5, Math.max(0.42, w * 1.05)),
  };
}

function facadeWindows(c: BuildContext, y: number, z: number, w: number, fh: number, face: 'f' | 'b', lit: number): void {
  const n = windowCount(w, c.rng);
  const { w: ww, h: wh } = windowFor(c, w, fh);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / n;
    win(c, x, y, z, ww, wh, face, lit);
  }
}

// The ground-floor front: a shopfront, or a house entrance with its fittings.
function frontFacade(c: BuildContext, plan: BuildPlan, form: Form, pal: Palette, fh: number, z: number): void {
  const w = plan.w;
  const doorX = form.side > 0 ? w / 2 - Math.min(0.55, w * 0.22) : -w / 2 + Math.min(0.55, w * 0.22);
  const style = c.overrides.door ?? 'sliding';

  if (plan.parts.shopfront) {
    // The shopfront is shifted off centre to leave room for the door beside it,
    // so its width has to be measured from the shifted centre outwards. Sized as
    // though it were centred, it grows wider than the wall on a broad building
    // and its frame and glazing end up standing in mid-air past the flank.
    const sfOff = form.side > 0 ? -w * 0.14 : w * 0.14;
    const sfW = Math.max(0.8, Math.min(w - 1.3, 2 * (w / 2 - 0.2 - Math.abs(sfOff))));
    shopfront(c, sfOff, z, sfW, fh - 0.16, c.overrides.shopfront ?? form.shopfront ?? 'plain');
    if (style === 'shutter') {
      shutter(c, sfOff, z + 0.005, sfW - 0.04, fh - 0.16, pal.metal ?? '#9a9ea0');
    }
    if (style === 'hinged') door(c, doorX, z, 0.42, fh - 0.2, pal.door);
    else slidingDoor(c, doorX, z, 0.5, fh - 0.18, pal.wood, pal.trim);

    if (plan.parts.awning) {
      // the same clamp: an awning is a wedge over the shopfront and cannot be
      // wider than the wall it hangs on either
      const awOff = form.side > 0 ? -w * 0.1 : w * 0.1;
      const awW = Math.min(w - 0.3, 2 * (w / 2 - 0.16 - Math.abs(awOff)));
      awning(c, awOff, fh - 0.06, z, awW, 0.4, pal.awning);
    }
    if (plan.parts.lanterns) noren(c, doorX, fh - 0.12, z + 0.015, 0.46, 0.15, pal.fabric ?? pal.awning);
    if (plan.parts.sign) {
      const signW = Math.min(w - 0.5, 0.9);
      signboard(c, form.side > 0 ? -w * 0.1 : w * 0.1, fh + 0.1, z, signW, 0.2, c.overrides.sign ?? form.sign ?? 'band', pal.accent);
    }
    if (plan.parts.lanterns) {
      lantern(c, doorX - 0.4, fh - 0.16, z, '#d8453a', 0.05);
      lantern(c, doorX + 0.4, fh - 0.16, z, '#d8453a', 0.05);
    }
  } else {
    if (style === 'shutter') {
      shutter(c, w / 2 - Math.min(0.9, w * 0.3), z + 0.004, Math.min(0.8, w * 0.26), fh - 0.2, pal.metal ?? '#9a9ea0');
    } else if (style === 'hinged') {
      door(c, doorX, z, 0.42, fh - 0.2, pal.door);
    } else {
      slidingDoor(c, doorX, z, 0.5, fh - 0.18, pal.wood, pal.trim);
    }
    // the lattice screen that runs beside a machiya entrance
    const latW = Math.min(0.7, w * 0.24);
    const latX = form.side > 0 ? w / 2 - latW / 2 - 0.06 : -w / 2 + latW / 2 + 0.06;
    if (Math.abs(latX - doorX) > latW * 0.7) lattice(c, latX, 0.06, z + 0.004, latW, fh - 0.26, pal.wood);
    if (form.porch) porchOf(c, form.porch, doorX, z, fh - 0.18, pal.wall, pal.roof, w, fh);
    // the remaining ground-floor windows
    const winY = fh * 0.3;
    for (const s of [-1, 1]) {
      const wx = s * (w / 2 - 0.42);
      if (Math.abs(wx - doorX) > 0.5) {
        const { w: ww, h: wh } = windowFor(c, w, fh);
        win(c, wx, winY, z, ww, wh, 'f', 0.7);
      }
    }
  }
  void GLASS;
}

// The roof, dispatched by the style the plan settled on. The family sets the
// pitch and the eave depth, so a farmhouse's roof is half its height and a town
// block's is a low cap: two buildings sharing a tile colour still read as
// different buildings, which is the whole point of a family.
function roof(c: BuildContext, plan: BuildPlan, form: Form, pal: Palette, H: number, w: number, d: number): void {
  const style = plan.roofStyle;
  const k = plan.roofK;
  const alongZ = k.ridgeAlong ?? d > w;
  const pitch = pal.pitch * k.pitch;
  const oh = k.eave;
  const span = (alongZ ? w : d) / 2 + oh;
  const rh = pitch * span;

  switch (style) {
    case 'hip':
      tiledRoof(c, 0, H, 0, w, d, rh * 0.9, pal.tile, oh, alongZ, false);
      break;
    case 'halfhip':
      tiledRoof(c, 0, H, 0, w, d, rh, pal.tile, oh, alongZ, true);
      break;
    case 'crossgable': {
      tiledRoof(c, 0, H, 0, w, d, rh, pal.tile, oh, alongZ, true);
      // a second gable facing the street over the front third
      const cw = (alongZ ? w : d) * 0.62;
      c.gb.push(0, H, 0);
      if (!alongZ) c.gb.gable(0, 0, d * 0.22, cw, d * 0.5, rh * 0.8, pal.wall, pal.tile, 0.06, true, 0.03);
      else c.gb.gable(0, 0, w * 0.22, cw, w * 0.5, rh * 0.8, pal.wall, pal.tile, 0.06, true, 0.03);
      c.gb.pop();
      break;
    }
    case 'saltbox':
      tiledRoof(c, 0, H, 0, w, d, rh, pal.tile, oh, alongZ, true);
      break;
    case 'mansard': {
      const M = mansardRoof(c, w, d, H, rh, pal.roof, pal.trim);
      if (form.dormer && plan.floors > 1) mansardDormers(c, Math.min(3, Math.max(1, Math.round(w / 1.6))), w, d, H, M, pal.wall, pal.roof, 0.6);
      break;
    }
    case 'gambrel':
      gambrelRoof(c, w, d, H, rh, pal.wall, pal.roof, alongZ, oh);
      break;
    case 'parapet':
    case 'flat':
      parapetRoof(c, w, d, H, pal.wall, pal.roof, pal.trim, 0.1);
      break;
    case 'thatch':
      tiledRoof(c, 0, H, 0, w, d, rh * 1.1, pal.thatch, oh * 1.3, alongZ, true);
      break;
    default: {
      tiledRoof(c, 0, H, 0, w, d, rh, pal.tile, oh, alongZ, true);
      // a farmhouse's ridge is a heavy timber beam and reads as one from the
      // street; a townhouse's is a line of tiles
      if (k.eave > 0.28) {
        c.gb.box(0, H + rh - 0.014, 0, alongZ ? d + oh * 2 : 0.055, 0.038, alongZ ? 0.055 : w + oh * 2, shade(pal.tile, 0.78));
        c.gb.box(0, H + rh + 0.024, 0, alongZ ? d + oh * 2 : 0.03, 0.014, alongZ ? 0.03 : w + oh * 2, shade(pal.tile, 1.12));
      }
      if (form.dormer && plan.floors > 1 && form.dormer !== 'hip' && w > 2.4) {
        const n = Math.min(3, Math.max(1, Math.round(w / 1.8)));
        dormers(c, form.dormer, n, w, d / 2, H, 0, H + rh, pal.wall, pal.roof, 0.6);
      }
    }
  }

  // the ridge, and whatever stands on it
  if (form.crest && style !== 'parapet' && style !== 'flat' && style !== 'mansard') {
    crest(c, form.crest, H + rh + 0.03, 0, Math.min(w, d) * 0.8, pal.wall, pal.roof);
  }
}

// The street-level details: air conditioning, meters, pipes, and the clutter
// that gathers by a front door.
function fittings(c: BuildContext, plan: BuildPlan, pal: Palette, fh: number, H: number, w: number, d: number): void {
  const zf = d / 2;
  const useAc = c.overrides.utilities === 'ac' || (c.overrides.utilities == null && plan.parts.ac);
  const useMeter = c.overrides.utilities === 'meter' || (c.overrides.utilities == null && plan.parts.ac && c.rng.chance(0.5));
  const usePipes = c.overrides.utilities === 'pipes' || c.overrides.utilities == null;

  if (useAc) {
    const n = plan.floors > 1 ? c.rng.int(1, 2) : 1;
    for (let i = 0; i < n; i++) {
      const x = (i === 0 ? 1 : -1) * (w / 2 - 0.28);
      const y = plan.floors > 1 ? fh + 0.1 : 0.12;
      acWithPipes(c, x, y, zf + 0.002, 0.35);
    }
  }
  if (useMeter) meter(c, w / 2 - 0.22, 0.14, zf + 0.002, 0.09, 0.12);
  if (usePipes) {
    for (const s of [-1, 1]) downpipe(c, s * (w / 2 - 0.08), 0, H - 0.02, zf + 0.008, pal.metal ?? '#7d8285');
    gutter(c, 0, H + 0.02, zf + 0.06, w + 0.2, pal.metal ?? '#7d8285');
  }
  if (c.rng.chance(0.4)) fireBox(c, -w / 2 + 0.3, 0.1, zf + 0.002);

  // balcony along the upper floors
  if (plan.parts.balcony && plan.floors > 1) {
    const bkind = c.overrides.balcony ?? c.form.balcony ?? 'rail';
    if (bkind !== 'none') {
      const bw = Math.min(w - 0.5, 2.4);
      const y = fh * (plan.floors - 1) + 0.05;
      railBalcony(c, 0, y, zf, bw, bkind);
    }
  }
}

// The front garden. A yard with nothing in it reads as bare dirt, however good
// the building behind it is: the boundary, the gravel path to the door and the
// planting either side of it are what make the ground in front of a house look
// lived in. Ported from Kinstead's cottageYard. Everything stays inside the
// building's own plot, and everything the yard carries is green, so it turns
// with the seasons.
function yard(c: BuildContext, plan: BuildPlan, pal: Palette, w: number, d: number): void {
  const { gb, rng, form } = c;
  const zf = d / 2 + 0.55; // the strip between the front wall and the street
  const doorX = form.side > 0 ? w / 2 - Math.min(0.55, w * 0.22) : -w / 2 + Math.min(0.55, w * 0.22);
  const kind = c.overrides.props === 'none' ? 'none' : pal.fence;
  if (kind === 'none') return;

  // the boundary: a hedge, a rail fence, or nothing but a low wall's gap where
  // the gate is. The gate always faces the path, which always reaches the door.
  if (kind === 'hedge') {
    gardenHedge(c, -w / 2 - 0.25, zf, 0.16, 1.0);
    gardenHedge(c, w / 2 + 0.25, zf, 0.16, 1.0);
  } else if (kind === 'block') {
    fenceRun(c, -w / 2 - 0.5, zf, doorX - 0.28, zf);
    fenceRun(c, doorX + 0.28, zf, w / 2 + 0.5, zf);
  }

  // the path from the gate to the door
  gravelPath(c, doorX, zf + 0.1, 0.3, 0.9);

  // planting either side of the path, on the plot edge where there is room
  for (const s of [-1, 1]) {
    const px = doorX + s * (w / 2 + 0.42);
    if (Math.abs(px) > w / 2 + 0.8) continue;
    const r = rng.next();
    if (r < 0.4) bush(c, px, zf + 0.05, rng.float(0.75, 1.05));
    else if (r < 0.68) flowerBed(c, px, zf + 0.05, rng.int(4, 6));
    else if (r < 0.85) gardenTree(c, px, zf + 0.02, rng.float(0.8, 1.05));
    // else: left open, which is a choice like any other
  }
  void gb;
}

// The props around the plot: vending machine, bikes, lanterns, clutter.
function plotProps(c: BuildContext, plan: BuildPlan, pal: Palette, w: number, d: number): void {
  const zf = d / 2;
  const want = (slot: PartSlot, fallback: boolean): boolean => {
    const o = c.overrides[slot];
    if (o === 'none') return false;
    if (o != null) return true;
    return fallback;
  };
  if (want('props', plan.parts.vending) && c.overrides.props !== 'bikes' && c.overrides.props !== 'lanterns' && c.overrides.props !== 'clutter') {
    vendingMachine(c, w / 2 + 0.28, zf - 0.5, -Math.PI / 2, pal.accent);
  }
  if (c.overrides.props === 'bikes' || (c.overrides.props == null && plan.parts.bikes)) {
    bikePark(c, -w / 2 - 0.35, zf - 0.9, c.rng.int(2, 3), 0);
  }
  if (c.overrides.props === 'clutter' || (c.overrides.props == null && plan.parts.vending)) {
    shopClutter(c, -w / 2 + 0.5, zf + 0.28, 0);
  }
  if (c.overrides.props === 'lanterns' || (c.overrides.props == null && plan.parts.lanterns)) {
    postSign(c, w / 2 - 0.4, zf + 0.4, 0.42, pal.accent);
  }
  if (c.rng.chance(0.35)) bollard(c, -w / 2 - 0.2, zf + 0.5, 0.16, pal.metal ?? '#7d8285');
}

// A lower wing fused to the back of the main mass. A real building is almost
// never one box: it is a main volume with a lean-to, an outshoot, a store room
// pushed onto the back, and it is that second, shorter volume that puts a step
// in the silhouette. It is the cheapest single thing that stops a generated
// building reading as a box. The wing stays inside the footprint so it never
// pokes into the neighbour's plot.
function wing(c: BuildContext, pal: Palette, w: number, d: number, H: number, fh: number, side: number): void {
  const { gb } = c;
  const aw = Math.min(1.7, Math.max(0.85, w * 0.46));
  const ad = Math.min(1.9, Math.max(0.85, d * 0.52));
  // a clear step down from the main eaves, so the join reads at a glance
  const top = Math.max(fh * 0.78, H - 0.24);
  // The wing has to stand *outside* the main wall, or it is not a second volume
  // at all. Centred on the wall itself it is a lower box buried inside the main
  // mass, which adds nothing to the silhouette — and a step in the silhouette
  // is the only reason to build one. It reaches 0.12 past the wall, about four
  // art pixels, and with its eaves trim the furthest anything gets is 0.16: the
  // collision box allows 0.2, so it can never reach a neighbour even where two
  // plots touch with no gap between them.
  const over = 0.12;
  const x = side * (w / 2 + over - aw / 2);
  const z = -d / 2 + ad / 2;

  gb.cbox(x, 0, z, aw, top, ad, shade(pal.wall, 0.95), 0, 0.012);
  // its lean-to roof falls away from the main wall
  gb.wedge(x, top, z, aw + 0.05, ad + 0.1, 0.15, pal.tile, Math.PI);
  gb.box(x, top + 0.13, z + ad / 2 - 0.03, aw + 0.06, 0.022, 0.05, pal.trim);
  gb.box(x, top + 0.13, z - ad / 2 + 0.03, aw + 0.06, 0.022, 0.05, pal.trim);
  // an opening on whichever outer face the camera can actually see
  const wx = side < 0 ? x - aw / 2 : x + aw / 2;
  const ww = Math.max(pal.winW, 0.28);
  win(c, wx, top * 0.52, z, ww, Math.min(top * 0.4, ww * 1.2), side < 0 ? 'l' : 'r', 0.45);
}

// A side outshoot: a lower volume fused along one flank and running most of the
// depth, so the plan reads as an L rather than a rectangle. This is the other
// half of how Kinstead composes a building — a villa there is a main body with a
// wing, an outshoot, a tower — and it is the combination of volumes, more than
// the detail on any one of them, that gives a building a silhouette. Like the
// wing it stays inside the footprint, so it can never encroach on a neighbour.
function outshoot(c: BuildContext, pal: Palette, w: number, d: number, H: number, fh: number, side: number): void {
  const { gb } = c;
  const aw = Math.min(1.5, Math.max(0.7, w * 0.34));
  const ad = d * 0.72;
  // a step down from the eaves, shallower than the back wing's, so the two are
  // never mistaken for each other on a building that has both
  const top = Math.max(fh * 0.72, H - 0.3);
  // out past the wall by the same 0.12 the back wing uses, for the same reason:
  // fused flush it would be swallowed by the main mass and the plan would still
  // read as a rectangle
  const over = 0.12;
  const x = side * (w / 2 + over - aw / 2);
  const z = d / 2 - ad / 2 - 0.06;

  gb.cbox(x, 0, z, aw, top, ad, shade(pal.wall, 0.97), 0, 0.012);
  // the eaves board, which is what makes the join read as a joint rather than
  // as one wall passing behind another
  gb.box(x, top - 0.024, z, aw + 0.016, 0.024, ad + 0.016, shade(pal.wall, 0.82));
  // a shallow roof falling away from the main wall: the wedge is high at its
  // local -z, so turning it a quarter turn puts the high edge against the main
  // mass and the low edge out over the flank
  const ry = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  gb.wedge(x, top, z, ad + 0.08, aw + 0.1, 0.16, pal.tile, ry);
  gb.box(x, top + 0.14, z + ad / 2 - 0.02, aw + 0.06, 0.022, 0.05, pal.trim);
  gb.box(x, top + 0.14, z - ad / 2 + 0.02, aw + 0.06, 0.022, 0.05, pal.trim);

  // openings on the flank the camera sees, one per floor it reaches
  const ww = Math.max(pal.winW, 0.3);
  const rows = Math.max(1, Math.min(2, Math.round(top / fh)));
  for (let i = 0; i < rows; i++) {
    const y = (top * (i + 0.5)) / rows - 0.03;
    win(c, side * (w / 2), y, z, ww, Math.min(top / rows - 0.12, ww * 1.15), side > 0 ? 'r' : 'l', i === 0 ? 0.5 : 0.35);
  }
}

export function buildBuilding(c: BuildContext, plan: BuildPlan, form: Form, pal: Palette): BuildResult {
  const { gb } = c;
  const w = plan.w;
  const d = plan.d;
  // the family sets the floor height: a shop wants a squat street level and
  // stacked floors above, a farmhouse wants generous rooms under a low ceiling
  const fh = plan.floorHeight;
  const H = fh * plan.floors;
  const zf = d / 2;
  const zb = -d / 2;

  gb.vary = 0.07;

  gb.setTag(TAG.base);
  footing(c, 0, 0, w, d, pal.stoneWall);
  gb.surface = SURFACE_BY_STYLE[pal.style] ?? SURFACE.render;

  if (isFlatFamily(plan.templateId)) {
    flatBuilding(c, plan, pal, fh, H, w, d);
    return { width: w, depth: d, height: H, doorAt: c.doorAt, collision: { w: w + 0.2, d: d + 0.2 } };
  }

  // ------------------------------------------------------------ the walls
  gb.setTag(TAG.ground);
  gb.cbox(0, 0, 0, w, H, d, pal.wall, 0, 0.012);
  // a plinth and a ground-floor band in a second material, where the pack
  // gives the building one
  const gf = c.overrides.groundFloor ?? 'same';
  if (gf !== 'same') {
    const bandCol = gf === 'tile' ? pal.brick : gf === 'stone' ? pal.stoneWall : pal.wood;
    gb.box(0, 0, 0, w + 0.004, fh, d + 0.004, bandCol);
    gb.box(0, fh - 0.02, 0, w + 0.01, 0.02, d + 0.01, shade(bandCol, 0.85));
  }
  gb.box(0, H - 0.03, 0, w + 0.014, 0.03, d + 0.014, shade(pal.wall, 0.82));
  // the wall's own surface: boarding, a mortar grid, a frame, floor bands.
  // Drawn before the openings so a window sits on top of the wall it is cut
  // into rather than being covered by it.
  wallDetail(c, pal, w, d, H, fh, plan.floors);

  // --------------------------------------------------------- composition
  // A building is rarely one box. A second volume — a lean-to pushed onto the
  // back, or a lower outshoot fused along one flank — puts a step in the
  // silhouette that no amount of surface detail can fake. Whether it gets one,
  // and which, is the family's decision rather than a coin toss, so a farmhouse
  // is reliably a body with a wing and a narrow townhouse reliably is not.
  const composed = plan.annex !== 'none';
  if (composed) {
    gb.setTag(TAG.ground);
    if (plan.annex === 'wing') wing(c, pal, w, d, H, fh, form.side);
    else outshoot(c, pal, w, d, H, fh, form.side);
  }

  // --------------------------------------------------------- the openings
  gb.setTag(TAG.ground);
  frontFacade(c, plan, form, pal, fh, zf);

  // upper floors: windows on the front, and a lighter run on the sides
  gb.setTag(TAG.upper);
  for (let f = 1; f < plan.floors; f++) {
    const y = f * fh + fh * 0.28;
    facadeWindows(c, y, zf, w, fh, 'f', 0.7);
    facadeWindows(c, y, zb, w, fh, 'b', 0.45);
    const nSide = Math.max(1, Math.round((d - 0.6) / 0.9));
    for (let i = 0; i < nSide; i++) {
      const z = -d / 2 + ((i + 0.5) * d) / nSide;
      win(c, w / 2, y, z, Math.max(pal.winW, 0.34), Math.min(fh * 0.46, Math.max(0.34, pal.winW * 0.9)), 'r', 0.4);
      if (i % 2 === 0) win(c, -w / 2, y, z, Math.max(pal.winW, 0.34), Math.min(fh * 0.46, Math.max(0.34, pal.winW * 0.9)), 'l', 0.4);
    }
  }
  // ground-floor side windows
  gb.setTag(TAG.ground);
  for (const s of [-1, 1]) {
    const nSide = Math.max(1, Math.round((d - 0.8) / 1.1));
    for (let i = 0; i < nSide; i++) {
      const z = -d / 2 + ((i + 0.5) * d) / nSide;
      win(c, s * (w / 2), fh * 0.32, z, Math.max(pal.winW, 0.34), Math.min(fh * 0.44, Math.max(0.32, pal.winW * 0.85)), s > 0 ? 'r' : 'l', 0.35);
    }
  }

  // the family's own structures, drawn before the roof so their eaves can meet
  // it: a veranda along the garden side, an open access walkway, a courtyard
  // garden behind the front rooms
  gb.setTag(TAG.prop);
  if (plan.parts.engawa) engawa(c, pal, w, d, fh);
  if (plan.parts.tsubo) courtyard(c, pal, w, d);
  if (plan.parts.walkway) {
    gb.setTag(TAG.upper);
    walkways(c, pal, w, d, fh, plan.floors);
  }

  // ---------------------------------------------------------- the fittings
  gb.setTag(TAG.fitting);
  fittings(c, plan, pal, fh, H, w, d);

  // ------------------------------------------------------------- the roof
  gb.setTag(TAG.roof);
  roof(c, plan, form, pal, H, w, d);

  // A building that was composed out of more than one volume gets a plane of
  // roof-coloured geometry at its eaves. It is drawn after the roof, so where
  // the shorter volume behind reaches past the main mass its ridge reads as
  // roof continuing rather than as a bare line drawn across a wall — which is
  // exactly how the join between two roof pitches looks from this angle.
  if (composed) {
    gb.box(0, H - 0.024, 0, w + 0.018, 0.024, d + 0.018, shade(pal.roof, 1.06));
  }

  // a bay window or a wall gable facing the street on the taller templates
  gb.setTag(TAG.upper);
  if (form.bay && plan.floors > 1 && w >= 3 && !plan.parts.shopfront) {
    tallBay(c, form.side * (w * 0.18), zf, fh, plan.floors, pal.wall, pal.roof, 0.65, form.bay === 'oriel');
  }

  // ------------------------------------------------------------- the plot
  gb.setTag(TAG.prop);
  plotProps(c, plan, pal, w, d);
  // the front garden on a dwelling: its boundary, its path, its planting
  if (!plan.parts.shopfront) {
    gb.setTag(TAG.prop);
    yard(c, plan, pal, w, d);
  }

  void WARM;
  void IRON;
  void bicycle;

  return {
    width: w,
    depth: d,
    height: H,
    doorAt: c.doorAt,
    collision: { w: w + 0.2, d: d + 0.2 },
  };
}
