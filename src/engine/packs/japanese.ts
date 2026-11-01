// The Japanese style pack. Everything specific to the look lives here: the
// materials, the five architectural families, and the parts the inspector can
// swap.
//
// A family is not a size of building. It is a way of building. A machiya is a
// narrow timber townhouse under a steep tile roof, with a lattice front and a
// sliding entrance. The modern house, the Showa shop, the apartment block and the
// commercial block are flat-roofed concrete and render buildings: their
// silhouettes come from floor count, window rhythm, and what is attached to the
// outside (balconies, external stairs, shutters, rooftop plant), not from a
// pitched roof. A street of them reads as five kinds of building rather than one
// box in five colours.
//
// A material, by contrast, is only what a family is built from. Any family may
// wear most of the materials, and a material implies a shape as well as a
// colour: charred cedar wants a steep narrow roof, rendered concrete a flat one.

import { RNG } from '../rng';
import type { BuildPlan, BuildingTemplate, StylePack } from './pack';
import type { BuildingRecipe, Form, FormTable, Palette, PartSlot, RoofStyle } from '../types';

// ---------------------------------------------------------------- materials

const KAWARA = ['#3d4750', '#46525c', '#333c44', '#4e5a64', '#2c353d', '#525a5e', '#4a6b58', '#8a5a44', '#5f5348'];
const KAWARA_BROWN = ['#5a4a3c', '#4e4034', '#665545', '#584a3e', '#7a5c40'];
const METAL_ROOF = ['#5a6a72', '#4a5a62', '#6a7a80', '#3f4a52', '#6a6a62', '#4a4a52', '#6e7a74', '#7a7468'];
const ASPHALT_ROOF = ['#55595d', '#4a4e52', '#62666a', '#3e4246'];
const SHIKKUI = ['#e8e2d2', '#ded6c4', '#efe9db', '#e2dccc', '#d6cebc', '#eae4d6'];
const ITABARI = ['#6a5540', '#5a4634', '#7a6248', '#4a3a2c', '#8a7050', '#66513c'];
const YAKISUGI = ['#3a322c', '#2e2822', '#463c34', '#524640', '#332c26'];
const NAMAKO = ['#33302c', '#3c3832', '#2a2824'];
const STUCCO = ['#c8c2b4', '#b4ae9e', '#d2ccc0', '#a8a294', '#bdb6a8', '#c4b8a4'];
const CONCRETE = ['#b9b7af', '#a9a79f', '#c6c4bc', '#9d9b93', '#b1afa6'];
const CORRUGATED = ['#6c7478', '#5c6468', '#7a8286', '#505a5e', '#68706a'];
const TILE_CLAD = ['#8a8478', '#7a7468', '#969084', '#6e685e'];
const PAINTED = ['#9ab4bc', '#8aa0a8', '#9ab0a4', '#b4a89a', '#7a929c', '#c0b49c', '#cfc4aa'];
const WOOD = ['#7a5a3c', '#6e5034', '#86663f', '#755636', '#8a6a48', '#5e4630'];
const STONE_WALLS = ['#a99f90', '#9a907f', '#b3a996', '#a39784', '#bdb3a0'];
const DOORS = ['#5c3d26', '#6b3a2a', '#3f4f5a', '#4a5a3a', '#6e4a2e', '#4e3828'];
const ACCENT = ['#a8382c', '#2f4a6a', '#3f6a4a', '#c09040', '#5a3a4a', '#3f4f5a', '#8a3a2a', '#6a4a2a'];
const FABRIC = ['#a8382c', '#2f4a6a', '#3f6a4a', '#c8a038', '#6a3a5a', '#b4653f', '#2f6a6a'];

const weighted = <K extends string>(r: RNG, table: readonly (readonly [K, number])[]): K => r.weighted(table);

// The materials a building can be built from, and what each one implies.
const STYLE_MATERIALS: Record<string, { walls: string[]; roof: string[]; trim: string; timber: boolean; window: string }> = {
  shikkui: { walls: SHIKKUI, roof: KAWARA, trim: '#e6dcc4', timber: false, window: '#4a3a2c' },
  itabari: { walls: ITABARI, roof: KAWARA_BROWN, trim: '#d8c8a8', timber: true, window: '#3a2e22' },
  yakisugi: { walls: YAKISUGI, roof: KAWARA, trim: '#c8b898', timber: true, window: '#2a2622' },
  namako: { walls: NAMAKO, roof: KAWARA, trim: '#e2d8c4', timber: false, window: '#3a3630' },
  stucco: { walls: STUCCO, roof: METAL_ROOF, trim: '#e8e4da', timber: false, window: '#3f4a52' },
  concrete: { walls: CONCRETE, roof: ASPHALT_ROOF, trim: '#d8d6cf', timber: false, window: '#34404a' },
  corrugated: { walls: CORRUGATED, roof: ASPHALT_ROOF, trim: '#8a9196', timber: false, window: '#2e363c' },
  tileclad: { walls: TILE_CLAD, roof: METAL_ROOF, trim: '#d8d4c8', timber: false, window: '#3a444a' },
  painted: { walls: PAINTED, roof: METAL_ROOF, trim: '#eae6dc', timber: false, window: '#3a444a' },
};

// The shape a material implies, as distinct from its colour. Two walls painted
// the same green still have to read as different buildings: a cedar house has a
// steep roof and narrow openings, rendered concrete has a flat roof and the
// widest glazing of all.
const MATERIAL_FORM: Record<string, { pitch: [number, number]; winW: [number, number] }> = {
  shikkui: { pitch: [0.34, 0.46], winW: [0.3, 0.4] },
  itabari: { pitch: [0.26, 0.36], winW: [0.34, 0.46] },
  yakisugi: { pitch: [0.4, 0.56], winW: [0.22, 0.32] },
  namako: { pitch: [0.34, 0.44], winW: [0.24, 0.32] },
  stucco: { pitch: [0.14, 0.24], winW: [0.4, 0.54] },
  concrete: { pitch: [0.1, 0.16], winW: [0.5, 0.7] },
  corrugated: { pitch: [0.08, 0.14], winW: [0.36, 0.48] },
  tileclad: { pitch: [0.16, 0.26], winW: [0.36, 0.5] },
  painted: { pitch: [0.2, 0.32], winW: [0.38, 0.52] },
};

export const JAPANESE_STYLES = [
  { id: 'shikkui', name: 'Shikkui plaster', description: 'White lime plaster over a timber frame, dark tile roof' },
  { id: 'itabari', name: 'Timber siding', description: 'Horizontal cedar boards, deep brown eaves' },
  { id: 'yakisugi', name: 'Yakisugi', description: 'Charred cedar cladding, near-black and modern-traditional' },
  { id: 'namako', name: 'Namako wall', description: 'Dark storehouse wall with its white mortar grid' },
  { id: 'stucco', name: 'Modern stucco', description: 'Rendered wall with a standing-seam metal roof' },
  { id: 'concrete', name: 'Board-marked concrete', description: 'Grey concrete with an asphalt roof, for flat-roofed blocks' },
  { id: 'tileclad', name: 'Tile clad', description: 'Small ceramic tiles on a commercial block' },
  { id: 'painted', name: 'Painted render', description: 'Muted painted render, the common modern house' },
];

// -------------------------------------------------------------- the families

export interface Family {
  id: string;
  name: string;
  category: 'residential' | 'commercial' | 'hospitality';
  description: string;
  footprint: { minW: number; maxW: number; minD: number; maxD: number };
  floors: { min: number; max: number };
  roofStyles: RoofStyle[];
  commercial: boolean;
  // commercial floors sit lower than domestic ones, so a shop can stack three
  // storeys in the height a house gives to two
  floorHeight: number;
  roofK: BuildPlan['roofK'];
  // which materials this family is built from, with weights
  materials: [string, number][];
  // how likely each attached structure is. These are the parts that change the
  // mass of the building rather than decorating it.
  lattice: number;
  engawa: number;
  walkway: number;
  decorated: number;
  tsubo: number;
  // how often a second volume is fused to the main mass, and which kind
  annex: 'wing' | 'outshoot' | 'none';
  annexChance: number;
  parts: {
    shopfront: [string | null, number][];
    awning: [string | null, number][];
    sign: [string | null, number][];
    balcony: [string | null, number][];
    porch: [string | null, number][];
  };
}

const FLAT: BuildPlan['roofK'] = { pitch: 0, eave: 0, ridgeAlong: null };
const NO_PARTS: Family['parts'] = {
  shopfront: [[null, 1]],
  awning: [[null, 1]],
  sign: [[null, 1]],
  balcony: [[null, 1]],
  porch: [[null, 1]],
};

export const FAMILIES: Family[] = [
  {
    id: 'modern',
    name: 'Modern house',
    category: 'residential',
    description: 'A narrow three-storey house on a flat roof: a recessed entrance, uneven window placement, a small balcony and air conditioning on the wall',
    footprint: { minW: 2.4, maxW: 3.2, minD: 4, maxD: 6 },
    floors: { min: 2, max: 3 },
    roofStyles: ['parapet'],
    commercial: false,
    floorHeight: 0.7,
    roofK: FLAT,
    materials: [['stucco', 4], ['painted', 3], ['concrete', 2]],
    lattice: 0,
    engawa: 0,
    walkway: 0,
    decorated: 0,
    tsubo: 0,
    annex: 'none',
    annexChance: 0,
    parts: { ...NO_PARTS, balcony: [['rail', 1]] },
  },
  {
    id: 'machiya',
    name: 'Machiya',
    category: 'residential',
    description: 'The narrow townhouse: a long plot, a ridge running back from the street, a lattice front and a courtyard garden behind',
    footprint: { minW: 2, maxW: 3, minD: 4, maxD: 6 },
    floors: { min: 2, max: 2 },
    roofStyles: ['gable', 'halfhip', 'hip'],
    commercial: false,
    floorHeight: 0.82,
    // the ridge runs front to back, so the gable end faces the street and the
    // eaves run down onto the neighbours. Steep, with eaves deep enough to
    // shade the whole front in summer.
    roofK: { pitch: 1.12, eave: 0.26, ridgeAlong: true },
    materials: [['itabari', 5], ['yakisugi', 3], ['shikkui', 3], ['namako', 1]],
    lattice: 0.9,
    engawa: 0,
    walkway: 0,
    decorated: 0.4,
    tsubo: 0.7,
    annex: 'outshoot',
    annexChance: 0.3,
    parts: {
      shopfront: [['plain', 3], ['pilasters', 2]],
      awning: [['fabric', 2], [null, 3]],
      sign: [['blade', 2], ['eaves', 2], [null, 3]],
      balcony: [['rail', 3], ['gallery', 1], [null, 3]],
      porch: [['canopy', 3], [null, 2]],
    },
  },
  {
    id: 'showa',
    name: 'Showa shop',
    category: 'commercial',
    description: 'A shopping-street building of one to three storeys: a roller shutter or glazed front at street level, a signboard, and aged tile above',
    footprint: { minW: 2.6, maxW: 4, minD: 3, maxD: 4.5 },
    floors: { min: 1, max: 3 },
    roofStyles: ['parapet'],
    commercial: true,
    floorHeight: 0.74,
    roofK: FLAT,
    materials: [['tileclad', 3], ['painted', 3], ['concrete', 2]],
    lattice: 0,
    engawa: 0,
    walkway: 0,
    decorated: 0,
    tsubo: 0,
    annex: 'none',
    annexChance: 0,
    parts: {
      shopfront: [['plain', 2], ['pilasters', 1]],
      awning: [['fabric', 3], [null, 1]],
      sign: [['blade', 2], ['band', 2]],
      balcony: [[null, 1]],
      porch: [[null, 1]],
    },
  },
  {
    id: 'apartment',
    name: 'Apartment block',
    category: 'residential',
    description: 'Two to four storeys of repeated flats: an open corridor along the front, a flank stair, and meters at street level',
    footprint: { minW: 4.5, maxW: 6.5, minD: 3, maxD: 4 },
    floors: { min: 2, max: 4 },
    roofStyles: ['parapet'],
    commercial: false,
    floorHeight: 0.66,
    roofK: FLAT,
    materials: [['concrete', 4], ['stucco', 2], ['painted', 2]],
    lattice: 0,
    engawa: 0,
    walkway: 1,
    decorated: 0,
    tsubo: 0,
    annex: 'none',
    annexChance: 0,
    parts: { ...NO_PARTS, balcony: [['gallery', 1]] },
  },
  {
    id: 'commercial',
    name: 'Commercial block',
    category: 'commercial',
    description: 'A contemporary mixed-use block: a glazed ground floor under a signband, ribbon windows, and rooftop plant',
    footprint: { minW: 4, maxW: 6, minD: 4, maxD: 5 },
    floors: { min: 1, max: 4 },
    roofStyles: ['parapet'],
    commercial: true,
    floorHeight: 0.72,
    roofK: FLAT,
    materials: [['concrete', 4], ['stucco', 2], ['corrugated', 2]],
    lattice: 0,
    engawa: 0,
    walkway: 0,
    decorated: 0,
    tsubo: 0,
    annex: 'none',
    annexChance: 0,
    parts: {
      shopfront: [['transom', 2], ['plain', 1]],
      awning: [[null, 1]],
      sign: [['band', 1]],
      balcony: [[null, 1]],
      porch: [[null, 1]],
    },
  },
];

const familyOf = (template: string): Family => FAMILIES.find((f) => f.id === template) ?? FAMILIES[0];

export function japanesePalette(seed: number, style: string | null, template?: string): Palette {
  const r = new RNG(seed);
  const fam = familyOf(template ?? 'machiya');
  const s = style && STYLE_MATERIALS[style] ? style : weighted(r, fam.materials);
  const mat = STYLE_MATERIALS[s];
  const wall = r.pick(mat.walls);
  const roofStyle = weighted<RoofStyle>(r, [['gable', 5], ['hip', 3], ['halfhip', 2], ['crossgable', 2], ['parapet', 2], ['saltbox', 1]]);
  const roof = r.pick(mat.roof);
  const accent = r.pick(ACCENT);
  const metal = r.pick(['#b9bcbd', '#a8acae', '#c4c8c8', '#9a9ea0']);
  return {
    style: s,
    wall,
    lower: r.chance(0.5) ? r.pick(STONE_WALLS) : r.pick(TILE_CLAD),
    stoneWall: r.pick(STONE_WALLS),
    brick: r.pick(TILE_CLAD),
    wood: r.pick(WOOD),
    roof,
    roofStyle,
    thatch: '#a8854c',
    slate: r.pick(KAWARA),
    tile: r.pick(KAWARA),
    door: r.chance(0.6) ? r.pick(mat.walls) : r.pick(DOORS),
    accent,
    frame: mat.window,
    awning: r.pick(FABRIC),
    awning2: r.chance(0.5) ? '#e9dfc9' : r.pick(FABRIC),
    leaf: r.pick(['#5f8a42', '#55803c', '#6a9448', '#4e7638']),
    trim: mat.trim,
    timber: mat.timber,
    thatched: false,
    hip: roofStyle === 'hip',
    alongZ: false,
    stoneHouse: s === 'namako',
    pitch: r.float(MATERIAL_FORM[s].pitch[0], MATERIAL_FORM[s].pitch[1]),
    winW: r.float(MATERIAL_FORM[s].winW[0], MATERIAL_FORM[s].winW[1]),
    winH: r.float(0.9, 1.1),
    jetty: false,
    bay: false,
    porch: r.chance(0.5),
    ivy: false,
    extChimney: false,
    chimneys: 0,
    shutters: r.chance(0.35) ? r.pick(['#8a6a48', '#6a5540', '#4a3a2c']) : null,
    flowerBoxes: r.chance(0.35),
    fence: r.pick(['block', 'hedge', 'none', 'none']),
    tint: [r.float(-0.06, 0.06), r.float(-0.05, 0.05), r.float(-0.08, 0.02)],
    metal,
    fabric: r.pick(FABRIC),
    glow: '#ffd9a0',
    stone: r.pick(STONE_WALLS),
    forced: !!style,
  };
}

// ------------------------------------------------------------- tendencies

// How each family likes its roofs and its optional parts. Keyed by family rather
// than by material: a flat-roofed block and a pitched machiya in the same tile
// are different buildings, and the tables say which is which.
const FLAT_TABLE: FormTable = {
  gable: [['parapet', 1]],
  hip: [['parapet', 1]],
  front: 0.5,
  gables: [['plain', 1]],
  porch: [[null, 1]],
  balcony: [['rail', 1], [null, 1]],
  turret: [[null, 1]],
  crest: [[null, 1]],
  shopfront: [['plain', 1]],
  sign: [['band', 1]],
};

const TABLES: Record<string, FormTable> = {
  machiya: {
    gable: [['gable', 6], ['halfhip', 2], ['hip', 1]],
    hip: [['hip', 3], ['gable', 2]],
    front: 0.85,
    gables: [['plain', 5], ['stepped', 2]],
    porch: [['canopy', 3], [null, 2]],
    balcony: [['rail', 3], ['gallery', 1], [null, 3]],
    turret: [[null, 9]],
    crest: [['finials', 3], [null, 4]],
    shopfront: [['plain', 3], ['pilasters', 2]],
    sign: [['blade', 3], ['eaves', 2], [null, 3]],
  },
  modern: FLAT_TABLE,
  showa: { ...FLAT_TABLE, shopfront: [['plain', 2], ['pilasters', 1]], sign: [['blade', 2], ['band', 2]] },
  apartment: { ...FLAT_TABLE, balcony: [['gallery', 1]] },
  commercial: { ...FLAT_TABLE, shopfront: [['transom', 2], ['plain', 1]] },
};

export function japaneseFormTable(template: string): FormTable {
  return TABLES[template] ?? TABLES.machiya;
}

// -------------------------------------------------------------- templates

export const JAPANESE_TEMPLATES: BuildingTemplate[] = FAMILIES.map((f) => ({
  id: f.id,
  name: f.name,
  category: f.category,
  description: f.description,
  footprint: f.footprint,
  floors: f.floors,
  roofStyles: f.roofStyles,
  commercial: f.commercial,
}));

// ---------------------------------------------------------------- options

export const JAPANESE_ROOFS = [
  { id: 'kawara', name: 'Kawara, dark', color: '#3d4750' },
  { id: 'kawara-brown', name: 'Kawara, brown', color: '#5a4a3c' },
  { id: 'kawara-blue', name: 'Kawara, glazed blue', color: '#3a5a6e' },
  { id: 'kawara-green', name: 'Kawara, glazed green', color: '#4a6b58' },
  { id: 'kawara-red', name: 'Aged red tile', color: '#8a5a44' },
  { id: 'metal', name: 'Standing seam metal', color: '#5a6a72' },
  { id: 'metal-weathered', name: 'Weathered metal', color: '#6e7a74' },
  { id: 'asphalt', name: 'Asphalt', color: '#55595d' },
  { id: 'thatch', name: 'Thatch', color: '#a8854c' },
];

export const JAPANESE_WALLS = [
  { id: 'shikkui', name: 'Shikkui plaster', color: '#e8e2d2' },
  { id: 'itabari', name: 'Timber siding', color: '#6a5540' },
  { id: 'yakisugi', name: 'Yakisugi', color: '#3a322c' },
  { id: 'namako', name: 'Namako wall', color: '#33302c' },
  { id: 'stucco', name: 'Modern stucco', color: '#c8c2b4' },
  { id: 'concrete', name: 'Board-marked concrete', color: '#b9b7af' },
  { id: 'corrugated', name: 'Corrugated metal', color: '#6c7478' },
  { id: 'tileclad', name: 'Tile clad', color: '#8a8478' },
  { id: 'painted', name: 'Painted render', color: '#6b7f86' },
];

export const JAPANESE_PART_OPTIONS: Record<PartSlot, string[]> = {
  roof: ['kawara', 'kawara-brown', 'kawara-blue', 'kawara-green', 'kawara-red', 'metal', 'metal-weathered', 'asphalt', 'thatch'],
  walls: ['shikkui', 'itabari', 'yakisugi', 'namako', 'stucco', 'concrete', 'corrugated', 'tileclad', 'painted'],
  groundFloor: ['same', 'tile', 'stone', 'timber'],
  door: ['sliding', 'hinged', 'shutter'],
  windows: ['lattice', 'plain', 'shoji'],
  balcony: ['rail', 'gallery', 'none'],
  shopfront: ['plain', 'pilasters', 'transom', 'recessed'],
  sign: ['blade', 'band', 'eaves', 'none'],
  awning: ['fabric', 'none'],
  entrance: ['noren', 'none'],
  utilities: ['ac', 'meter', 'pipes', 'none'],
  props: ['vending', 'bikes', 'lanterns', 'clutter', 'none'],
};

export function japanesePlanFromRecipe(
  recipe: BuildingRecipe,
  pal: Palette,
  form: Form,
  rng: RNG,
): BuildPlan {
  const templateId = recipe.template;
  const fam = familyOf(templateId);
  const floors = recipe.floors;
  const detail = recipe.detail;
  // A family's roof form belongs to the family, not to its paint: a machiya
  // gets a ridge running back from the street, a flat block gets a parapet.
  const roofStyle: RoofStyle = recipe.overrides.roof === 'thatch'
    ? 'thatch'
    : recipe.roofStyle ?? (fam.roofStyles.includes(pal.roofStyle) ? pal.roofStyle : fam.roofStyles[0]);

  const pick = (table: [string | null, number][], fallback: string | null): string | null =>
    rng.weighted(table as readonly (readonly [string | null, number])[]) ?? fallback;

  const shopfront = fam.commercial ? pick(fam.parts.shopfront, 'plain') : null;
  const awning = fam.commercial && pick(fam.parts.awning, null) ? rng.chance(0.7) : false;
  const sign = pick(fam.parts.sign, null) !== null;
  const balconyKind = pick(fam.parts.balcony, null);

  return {
    templateId,
    w: recipe.width,
    d: recipe.depth,
    floors,
    floorHeight: fam.floorHeight,
    roofStyle,
    detail,
    frontGable: form.front === 'gable',
    roofK: fam.roofK,
    annex: recipe.width < 3.2 || recipe.depth < 3.2 ? 'none' : (rng.chance(fam.annexChance) ? fam.annex : 'none'),
    parts: {
      balcony: floors > 1 && balconyKind !== null,
      shopfront: shopfront !== null,
      awning,
      sign,
      vending: rng.chance(0.34 * detail),
      bikes: rng.chance(0.48 * detail),
      ac: rng.chance(0.75 * detail),
      pole: rng.chance(0.58 * detail),
      lanterns: fam.commercial || pal.style === 'yakisugi' ? rng.chance(0.55) : false,
      engawa: rng.chance(fam.engawa),
      walkway: floors > 1 && rng.chance(fam.walkway),
      decorated: floors > 1 && rng.chance(fam.decorated),
      lattice: rng.chance(fam.lattice),
      tsubo: rng.chance(fam.tsubo),
    },
  } satisfies BuildPlan;
}

export const japanesePack: StylePack = {
  id: 'japanese',
  name: 'Japanese',
  description: 'Five families: the modern house, the machiya, the Showa shop, the apartment block and the commercial block',
  tileSize: 1,
  palette: japanesePalette,
  styles: JAPANESE_STYLES,
  formTable: japaneseFormTable,
  templates: JAPANESE_TEMPLATES,
  planFor: japanesePlanFromRecipe,
  builders: {},
  partOptions: JAPANESE_PART_OPTIONS,
  roofOptions: JAPANESE_ROOFS,
  wallOptions: JAPANESE_WALLS,
};
