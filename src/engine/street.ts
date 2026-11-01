// Streets and neighborhoods. A street is a row of lots either side of a road,
// filled from the style pack's templates. Everything is derived from the
// street's seed, so the same seed gives the same town every time, and any
// single building can be regenerated, restyled or swapped without disturbing
// its neighbours.
//
// The road is not a straight line. Its centre line wanders — a bend here, a
// widening there — the way a real street does, and the two rows of buildings
// follow it: every lot is measured out along x, and its distance from the road
// is read from the centre line at that point. That is what makes the picture
// read as a place rather than as a diagram.

import { RNG, mixSeed } from './rng';
import { newRecipe } from './generator';
import { getPack } from './packs/registry';
import { composeStreet } from './composedStreet';
import type {
  MapDef, NeighborhoodPreset, PlacedBuilding, PlacedProp, StreetSpec,
} from './types';

// The presets that are filled in procedurally. `composed` is deliberately not
// one of them: it is hand-placed, plot by plot, and shares nothing with the
// tables below except the road width and the way a lot is measured out.
type GeneratedPreset = Exclude<NeighborhoodPreset, 'composed'>;

interface PresetShape {
  // how likely a lot is to be a shop or a commercial block rather than a house
  commercial: number;
  // how many tiles deep the front gardens are, and so how far back the row sits
  setback: number;
  // whether the street may carry lanterns, vending machines and the like
  lanterns: boolean;
  vending: boolean;
  bikes: boolean;
  // the templates to draw from, with weights
  templates: [string, number][];
  // how many tiles of road frontage a lot wants, before the building's own size
  lot: [number, number];
}

const PRESETS: Record<GeneratedPreset, PresetShape> = {
  // A preset names the families it is built from, not a size of building. The
  // families are what carry the architecture, so a street that wants shops asks
  // for the two commercial families and a street that wants homes asks for the
  // two domestic ones. The `commercial` ratio still decides *whether* a lot is a
  // shop; the family table decides what kind of shop it is.
  residential: {
    commercial: 0.12,
    setback: 2,
    lanterns: false,
    vending: false,
    bikes: true,
    templates: [['machiya', 6], ['modern', 4], ['showa', 1]],
    lot: [3, 5],
  },
  shopping: {
    commercial: 0.78,
    setback: 1,
    lanterns: true,
    vending: true,
    bikes: true,
    templates: [['showa', 6], ['commercial', 4], ['machiya', 2]],
    lot: [3, 4],
  },
  mainroad: {
    commercial: 0.55,
    setback: 1,
    lanterns: false,
    vending: true,
    bikes: false,
    templates: [['commercial', 5], ['showa', 4], ['apartment', 2], ['machiya', 1]],
    lot: [4, 7],
  },
  mixed: {
    commercial: 0.4,
    setback: 2,
    lanterns: true,
    vending: true,
    bikes: true,
    templates: [['machiya', 4], ['modern', 3], ['showa', 3], ['commercial', 2]],
    lot: [3, 6],
  },
};

// Pick a template for one lot. The street's commercial ratio decides *whether*
// this lot is a shop; the template table decides *which kind*. Applying the
// ratio a second time on top of a table that is already mostly houses is what
// once turned a 12% residential street into a 1% one.
function pickTemplate(rng: RNG, shape: PresetShape, packId: string, commercial: boolean): string {
  const pack = getPack(packId);
  const isCommercial = (id: string): boolean => pack.templates.find((t) => t.id === id)?.commercial ?? false;
  const declared = new Set(pack.templates.map((t) => t.id));
  const available = shape.templates.filter(([id]) => declared.has(id));
  const base: [string, number][] = available.length ? available : pack.templates.map((t) => [t.id, 1]);
  const wanted = base.filter(([id]) => isCommercial(id) === commercial);
  // a pack with nothing on the wanted side falls back rather than failing
  const table = wanted.length ? wanted : base;
  return rng.weighted(table) ?? table[0][0];
}

// Where a building's door should point so it opens onto the street.
//
// The camera looks along +x and +z, so the far row of a street shows its front
// and the near row shows its back. That is what a real street looks like from
// this angle, and it is why the two rows face opposite ways.
const ROW_FACING: Record<1 | -1, PlacedBuilding['facing']> = { [-1]: 'south', 1: 'north' };

// How far the road's centre may be from x's axis at any tile, in tiles. Small
// on purpose: the road meanders gently, it does not snake.
const MEANDER = 1.1;

// The road's centre line, one z per tile of x. A random walk that is then
// smoothed twice, so it bends rather than zig-zags.
function meanderRoad(rng: RNG, tiles: number): number[] {
  const walk: number[] = [];
  let z = 0;
  for (let i = 0; i < tiles; i++) {
    walk.push(z);
    z += rng.float(-0.35, 0.35);
    z = Math.max(-MEANDER, Math.min(MEANDER, z));
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < walk.length - 1; i++) {
      walk[i] = (walk[i - 1] + walk[i] * 2 + walk[i + 1]) / 4;
    }
  }
  return walk.map((v) => Math.round(v * 4) / 4);
}

export function generateStreet(spec: StreetSpec, packId = 'japanese'): MapDef {
  // The composed street is not generated: it is one street, written down. It
  // goes through this same door so that everything downstream — the bake, the
  // export, the studio — has only one kind of thing to deal with.
  if (spec.preset === 'composed') return composeStreet(spec);

  const rng = new RNG(spec.seed >>> 0);
  const shape = PRESETS[spec.preset];
  const buildings: PlacedBuilding[] = [];
  const props: PlacedProp[] = [];
  const road = spec.depth;

  // how far the street runs, with slack at both ends
  const span = Math.ceil(spec.lots * (shape.lot[1] + 2) * 0.8) + 6;
  const centre = meanderRoad(rng, span);

  // two rows, one each side of the road, running along x
  const rows: { side: 1 | -1 }[] = [{ side: -1 }, { side: 1 }];

  let lanternBudget = Math.max(1, Math.floor(spec.lots / 6));
  let vendingBudget = Math.max(1, Math.floor(spec.lots / 4));
  let bikeBudget = Math.max(1, Math.floor(spec.lots / 5));
  let treeBudget = Math.max(2, Math.floor(spec.lots / 2.5));
  let hedgeBudget = Math.max(2, Math.floor(spec.lots / 2));
  let gateBudget = Math.max(1, Math.floor(spec.lots / 3.5));
  let bushBudget = Math.max(1, Math.floor(spec.lots / 2));
  let index = 0;

  for (const row of rows) {
    let x = 0;
    let placed = 0;
    while (placed < spec.lots && x < span - 2) {
      const seed = mixSeed(spec.seed, index, row.side);
      const lotRng = new RNG(seed);
      const wantsCommercial = lotRng.chance(shape.commercial);
      const template = pickTemplate(lotRng, shape, packId, wantsCommercial);
      const recipe = newRecipe(template, seed, packId);
      recipe.detail = shape.commercial > 0.5 ? 1 : 0.75;

      const pack = getPack(packId);
      const t = pack.templates.find((v) => v.id === template) ?? pack.templates[0];
      const w = lotRng.int(Math.max(t.footprint.minW, shape.lot[0]), Math.min(t.footprint.maxW, shape.lot[1] + 2));
      const d = lotRng.int(t.footprint.minD, t.footprint.maxD);
      const floors = lotRng.int(t.floors.min, t.floors.max);
      recipe.width = w;
      recipe.depth = d;
      recipe.floors = floors;

      // the road's centre at this lot, read from the meandering line
      const czRoad = centre[Math.min(centre.length - 1, Math.floor(x + w / 2))] ?? 0;
      // the building's own centre: half the road, the setback, then half its
      // own depth, all measured out from the road's centre *at this point*.
      // Storing the centre rather than a corner keeps every later calculation,
      // in the preview and in the exporter, free of which-corner-was-it guesses.
      const cx = x + w / 2;
      const cz = czRoad + row.side * (road / 2 + shape.setback + d / 2);
      // the edge the door opens onto, which is the side facing the road
      const front = cz - row.side * d / 2;
      const commercial = t.commercial;

      buildings.push({
        id: `b_${index}`,
        recipe,
        tileX: cx,
        tileZ: cz,
        facing: ROW_FACING[row.side],
        spriteKey: `${recipe.id}::day::summer`,
        anchorY: 0,
        sortKey: cx + cz,
        commercial,
      });

      // street furniture goes on the strip between the building and the road
      const curb = front - row.side * 0.6;
      if (shape.lanterns && commercial && lanternBudget > 0 && lotRng.chance(0.34)) {
        lanternBudget--;
        props.push({ id: `p_lant_${index}`, kind: 'lantern', tileX: cx, tileZ: curb, variant: lotRng.int(0, 2) });
      }
      if (shape.vending && vendingBudget > 0 && lotRng.chance(0.22)) {
        vendingBudget--;
        props.push({ id: `p_vend_${index}`, kind: 'vending', tileX: cx + w / 2 + 0.4, tileZ: curb, variant: lotRng.int(0, 3) });
      }
      if (shape.bikes && bikeBudget > 0 && commercial && lotRng.chance(0.3)) {
        bikeBudget--;
        props.push({ id: `p_bike_${index}`, kind: 'bikes', tileX: cx - w / 4, tileZ: curb - row.side * 0.3, variant: lotRng.int(0, 2) });
      }
      // a tree between the road and the front door, where a garden has room
      if (treeBudget > 0 && !commercial && lotRng.chance(0.38)) {
        treeBudget--;
        props.push({ id: `p_tree_${index}`, kind: 'tree', tileX: cx + lotRng.float(-w / 4, w / 4), tileZ: curb + row.side * 0.55, variant: lotRng.int(0, 15) });
      }
      // garden dressing along the verge: a hedge run, a gate or a planted bush
      if (!commercial && hedgeBudget > 0 && lotRng.chance(0.4)) {
        hedgeBudget--;
        props.push({ id: `p_hedge_${index}`, kind: 'hedge', tileX: cx - w / 2 - 0.9, tileZ: curb + row.side * 0.9, variant: lotRng.int(0, 7) });
      }
      if (!commercial && gateBudget > 0 && lotRng.chance(0.32)) {
        gateBudget--;
        props.push({ id: `p_gate_${index}`, kind: 'gate', tileX: cx + w / 2 + 0.9, tileZ: curb + row.side * 0.9, variant: lotRng.int(0, 7) });
      }
      if (!commercial && bushBudget > 0 && lotRng.chance(0.34)) {
        bushBudget--;
        props.push({ id: `p_bush_${index}`, kind: 'bush', tileX: cx + lotRng.float(-w / 3, w / 3), tileZ: curb + row.side * 0.4, variant: lotRng.int(0, 7) });
      }

      x += w + lotRng.int(0, 2);
      index++;
      placed++;
    }
  }

  // utility poles march along the road edge, alternating sides, following the
  // road's meander so they hug the same edge as it bends
  const poles: PlacedProp[] = [];
  let px = 1;
  let side: 1 | -1 = -1;
  while (px < span - 2) {
    const pz = (centre[Math.min(centre.length - 1, Math.floor(px))] ?? 0) + side * (road / 2 + 0.5);
    poles.push({ id: `p_pole_${px}_${side}`, kind: 'pole', tileX: px, tileZ: pz, variant: 0 });
    px += rng.int(4, 6);
    side = side === 1 ? -1 : 1;
  }
  props.push(...poles);

  return {
    id: `m${spec.seed.toString(36)}`,
    name: spec.name,
    seed: spec.seed,
    preset: spec.preset,
    tileSize: 1,
    roadWidth: road,
    roadCentre: centre,
    buildings,
    props,
  };
}

export function streetDefaults(preset: NeighborhoodPreset): Pick<StreetSpec, 'lots' | 'depth'> {
  switch (preset) {
    case 'composed': return { lots: 6, depth: 4 };
    case 'shopping': return { lots: 7, depth: 4 };
    case 'mainroad': return { lots: 6, depth: 6 };
    case 'mixed': return { lots: 6, depth: 5 };
    default: return { lots: 8, depth: 4 };
  }
}

export const PRESET_LABELS: Record<NeighborhoodPreset, string> = {
  composed: 'Kawara Street',
  residential: 'Residential street',
  shopping: 'Shopping street',
  mainroad: 'Main road',
  mixed: 'Mixed neighborhood',
};

// The composed street leads: it is the one to look at, and the generated ones are
// there to explore around it.
export const PRESET_ORDER: NeighborhoodPreset[] = ['composed', 'residential', 'shopping', 'mainroad', 'mixed'];
