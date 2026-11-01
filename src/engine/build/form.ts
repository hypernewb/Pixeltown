// Deriving a building's shape from its seed and its pack's tendencies. Because
// this runs off the seed alone, a building keeps its form as it is regenerated,
// restyled or upgraded, and every part of it stays reproducible.

import { RNG } from '../rng';
import type { Form, FormTable, Palette, RoofStyle } from '../types';

const GABLE_ROOFS: RoofStyle[] = ['halfhip', 'saltbox', 'crossgable'];

export function formOf(seed: number, table: FormTable, pal: Palette): Form {
  const v = seed >>> 0;
  const own = (salt: number): RNG => new RNG((v ^ Math.imul(salt * 2 + 1, 0x9e3779b1)) >>> 0);
  const S = table;
  const r = own(101);
  const F: Form = {
    roofs: { gable: r.weighted(S.gable), hip: r.weighted(S.hip) },
    front: r.chance(S.front) ? 'gable' : 'eaves',
    gable: r.weighted(S.gables),
    dormer: r.weighted([['gable', 4], ['flat', 2], ['hip', 2], [null, 3]] as const),
    porch: r.chance(0.7) ? r.weighted(S.porch) : null,
    bay: r.weighted([['canted', 3], ['tall', 2], [null, 4]] as const),
    balcony: r.weighted(S.balcony),
    turret: r.weighted(S.turret),
    crest: r.weighted(S.crest),
    shopfront: r.weighted(S.shopfront),
    sign: r.weighted(S.sign),
    plan: r.int(0, 59),
    tall: r.chance(0.4) ? 1 : 0,
    side: r.chance(0.5) ? 1 : -1,
    a: r.next(),
    b: r.next(),
  };
  // an artist's material override keeps its own roof where it names one
  if (pal.forced && pal.roofStyle && GABLE_ROOFS.includes(pal.roofStyle)) F.roofs.gable = pal.roofStyle;
  return F;
}

// The roof a building gets for the kind its template asks for.
export function roofFor(form: Form, kind: RoofStyle): RoofStyle {
  if (kind === 'gable') return form.roofs.gable;
  if (kind === 'hip') return form.roofs.hip;
  return kind;
}

// One of a template's own plans: n of them, the same at every level.
export const planOf = (form: Form, n: number, salt = 0): number => (salt ? (form.plan * 7 + salt * 13) % n : form.plan % n);
