// One street, composed by hand instead of filled in by a rule.
//
// The generator can lay out a plausible street, but plausible is not the same as
// good. A rule has no way to know that a flat-roofed house beside a narrow
// townhouse sets up the height of the block after it, or that a row should close
// on the widest front it has. Those are judgements about one particular street,
// so they are written down as one street rather than as a rule that might
// produce it.
//
// Six buildings, one row, one side of a straight road:
//
//   - no family repeats back to back, and the two townhouses sit four buildings
//     apart, so the repeat reads as a rhythm rather than a copy;
//   - the lots are tight through the middle, where a real street crowds, and the
//     two townhouses at either end keep a little clear ground around them;
//   - the street furniture belongs to a lot. A bush, a gate or a bicycle stands in
//     front of the building it serves, and the poles sit on the lot lines;
//   - the road is straight and narrow. Three tiles is enough for two-way traffic
//     and close enough that the fronts still read as one street.

import { newRecipe } from './generator';
import { getPack } from './packs/registry';
import { mixSeed } from './rng';
import type { MapDef, PlacedBuilding, PlacedProp, StreetSpec } from './types';

interface LotProp {
  kind: string;
  // offset from the lot's centre, in tiles, along the street
  dx: number;
  variant: number;
}

interface Plot {
  template: string;
  w: number;
  d: number;
  floors: number;
  // the name shown in the studio, so the six buildings read as named places
  name: string;
  // tiles of clear ground left before this plot starts
  gap: number;
  detail: number;
  // a utility pole stands on this lot's left line; only some lot lines carry one
  pole?: boolean;
  props: LotProp[];
}

const PLOTS: Plot[] = [
  {
    template: 'modern', w: 4, d: 4, floors: 2, name: 'Narrow house', gap: 0, detail: 0.9, pole: true,
    props: [{ kind: 'bush', dx: -2.5, variant: 2 }, { kind: 'bikes', dx: 1.2, variant: 0 }],
  },
  {
    template: 'machiya', w: 2.6, d: 5, floors: 2, name: 'Townhouse', gap: 0.6, detail: 0.85,
    props: [{ kind: 'gate', dx: 0, variant: 1 }],
  },
  {
    template: 'showa', w: 3.6, d: 4, floors: 2, name: 'Showa shop', gap: 0.4, detail: 1, pole: true,
    props: [{ kind: 'lantern', dx: -1.2, variant: 1 }, { kind: 'bikes', dx: 1.2, variant: 0 }],
  },
  {
    template: 'commercial', w: 3.4, d: 4, floors: 3, name: 'Corner shop block', gap: 0.4, detail: 1,
    props: [{ kind: 'vending', dx: 0.8, variant: 2 }, { kind: 'bush', dx: -1.2, variant: 5 }],
  },
  {
    template: 'apartment', w: 5, d: 4.5, floors: 3, name: 'Apartment block', gap: 0.4, detail: 0.95, pole: true,
    props: [{ kind: 'tree', dx: 0.5, variant: 3 }, { kind: 'bikes', dx: -1.9, variant: 0 }],
  },
  {
    template: 'machiya', w: 2.6, d: 5, floors: 2, name: 'Second townhouse', gap: 0.6, detail: 0.85,
    props: [{ kind: 'hedge', dx: 0, variant: 4 }],
  },
];

// The road's kerb sits at ROAD / 2 from the centre line. Street furniture stands
// on the pavement just inside the kerb, in the strip between the road and the
// fronts.
const ROAD = 3;
const SETBACK = 2;
const START = -11.8;
const FURNITURE_Z = ROAD / 2 + 0.8;

function straightRoad(tiles: number): number[] {
  return new Array(Math.max(1, Math.ceil(tiles) + 4)).fill(0);
}

export function composeStreet(spec: StreetSpec): MapDef {
  const buildings: PlacedBuilding[] = [];
  const props: PlacedProp[] = [];

  let cursor = START;
  let right = START;
  PLOTS.forEach((plot, i) => {
    const seed = mixSeed(spec.seed, i, 7);
    const recipe = newRecipe(plot.template, seed, 'japanese');
    recipe.width = plot.w;
    recipe.depth = plot.d;
    recipe.floors = plot.floors;
    recipe.detail = plot.detail;

    const cx = cursor + plot.gap + plot.w / 2;
    // the fronts sit one setback back from the kerb; the building's own depth is
    // added so the front face lands on that line rather than its centre
    const cz = ROAD / 2 + SETBACK + plot.d / 2;

    buildings.push({
      id: `b_${i}`,
      recipe,
      tileX: cx,
      tileZ: cz,
      facing: 'north',
      spriteKey: `${recipe.id}::day::summer`,
      anchorY: 0,
      sortKey: cx + cz,
      commercial: getPack('japanese').templates.find((t) => t.id === plot.template)?.commercial ?? false,
    });

    plot.props.forEach((p, k) => {
      props.push({
        id: `p_${i}_${p.kind}_${k}`,
        kind: p.kind,
        tileX: cx + p.dx,
        tileZ: FURNITURE_Z,
        variant: p.variant,
      });
    });
    if (plot.pole) props.push({
      id: `p_${i}_pole`,
      kind: 'pole',
      tileX: cx - plot.w / 2 - plot.gap / 2,
      tileZ: FURNITURE_Z,
      variant: 0,
    });

    cursor = cx + plot.w / 2;
    right = Math.max(right, cursor);
  });

  const roadCentre = straightRoad(right - START);

  return {
    id: `m${spec.seed.toString(36)}`,
    name: spec.name,
    seed: spec.seed,
    preset: spec.preset,
    tileSize: 1,
    roadWidth: ROAD,
    roadCentre,
    buildings,
    props,
  };
}
