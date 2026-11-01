// The generation engine. Give it a recipe and it returns the geometry, the
// plan it settled on, and the footprint a map needs. Nothing here knows about
// React, PixiJS or three.js's scene graph: it only builds geometry.

import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { RNG, seedToCode } from './rng';
import { makeContext, type SmokeSpot } from './build/context';
import { buildBuilding, type BuildResult } from './build/building';
import { formOf } from './build/form';
import { captureLocks, applyLocks } from './parts';
import { getPack } from './packs/registry';
import type { BuildPlan } from './packs/pack';
import type { BuildingFootprint, BuildingRecipe, Form, Palette } from './types';

// The COLOUR fields a building's palette carries. Each one shifts a shade per
// building so no two walls or roofs on a street match exactly — the thing that
// makes a real row of houses look lived-in rather than printed.
const TINTED: (keyof Palette & string)[] = [
  'wall', 'lower', 'stoneWall', 'brick', 'wood', 'roof', 'thatch', 'slate', 'tile',
  'door', 'accent', 'frame', 'awning', 'awning2', 'leaf', 'trim', 'shutters', 'metal', 'fabric', 'stone',
];

function tintPalette(pal: Palette): Palette {
  const out: Palette = { ...pal };
  const c = new THREE.Color();
  for (const key of TINTED) {
    const v = pal[key];
    if (typeof v !== 'string' || !v) continue;
    c.set(v);
    c.r = Math.min(1, Math.max(0, c.r * (1 + pal.tint[0])));
    c.g = Math.min(1, Math.max(0, c.g * (1 + pal.tint[1])));
    c.b = Math.min(1, Math.max(0, c.b * (1 + pal.tint[2])));
    (out as unknown as Record<string, unknown>)[key] = `#${c.getHexString()}`;
  }
  return out;
}

export interface GeneratedBuilding {
  recipe: BuildingRecipe;
  plan: BuildPlan;
  form: Form;
  palette: Palette;
  geometry: THREE.BufferGeometry | null;
  result: BuildResult;
  smoke: SmokeSpot[];
  footprint: BuildingFootprint;
  seedCode: string;
}

// What the recipe asks for, resolved against the pack's template limits.
function resolve(recipe: BuildingRecipe, packId: string): { w: number; d: number; floors: number } {
  const pack = getPack(packId);
  const t = pack.templates.find((x) => x.id === recipe.template) ?? pack.templates[0];
  const r = new RNG((recipe.seed ^ 0x51ed2701) >>> 0);
  const clampT = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const w = clampT(recipe.width || r.int(t.footprint.minW, t.footprint.maxW), t.footprint.minW, t.footprint.maxW);
  const d = clampT(recipe.depth || r.int(t.footprint.minD, t.footprint.maxD), t.footprint.minD, t.footprint.maxD);
  const floors = clampT(recipe.floors || r.int(t.floors.min, t.floors.max), t.floors.min, t.floors.max);
  return { w, d, floors };
}

export function generateBuilding(recipe: BuildingRecipe): GeneratedBuilding {
  const pack = getPack(recipe.packId);
  // the artist's material pick outranks the one the seed would have drawn: it
  // is passed in as the style, so the whole palette — walls, roof, trim, and
  // the timber detailing that comes with the material — follows it
  const palette = tintPalette(pack.palette(recipe.seed, recipe.overrides.walls ?? recipe.style, recipe.template));
  // a roof material named by hand replaces the tiles the palette drew, and
  // thatch also brings its own form with it
  const roofChoice = recipe.overrides.roof ? pack.roofOptions.find((o) => o.id === recipe.overrides.roof) : null;
  if (roofChoice) {
    palette.roof = roofChoice.color;
    palette.tile = roofChoice.color;
    palette.slate = roofChoice.color;
    if (roofChoice.id === 'thatch') palette.thatch = roofChoice.color;
  }
  const form = formOf(recipe.seed, pack.formTable(recipe.template), palette);
  const rng = new RNG((recipe.seed ^ 0x2f1b3c5d) >>> 0);
  const { w, d, floors } = resolve(recipe, recipe.packId);
  const resolved: BuildingRecipe = { ...recipe, width: w, depth: d, floors };

  const plan = pack.planFor(resolved, palette, form, rng);
  // parts the artist pinned keep the decision they were pinned at
  applyLocks(plan, recipe.lockedPlan ?? null);
  plan.roofStyle = recipe.roofStyle ?? plan.roofStyle;
  plan.detail = recipe.detail;
  plan.frontGable = form.front === 'gable';

  const gb = new GeoBuilder();
  const ctx = makeContext({
    gb,
    rng,
    pal: palette,
    form,
    detail: recipe.detail,
    overrides: recipe.overrides,
    frame: palette.frame,
    winH: palette.winH,
    arched: false,
    shutters: palette.shutters,
    flowerBoxes: palette.flowerBoxes,
  });

  const result = buildBuilding(ctx, plan, form, palette);
  const geometry = gb.build();

  // the door, in tiles, and the way it faces
  const doorLocal = result.doorAt ?? { x: 0, z: d / 2, dx: 0, dz: 1 };
  const doorTile = {
    x: Math.max(0, Math.min(w - 1, Math.floor(doorLocal.x + w / 2))),
    z: Math.max(0, Math.min(d - 1, Math.floor(doorLocal.z + d / 2))),
  };
  const facing: BuildingFootprint['facing'] =
    Math.abs(doorLocal.dz) >= Math.abs(doorLocal.dx)
      ? doorLocal.dz >= 0 ? 'south' : 'north'
      : doorLocal.dx >= 0 ? 'east' : 'west';

  return {
    recipe: resolved,
    plan,
    form,
    palette,
    geometry,
    result,
    smoke: ctx.smoke,
    footprint: { w, d, doorTile, facing },
    seedCode: seedToCode(recipe.seed),
  };
}

// A fresh recipe for a template, with a seed the artist can write down.
export function newRecipe(template: string, seed: number, packId = 'japanese'): BuildingRecipe {
  return {
    id: `b${seed.toString(36)}`,
    name: '',
    template,
    packId,
    style: null,
    seed,
    width: 0,
    depth: 0,
    floors: 0,
    locked: [],
    lockedPlan: null,
    overrides: {},
    roofStyle: null,
    detail: 1,
  };
}
