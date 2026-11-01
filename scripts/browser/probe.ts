// Proves the three controls that were once dead actually change the picture.
//
// A control that moves a slider but leaves the sprite identical is worse than
// no control at all: it looks like it worked. So each of these bakes the same
// building twice and counts the pixels that moved.

import { generateBuilding, newRecipe } from '@/engine/generator';
import { bakeBatch, type BakeOutput } from '@/engine/bake/bake';
import { propGeometry } from '@/engine/build/furniture';
import type { BuildingRecipe, LightPresetId, SeasonId } from '@/engine/types';

const reports: { name: string; png: string }[] = [];
let failed = 0;

function say(line: string): void {
  const pre = document.getElementById('log');
  if (pre) pre.textContent += `${line}\n`;
  console.log(line);
}

function check(name: string, ok: boolean, detail: string): void {
  say(`  ${ok ? 'pass' : 'FAILED'}  ${name} — ${detail}`);
  if (!ok) failed++;
}

const VOLUME = { x: 5, y: 6, z: 5 };
const TREE_VOLUME = { x: 1.6, y: 1.4, z: 1.6 };

interface OneOptions {
  prop?: boolean;
  volume?: { x: number; y: number; z: number };
  // a street tree is far smaller than its own contact shadow, which would fill
  // the whole frame and swamp any measurement of the tree itself
  shadow?: boolean;
  span?: number;
}

function bakeOne(
  geometry: ReturnType<typeof generateBuilding>['geometry'],
  light: LightPresetId,
  season: SeasonId,
  opts: OneOptions = {},
): BakeOutput {
  const [out] = bakeBatch(
    [{ geometry, light, season, span: opts.span ?? 4, prop: opts.prop ?? false }],
    opts.volume ?? VOLUME,
    { pxPerUnit: 32, pixelSize: 2, shadow: opts.shadow ?? true },
  );
  return out;
}

// How many pixels differ between two bakes, as a share of the pixels either one
// actually drew. Normalising against the whole frame would make a small object
// look unchanged: a tree fills a fraction of a percent of its frame, so a total
// recolor of it would still read as "0.4% of pixels".
function diff(a: BakeOutput, b: BakeOutput): { n: number; pct: number } {
  const n = Math.min(a.pixels.length, b.pixels.length);
  let d = 0;
  let drawn = 0;
  for (let i = 0; i < n; i += 4) {
    const ao = a.pixels[i + 3] > 8;
    const bo = b.pixels[i + 3] > 8;
    if (!ao && !bo) continue;
    drawn++;
    if (
      Math.abs(a.pixels[i] - b.pixels[i]) > 6 ||
      Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) > 6 ||
      Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > 6
    ) d++;
  }
  return { n: d, pct: drawn ? (d / drawn) * 100 : 0 };
}

// The average warmth of the opaque pixels: red minus blue. Used to tell autumn
// from summer on foliage, where a pixel count alone would not.
function warmth(o: BakeOutput): number {
  let r = 0, b = 0, k = 0;
  for (let i = 0; i < o.pixels.length; i += 4) {
    if (o.pixels[i + 3] <= 8) continue;
    r += o.pixels[i];
    b += o.pixels[i + 2];
    k++;
  }
  return k ? (r - b) / k : 0;
}

function push(name: string, o: BakeOutput): void {
  reports.push({ name, png: o.toCanvas().toDataURL('image/png').replace(/^data:image\/png;base64,/, '') });
}

function run(): void {
  const base = newRecipe('machiya', 20250101, 'japanese');
  const geometryOf = (recipe: BuildingRecipe) => generateBuilding(recipe).geometry;

  // -------------------------------------------------------------- seasons
  say('the season control changes the picture');
  const summer = bakeOne(geometryOf(base), 'day', 'summer');
  const autumn = bakeOne(geometryOf(base), 'day', 'autumn');
  const spring = bakeOne(geometryOf(base), 'day', 'spring');
  const winter = bakeOne(geometryOf(base), 'day', 'winter');
  const sa = diff(summer, autumn);
  const ss = diff(summer, spring);
  const sw = diff(summer, winter);
  check('autumn differs from summer', sa.pct > 3, `${sa.pct.toFixed(1)}% of pixels`);
  check('spring differs from summer', ss.pct > 1, `${ss.pct.toFixed(1)}% of pixels`);
  check('winter differs from summer', sw.pct > 8, `${sw.pct.toFixed(1)}% of pixels`);
  // snow is bright, so winter is not colder than summer in a simple red-minus-
  // blue sense; what matters is that autumn is warmer and winter is bluer
  check('autumn is warmer than summer', warmth(autumn) > warmth(summer), `${warmth(summer).toFixed(1)} to ${warmth(autumn).toFixed(1)}`);
  const blue = (o: BakeOutput): number => warmth(o);
  check('winter is bluer than summer', blue(winter) < blue(summer), `${blue(summer).toFixed(1)} to ${blue(winter).toFixed(1)}`);
  push('season_summer', summer);
  push('season_autumn', autumn);
  push('season_winter', winter);

  // ------------------------------------------------------------- foliage
  say('foliage turns with the season');
  const tree = propGeometry('tree', 3);
  const treeOpts: OneOptions = { prop: true, volume: TREE_VOLUME, shadow: false, span: 0.7 };
  const tSummer = bakeOne(tree, 'day', 'summer', treeOpts);
  const tAutumn = bakeOne(tree, 'day', 'autumn', treeOpts);
  const tWinter = bakeOne(tree, 'day', 'winter', treeOpts);
  const ta = diff(tSummer, tAutumn);
  check('an autumn tree differs from a summer one', ta.pct > 40, `${ta.pct.toFixed(1)}% of its pixels`);
  check('an autumn tree is warmer than a summer one', warmth(tAutumn) > warmth(tSummer) + 8, `${warmth(tSummer).toFixed(1)} to ${warmth(tAutumn).toFixed(1)}`);
  const tw = diff(tSummer, tWinter);
  check('a winter tree is not the summer tree', tw.pct > 40, `${tw.pct.toFixed(1)}% of its pixels`);
  push('tree_summer', tSummer);
  push('tree_autumn', tAutumn);

  // -------------------------------------------------------- roof material
  say('the roof material control changes the roof');
  const kawara = bakeOne(geometryOf({ ...base, overrides: { roof: 'kawara' } }), 'day', 'summer');
  const thatch = bakeOne(geometryOf({ ...base, overrides: { roof: 'thatch' } }), 'day', 'summer');
  const metal = bakeOne(geometryOf({ ...base, overrides: { roof: 'metal' } }), 'day', 'summer');
  const kt = diff(kawara, thatch);
  const km = diff(kawara, metal);
  check('thatch differs from kawara tile', kt.pct > 4, `${kt.pct.toFixed(1)}% of pixels`);
  check('metal differs from kawara tile', km.pct > 4, `${km.pct.toFixed(1)}% of pixels`);
  check('thatch changes the form, not just the colour', kt.pct > km.pct, `${kt.pct.toFixed(1)}% vs ${km.pct.toFixed(1)}%`);
  push('roof_kawara', kawara);
  push('roof_thatch', thatch);

  // ----------------------------------------------------------- roof shape
  say('the roof shape control changes the roof');
  const gable = bakeOne(geometryOf({ ...base, roofStyle: 'gable' }), 'day', 'summer');
  const hip = bakeOne(geometryOf({ ...base, roofStyle: 'hip' }), 'day', 'summer');
  const parapet = bakeOne(geometryOf({ ...base, roofStyle: 'parapet' }), 'day', 'summer');
  check('hip differs from gable', diff(gable, hip).pct > 4, `${diff(gable, hip).pct.toFixed(1)}% of pixels`);
  check('parapet differs from gable', diff(gable, parapet).pct > 4, `${diff(gable, parapet).pct.toFixed(1)}% of pixels`);
  push('roof_gable', gable);
  push('roof_parapet', parapet);

  // ----------------------------------------------------------- wall material
  say('the wall material control changes the building');
  const plain = bakeOne(geometryOf(base), 'day', 'summer');
  const yaki = bakeOne(geometryOf({ ...base, overrides: { walls: 'yakisugi' } }), 'day', 'summer');
  const shik = bakeOne(geometryOf({ ...base, overrides: { walls: 'shikkui' } }), 'day', 'summer');
  check('yakisugi differs from the generated wall', diff(plain, yaki).pct > 5, `${diff(plain, yaki).pct.toFixed(1)}% of pixels`);
  check('shikkui differs from yakisugi', diff(yaki, shik).pct > 5, `${diff(shik, yaki).pct.toFixed(1)}% of pixels`);
  push('wall_generated', plain);
  push('wall_yakisugi', yaki);

  say(failed ? `${failed} FAILED` : 'all controls live');
}

try {
  run();
} catch (err) {
  console.log('FAILED: ' + (err instanceof Error ? err.message : String(err)));
  failed++;
}

const tag = document.createElement('script');
tag.type = 'application/json';
tag.id = 'probe-pngs';
tag.textContent = JSON.stringify(reports);
document.body.appendChild(tag);
