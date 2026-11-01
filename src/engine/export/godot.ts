// Godot 4 export. Everything a 2D Godot project needs to drop a baked town in
// and have it work: the sprites, the collision footprints, the sprite anchors,
// the depth-sorting offsets, and the occlusion bands that decide what can walk
// behind a building.
//
// Nothing here reads pixels to work any of that out. The bands come from the
// part tags stamped on the geometry, projected through the same camera that
// baked the sprite, so the numbers describe the building rather than the
// picture of the building.

import type { BakeOutput } from '../bake/bake';
import type { BuildingFootprint, BuildingRecipe, LightPresetId, SeasonId } from '../types';
import { TAG } from '../tags';
import { encodePNG } from './png';

export interface PartBand {
  tag: number;
  name: string;
  // in sprite pixels, measured from the top of the sprite
  top: number;
  bottom: number;
  // where the player's feet pass behind this part
  z: number;
}

export interface SpriteSheetEntry {
  name: string;
  file: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  // art pixels the sprite covers, for lining up with the tile grid
  artWidth: number;
  artHeight: number;
  light: LightPresetId;
  season: SeasonId;
}

export interface GodotExportInput {
  assetName: string;
  recipe: BuildingRecipe;
  footprint: BuildingFootprint;
  // one per baked variant, in the order they were baked
  sprites: {
    bake: BakeOutput;
    light: LightPresetId;
    season: SeasonId;
    bands: PartBand[];
  }[];
  // the tile grid, in output pixels
  tilePixels: number;
}

export interface GodotFile {
  // path inside the exported folder
  path: string;
  bytes: Uint8Array;
  kind: 'png' | 'text' | 'scene';
}

// Which band each tag belongs to, in drawing order from the back forwards.
const BAND_ORDER = [TAG.base, TAG.ground, TAG.upper, TAG.fitting, TAG.prop, TAG.roof];

const BAND_NAME: Record<number, string> = {
  [TAG.base]: 'base',
  [TAG.ground]: 'ground_floor',
  [TAG.upper]: 'upper_floors',
  [TAG.fitting]: 'fittings',
  [TAG.prop]: 'props',
  [TAG.roof]: 'roof',
};

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'asset';
}

export function bandsFor(
  geometry: { getAttribute(name: string): { count: number; array: ArrayLike<number> } | undefined } | null,
  bake: BakeOutput,
): PartBand[] {
  if (!geometry) return [];
  const pos = geometry.getAttribute('position');
  const tag = geometry.getAttribute('tag');
  if (!pos || !tag) return [];
  const project = bake.project;

  const seen = new Map<number, { top: number; bottom: number; z: number }>();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.round(tag.array[i]);
    const x = pos.array[i * 3];
    const y = pos.array[i * 3 + 1];
    const z = pos.array[i * 3 + 2];
    const p = project(x, y, z);
    const cur = seen.get(t);
    if (!cur) {
      seen.set(t, { top: p.y, bottom: p.y, z });
    } else {
      if (p.y < cur.top) cur.top = p.y;
      if (p.y > cur.bottom) cur.bottom = p.y;
      // the nearest ground point of the part is what the player walks behind
      if (z < cur.z) cur.z = z;
    }
  }

  const bands: PartBand[] = [];
  for (const tagId of BAND_ORDER) {
    const s = seen.get(tagId);
    if (!s) continue;
    bands.push({
      tag: tagId,
      name: BAND_NAME[tagId] ?? 'part',
      top: Math.max(0, Math.round(s.top)),
      bottom: Math.min(bake.height, Math.round(s.bottom)),
      z: Math.round(s.z * 1000) / 1000,
    });
  }
  return bands;
}

function gdString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function exportGodot(input: GodotExportInput): GodotFile[] {
  const base = sanitize(input.assetName);
  const files: GodotFile[] = [];
  const sheets: SpriteSheetEntry[] = [];

  for (const s of input.sprites) {
    const variant = s.light === 'day' && s.season === 'summer' ? '' : `_${s.light}_${s.season}`;
    const file = `${base}${variant}.png`;
    files.push({ path: file, bytes: encodePNG(s.bake.width, s.bake.height, s.bake.pixels), kind: 'png' });
    sheets.push({
      name: `${input.assetName}${variant}`,
      file,
      width: s.bake.width,
      height: s.bake.height,
      anchorX: s.bake.anchor.x,
      anchorY: s.bake.anchor.y,
      artWidth: s.bake.artWidth,
      artHeight: s.bake.artHeight,
      light: s.light,
      season: s.season,
    });
  }

  const daySummer = input.sprites.find((s) => s.light === 'day' && s.season === 'summer') ?? input.sprites[0];
  const bands = daySummer?.bands ?? [];
  const tile = input.tilePixels;

  // the manifest the game reads: every sprite, its anchor, its collision and
  // the bands that decide what walks behind it
  const manifest = {
    asset: input.assetName,
    pack: input.recipe.packId,
    template: input.recipe.template,
    seed: input.recipe.seed,
    // kept so the asset can be regenerated exactly, or re-baked at a new angle
    recipe: input.recipe,
    camera: daySummer?.bake.camera ?? null,
    pxPerUnit: daySummer?.bake.pxPerUnit ?? 32,
    pixelSize: daySummer?.bake.pixelSize ?? 2,
    tilePixels: tile,
    footprint: {
      width_tiles: input.footprint.w,
      depth_tiles: input.footprint.d,
      // where the building's own origin sits relative to its collision box
      origin_px: {
        x: daySummer ? Math.round(daySummer.bake.anchor.x - (input.footprint.w * tile) / 2) : 0,
        y: daySummer ? Math.round(daySummer.bake.anchor.y - (input.footprint.d * tile) / 2) : 0,
      },
      door_tile: { x: input.footprint.doorTile.x, y: input.footprint.doorTile.z },
      facing: input.footprint.facing,
    },
    sprites: sheets,
    occlusion_bands: bands,
  };
  files.push({ path: `${base}.json`, bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)), kind: 'text' });

  // a readme the artist can follow without knowing the exporter exists
  files.push({ path: 'README.md', bytes: new TextEncoder().encode(readme(input, sheets, bands, tile)), kind: 'text' });

  // and a scene that just works: sprite, anchor offset, collision and bands
  if (daySummer) {
    files.push({ path: `${base}.tscn`, bytes: new TextEncoder().encode(scene(input, base, daySummer, bands, tile)), kind: 'scene' });
  }

  return files;
}

function readme(input: GodotExportInput, sheets: SpriteSheetEntry[], bands: PartBand[], tile: number): string {
  const lines: string[] = [];
  lines.push(`# ${input.assetName}`, '');
  lines.push(`Exported from PixelTown Studio for Godot 4 (2D).`, '');
  lines.push(`One tile is ${tile} pixels on screen, and every sprite`);
  lines.push(`was baked at ${sheets[0]?.artWidth ?? 0} by ${sheets[0]?.artHeight ?? 0} art pixels with the camera`);
  lines.push(`fixed at a 2:1 three-quarter angle.`, '');
  lines.push('## Importing', '');
  lines.push('1. Copy this whole folder into your Godot project, for example `res://assets/town/`.');
  lines.push('2. In the FileSystem dock, select the PNGs and set **Filter** to *Off* so the');
  lines.push('   pixels stay crisp, then click Reimport.');
  lines.push('3. Open `' + sanitize(input.assetName) + '.tscn`, or read `' + sanitize(input.assetName) + '.json`');
  lines.push('   and place the sprites yourself.', '');
  lines.push('## Placing a sprite', '');
  lines.push(`Each sprite has an anchor: the pixel where the building's ground origin sits.`);
  lines.push('Set the sprite\'s **Offset** to `(-anchor.x, -anchor.y)` so the anchor lands on the');
  lines.push('tile you placed it on. The JSON records this for every variant.', '');
  lines.push('## Depth sorting', '');
  lines.push('Buildings are drawn back to front. Put each building sprite in a `YSort` node and');
  lines.push(`set the sprite's position Y to its ground line. The sprite anchor already accounts`);
  lines.push('for the footprint, so nothing needs a manual offset.', '');
  lines.push('## Walking behind a building', '');
  lines.push('The JSON lists occlusion bands. Each band is a slice of the sprite, in pixels from');
  lines.push('the top, together with the world Z where a character passes behind it. Add a');
  lines.push('`LightOccluder2D` or a `CollisionPolygon2D` over the band to block movement, or use');
  lines.push('the band to raise the character\'s Z index while they are inside it.', '');
  if (bands.length) {
    lines.push('');
    lines.push('| band | top px | bottom px | z |');
    lines.push('| --- | --- | --- | --- |');
    for (const b of bands) lines.push(`| ${b.name} | ${b.top} | ${b.bottom} | ${b.z} |`);
  }
  lines.push('');
  lines.push('## Variants', '');
  for (const s of sheets) lines.push(`- \`${s.file}\` — ${s.light}, ${s.season}`);
  lines.push('');
  lines.push('## Regenerating', '');
  lines.push('The seed and the full 3D recipe are in the JSON. Load the project file back into');
  lines.push('PixelTown Studio to re-bake these assets at a different scale, or later at a');
  lines.push('different camera angle, without redrawing anything.');
  lines.push('');
  return lines.join('\n');
}

function scene(input: GodotExportInput, base: string, sprite: GodotExportInput['sprites'][number], bands: PartBand[], tile: number): string {
  const w = input.footprint.w * tile;
  const h = input.footprint.d * tile;
  const ox = Math.round(sprite.bake.anchor.x - w / 2);
  const oy = Math.round(sprite.bake.anchor.y - h / 2);
  const half = tile / 2;
  const variant = sprite.light === 'day' && sprite.season === 'summer' ? '' : `_${sprite.light}_${sprite.season}`;

  const lines: string[] = [];
  lines.push('[gd_scene load_steps=2 format=3]', '');
  lines.push(`[ext_resource type="Texture2D" path="res://${base}${variant}.png" id="1"]`, '');
  lines.push('[sub_resource type="RectangleShape2D" id="1"]');
  lines.push(`size = Vector2(${w}, ${h})`, '');
  lines.push(`[node name="${base}" type="Node2D"]`, '');
  lines.push(`[node name="Body" type="StaticBody2D" parent="."]`);
  lines.push(`position = Vector2(${w / 2}, ${h / 2})`, '');
  lines.push(`[node name="Collision" type="CollisionShape2D" parent="Body"]`);
  lines.push(`shape = SubResource("1")`, '');
  lines.push(`[node name="Sprite" type="Sprite2D" parent="."]`);
  lines.push(`position = Vector2(${w / 2}, ${h / 2})`);
  lines.push(`offset = Vector2(${-ox}, ${-oy})`);
  lines.push(`texture = ExtResource("1")`, '');
  lines.push(`[node name="DoorMarker" type="Marker2D" parent="."]`);
  lines.push(`position = Vector2(${input.footprint.doorTile.x * tile + half}, ${input.footprint.doorTile.z * tile + half})`, '');
  lines.push(`[node name="Occlusion" type="Node2D" parent="."]`);
  lines.push(`position = Vector2(${w / 2}, ${h / 2})`);
  lines.push('metadata/bands = [' + bands.map((b) => `{"name":${gdString(b.name)},"top":${b.top},"bottom":${b.bottom},"z":${b.z}}`).join(', ') + ']');
  lines.push('');
  return lines.join('\n');
}
