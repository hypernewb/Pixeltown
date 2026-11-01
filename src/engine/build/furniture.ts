// Standalone street furniture, built as its own little model rather than as
// part of a building. The street generator places lanterns, vending machines,
// bicycle parking and utility poles in the gaps between buildings, so they have
// to exist independently of any facade.

import * as THREE from 'three';
import { GeoBuilder } from '../geo';
import { RNG, strHash } from '../rng';
import { makeContext } from './context';
import { formOf } from './form';
import { getPack } from '../packs/registry';
import { bicycle, bikePark, lantern, streetTree, utilityPole, vendingMachine } from './props';
import { bush, fenceRun, flowerBed, gardenHedge, gardenTree, gravelPath } from './garden';

// How much world each kind of furniture needs to be framed in, so nothing is
// clipped. The pole is the awkward one: its wires reach most of a tile either
// side of the shaft.
export const PROP_VOLUME: Record<string, { x: number; y: number; z: number }> = {
  lantern: { x: 0.8, y: 1.5, z: 0.8 },
  vending: { x: 0.9, y: 0.9, z: 0.9 },
  bikes: { x: 1.6, y: 0.8, z: 1.0 },
  pole: { x: 2.6, y: 2.0, z: 1.0 },
  tree: { x: 1.6, y: 2.2, z: 1.6 },
  hedge: { x: 1.6, y: 0.7, z: 1.1 },
  gate: { x: 3.0, y: 0.9, z: 1.0 },
  bush: { x: 0.9, y: 0.6, z: 0.9 },
};

const DEFAULT_VOLUME = { x: 1.2, y: 1.2, z: 1.2 };

export function propVolume(kind: string): { x: number; y: number; z: number } {
  return PROP_VOLUME[kind] ?? DEFAULT_VOLUME;
}

// The kinds the street generator knows how to place. Anything else is skipped
// rather than exported as an empty sprite.
export const PROP_KINDS = Object.keys(PROP_VOLUME);

export function propGeometry(kind: string, variant: number): THREE.BufferGeometry | null {
  // the variant is folded into the string, so variant 12 is not variant 1 again
  const seed = strHash(`${kind}:${variant}`);
  const pack = getPack('japanese');
  const pal = pack.palette(seed, null);
  const gb = new GeoBuilder();
  const c = makeContext({
    gb,
    rng: new RNG(seed),
    pal,
    form: formOf(seed, pack.formTable(pal.style), pal),
    detail: 1,
    overrides: {},
    frame: pal.frame,
    winH: pal.winH,
    arched: false,
    shutters: pal.shutters,
    flowerBoxes: pal.flowerBoxes,
  });

  switch (kind) {
    case 'lantern': {
      // a post lantern rather than the wall bracket the facade uses
      const top = 0.98;
      gb.cyl(0, 0, 0, 0.024, 0.032, top, 8, '#3c3c42');
      gb.cyl(0, top, 0, 0.034, 0.024, 0.022, 8, '#4c4c54');
      lantern(c, 0, top + 0.17, -0.14, '#d8453a', 0.052);
      break;
    }
    case 'vending':
      vendingMachine(c, 0, 0, 0, variant % 2 === 0 ? undefined : pal.accent);
      break;
    case 'bikes': {
      // a rack of three bikes is wider than one, so the variant has to be
      // decided from the seed rather than handed in: a street asking for
      // variant 2 still gets a believable prop
      const rack = (variant + strHash(`${kind}`)) % 2 === 0;
      if (rack) bikePark(c, 0, 0, 3, 0);
      else bicycle(c, 0, 0, 0);
      break;
    }
    case 'pole':
      utilityPole(c, 0, 0, 1.5, true);
      break;
    case 'tree':
      streetTree(c, 0, 0, 1.35);
      break;
    case 'hedge':
      // a garden hedge run, one tile long, standing on its own ground
      gravelPath(c, 0, 0, 1.15, 0.75);
      gardenHedge(c, 0, 0, 1.1, 0.24, 0.13);
      bush(c, -0.62, 0.05, 0.85);
      bush(c, 0.62, -0.05, 0.8);
      break;
    case 'gate': {
      // two gate piers with caps, and the low fence running away from each
      for (const s of [-1, 1]) {
        gb.cbox(s * 0.55, 0, 0, 0.1, 0.34, 0.1, '#8f8676', 0, 0.012);
        gb.cbox(s * 0.55, 0.34, 0, 0.14, 0.04, 0.14, '#9a9284', 0, 0.008);
      }
      fenceRun(c, -0.62, 0, -1.35, 0);
      fenceRun(c, 0.62, 0, 1.35, 0);
      break;
    }
    case 'bush':
      bush(c, 0, 0, 1);
      flowerBed(c, 0.1, 0.08, 4, 0.05);
      break;
    default:
      return null;
  }
  return gb.build();
}
