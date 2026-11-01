// The flat-roofed families: a modern house, a Showa shop, an apartment block and a
// commercial block. Their silhouettes come from storeys and from what hangs off
// them (balconies, a flank stair, shutters, rooftop plant), not from a roof.
//
// Each front is composed on a grid rather than scattered. Windows share a column
// rhythm with the floor above, air conditioners sit on the wall beside a window,
// and every fitting belongs to a particular wall of a particular family.

import type { BuildContext } from './context';
import type { BuildPlan } from '../packs/pack';
import type { Palette } from '../types';
import { TAG } from '../tags';
import { shade } from '../geo';
import { win, door, slidingDoor, shopfront, awning, shutter, balcony } from './facade';
import { parapetRoof } from './roofs';
import { acUnit, acWithPipes, meter, downpipe, vendingMachine, bikePark } from './props';
import { bush } from './garden';

const FLAT_FAMILIES = new Set(['modern', 'showa', 'apartment', 'commercial']);
const METAL = '#9a9ea0';

export function isFlatFamily(templateId: string): boolean {
  return FLAT_FAMILIES.has(templateId);
}

export function flatBuilding(c: BuildContext, plan: BuildPlan, pal: Palette, fh: number, H: number, w: number, d: number): void {
  const { gb, form } = c;
  const zf = d / 2;
  const side = form.side > 0 ? 1 : -1;

  gb.setTag(TAG.ground);
  gb.cbox(0, 0, 0, w, H, d, pal.wall, 0, 0.01);
  for (let f = 1; f < plan.floors; f++) {
    gb.box(0, f * fh - 0.012, 0, w + 0.03, 0.024, d + 0.03, shade(pal.wall, 0.86));
  }
  gb.setTag(TAG.ground);
  gb.box(0, 0, zf + 0.01, w + 0.02, 0.12, 0.03, shade(pal.wall, 0.72));
  gb.setTag(TAG.roof);
  gb.box(0, H - 0.04, 0, w + 0.06, 0.06, d + 0.06, shade(pal.wall, 0.9));
  parapetRoof(c, w, d, H, pal.wall, pal.roof, pal.trim, 0.1);

  switch (plan.templateId) {
    case 'modern':
      modernFront(c, plan, pal, fh, H, w, d, side);
      break;
    case 'showa':
      showaFront(c, plan, pal, fh, H, w, d, side);
      break;
    case 'apartment':
      apartmentFront(c, plan, pal, fh, H, w, d, side);
      break;
    case 'commercial':
      commercialFront(c, plan, pal, fh, H, w, d, side);
      break;
  }
}

// A narrow house: a recessed entrance under a slab canopy, a balcony on the first
// upper floor, windows that do not line up floor to floor, and an air conditioner
// on the wall beside some of them.
function modernFront(c: BuildContext, plan: BuildPlan, pal: Palette, fh: number, H: number, w: number, d: number, side: number): void {
  const { gb, rng } = c;
  const zf = d / 2;
  const doorX = side * (w / 2 - Math.min(0.55, w * 0.26));

  gb.setTag(TAG.ground);
  gb.box(0, fh - 0.04, zf + 0.02, w - 0.2, 0.12, 0.04, pal.trim);
  gb.box(doorX, 0, zf + 0.012, 0.56, fh * 0.8, 0.03, shade(pal.wall, 0.58));
  door(c, doorX, zf + 0.03, 0.44, fh * 0.74, pal.door);
  gb.box(doorX, fh * 0.8, zf + 0.12, 0.72, 0.04, 0.24, pal.trim);
  meter(c, -side * (w / 2 - 0.26), 0.36, zf + 0.004, 0.1, 0.13);
  downpipe(c, -side * (w / 2 - 0.06), 0, H - 0.02, zf + 0.008, METAL);

  gb.setTag(TAG.upper);
  const cols = Math.max(2, Math.round((w - 0.4) / 0.6));
  const colW = (w - 0.4) / cols;
  for (let f = 1; f < plan.floors; f++) {
    const y = f * fh;
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + 0.2 + (i + 0.5) * colW;
      const balconyHere = f === 1 && i === 1 && plan.parts.balcony;
      if (balconyHere) {
        balcony(c, x, y + 0.02, zf, colW + 0.3, 'rail');
        continue;
      }
      if (rng.chance(0.78)) {
        win(c, x, y + fh * 0.26, zf, colW * 0.62, fh * 0.46, 'f', 0.7);
      } else if (rng.chance(0.5)) {
        acWithPipes(c, x, y + 0.08, zf + 0.002, 0.35);
      }
    }
    win(c, w / 2, y + fh * 0.3, 0, 0.3, fh * 0.42, 'r', 0.4);
  }

  gb.setTag(TAG.fitting);
  gb.box(-side * (w * 0.2), H + 0.1, -d * 0.18, 0.2, 0.2, 0.2, METAL);
  gb.setTag(TAG.prop);
  bush(c, -side * (w / 2 + 0.34), zf + 0.14, 0.8);
  bikePark(c, doorX, zf + 0.72, 2, 0);
}

// A shopping-street building: a roller shutter or a glazed front at street level,
// a projecting blade sign, a fabric awning, and window bays above with the
// occasional air conditioner.
function showaFront(c: BuildContext, plan: BuildPlan, pal: Palette, fh: number, H: number, w: number, d: number, side: number): void {
  const { gb, rng } = c;
  const zf = d / 2;
  const sw = w - 0.4;

  gb.setTag(TAG.ground);
  if (rng.chance(0.5)) {
    shutter(c, 0, zf + 0.006, sw - 0.04, fh - 0.16, METAL);
  } else {
    shopfront(c, -side * 0.12, zf, Math.max(0.8, sw - 0.6), fh - 0.16, 'plain');
    slidingDoor(c, side * (w / 2 - 0.34), zf, 0.42, fh - 0.2, pal.wood, pal.trim);
  }
  awning(c, 0, fh - 0.06, zf, sw - 0.04, 0.4, pal.awning);
  gb.box(w / 2 + 0.06, fh * 1.05, zf + 0.14, 0.04, 0.36, 0.36, pal.accent);

  gb.setTag(TAG.upper);
  for (let f = 1; f < plan.floors; f++) {
    const y = f * fh;
    const cols = Math.max(1, Math.round((w - 0.4) / 0.7));
    const colW = (w - 0.4) / cols;
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + 0.2 + (i + 0.5) * colW;
      win(c, x, y + fh * 0.3, zf, colW * 0.6, fh * 0.5, 'f', 0.6);
      if (rng.chance(0.4)) acUnit(c, x + colW * 0.3, y + 0.14, zf + 0.02, 0.22, 0.16, 0.16);
    }
  }

  gb.setTag(TAG.fitting);
  const flueX = -side * (w / 2 - 0.3);
  gb.cyl(flueX, H + 0.1, -d / 2 + 0.3, 0.05, 0.05, 0.5, 8, METAL);
  c.addSmoke(flueX, H + 0.66, -d / 2 + 0.3, 'kitchen');
  gb.setTag(TAG.prop);
  bikePark(c, side * (w / 2 + 0.5), zf + 0.7, 2, 0);
}

// An apartment block: a timber-free open corridor on every upper floor with a rail
// along it, a row of flat doors opening onto that corridor, and an external stair
// on one flank. Meters sit at street level, one per flat.
function apartmentFront(c: BuildContext, plan: BuildPlan, pal: Palette, fh: number, H: number, w: number, d: number, side: number): void {
  const { gb } = c;
  const zf = d / 2;
  const units = Math.max(2, Math.round(w / 1.4));
  const unitW = w / units;

  gb.setTag(TAG.ground);
  gb.box(0, fh - 0.04, zf + 0.02, w - 0.2, 0.12, 0.04, pal.trim);
  for (let i = 0; i < units; i++) {
    const x = -w / 2 + (i + 0.5) * unitW;
    meter(c, x, 0.4, zf + 0.004, 0.1, 0.13);
  }
  door(c, side * (w / 2 - 0.7), zf + 0.03, 0.46, fh * 0.78, pal.door);

  gb.setTag(TAG.upper);
  for (let f = 1; f < plan.floors; f++) {
    const y = f * fh;
    balcony(c, 0, y, zf, w - 0.1, 'gallery');
    for (let i = 0; i < units; i++) {
      const x = -w / 2 + (i + 0.5) * unitW;
      gb.box(x, y + 0.03, zf + 0.012, 0.34, fh * 0.7, 0.02, pal.door);
      win(c, x + unitW * 0.32, y + fh * 0.3, zf, unitW * 0.3, fh * 0.34, 'f', 0.6);
    }
    win(c, w / 2, y + fh * 0.3, 0, 0.3, fh * 0.4, 'r', 0.4);
  }

  gb.setTag(TAG.prop);
  const stairX = side * (w / 2 + 0.2);
  const steps = plan.floors * 3;
  const rise = H / steps;
  for (let k = 0; k < steps; k++) {
    const z = zf - 0.16 - k * 0.2;
    gb.box(stairX, (k + 1) * rise, z, 0.36, 0.03, 0.2, shade(METAL, 0.9));
    gb.box(stairX + side * 0.16, ((k + 1) * rise) / 2, z, 0.03, (k + 1) * rise, 0.03, METAL);
  }

  gb.setTag(TAG.fitting);
  gb.box(-side * (w * 0.22), H + 0.12, -d * 0.2, 0.42, 0.24, 0.42, METAL);
  gb.setTag(TAG.prop);
  bush(c, -side * (w / 2 + 0.34), zf + 0.14, 0.8);
}

// A contemporary commercial block: a full-width glazed shop under a signband with
// a separate door, ribbon windows set between slabs above, and rooftop plant.
function commercialFront(c: BuildContext, plan: BuildPlan, pal: Palette, fh: number, H: number, w: number, d: number, side: number): void {
  const { gb } = c;
  const zf = d / 2;
  const doorX = -side * (w / 2 - 0.42);
  const a = doorX + side * 0.3;
  const b = side * (w / 2 - 0.12);

  gb.setTag(TAG.ground);
  shopfront(c, (a + b) / 2, zf, Math.abs(b - a), fh - 0.14, 'transom');
  slidingDoor(c, doorX, zf, 0.5, fh - 0.18, pal.wood, pal.trim);
  gb.box(0, fh - 0.02, zf + 0.02, w - 0.1, 0.24, 0.05, pal.accent);

  gb.setTag(TAG.upper);
  const cols = Math.max(2, Math.round((w - 0.3) / 1.0));
  const colW = (w - 0.3) / cols;
  for (let f = 1; f < plan.floors; f++) {
    const y = f * fh;
    gb.box(0, y - 0.02, zf + 0.03, w + 0.02, 0.03, 0.06, shade(pal.wall, 0.8));
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + 0.15 + (i + 0.5) * colW;
      win(c, x, y + fh * 0.2, zf, colW - 0.16, fh * 0.58, 'f', 0.85);
    }
  }

  gb.setTag(TAG.fitting);
  gb.box(-side * (w * 0.2), H + 0.09, -d * 0.15, 0.5, 0.16, 0.36, METAL);
  gb.box(side * (w * 0.22), H + 0.09, -d * 0.2, 0.42, 0.16, 0.42, METAL);
  gb.cyl(-side * (w * 0.08), H + 0.1, d * 0.2, 0.05, 0.05, 0.25, 6, METAL);
  if (plan.floors === 1) {
    gb.setTag(TAG.prop);
    vendingMachine(c, side * (w / 2 + 0.3), zf + 0.2, 0, pal.accent);
  }
}
