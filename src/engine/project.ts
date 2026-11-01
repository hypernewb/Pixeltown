// The studio's vocabulary for a project: which buildings the artist has made,
// how they are laid out on a map, and which light and season each sprite is
// baked for. A project file is this structure as JSON, plus the 3D recipes
// inside it, which is what makes every asset re-bakeable later.

import type { BuildingRecipe, LightPresetId, MapDef, SeasonId } from './types';

export interface AssetEntry {
  id: string;
  name: string;
  recipe: BuildingRecipe;
  // the variants this asset is baked for
  lights: LightPresetId[];
  seasons: SeasonId[];
  notes: string;
}

export interface StudioProject {
  version: 1;
  id: string;
  name: string;
  // art pixels per world unit; 32 matches the 32x32 tile grid
  pxPerUnit: number;
  // how many output pixels wide one art pixel is drawn
  pixelSize: number;
  assets: AssetEntry[];
  map: MapDef | null;
}

export const PROJECT_VERSION = 1;

export function emptyProject(name = 'Untitled project'): StudioProject {
  return {
    version: PROJECT_VERSION,
    id: `p${Date.now().toString(36)}`,
    name,
    pxPerUnit: 32,
    pixelSize: 2,
    assets: [],
    map: null,
  };
}
