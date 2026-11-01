// Shared vocabulary for the whole studio. The generation engine works in terms
// of these types and never in terms of Japanese architecture: a style pack is
// data, so a European or science-fiction pack can be dropped in unchanged.

import type { PinnedParts } from './parts';

export type RoofStyle =
  | 'gable'
  | 'hip'
  | 'halfhip'
  | 'crossgable'
  | 'saltbox'
  | 'mansard'
  | 'gambrel'
  | 'parapet'
  | 'thatch'
  | 'flat';

export type GableKind = 'plain' | 'stepped' | 'dutch' | 'curved';

export type PartSlot =
  | 'roof'
  | 'walls'
  | 'groundFloor'
  | 'door'
  | 'windows'
  | 'balcony'
  | 'shopfront'
  | 'sign'
  | 'awning'
  | 'entrance'
  | 'utilities'
  | 'props';

export const PART_SLOTS: PartSlot[] = [
  'roof',
  'walls',
  'groundFloor',
  'door',
  'windows',
  'balcony',
  'shopfront',
  'sign',
  'awning',
  'entrance',
  'utilities',
  'props',
];

export const SLOT_LABELS: Record<PartSlot, string> = {
  roof: 'Roof',
  walls: 'Walls',
  groundFloor: 'Ground floor',
  door: 'Door',
  windows: 'Windows',
  balcony: 'Balcony',
  shopfront: 'Shopfront',
  sign: 'Signage',
  awning: 'Awning',
  entrance: 'Entrance',
  utilities: 'Utilities',
  props: 'Props',
};

// The colours and material tendencies a building is built from.
export interface Palette {
  style: string;
  wall: string;
  lower: string;
  stoneWall: string;
  brick: string;
  wood: string;
  roof: string;
  roofStyle: RoofStyle;
  thatch: string;
  slate: string;
  tile: string;
  door: string;
  accent: string;
  frame: string;
  awning: string;
  awning2: string;
  leaf: string;
  trim: string;
  timber: boolean;
  thatched: boolean;
  hip: boolean;
  alongZ: boolean;
  stoneHouse: boolean;
  pitch: number;
  winW: number;
  winH: number;
  jetty: boolean;
  bay: boolean;
  porch: boolean;
  ivy: boolean;
  extChimney: boolean;
  chimneys: number;
  shutters: string | null;
  flowerBoxes: boolean;
  fence: string;
  tint: [number, number, number];
  forced?: boolean;
  // extra slots a style pack may fill
  metal?: string;
  fabric?: string;
  glow?: string;
  stone?: string;
}

// The shape a building takes, chosen once per seed and then held.
export interface Form {
  roofs: { gable: RoofStyle; hip: RoofStyle };
  front: 'gable' | 'eaves';
  gable: GableKind;
  dormer: 'gable' | 'flat' | 'hip' | null;
  porch: string | null;
  bay: string | null;
  balcony: string | null;
  turret: string | null;
  crest: string | null;
  shopfront: string | null;
  sign: string | null;
  plan: number;
  tall: number;
  side: number;
  a: number;
  b: number;
}

// One weight table: a list of [choice, weight] pairs. A null choice means the
// part is simply left out, which is how optional parts are weighted.
export type Weighted<K extends string | null = string | null> = readonly (readonly [K, number])[];

// What a style builds like: roof and facade tendencies, and how often each
// optional part appears. This is the hook that keeps the engine generic.
export interface FormTable {
  gable: Weighted<RoofStyle>;
  hip: Weighted<RoofStyle>;
  front: number;
  gables: Weighted<GableKind>;
  porch: Weighted;
  balcony: Weighted;
  turret: Weighted;
  crest: Weighted;
  shopfront: Weighted;
  sign: Weighted;
}

export interface FacadeRule {
  // how many windows across a given wall width
  windowsAcross: (width: number, rng: { next: () => number }) => number;
  // chance a window is lit at night
  lit: number;
}

// ------------------------------------------------------------------ recipes

export interface BuildingRecipe {
  id: string;
  name: string;
  template: string;
  packId: string;
  style: string | null;
  seed: number;
  width: number;
  depth: number;
  floors: number;
  locked: PartSlot[];
  // the decisions the pinned parts were fixed at, so re-rolling the seed
  // produces fresh variation everywhere except the parts that were pinned
  lockedPlan: PinnedParts | null;
  // per-slot overrides the artist pinned by hand
  overrides: Partial<Record<PartSlot, string>>;
  roofStyle: RoofStyle | null;
  detail: number;
}

export interface BuildingFootprint {
  // in tiles, origin at the building's front-left ground corner
  w: number;
  d: number;
  doorTile: { x: number; z: number };
  // the tile the door faces, for street connection checks
  facing: 'north' | 'south' | 'east' | 'west';
}

export interface PlacedBuilding {
  id: string;
  recipe: BuildingRecipe;
  tileX: number;
  tileZ: number;
  facing: 'north' | 'south' | 'east' | 'west';
  spriteKey: string;
  anchorY: number;
  // back-to-front order for the map view: the ground line, in tiles
  sortKey: number;
  // whether this building carries a shopfront
  commercial: boolean;
}

export interface StreetSpec {
  id: string;
  name: string;
  preset: NeighborhoodPreset;
  seed: number;
  lots: number;
  depth: number;
}

export type NeighborhoodPreset = 'composed' | 'residential' | 'shopping' | 'mainroad' | 'mixed';

export interface MapDef {
  id: string;
  name: string;
  seed: number;
  preset: NeighborhoodPreset;
  tileSize: number;
  // how wide the road is, in tiles: the buildings are set back from it
  roadWidth: number;
  // the road's centre line, one entry per tile of x: a town's road wanders,
  // and the rows of buildings on either side follow it
  roadCentre: number[];
  buildings: PlacedBuilding[];
  props: PlacedProp[];
}

export interface PlacedProp {
  id: string;
  kind: string;
  tileX: number;
  tileZ: number;
  variant: number;
}

// ------------------------------------------------------------------- light

export type LightPresetId = 'day' | 'afternoon' | 'dusk' | 'night' | 'dawn';
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export interface LightPreset {
  id: LightPresetId;
  name: string;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  // 0 by day, 1 at night: drives lit windows and lamps
  night: number;
  exposure: number;
  backdrop: string;
}

export interface SeasonPreset {
  id: SeasonId;
  name: string;
  // multiplies the palette so one set of geometry can wear four seasons
  foliage: string;
  // the second green a leaf may be shaded toward, so a row of trees keeps its
  // variation as the seasons change
  leafAlt: string;
  tint: [number, number, number];
  snow: number;
  // how heavily grime gathers at the base of a wall this season
  grime: number;
}

// -------------------------------------------------------------------- bake

export interface CameraPreset {
  // compass angle of the camera, radians
  angle: number;
  // height above the horizon, radians
  elevation: number;
  // world units visible vertically
  viewHeight: number;
}

export interface BakeResult {
  canvas: HTMLCanvasElement;
  // where the building's ground origin sits inside the canvas, in pixels
  anchor: { x: number; y: number };
  // the pixel scale the bake used: world units per output pixel
  unitsPerPixel: number;
  width: number;
  height: number;
}

export interface BakeVariant {
  light: LightPresetId;
  season: SeasonId;
}
