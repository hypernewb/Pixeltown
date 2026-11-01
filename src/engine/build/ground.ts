// The ground a street stands on: road, gutter, kerb, pavement, verge and plot
// earth.
//
// It is baked as a narrow slice, one tile wide, running the full depth of the
// map, and then repeated along the street by the exporter. That works because
// the ground pattern only changes along z: the camera is orthographic and
// looks along a fixed diagonal, so stepping one tile in x moves the picture
// by exactly the same amount every time. One small image covers a whole street.
//
// Two rules follow from that repetition and both are easy to get wrong.
//
// The strip is built out of solid columns, not thin caps. A road sunk below its
// kerb has a vertical face between the two, and a stack of thin slabs leaves
// that face missing, so you see straight through the street at every change of
// level. Each band is one box reaching from the bed up to its own surface, so
// neighbouring bands meet in a real wall and the section is watertight.
//
// And because the strip repeats along x, only marks that run *along* the street
// can be drawn. A drain cover or a single fallen leaf would repeat at every
// tile and read as a stripe. The road itself is therefore left plain: any mark
// on it would repeat into the striping this strip is meant to avoid.

import * as THREE from 'three';
import { GeoBuilder, shade } from '../geo';
import { RNG } from '../rng';

export interface GroundBand {
  z0: number;
  z1: number;
  color: string;
  // height of this band's surface, in world units. The road is the datum: the
  // kerb rises above it and the pavement sits between the two, which is what
  // gives the street a section rather than a flat sheet of colour.
  level: number;
}

// The street's cross-section, in world units. One art pixel is 1/32 of a unit,
// so the pavement stands about two pixels above the road — enough to read as a
// kerb at a glance rather than as a change of paint.
//
// The road is the datum and it sits at zero, with everything else built up from
// it. The road could just as well be sunk below zero, but the bake frames the
// world from y = 0 upward: anything below that line falls outside the camera and
// is silently cut off, so the whole section has to stand on zero rather than
// hang under it.
const LEVEL = {
  bed: 0,
  road: 0.005,
  gutter: 0.02,
  kerb: 0.065,
  walk: 0.065,
  verge: 0.055,
  earth: 0.065,
};

export const GROUND_COLORS = {
  asphalt: '#4c5057',
  gutter: '#34373d',
  kerb: '#a8a296',
  kerbEdge: '#6f6a60',
  walk: '#a9a396',
  walkSlab: '#b4aea0',
  walkJoint: '#8a8472',
  verge: '#6d7f52',
  grass: '#5e6f47',
  earth: '#8d7c5f',
  dirt: '#6d6047',
  bed: '#443f36',
};

// How wide the slice is, in tiles. Slightly more than one so neighbouring
// slices overlap and no seam shows between them.
export const STRIP_WIDTH = 1.12;

// Detail stays inside half a tile of the centre line, so the pattern is exactly
// periodic at one tile and two copies meet without a step.
const DETAIL_HALF = 0.5;

export function groundStrip(
  z0: number,
  z1: number,
  bands: readonly GroundBand[],
  width = STRIP_WIDTH,
  base = GROUND_COLORS.bed,
  detailSeed = 1,
): THREE.BufferGeometry | null {
  const gb = new GeoBuilder();
  const cz = (z0 + z1) / 2;
  const depth = z1 - z0;

  // the bed every band stands on, so a gap between two bands shows earth
  // rather than a hole through to nothing
  gb.box(0, LEVEL.bed, -cz, width, 0.02, depth, base);

  for (const band of bands) {
    const len = band.z1 - band.z0;
    if (len <= 0) continue;
    gb.box(0, LEVEL.bed, (band.z0 + band.z1) / 2 - cz, width, band.level - LEVEL.bed, len, band.color);
  }

  addDetail(gb, bands, cz, detailSeed);
  return gb.build();
}

// The shadow that falls across a street is not drawn here, and deliberately so.
//
// The strip repeats along the street, so anything painted into it repeats too:
// a shadow painted once would appear under every building at the same place,
// which is worse than no shadow at all. Real cast shadow varies along the
// street, and a repeating tile cannot hold it.
//
// The strip does not need it. Every band is a solid column, so the kerb has a
// real vertical face turning down to the road, and the sun lights the face on
// one side of the street while leaving the other in shade. The section is
// itself the light direction, and it costs nothing to repeat.

// The pixel-scale dressing: kerb stones with a joint between them, a centre
// line, paving joints across the pavement, wheel-worn tracks, grass tufts. Each
// mark is a thin plate lying on its band's surface, so it reads as texture on
// the road rather than as an object standing on it.
function addDetail(gb: GeoBuilder, bands: readonly GroundBand[], cz: number, seed: number): void {
  const rng = new RNG(seed >>> 0);

  // a plate on a band's surface: `len` deep in z, from x0 to x1 across the
  // strip. Both x limits default to the full periodic width.
  const plate = (
    z: number, len: number, level: number, h: number,
    color: THREE.ColorRepresentation, x0 = -DETAIL_HALF, x1 = DETAIL_HALF,
  ): void => {
    if (len <= 0 || x1 - x0 <= 0) return;
    gb.box((x0 + x1) / 2, level, z - cz, x1 - x0, h, len, color);
  };

  for (const band of bands) {
    const len = band.z1 - band.z0;
    if (len <= 0) continue;
    const mid = (band.z0 + band.z1) / 2;

    if (band.color === GROUND_COLORS.asphalt) {
      // plain asphalt: no marks at all, so the road stops reading as stripes
    } else if (band.color === GROUND_COLORS.gutter) {
      // the channel itself, a dark line at the foot of the kerb
      plate(mid, len * 0.6, band.level + 0.002, 0.005, GROUND_COLORS.gutter);
    } else if (band.color === GROUND_COLORS.kerb) {
      // kerb stones laid end to end, each a whole number of pixels long so the
      // joints stay even all the way down the street
      const stone = 0.25;
      for (let z = band.z0; z < band.z1 - 1e-6; z += stone) {
        const s = Math.min(stone - 0.022, band.z1 - z);
        if (s <= 0) break;
        plate(z + s / 2, s, band.level + 0.004, 0.012, shade(GROUND_COLORS.kerb, rng.float(0.95, 1.05)));
        plate(z + s + 0.011, 0.022, band.level + 0.004, 0.01, GROUND_COLORS.kerbEdge);
      }
      // the shadowed line where the kerb turns over into the road
      plate(band.z0 + len * 0.18, 0.03, band.level + 0.005, 0.006, shade(GROUND_COLORS.kerb, 0.66));
    } else if (band.color === GROUND_COLORS.walk) {
      // paving: slabs a half tile across, a joint between each pair
      const slab = 0.5;
      let k = 0;
      for (let z = band.z0; z < band.z1 - 1e-6; z += slab) {
        const s = Math.min(slab - 0.028, band.z1 - z);
        if (s <= 0) break;
        plate(z + s / 2, s, band.level + 0.002, 0.004, k % 2 ? GROUND_COLORS.walk : GROUND_COLORS.walkSlab);
        plate(z + s + 0.014, 0.02, band.level + 0.002, 0.004, GROUND_COLORS.walkJoint);
        k++;
      }
    } else if (band.color === GROUND_COLORS.verge || band.color === GROUND_COLORS.earth) {
      // grass tufts on the verge, scuffed dirt on the plot earth. Drawn as
      // short lengthwise marks at scattered depths, which reads as mottled
      // ground without turning into stripes.
      const green = band.color === GROUND_COLORS.verge;
      const n = Math.round(len * 7);
      // A tuft is a mark of some length centred on z, so z has to stay half a
      // tuft clear of the band's ends. Inset by the tuft's own half-length
      // rather than by a fixed amount, or the longest tufts hang past the end
      // of the strip and the ground stops covering exactly the map.
      const maxTuft = 0.16;
      if (len > maxTuft + 0.02) {
        for (let k = 0; k < n; k++) {
          const w = rng.float(0.06, maxTuft);
          const z = rng.float(band.z0 + w / 2 + 0.005, band.z1 - w / 2 - 0.005);
          const x0 = rng.float(-DETAIL_HALF, DETAIL_HALF - maxTuft);
          const col = green
            ? (rng.chance(0.7) ? shade(GROUND_COLORS.grass, rng.float(0.85, 1.15)) : shade(GROUND_COLORS.verge, rng.float(0.9, 1.1)))
            : (rng.chance(0.6) ? shade(GROUND_COLORS.dirt, rng.float(0.85, 1.1)) : shade(GROUND_COLORS.earth, rng.float(0.92, 1.06)));
          plate(z, w, band.level + 0.002, green ? 0.007 : 0.003, col, x0, Math.min(DETAIL_HALF, x0 + w));
        }
      }
    }
  }
}

// The bands a street needs, worked out from where its buildings actually sit
// rather than from a fixed layout. Each side of the road is laid out from the
// kerb outwards and then mirrored, so the two sides are guaranteed to be each
// other's reflection and the street reads as symmetric.
export function streetGround(
  roadWidth: number,
  plots: readonly { z0: number; z1: number }[],
): { z0: number; z1: number; bands: GroundBand[] } {
  const road = Math.max(2, roadWidth);
  const half = road / 2;
  // the section, measured out from the edge of the road
  const gutter = 0.14;
  const kerb = 0.12;
  const walk = 0.6;
  const verge = 0.4;
  const front = gutter + kerb + walk + verge;

  let plotMin = -half - walk;
  let plotMax = half + walk;
  for (const p of plots) {
    plotMin = Math.min(plotMin, p.z0);
    plotMax = Math.max(plotMax, p.z1);
  }

  const z0 = plotMin - 1.6;
  const z1 = plotMax + 1.6;

  const side = (s: 1 | -1): GroundBand[] => {
    const at = (d: number): number => s * (half + d);
    const span = (a: number, b: number, color: string, level: number): GroundBand =>
      s > 0
        ? { z0: at(a), z1: at(b), color, level }
        : { z0: at(b), z1: at(a), color, level };
    const out: GroundBand[] = [
      span(0, gutter, GROUND_COLORS.gutter, LEVEL.gutter),
      span(gutter, gutter + kerb, GROUND_COLORS.kerb, LEVEL.kerb),
      span(gutter + kerb, gutter + kerb + walk, GROUND_COLORS.walk, LEVEL.walk),
      span(gutter + kerb + walk, front, GROUND_COLORS.verge, LEVEL.verge),
    ];
    // the plot earth runs from the back of the verge to the edge of the strip
    const outer = s > 0 ? z1 : z0;
    const earth = s > 0 ? { z0: at(front), z1: outer } : { z0: outer, z1: at(front) };
    out.push({ ...earth, color: GROUND_COLORS.earth, level: LEVEL.earth });
    return out;
  };

  const bands: GroundBand[] = [
    { z0: -half, z1: half, color: GROUND_COLORS.asphalt, level: LEVEL.road },
    ...side(1),
    ...side(-1),
  ];
  return { z0, z1, bands };
}
