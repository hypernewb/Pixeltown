// Baking and exporting a whole street, rather than one building at a time.
//
// Two things make a street work where a single building does not:
//
// 1. Every building, prop and strip of ground is baked in the *same* volume, so
//    they all share one camera and one scale. Baked separately they would drift
//    apart and the town would look assembled from mismatched parts.
// 2. The tile grid is derived from the camera rather than guessed. A 2:1
//    three-quarter view moves the picture exactly half a tile across and a
//    quarter of a tile down for every step in x, which is what lets the
//    exporter place sprites, collision and ground on one consistent grid.

import * as THREE from 'three';
import { bakeBatch, screenBasis, type BakeEntry, type BakeVolume, type ScreenBasis } from './bake/bake';
import { generateBuilding, type GeneratedBuilding } from './generator';
import { bandsFor } from './export/godot';
import { propGeometry, propVolume } from './build/furniture';
import { groundStrip, streetGround, GROUND_COLORS, STRIP_WIDTH, type GroundBand } from './build/ground';
import { encodePNG } from './export/png';
import { bakeAsset, type BakedSprite, type BakeAssetOptions } from './service';
import type { GodotFile } from './export/godot';
import type { LightPresetId, MapDef, PlacedBuilding, SeasonId } from './types';
import type { AssetEntry } from './project';

// ------------------------------------------------------------- the tile grid

// Where a point on the tile grid lands in sprite pixels, measured from the
// sprite's origin. The basis comes from the camera, so this is the real
// projection rather than an approximation of it.
export function tileToPx(tx: number, tz: number, basis: ScreenBasis): { x: number; y: number } {
  return {
    x: tx * basis.x.x + tz * basis.z.x,
    y: tx * basis.x.y + tz * basis.z.y,
  };
}

// The ground a building occupies, as a diamond in sprite pixels measured from
// the sprite's origin: the four corners of its footprint pushed through the
// same basis. Godot wants a CollisionPolygon2D in exactly that space.
export function footprintDiamond(w: number, d: number, basis: ScreenBasis): [number, number][] {
  const corner = (cx: number, cz: number): [number, number] => {
    const p = tileToPx(cx, cz, basis);
    return [p.x, p.y];
  };
  return [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)];
}

// Back-to-front order for a 2:1 view: whatever is further along x + z is nearer
// the camera, so it draws last.
function depthKey(x: number, z: number, w = 0, d = 0): number {
  return x + w / 2 + (z + d / 2);
}

// ------------------------------------------------------------------ baking

export interface StreetBuilding {
  placed: PlacedBuilding;
  generated: GeneratedBuilding;
  sprites: BakedSprite[];
}

export interface StreetProp {
  id: string;
  kind: string;
  tileX: number;
  tileZ: number;
  sprites: BakedSprite[];
}

export interface StreetBake {
  buildings: StreetBuilding[];
  props: StreetProp[];
  ground: BakedSprite;
  groundBands: GroundBand[];
  groundAnchor: { x: number; y: number };
  groundStripCenterZ: number;
  groundZ: [number, number];
  roadCentre: number[];
  xRange: [number, number];
  tilePixels: number;
  // how a world step maps to sprite pixels, from the camera
  basis: ScreenBasis;
  light: LightPresetId;
  season: SeasonId;
  // anything that could not be baked, and why
  problems: { asset: string; reason: string }[];
}

export interface StreetBakeOptions extends BakeAssetOptions {
  light: LightPresetId;
  season: SeasonId;
}

export interface StreetProgress {
  done: number;
  total: number;
  label: string;
}

// The shared volume every building in the street is framed in. Taking the
// largest footprint and the tallest roof means no building is ever clipped by
// the frame, and all of them come out at the same scale.
function buildingVolume(buildings: readonly GeneratedBuilding[]): BakeVolume {
  let w = 1.5;
  let d = 1.5;
  let y = 1;
  for (const g of buildings) {
    const box = g.geometry?.boundingBox;
    w = Math.max(w, g.result.width + 1.0);
    d = Math.max(d, g.result.depth + 1.0);
    y = Math.max(y, (box ? box.max.y : g.result.height) + 0.3);
  }
  return { x: w, y, z: d };
}

function propBakeVolume(kinds: readonly string[]): BakeVolume {
  let x = 1.2;
  let y = 1.2;
  let z = 1.2;
  for (const k of kinds) {
    const v = propVolume(k);
    x = Math.max(x, v.x);
    y = Math.max(y, v.y);
    z = Math.max(z, v.z);
  }
  return { x, y, z };
}

export function bakeStreet(map: MapDef, opts: StreetBakeOptions, onProgress?: (p: StreetProgress) => void): StreetBake {
  const problems: StreetBake['problems'] = [];

  // ------------------------------------------------------- generate the town
  const generated: { placed: PlacedBuilding; generated: GeneratedBuilding }[] = [];
  for (const placed of map.buildings) {
    try {
      const g = generateBuilding(placed.recipe);
      if (!g.geometry) {
        problems.push({ asset: placed.id, reason: 'this building produced no geometry' });
        continue;
      }
      generated.push({ placed, generated: g });
    } catch (err) {
      problems.push({ asset: placed.id, reason: err instanceof Error ? err.message : 'generation failed' });
    }
  }

  const tilePixels = Math.max(1, Math.round(opts.pxPerUnit * opts.pixelSize));
  const basis = screenBasis(tilePixels);
  const total = generated.length + map.props.length + 1;
  let done = 0;
  const tick = (label: string): void => {
    done++;
    onProgress?.({ done, total, label });
  };

  // ------------------------------------------------------------ the buildings
  const bVolume = buildingVolume(generated.map((g) => g.generated));
  const entries: BakeEntry[] = generated.map((g) => ({
    geometry: g.generated.geometry,
    light: opts.light,
    season: opts.season,
    span: Math.max(g.generated.result.width, g.generated.result.depth),
  }));
  const bakes = bakeBatch(entries, bVolume, {
    pxPerUnit: opts.pxPerUnit,
    pixelSize: opts.pixelSize,
    outline: opts.outline,
    shadow: opts.shadow,
  });

  const buildings: StreetBuilding[] = [];
  generated.forEach((g, i) => {
    buildings.push({
      placed: g.placed,
      generated: g.generated,
      sprites: [
        {
          light: opts.light,
          season: opts.season,
          bake: bakes[i],
          bands: bandsFor(g.generated.geometry, bakes[i]),
        },
      ],
    });
    tick(g.placed.recipe.template);
  });

  // ---------------------------------------------------------------- the props
  const kinds = [...new Set(map.props.map((p) => p.kind))];
  const pVolume = propBakeVolume(kinds);
  const props: StreetProp[] = [];
  for (const kind of kinds) {
    const group = map.props.filter((p) => p.kind === kind);
    const geoms = group.map((p) => propGeometry(kind, p.variant));
    const keep = group.map((p, i) => ({ p, geo: geoms[i] }));
    const usable = keep.filter((k) => k.geo);
    if (!usable.length) {
      for (const k of keep) problems.push({ asset: k.p.id, reason: `no geometry for a ${kind}` });
      continue;
    }
    const pBakes = bakeBatch(
      usable.map((k) => ({ geometry: k.geo, light: opts.light, season: opts.season, span: Math.max(pVolume.x, pVolume.z), prop: true })),
      pVolume,
      { pxPerUnit: opts.pxPerUnit, pixelSize: opts.pixelSize, outline: opts.outline, shadow: opts.shadow },
    );
    usable.forEach((k, i) => {
      props.push({
        id: k.p.id,
        kind,
        tileX: k.p.tileX,
        tileZ: k.p.tileZ,
        sprites: [{ light: opts.light, season: opts.season, bake: pBakes[i], bands: [] }],
      });
      tick(kind);
    });
  }

  // --------------------------------------------------------------- the ground
  const plots = generated.map((g) => {
    const d = g.generated.footprint.d;
    return { z0: g.placed.tileZ - d / 2, z1: g.placed.tileZ + d / 2 };
  });
  const ground = streetGround(map.roadWidth, plots);
  const stripGeo = groundStrip(ground.z0, ground.z1, ground.bands, STRIP_WIDTH, GROUND_COLORS.bed, map.seed);
  const gVolume: BakeVolume = { x: STRIP_WIDTH, y: 0.08, z: ground.z1 - ground.z0 };
  const [gBake] = bakeBatch(
    [{ geometry: stripGeo, light: opts.light, season: opts.season, span: Math.max(gVolume.x, gVolume.z), prop: true }],
    gVolume,
    { pxPerUnit: opts.pxPerUnit, pixelSize: opts.pixelSize, outline: opts.outline, shadow: false },
  );
  tick('ground');

  // the ground only has to run as far as the buildings do
  let minX = 0;
  let maxX = 0;
  for (const b of generated) {
    minX = Math.min(minX, b.placed.tileX - b.generated.footprint.w / 2);
    maxX = Math.max(maxX, b.placed.tileX + b.generated.footprint.w / 2);
  }

  return {
    buildings,
    props,
    ground: { light: opts.light, season: opts.season, bake: gBake, bands: [] },
    groundBands: ground.bands,
    groundAnchor: gBake.anchor,
    groundStripCenterZ: (ground.z0 + ground.z1) / 2,
    groundZ: [ground.z0, ground.z1],
    roadCentre: map.roadCentre ?? [],
    xRange: [Math.floor(minX) - 1, Math.ceil(maxX) + 1],
    tilePixels,
    basis,
    light: opts.light,
    season: opts.season,
    problems,
  };
}

// ---------------------------------------------------------------- exporting

const round4 = (v: number): number => Math.round(v * 10000) / 10000;

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'map';
}

function variantSuffix(light: LightPresetId, season: SeasonId): string {
  return light === 'day' && season === 'summer' ? '' : `_${light}_${season}`;
}

export function exportStreet(input: { projectName: string; map: MapDef; baked: StreetBake }): GodotFile[] {
  const { map, baked } = input;
  const files: GodotFile[] = [];
  const tile = baked.tilePixels;
  const suffix = variantSuffix(baked.light, baked.season);

  const sprite = (name: string, s: BakedSprite): string => {
    const file = `${sanitize(name)}${suffix}.png`;
    files.push({ path: file, bytes: encodePNG(s.bake.width, s.bake.height, s.bake.pixels), kind: 'png' });
    return file;
  };

  // one ground strip, repeated along the street by the importer
  const groundFile = sprite('ground', baked.ground);

  // back to front: buildings and props share one ordering so a prop in front of
  // a building draws over it and a prop behind draws under
  const order = [
    ...baked.buildings.map((b) => ({
      key: depthKey(b.placed.tileX, b.placed.tileZ, b.generated.footprint.w, b.generated.footprint.d),
      kind: 'building' as const,
      id: b.placed.id,
    })),
    ...baked.props.map((p) => ({ key: depthKey(p.tileX, p.tileZ, 0.5, 0.5), kind: 'prop' as const, id: p.id })),
  ].sort((a, b) => a.key - b.key);
  const zIndex = new Map<string, number>();
  order.forEach((o, i) => zIndex.set(`${o.kind}:${o.id}`, i));

  const buildings = baked.buildings.map((b) => {
    const f = b.generated.footprint;
    const s = b.sprites[0];
    return {
      id: b.placed.id,
      name: b.placed.recipe.template,
      template: b.placed.recipe.template,
      seed: b.placed.recipe.seed,
      seed_code: b.generated.seedCode,
      // the recipe keeps the 3D source of this exact building
      recipe: b.generated.recipe,
      tile_center: [b.placed.tileX, b.placed.tileZ],
      footprint_tiles: [f.w, f.d],
      facing: b.placed.facing,
      door_tile: [b.placed.tileX - f.w / 2 + f.doorTile.x, b.placed.tileZ - f.d / 2 + f.doorTile.z],
      commercial: b.placed.commercial,
      sprite: sprite(b.placed.id, s),
      sprite_center_px: [Math.round(s.bake.width / 2), Math.round(s.bake.height / 2)],
      anchor_px: [s.bake.anchor.x, s.bake.anchor.y],
      collision: footprintDiamond(f.w, f.d, baked.basis),
      z_index: zIndex.get(`building:${b.placed.id}`) ?? 0,
      occlusion_bands: s.bands,
    };
  });

  const props = baked.props.map((p) => {
    const s = p.sprites[0];
    return {
      id: p.id,
      kind: p.kind,
      tile: [p.tileX, p.tileZ],
      sprite: sprite(p.id, s),
      anchor_px: [s.bake.anchor.x, s.bake.anchor.y],
      size_px: [s.bake.width, s.bake.height],
      z_index: zIndex.get(`prop:${p.id}`) ?? 0,
    };
  });

  const manifest = {
    tool: 'PixelTown Studio',
    format: 1,
    target: 'godot4-2d',
    project: input.projectName,
    map: {
      id: map.id,
      name: map.name,
      preset: map.preset,
      seed: map.seed,
      road_width_tiles: map.roadWidth,
      road_centre: map.roadCentre ?? [],
      ground_z: baked.groundZ,
    },
    grid: {
      tile_pixels: tile,
      px_per_unit: baked.ground.bake.pxPerUnit,
      pixel_size: baked.ground.bake.pixelSize,
      projection: 'orthographic',
      camera: baked.ground.bake.camera,
      // one world unit along each axis, in output pixels: the whole layout
      // contract between the camera and the map
      basis: {
        x: [round4(baked.basis.x.x), round4(baked.basis.x.y)],
        z: [round4(baked.basis.z.x), round4(baked.basis.z.y)],
        y: [round4(baked.basis.y.x), round4(baked.basis.y.y)],
      },
    },
    light: baked.light,
    season: baked.season,
    ground: {
      file: groundFile,
      anchor_px: [baked.groundAnchor.x, baked.groundAnchor.y],
      size_px: [baked.ground.bake.width, baked.ground.bake.height],
      // the strip's own origin sits here, so copies step one tile in x
      strip_center_z: baked.groundStripCenterZ,
      x_range: baked.xRange,
      bands: baked.groundBands,
    },
    buildings,
    props,
    counts: { buildings: buildings.length, props: props.length },
  };
  files.push({ path: 'map.json', bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)), kind: 'text' });
  files.push({ path: 'import_map.gd', bytes: new TextEncoder().encode(importerScript()), kind: 'text' });
  files.push({
    path: 'README.md',
    bytes: new TextEncoder().encode(streetReadme(input.projectName, manifest, baked, tile)),
    kind: 'text',
  });

  return files;
}

// ------------------------------------------------------------------- Godot

// A real importer rather than a pile of numbers to read by hand. Run it from
// Godot's script editor and it writes a scene built from the manifest.
function importerScript(): string {
  return `# PixelTown Studio map importer.
#
# Open this script in Godot 4, then use File > Run (Ctrl+Shift+X) in the script
# editor. It reads map.json next to this file and writes a scene containing the
# whole street: ground, buildings, props, collision and occlusion.
#
# Run it again after re-exporting from PixelTown Studio to pick up changes.
@tool
extends EditorScript

const MANIFEST := "map.json"

# One world unit along each axis, in output pixels. Read from the manifest
# rather than assumed, so the map always matches the camera that baked it.
var _basis_x := Vector2(1, 0)
var _basis_z := Vector2(0, 1)


func _run() -> void:
	var base: String = get_script().resource_path.get_base_dir()
	var data: Dictionary = _read_json(base.path_join(MANIFEST))
	if data.is_empty():
		push_error("PixelTown: could not read " + base.path_join(MANIFEST))
		return

	var grid: Dictionary = data.get("grid", {})
	var tile: float = float(grid.get("tile_pixels", 64))
	var map_info: Dictionary = data.get("map", {})
	_setup_basis(grid)

	var root := Node2D.new()
	root.name = String(map_info.get("name", "PixelTownMap")).to_pascal_case()
	if root.name.is_empty():
		root.name = "PixelTownMap"

	_build_ground(root, base, data, tile)
	var placed_buildings := _build_buildings(root, base, data, tile)
	_build_props(root, base, data, tile)

	var out: String = base.path_join(root.name.to_snake_case() + ".tscn")
	var packed := PackedScene.new()
	if packed.pack(root) != OK:
		push_error("PixelTown: could not pack the scene")
		root.free()
		return
	if ResourceSaver.save(packed, out) != OK:
		push_error("PixelTown: could not write " + out)
		root.free()
		return

	print("PixelTown: wrote ", out, " with ", placed_buildings, " buildings")
	print("PixelTown: open it from the FileSystem dock to walk the street.")
	root.free()


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed


func _texture(base: String, file: String) -> Texture2D:
	var path: String = base.path_join(file)
	if not ResourceLoader.exists(path):
		push_warning("PixelTown: missing sprite " + path)
		return null
	return load(path) as Texture2D


# The ground is one strip repeated along the street: every copy steps one tile
# in x, which in this projection moves it half a tile across and a quarter down.
func _build_ground(root: Node2D, base: String, data: Dictionary, tile: float) -> void:
	var g: Dictionary = data.get("ground", {})
	var tex: Texture2D = _texture(base, String(g.get("file", "")))
	if tex == null:
		return
	var layer := Node2D.new()
	layer.name = "Ground"
	layer.z_index = -100
	root.add_child(layer)

	var strip_z: float = float(g.get("strip_center_z", 0.0))
	var ganchor: Array = g.get("anchor_px", [0, 0])
	var range_v: Array = g.get("x_range", [0, 0])
	var centre: Array = data.get("map", {}).get("road_centre", [])
	for i in range(int(range_v[0]), int(range_v[1]) + 1):
		var s := Sprite2D.new()
		s.name = "Strip%d" % i
		s.texture = tex
		s.centered = false
		s.offset = Vector2(-float(ganchor[0]), -float(ganchor[1]))
		s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		var dz: float = 0.0
		if i >= 0 and i < centre.size():
			dz = float(centre[i])
		s.position = _tile_to_px(float(i), strip_z + dz, tile)
		layer.add_child(s)


func _build_buildings(root: Node2D, base: String, data: Dictionary, tile: float) -> int:
	var layer := Node2D.new()
	layer.name = "Buildings"
	root.add_child(layer)
	var count := 0
	for b in data.get("buildings", []):
		if typeof(b) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = b
		var tex: Texture2D = _texture(base, String(d.get("sprite", "")))
		if tex == null:
			continue

		var node := Node2D.new()
		node.name = String(d.get("id", "building"))
		var center: Array = d.get("tile_center", [0, 0])
		node.position = _tile_to_px(float(center[0]), float(center[1]), tile)
		node.z_index = int(d.get("z_index", 0))
		layer.add_child(node)

		var sprite := Sprite2D.new()
		sprite.name = "Sprite"
		sprite.texture = tex
		# placed by the anchor recorded at bake time: the pixel where the
		# building's ground centre sits, so the footprint lines up exactly
		sprite.centered = false
		var a: Array = d.get("anchor_px", [0, 0])
		sprite.offset = Vector2(-float(a[0]), -float(a[1]))
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		node.add_child(sprite)

		# the ground the building occupies, as an isometric diamond
		var poly := PackedVector2Array()
		for p in d.get("collision", []):
			poly.append(Vector2(float(p[0]), float(p[1])))
		if poly.size() >= 3:
			var body := StaticBody2D.new()
			body.name = "Body"
			node.add_child(body)
			var shape := CollisionPolygon2D.new()
			shape.name = "Collision"
			shape.polygon = poly
			body.add_child(shape)

		# where the door is, so a game can route people to it
		var door: Array = d.get("door_tile", [0, 0])
		var marker := Marker2D.new()
		marker.name = "Door"
		marker.position = _tile_to_px(float(door[0]), float(door[1]), tile) - node.position
		node.add_child(marker)

		# the bands that decide what may walk behind the building
		var bands: Array = d.get("occlusion_bands", [])
		if not bands.is_empty():
			var occ := Node2D.new()
			occ.name = "Occlusion"
			occ.set_meta("bands", bands)
			node.add_child(occ)
		count += 1
	return count


func _build_props(root: Node2D, base: String, data: Dictionary, tile: float) -> void:
	var layer := Node2D.new()
	layer.name = "Props"
	root.add_child(layer)
	for p in data.get("props", []):
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = p
		var tex: Texture2D = _texture(base, String(d.get("sprite", "")))
		if tex == null:
			continue
		var s := Sprite2D.new()
		s.name = String(d.get("id", "prop"))
		s.texture = tex
		s.centered = false
		var a: Array = d.get("anchor_px", [0, 0])
		s.offset = Vector2(-float(a[0]), -float(a[1]))
		s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		var t: Array = d.get("tile", [0, 0])
		s.position = _tile_to_px(float(t[0]), float(t[1]), tile)
		s.z_index = int(d.get("z_index", 0))
		layer.add_child(s)


# One world unit in x moves the picture this far; one in z moves it that far.
# Taken from the manifest, so the importer and the exporter cannot disagree.
func _setup_basis(grid: Dictionary) -> void:
	var b: Dictionary = grid.get("basis", {})
	if b.is_empty():
		push_warning("PixelTown: the manifest has no screen basis; the map may sit wrong")
		return
	var bx: Array = b.get("x", [1, 0])
	var bz: Array = b.get("z", [0, 1])
	_basis_x = Vector2(float(bx[0]), float(bx[1]))
	_basis_z = Vector2(float(bz[0]), float(bz[1]))


func _tile_to_px(tx: float, tz: float, _tile: float) -> Vector2:
	return _basis_x * tx + _basis_z * tz
`;
}

function streetReadme(
  projectName: string,
  manifest: { buildings: unknown[]; props: unknown[]; map: { name: string; road_width_tiles: number }; grid: { tile_pixels: number } },
  baked: StreetBake,
  tile: number,
): string {
  const lines: string[] = [];
  lines.push(`# ${manifest.map.name}`, '');
  lines.push(`${manifest.buildings.length} buildings and ${manifest.props.length} pieces of street furniture,`);
  lines.push(`exported from PixelTown Studio as part of "${projectName}".`, '');
  lines.push('## What is in here', '');
  lines.push('| file | what it is |');
  lines.push('| --- | --- |');
  lines.push('| `map.json` | the whole street: where every building and prop goes, its collision, its door and its occlusion bands |');
  lines.push('| `ground.png` | one strip of road and pavement, repeated along the street |');
  lines.push(`| the other PNGs | one sprite per building and per prop, baked at ${tile} pixels per tile |`);
  lines.push('| `import_map.gd` | the importer, which builds the scene for you |');
  lines.push('');
  lines.push('## Importing', '');
  lines.push('1. Copy this whole folder into your Godot project, for example `res://town/`.');
  lines.push('2. In the FileSystem dock, right-click the folder and choose Reimport.');
  lines.push('3. Open `import_map.gd` and use **File > Run** (Ctrl+Shift+X). It writes a scene');
  lines.push(`   named after the map and prints where it put it.`);
  lines.push('4. Open that scene. The street is there, with collision, doors and depth order.');
  lines.push('');
  lines.push('The importer sets every sprite to nearest-neighbour filtering, so the pixels');
  lines.push('stay crisp whatever the project\'s import defaults are.');
  lines.push('');
  lines.push('## How the pieces line up', '');
  lines.push(`The camera is a fixed three-quarter view and one tile is ${tile} pixels on screen.`);
  lines.push('`map.json` records exactly how far one world unit moves on screen along each');
  lines.push('axis, and every building, prop, door and collision shape in it is already');
  lines.push('expressed in that grid, so nothing has to be nudged by hand.');
  lines.push('');
  lines.push('## Depth sorting', '');
  lines.push('Buildings are drawn back to front. Each one carries a `z_index` worked out from');
  lines.push('where it stands, and the importer applies it, so a building nearer the camera');
  lines.push('covers the one behind it.');
  lines.push('');
  lines.push('## Walking behind a building', '');
  lines.push('Each building lists occlusion bands: slices of its sprite, measured in pixels');
  lines.push('from the top, with the depth at which a character passes behind that part. The');
  lines.push('importer stores them on the building as metadata under `bands`, so a script can');
  lines.push('read them and hide or fade the character at the right moment.');
  lines.push('');
  lines.push('## Collision', '');
  lines.push('Each building has a `CollisionPolygon2D` shaped like the ground it actually');
  lines.push('occupies in this projection, not a plain rectangle, so characters walk round it');
  lines.push('the way it looks.');
  lines.push('');
  lines.push('## Time of day', '');
  lines.push(`This export is baked for **${baked.light}** in **${baked.season}**. Export again from`);
  lines.push('PixelTown Studio with a different time or season for the night version of the');
  lines.push('same street; the geometry, the seeds and the layout are identical.');
  lines.push('');
  lines.push('## Rebuilding the town', '');
  lines.push('Every building keeps its full 3D recipe and seed in `map.json`. Load the project');
  lines.push('file back into PixelTown Studio to change a building, re-roll a seed, or re-bake');
  lines.push('the street at another scale or angle without redrawing anything.');
  lines.push('');
  return lines.join('\n');
}

export { bakeAsset };
export type { AssetEntry, BakeAssetOptions };
