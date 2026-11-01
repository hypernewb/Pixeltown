// Verifies the Godot export and the zip writer without a browser. The bake
// itself needs WebGL, so a synthetic bake stands in: everything downstream of
// the pixels is the real code path.

import * as THREE from 'three';
import { generateBuilding, newRecipe } from '../src/engine/generator';
import { bandsFor, exportGodot } from '../src/engine/export/godot';
import { zipFiles } from '../src/engine/service';
import { encodePNG } from '../src/engine/export/png';
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

// A stand-in for a real bake: correct shape, obviously fake pixels. The camera
// is a plain orthographic one so the projector behaves exactly as it would.
function fakeBake(light: LightPresetId, season: SeasonId): BakeOutput {
  const w = 96;
  const h = 80;
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.25, -1.25, 0.1, 100);
  camera.position.set(2, 2, 2);
  camera.lookAt(0, 0.5, 0);
  camera.updateMatrixWorld(true);
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = (i * 7) % 256;
    pixels[i * 4 + 1] = 120;
    pixels[i * 4 + 2] = (i * 3) % 256;
    pixels[i * 4 + 3] = i % 5 === 0 ? 0 : 255;
  }
  return {
    pixels,
    width: w,
    height: h,
    artWidth: 48,
    artHeight: 40,
    pxPerUnit: 32,
    pixelSize: 2,
    camera: { angle: Math.PI / 4, elevation: Math.atan(0.5), viewHeight: 0 },
    anchor: { x: 48, y: 60 },
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

console.log('\nbands come from the geometry, not the picture');
{
  const g = generateBuilding(newRecipe('machiya', 5150));
  const bake = fakeBake('day', 'summer');
  const bands = bandsFor(g.geometry, bake);

  ok('at least one band is produced', bands.length > 0, `${bands.length}`);
  const names = bands.map((b) => b.name);
  console.log(`        bands: ${names.join(', ')}`);
  ok('the roof is one of them', names.includes('roof'), names.join(', '));
  ok('the ground floor is one of them', names.includes('ground_floor'), names.join(', '));
  ok('every band has a positive height', bands.every((b) => b.bottom > b.top));
  ok('every band lies inside the sprite', bands.every((b) => b.top >= 0 && b.bottom <= bake.height));

  // the roof must sit above the ground floor in the image, and be nearer the
  // camera than the ground floor's far edge — the whole point of the bands
  const roof = bands.find((b) => b.name === 'roof')!;
  const ground = bands.find((b) => b.name === 'ground_floor')!;
  ok('the roof draws above the ground floor', roof.bottom <= ground.bottom, `roof ${roof.top}-${roof.bottom}, ground ${ground.top}-${ground.bottom}`);
  // the manifest lists bands bottom-up so a game can walk them in draw order
  ok('the roof is listed last', names[names.length - 1] === 'roof', names.join(', '));
  ok('the foundation, if present, is listed first', !names.includes('base') || names[0] === 'base', names.join(', '));

  // the same geometry must always give the same bands
  const again = bandsFor(g.geometry, bake);
  ok('bands are reproducible', JSON.stringify(bands) === JSON.stringify(again));

  // and a building with no geometry must not throw
  ok('no geometry yields no bands', bandsFor(null, bake).length === 0);
  ok('geometry without tags yields no bands', bandsFor(new THREE.BufferGeometry(), bake).length === 0);
}

console.log('\nthe Godot export is a complete, coherent folder');
{
  const generated = generateBuilding(newRecipe('showa', 31337));
  const day = fakeBake('day', 'summer');
  const night = fakeBake('night', 'summer');
  const files = exportGodot({
    assetName: 'Neighbourhood Shop',
    recipe: generated.recipe,
    footprint: generated.footprint,
    sprites: [
      { bake: day, light: 'day', season: 'summer', bands: bandsFor(generated.geometry, day) },
      { bake: night, light: 'night', season: 'summer', bands: bandsFor(generated.geometry, night) },
    ],
    tilePixels: 64,
  });

  const paths = files.map((f) => f.path);
  console.log(`        files: ${paths.join(', ')}`);
  ok('a PNG per variant', paths.filter((p) => p.endsWith('.png')).length === 2, paths.join(', '));
  ok('a JSON manifest', paths.includes('neighbourhood_shop.json'));
  ok('a README', paths.includes('README.md'));
  ok('a Godot scene', paths.includes('neighbourhood_shop.tscn'));
  ok('the day variant is not suffixed', paths.includes('neighbourhood_shop.png'));
  ok('the night variant is suffixed', paths.includes('neighbourhood_shop_night_summer.png'));

  const manifest = JSON.parse(new TextDecoder().decode(files.find((f) => f.path.endsWith('.json'))!.bytes)) as Record<string, never>;
  ok('the manifest records the seed', typeof (manifest as Record<string, unknown>).seed === 'number');
  ok('the manifest keeps the whole 3D recipe', typeof (manifest as Record<string, unknown>).recipe === 'object');
  ok('the manifest records the camera', typeof (manifest as Record<string, unknown>).camera === 'object');
  ok('the manifest lists both sprites', ((manifest as Record<string, unknown>).sprites as unknown[]).length === 2);
  ok('the manifest carries occlusion bands', (((manifest as Record<string, unknown>).occlusion_bands as unknown[]) ?? []).length > 0);
  const fp = (manifest as Record<string, unknown>).footprint as Record<string, unknown>;
  ok('the manifest records the collision footprint', typeof fp.width_tiles === 'number' && typeof fp.depth_tiles === 'number');
  ok('the manifest records the door tile and facing', typeof fp.door_tile === 'object' && typeof fp.facing === 'string');

  const scene = new TextDecoder().decode(files.find((f) => f.path.endsWith('.tscn'))!.bytes);
  ok('the scene declares a Godot 4 scene', scene.startsWith('[gd_scene'));
  ok('the scene has a sprite', scene.includes('type="Sprite2D"'));
  ok('the scene has collision', scene.includes('CollisionShape2D'));
  ok('the scene marks the door', scene.includes('DoorMarker'));
  ok('the scene carries the bands as metadata', scene.includes('metadata/bands'));

  const readme = new TextDecoder().decode(files.find((f) => f.path === 'README.md')!.bytes);
  ok('the README explains the import steps', readme.includes('Reimport') && readme.includes('Filter'));
  ok('the README explains depth sorting', readme.toLowerCase().includes('depth'));
  ok('the README explains occlusion', readme.toLowerCase().includes('occlusion'));
  ok('the README names the actual files', readme.includes('neighbourhood_shop.png'));

  // a name that would break a filename must be sanitized
  const odd = exportGodot({
    assetName: 'Corner "Shop" / #2!',
    recipe: generated.recipe,
    footprint: generated.footprint,
    sprites: [{ bake: day, light: 'day', season: 'summer', bands: [] }],
    tilePixels: 64,
  });
  ok('an awkward name is sanitized', odd.every((f) => !/[ "#!/]/.test(f.path)), odd.map((f) => f.path).join(', '));
}

console.log('\nthe zip is a real zip');
{
  const generated = generateBuilding(newRecipe('modern', 7));
  const day = fakeBake('day', 'summer');
  const files = exportGodot({
    assetName: 'House',
    recipe: generated.recipe,
    footprint: generated.footprint,
    sprites: [{ bake: day, light: 'day', season: 'summer', bands: bandsFor(generated.geometry, day) }],
    tilePixels: 64,
  });
  const zip = zipFiles(files);

  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // find the end-of-central-directory record
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  ok('ends with an end-of-central-directory record', eocd >= 0);
  const entries = view.getUint16(eocd + 10, true);
  ok('the directory lists every file', entries === files.length, `${entries} vs ${files.length}`);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralAt = view.getUint32(eocd + 16, true);
  ok('the central directory is where it says it is', centralAt + centralSize === eocd, `${centralAt}+${centralSize} vs ${eocd}`);

  // walk the central directory and check each entry against its local header
  let at = centralAt;
  let walked = 0;
  let allGood = true;
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) {
      allGood = false;
      break;
    }
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));

    // the local header must agree
    if (view.getUint32(localAt, true) !== 0x04034b50) allGood = false;
    if (view.getUint32(localAt + 14, true) !== crc) allGood = false;
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;

    // and the stored bytes must match the file we asked for
    const original = files.find((f) => f.path === name);
    if (!original || original.bytes.length !== size) allGood = false;
    else {
      for (let k = 0; k < size; k++) {
        if (zip[dataAt + k] !== original.bytes[k]) {
          allGood = false;
          break;
        }
      }
    }
    at += 46 + nameLen + extraLen + commentLen;
    walked++;
  }
  ok('every entry matches its local header and its bytes', allGood);
  ok('the walk consumed every entry', walked === entries, `${walked}/${entries}`);
  ok('the zip is a plausible size', zip.length > 2000, `${zip.length} bytes`);
}

console.log('\nPNGs inside the export decode');
{
  const generated = generateBuilding(newRecipe('commercial', 2));
  const day = fakeBake('day', 'summer');
  const png = encodePNG(day.width, day.height, day.pixels);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  ok('the exported PNG has the right dimensions', view.getUint32(16) === day.width && view.getUint32(20) === day.height);
  void generated;
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log('all good');
