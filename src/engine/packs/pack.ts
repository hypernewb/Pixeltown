// The style-pack contract. A pack supplies everything that is specific to a
// look: its palette, its building tendencies, its templates and its part
// builders. The generation engine and the studio only ever talk to this
// interface, so a new look is a new pack and nothing else.

import type { RNG } from '../rng';
import type { BuildContext } from '../build/context';
import type { FormTable, Palette, RoofStyle, PartSlot, BuildingRecipe, Form } from '../types';

export interface BuildingTemplate {
  id: string;
  name: string;
  category: 'residential' | 'commercial' | 'hospitality';
  description: string;
  // footprint limits in tiles
  footprint: { minW: number; maxW: number; minD: number; maxD: number };
  floors: { min: number; max: number };
  roofStyles: RoofStyle[];
  // whether this kind of building may carry a shopfront and signage
  commercial: boolean;
}

export interface BuildPlan {
  templateId: string;
  // footprint in tiles
  w: number;
  d: number;
  floors: number;
  floorHeight: number;
  roofStyle: RoofStyle;
  detail: number;
  frontGable: boolean;
  // The roof's proportions, which belong to the building family rather than to
  // its material: a farmhouse and a townhouse can share a tiled roof and still
  // need very different pitches and eaves to read as what they are.
  roofK: {
    // multiplies the palette's pitch
    pitch: number;
    // the eave overhang in world units
    eave: number;
    // true when the ridge runs along the street, false when it runs front to
    // back so the gable end faces the road, null to let the proportions decide
    ridgeAlong: boolean | null;
  };
  // a second volume fused to the main mass. Which kind, and whether, is the
  // family's business: a farmhouse is almost always a body with a wing, a
  // narrow townhouse usually stands alone, a block never breaks its frontage.
  annex: 'wing' | 'outshoot' | 'none';
  parts: {
    balcony: boolean;
    shopfront: boolean;
    awning: boolean;
    sign: boolean;
    vending: boolean;
    bikes: boolean;
    ac: boolean;
    pole: boolean;
    lanterns: boolean;
    // The structures that make a family's mass recognisable. They are separate
    // from the fittings above because each one changes the silhouette rather
    // than adding an object to it.
    engawa: boolean;    // a veranda running along the front
    walkway: boolean;   // an open access walkway with a railing
    decorated: boolean; // a decorated upper facade carried over a shopfront
    lattice: boolean;   // a lattice screen beside the entrance
    tsubo: boolean;     // a small courtyard garden behind the front rooms
  };
}

export type PartBuilder = (c: BuildContext, plan: BuildPlan) => void;

export interface StylePack {
  id: string;
  name: string;
  description: string;
  // world units per tile: the studio's grid
  tileSize: number;
  // the template is passed in because a family decides which materials it may
  // be built from, and so what the palette may draw
  palette(seed: number, style: string | null, template?: string): Palette;
  // which materials a building of this pack may be built from
  styles: { id: string; name: string; description: string }[];
  // keyed by template, not by material: a farmhouse in plaster and a farmhouse
  // in board are the same building
  formTable(template: string): FormTable;
  templates: BuildingTemplate[];
  // how a recipe and a form become a concrete build plan for this pack
  planFor(recipe: BuildingRecipe, pal: Palette, form: Form, rng: RNG): BuildPlan;
  builders: Record<string, PartBuilder>;
  // what the inspector can swap any given part to
  partOptions: Record<PartSlot, string[]>;
  // the roof materials the artist can pick from directly
  roofOptions: { id: string; name: string; color: string }[];
  wallOptions: { id: string; name: string; color: string }[];
}

export type { RNG, FormTable, Palette, RoofStyle, PartSlot };
