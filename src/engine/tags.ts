// Part tags. Every primitive the geometry builder emits is stamped with the
// role it plays, so the exporter can ask "where does the ground floor stop and
// the roof begin?" and get the answer from the geometry rather than from a
// guess about sprite proportions.

export const TAG = {
  ground: 0,
  upper: 1,
  roof: 2,
  fitting: 3,
  prop: 4,
  base: 5,
} as const;

export type PartTag = (typeof TAG)[keyof typeof TAG];

export const TAG_NAMES: Record<number, string> = {
  [TAG.ground]: 'ground floor',
  [TAG.upper]: 'upper floor',
  [TAG.roof]: 'roof',
  [TAG.fitting]: 'fitting',
  [TAG.prop]: 'prop',
  [TAG.base]: 'base',
};

// Foliage is not a band of a building, so it is not a tag: a tree keeps the tag
// that says where it draws, and carries this marker in the alpha channel of its
// emit attribute instead. It is deliberately outside the range the glow modes
// use (0 to 3) so a leaf can never be mistaken for a lit window.
export const LEAF_MARK = 6;
