// Verification for the street export: the tile maths, the ground, the street
// furniture, and the shape of the manifest the Godot importer reads.
//
// The bake itself needs WebGL, so the pixels here are synthetic. Everything
// downstream of them, and everything that decides *where* things go, is the
// real code. The most important check is the first one: the tile formula the
// whole map is laid out with is compared against the actual camera, because a
// wrong constant there would misplace every building on the street and nothing
// in the browser would say so.

import * as THREE from 'three';
import { generateBuilding, newRecipe } from '../src/engine/generator';
import {
  bakeStreet,
  exportStreet,
  footprintDiamond,
  tileToPx,
  type StreetBake,
} from '../src/engine/mapExport';
import { ISO_ELEVATION, screenBasis } from '../src/engine/bake/bake';
import { groundStrip, streetGround, GROUND_COLORS } from '../src/engine/build/ground';
import { propGeometry, propVolume, PROP_KINDS } from '../src/engine/build/furniture';
import { generateStreet, streetDefaults } from '../src/engine/street';
import { bandsFor } from '../src/engine/export/godot';
import { zipFiles } from '../src/engine/service';
import type { BakeOutput } from '../src/engine/bake/bake';
import type { LightPresetId, SeasonId } from '../src/engine/types';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  checks++;
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name: string): void {
  console.log(`\n${name}`);
}

// --------------------------------------------------------------- the camera

// A faithful copy of the bake camera: same angle, same framing, same snap to
// whole art pixels. Built here rather than imported because bake.ts keeps its
// camera behind a renderer, and this is exactly the thing being checked.
function studioCamera(volume: { x: number; y: number; z: number }, pxPerUnit: number, pixelSize: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const box = new THREE.Box3(
    new THREE.Vector3(-volume.x / 2, 0, -volume.z / 2),
    new THREE.Vector3(volume.x / 2, volume.y, volume.z / 2),
  );
  const angle = Math.PI / 4;
  const dir = new THREE.Vector3(
    Math.sin(angle) * Math.cos(ISO_ELEVATION),
    Math.sin(ISO_ELEVATION),
    Math.cos(angle) * Math.cos(ISO_ELEVATION),
  );
  const center = box.getCenter(new THREE.Vector3());
  camera.position.copy(center).addScaledVector(dir, 60);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const inv = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const v = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).applyMatrix4(inv);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
      }
    }
  }
  const pad = 0.3;
  const ex = (maxX - minX) / 2 + pad;
  const ey = (maxY - minY) / 2 + pad;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  camera.left = cx - ex;
  camera.right = cx + ex;
  camera.top = cy + ey;
  camera.bottom = cy - ey;
  camera.near = Math.max(0.1, -maxZ - 6);
  camera.far = -minZ + 6;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  // snap so exactly whole art pixels cover the frustum
  const worldW = camera.right - camera.left;
  const worldH = camera.top - camera.bottom;
  const artW = Math.max(8, Math.round(worldW * pxPerUnit));
  const artH = Math.max(8, Math.round(worldH * pxPerUnit));
  const mx = (camera.left + camera.right) / 2;
  const my = (camera.top + camera.bottom) / 2;
  camera.left = mx - artW / pxPerUnit / 2;
  camera.right = mx + artW / pxPerUnit / 2;
  camera.top = my + artH / pxPerUnit / 2;
  camera.bottom = my - artH / pxPerUnit / 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  void pixelSize;
  return camera;
}

function outSize(volume: { x: number; y: number; z: number }, pxPerUnit: number, pixelSize: number): { w: number; h: number } {
  const c = studioCamera(volume, pxPerUnit, pixelSize);
  return {
    w: Math.round((c.right - c.left) * pxPerUnit) * pixelSize,
    h: Math.round((c.top - c.bottom) * pxPerUnit) * pixelSize,
  };
}

function fakeBake(camera: THREE.OrthographicCamera, w: number, h: number, light: LightPresetId, season: SeasonId): BakeOutput {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = (i * 7) % 256;
    pixels[i * 4 + 1] = 130;
    pixels[i * 4 + 2] = (i * 5) % 256;
    pixels[i * 4 + 3] = i % 7 === 0 ? 0 : 255;
  }
  return {
    pixels,
    width: w,
    height: h,
    artWidth: Math.round(w / 2),
    artHeight: Math.round(h / 2),
    pxPerUnit: 32,
    pixelSize: 2,
    camera: { angle: Math.PI / 4, elevation: ISO_ELEVATION, viewHeight: 0 },
    anchor: { x: Math.round(w / 2), y: Math.round(h / 2) },
    project(x: number, y: number, z: number) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    },
    light,
    season,
    toCanvas() {
      throw new Error('no canvas in node');
    },
  };
}

// --------------------------------------------- the tile maths vs the camera

section('the tile basis matches what the camera actually does');
{
  const pxPerUnit = 32;
  const pixelSize = 2;
  const tilePixels = pxPerUnit * pixelSize;
  const volume = { x: 6, y: 3, z: 6 };
  const camera = studioCamera(volume, pxPerUnit, pixelSize);
  const { w, h } = outSize(volume, pxPerUnit, pixelSize);
  const basis = screenBasis(tilePixels);

  const screen = (x: number, y: number, z: number): { x: number; y: number } => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
  };

  const origin = screen(0, 0, 0);
  const stepX = screen(1, 0, 0);
  const stepZ = screen(0, 0, 1);
  const stepY = screen(0, 1, 0);
  const dx = { x: stepX.x - origin.x, y: stepX.y - origin.y };
  const dz = { x: stepZ.x - origin.x, y: stepZ.y - origin.y };
  const dy = { x: stepY.x - origin.x, y: stepY.y - origin.y };

  const wantX = tileToPx(1, 0, basis);
  const wantZ = tileToPx(0, 1, basis);

  console.log(`        camera says x step (${dx.x.toFixed(2)}, ${dx.y.toFixed(2)}), basis says (${wantX.x.toFixed(2)}, ${wantX.y.toFixed(2)})`);
  console.log(`        camera says z step (${dz.x.toFixed(2)}, ${dz.y.toFixed(2)}), basis says (${wantZ.x.toFixed(2)}, ${wantZ.y.toFixed(2)})`);

  // within half an output pixel, since the camera snaps to whole art pixels
  const near = (a: number, b: number): boolean => Math.abs(a - b) < pixelSize;
  ok('a step in x matches the camera', near(dx.x, wantX.x) && near(dx.y, wantX.y), `(${dx.x.toFixed(2)}, ${dx.y.toFixed(2)})`);
  ok('a step in z matches the camera', near(dz.x, wantZ.x) && near(dz.y, wantZ.y), `(${dz.x.toFixed(2)}, ${dz.y.toFixed(2)})`);
  ok('x moves right and down', dx.x > 0 && dx.y > 0, `${dx.x.toFixed(2)}, ${dx.y.toFixed(2)}`);
  ok('z moves left and down', dz.x < 0 && dz.y > 0, `${dz.x.toFixed(2)}, ${dz.y.toFixed(2)}`);
  ok('the two steps are mirror images in x', near(dx.x, -dz.x), `${dx.x.toFixed(2)} vs ${dz.x.toFixed(2)}`);
  ok('x and z drop by the same amount', near(dx.y, dz.y), `${dx.y.toFixed(2)} vs ${dz.y.toFixed(2)}`);
  ok('up moves straight up the screen', Math.abs(dy.x) < pixelSize && dy.y < 0, `(${dy.x.toFixed(2)}, ${dy.y.toFixed(2)})`);

  // a diagonal step, which is what a building's own footprint corners are
  const diag = screen(1, 0, 1);
  const dd = { x: diag.x - origin.x, y: diag.y - origin.y };
  const wantD = tileToPx(1, 1, basis);
  ok('a diagonal step matches the camera', near(dd.x, wantD.x) && near(dd.y, wantD.y), `(${dd.x.toFixed(2)}, ${dd.y.toFixed(2)})`);
  ok('a diagonal step is straight down', Math.abs(dd.x) < pixelSize, `${dd.x.toFixed(2)}`);

  // and the whole thing must be linear, not just true one tile out
  const far = screen(3, 0, 0);
  const wantFar = tileToPx(3, 0, basis);
  ok(
    'three tiles out is three times one tile',
    near(far.x - origin.x, wantFar.x) && near(far.y - origin.y, wantFar.y),
    `(${(far.x - origin.x).toFixed(2)}, ${(far.y - origin.y).toFixed(2)})`,
  );

  // The familiar 2:1 rule is a different elevation. Asserting the real numbers
  // here is the point: they were hard-coded as the familiar ones once, which
  // put every building on the map in the wrong place.
  ok(
    'the across step is a whole tile times cos(angle)',
    Math.abs(basis.x.x - tilePixels * Math.cos(Math.PI / 4)) < 1e-9,
    `${basis.x.x.toFixed(3)}`,
  );
  // the drop carries both factors: the tile is foreshortened by cos(angle)
  // across the view and by sin(elevation) down it
  ok(
    'the drop step is a whole tile times cos(angle) times sin(elevation)',
    Math.abs(basis.x.y - tilePixels * Math.cos(Math.PI / 4) * Math.sin(ISO_ELEVATION)) < 1e-9,
    `${basis.x.y.toFixed(3)}`,
  );
  ok('the drop step is not a quarter tile', Math.abs(basis.x.y - tilePixels / 4) > 0.5, `${basis.x.y.toFixed(3)} vs ${tilePixels / 4}`);
}

section('the collision diamond matches the footprint the camera sees');
{
  const pxPerUnit = 32;
  const pixelSize = 2;
  const tilePixels = pxPerUnit * pixelSize;
  const volume = { x: 8, y: 4, z: 8 };
  const camera = studioCamera(volume, pxPerUnit, pixelSize);
  const { w, h } = outSize(volume, pxPerUnit, pixelSize);
  const basis = screenBasis(tilePixels);
  const screen = (x: number, y: number, z: number): { x: number; y: number } => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
  };

  for (const [fw, fd] of [[3, 4], [5, 2], [4, 4]] as [number, number][]) {
    const diamond = footprintDiamond(fw, fd, basis);
    // the four ground corners of the footprint, as world offsets from its centre
    const corners: [number, number][] = [
      [-fw / 2, -fd / 2],
      [fw / 2, -fd / 2],
      [fw / 2, fd / 2],
      [-fw / 2, fd / 2],
    ];
    const origin = screen(0, 0, 0);
    let worst = 0;
    corners.forEach(([cx, cz], i) => {
      const p = screen(cx, 0, cz);
      const want = diamond[i];
      worst = Math.max(worst, Math.abs(p.x - origin.x - want[0]), Math.abs(p.y - origin.y - want[1]));
    });
    ok(`a ${fw}x${fd} footprint diamond lands on the real corners`, worst < pixelSize * 1.5, `off by ${worst.toFixed(2)} px`);

    // and it must be a proper diamond: four distinct corners, equal opposite sides
    const uniq = new Set(diamond.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`));
    ok(`a ${fw}x${fd} diamond has four distinct corners`, uniq.size === 4);
    const side = (a: number, b: number): number => Math.hypot(diamond[a][0] - diamond[b][0], diamond[a][1] - diamond[b][1]);
    ok(`a ${fw}x${fd} diamond has equal opposite sides`, Math.abs(side(0, 1) - side(2, 3)) < 1e-6 && Math.abs(side(1, 2) - side(3, 0)) < 1e-6);
  }
}

// ------------------------------------------------------------- the ground

section('the ground is a strip that tiles without gaps');
{
  const road = 4;
  const plots = [{ z0: -5, z1: -1 }, { z0: 1, z1: 5 }];
  const ground = streetGround(road, plots);
  ok('the strip runs past every plot', ground.z0 < -5 && ground.z1 > 5, `${ground.z0} to ${ground.z1}`);
  ok('there are bands', ground.bands.length > 0, `${ground.bands.length}`);

  const asphalt = ground.bands.find((b) => b.color === GROUND_COLORS.asphalt);
  ok('the road is the full width of the road', !!asphalt && Math.abs(asphalt.z1 - asphalt.z0 - road) < 1e-9, `${asphalt ? asphalt.z1 - asphalt.z0 : 'none'}`);
  ok('the road is centred on the origin', !!asphalt && Math.abs(asphalt.z0 + asphalt.z1) < 1e-9);

  // every band must lie inside the strip, and no band may overlap another
  const inside = ground.bands.every((b) => b.z0 >= ground.z0 - 1e-9 && b.z1 <= ground.z1 + 1e-9);
  ok('every band lies inside the strip', inside);
  const overlaps = ground.bands.some((a, i) =>
    ground.bands.some((b, j) => i !== j && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-9));
  ok('no two bands overlap', !overlaps);

  // a wider road must give a wider road band, not a shifted one
  const wide = streetGround(8, plots);
  const wideAsphalt = wide.bands.find((b) => b.color === GROUND_COLORS.asphalt);
  ok('a wider road widens the road band', !!wideAsphalt && Math.abs(wideAsphalt.z1 - wideAsphalt.z0 - 8) < 1e-9);

  // and the geometry itself
  const geo = groundStrip(ground.z0, ground.z1, ground.bands);
  ok('the ground strip builds geometry', !!geo && geo.getAttribute('position').count > 100, `${geo?.getAttribute('position').count ?? 0} verts`);
  const box = geo?.boundingBox;
  ok('the strip is one tile wide', !!box && Math.abs(box.max.x - box.min.x - 1.12) < 1e-6, `${box ? (box.max.x - box.min.x).toFixed(3) : 'none'}`);
  ok('the strip is as deep as the map', !!box && Math.abs(box.max.z - box.min.z - (ground.z1 - ground.z0)) < 1e-6);
  ok('nothing in the ground is below zero', !!box && box.min.y >= 0);

  // an empty plot list must still give usable ground rather than nothing
  const bare = streetGround(4, []);
  ok('a street with no buildings still gets ground', bare.bands.length > 0 && bare.z1 > bare.z0);
}

// --------------------------------------------------------- street furniture

section('street furniture builds real models');
{
  for (const kind of PROP_KINDS) {
    const g = propGeometry(kind, 0);
    const verts = g?.getAttribute('position').count ?? 0;
    ok(`${kind}: builds geometry`, verts > 40, `${verts} verts`);
    const v = propVolume(kind);
    const box = g?.boundingBox;
    ok(`${kind}: fits the volume it is framed in`, !!box && box.max.x - box.min.x <= v.x + 1e-6 && box.max.y - box.min.y <= v.y + 1e-6, `${box ? (box.max.x - box.min.x).toFixed(2) : '?'} x ${box ? (box.max.y - box.min.y).toFixed(2) : '?'} in ${v.x} x ${v.y}`);
    ok(`${kind}: stands on the ground`, !!box && box.min.y > -0.06 && box.min.y < 0.06, `${box?.min.y.toFixed(3)}`);
  }

  // variants must actually differ, or every prop on a street is a clone.
  // A vending machine's variety is its colour, so compare colour as well.
  const differs = (a: THREE.BufferGeometry | null, b: THREE.BufferGeometry | null): boolean => {
    for (const name of ['position', 'color']) {
      const pa = a?.getAttribute(name).array as Float32Array;
      const pb = b?.getAttribute(name).array as Float32Array;
      if (pa.length !== pb.length) return true;
      for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return true;
    }
    return false;
  };
  ok('two variants of a vending machine differ', differs(propGeometry('vending', 0), propGeometry('vending', 1)));
  ok('two variants of bicycle parking differ', differs(propGeometry('bikes', 0), propGeometry('bikes', 1)));
  ok('the same variant is reproducible', !differs(propGeometry('lantern', 1), propGeometry('lantern', 1)));

  ok('an unknown kind builds nothing rather than throwing', propGeometry('spaceship', 0) === null);
}

// ----------------------------------------------------------- the manifest

section('the manifest carries everything the importer reads');
{
  const preset = 'shopping' as const;
  const d = streetDefaults(preset);
  const map = generateStreet({ id: 's1', name: 'Test street', preset, seed: 4242, lots: d.lots, depth: d.depth });

  const pxPerUnit = 32;
  const pixelSize = 2;
  const tilePixels = pxPerUnit * pixelSize;
  const camera = studioCamera({ x: 6, y: 3, z: 6 }, pxPerUnit, pixelSize);
  const size = outSize({ x: 6, y: 3, z: 6 }, pxPerUnit, pixelSize);

  // a street bake with real geometry and real bands, but synthetic pixels
  const bakes = (light: LightPresetId, season: SeasonId): StreetBake => {
    const buildings = map.buildings.slice(0, 4).map((placed) => {
      const generated = generateBuilding(placed.recipe);
      const bake = fakeBake(camera, size.w, size.h, light, season);
      return { placed, generated, sprites: [{ light, season, bake, bands: bandsFor(generated.geometry, bake) }] };
    });
    const props = map.props.slice(0, 3).map((p) => ({
      id: p.id,
      kind: p.kind,
      tileX: p.tileX,
      tileZ: p.tileZ,
      sprites: [{ light, season, bake: fakeBake(camera, size.w, size.h, light, season), bands: [] }],
    }));
    return {
      buildings,
      props,
      ground: { light, season, bake: fakeBake(camera, size.w, size.h, light, season), bands: [] },
      groundBands: streetGround(map.roadWidth, []).bands,
      groundAnchor: { x: Math.round(size.w / 2), y: Math.round(size.h / 2) },
      groundStripCenterZ: -2,
      groundZ: [-9, 9],
      xRange: [-1, 12],
      tilePixels,
      basis: screenBasis(tilePixels),
      light,
      season,
      problems: [],
    };
  };

  const baked = bakes('day', 'summer');
  const files = exportStreet({ projectName: 'Kawara Street', map, baked });
  const paths = files.map((f) => f.path);
  console.log(`        ${files.length} files: ${paths.slice(0, 6).join(', ')}${paths.length > 6 ? ', …' : ''}`);

  ok('a manifest is written', paths.includes('map.json'));
  ok('the importer script is written', paths.includes('import_map.gd'));
  ok('a readme is written', paths.includes('README.md'));
  ok('one PNG per building and prop, plus the ground', paths.filter((p) => p.endsWith('.png')).length === baked.buildings.length + baked.props.length + 1, `${paths.filter((p) => p.endsWith('.png')).length}`);

  const text = new TextDecoder().decode(files.find((f) => f.path === 'map.json')!.bytes);
  const m = JSON.parse(text) as Record<string, never>;

  // every key the GDScript reaches for must exist, or the importer silently
  // produces an empty scene
  const grid = m.grid as Record<string, unknown>;
  ok('the importer can find the tile size', typeof grid.tile_pixels === 'number', String(grid.tile_pixels));
  ok('the manifest records the camera', typeof grid.camera === 'object');

  const ground = m.ground as Record<string, unknown>;
  ok('the importer can find the ground sprite', typeof ground.file === 'string' && (ground.file as string).endsWith('.png'));
  ok('the importer can find the ground anchor', Array.isArray(ground.anchor_px));
  ok('the importer can find the strip offset', typeof ground.strip_center_z === 'number');
  ok('the importer can find the x range', Array.isArray(ground.x_range) && (ground.x_range as number[]).length === 2);

  const buildings = m.buildings as Record<string, never>[];
  ok('there are buildings', buildings.length > 0, `${buildings.length}`);
  const b0 = buildings[0];
  ok('a building names its sprite', typeof b0.sprite === 'string');
  ok('a building gives its tile centre', Array.isArray(b0.tile_center) && (b0.tile_center as number[]).length === 2);
  ok('a building gives its collision', Array.isArray(b0.collision) && (b0.collision as unknown[]).length === 4);
  ok('a building gives its door tile', Array.isArray(b0.door_tile) && (b0.door_tile as number[]).length === 2);
  ok('a building carries occlusion bands', Array.isArray(b0.occlusion_bands) && (b0.occlusion_bands as unknown[]).length > 0);
  ok('a building gives a depth order', typeof b0.z_index === 'number');
  ok('a building keeps its 3D recipe', typeof b0.recipe === 'object' && b0.recipe !== null);
  ok('a building keeps its seed', typeof b0.seed === 'number');
  ok('every building sprite is in the folder', buildings.every((b) => paths.includes(b.sprite as unknown as string)));

  const props = m.props as Record<string, never>[];
  ok('there are props', props.length > 0, `${props.length}`);
  ok('a prop names its sprite', typeof props[0].sprite === 'string');
  ok('a prop gives its tile', Array.isArray(props[0].tile));
  ok('a prop gives a depth order', typeof props[0].z_index === 'number');
  ok('every prop sprite is in the folder', props.every((p) => paths.includes(p.sprite as unknown as string)));

  // depth order must be unique, or two things fight over the same slot
  const zs = [...buildings.map((b) => b.z_index as number), ...props.map((p) => p.z_index as number)];
  ok('every depth order is unique', new Set(zs).size === zs.length, `${zs.length} pieces, ${new Set(zs).size} slots`);

  // and it must actually be back to front
  const withDepth = buildings.map((b, i) => {
    const c = b.tile_center as number[];
    return { z: b.z_index as number, key: c[0] + c[1] };
  });
  withDepth.sort((a, b) => a.z - b.z);
  const monotonic = withDepth.every((v, i) => i === 0 || v.key >= withDepth[i - 1].key);
  ok('depth order runs back to front', monotonic, withDepth.map((v) => v.key.toFixed(1)).join(' '));

  // the door must land inside the footprint it belongs to
  const inside = buildings.every((b) => {
    const c = b.tile_center as number[];
    const f = b.footprint_tiles as number[];
    const door = b.door_tile as number[];
    return door[0] >= c[0] - f[0] / 2 - 1e-6 && door[0] <= c[0] + f[0] / 2 + 1e-6 &&
      door[1] >= c[1] - f[1] / 2 - 1e-6 && door[1] <= c[1] + f[1] / 2 + 1e-6;
  });
  ok('every door sits inside its own footprint', inside);

  // the importer script must be real GDScript, not a stub
  const gd = new TextDecoder().decode(files.find((f) => f.path === 'import_map.gd')!.bytes);
  ok('the importer is an editor script', gd.includes('extends EditorScript'));
  ok('the importer reads the manifest', gd.includes('map.json'));
  ok('the importer builds ground', gd.includes('_build_ground'));
  ok('the importer builds buildings', gd.includes('_build_buildings'));
  ok('the importer builds props', gd.includes('_build_props'));
  ok('the importer creates collision', gd.includes('CollisionPolygon2D'));
  ok('the importer marks doors', gd.includes('Marker2D'));
  ok('the importer keeps the occlusion bands', gd.includes('occlusion_bands'));
  ok('the importer writes a scene', gd.includes('PackedScene') && gd.includes('ResourceSaver.save'));
  ok('the importer turns filtering off', gd.includes('TEXTURE_FILTER_NEAREST'));
  ok('the importer uses the basis from the manifest', gd.includes('_basis_x') && gd.includes('basis'));
  ok('the importer does not assume a 2:1 grid', !gd.includes('* tile * 0.25'));

  // a night export must be named differently and say so
  const nightFiles = exportStreet({ projectName: 'Kawara Street', map, baked: bakes('night', 'winter') });
  const nightPaths = nightFiles.map((f) => f.path);
  ok('a night export is suffixed', nightPaths.some((p) => p.includes('_night_winter')), nightPaths.slice(0, 3).join(', '));
  const nightReadme = new TextDecoder().decode(nightFiles.find((f) => f.path === 'README.md')!.bytes);
  ok('the readme names the time and season', nightReadme.includes('night') && nightReadme.includes('winter'));

  // the whole thing must zip
  const zip = zipFiles(files);
  ok('the export zips', zip.length > 1000, `${zip.length} bytes`);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  ok('the zip ends properly', view.getUint32(zip.length - 22, true) === 0x06054b50);
  ok('the zip lists every file', view.getUint16(zip.length - 22 + 10, true) === files.length);
}

// ------------------------------------------------------ the street as a whole

section('a street bakes as one coherent set');
{
  // bakeStreet needs WebGL, so this checks what can be checked without it: that
  // it fails loudly rather than quietly when there is no renderer.
  let threw = false;
  try {
    const d = streetDefaults('shopping');
    const map = generateStreet({ id: 's', name: 'T', preset: 'shopping', seed: 7, lots: d.lots, depth: d.depth });
    bakeStreet(map, { pxPerUnit: 32, pixelSize: 2, light: 'day', season: 'summer' });
  } catch {
    threw = true;
  }
  ok('baking a street without a renderer fails rather than returning nothing', threw);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log('all good');
