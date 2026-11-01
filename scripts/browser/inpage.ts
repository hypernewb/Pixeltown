// Runs inside the browser. Everything here is the real engine: the real
// renderer, the real post-processing chain, the real readback.
//
// It reports a few facts about the pixels rather than the pixels themselves,
// because the point is to catch a pipeline that runs but produces nothing —
// an all-transparent sprite, an outline pass that never fires, a camera that
// frames empty space. It also hands each sprite back as a data URL so the
// harness can save them and they can be looked at.

import { generateBuilding, newRecipe } from '@/engine/generator';
import { bakeBuilding, bakeBatch, screenBasis } from '@/engine/bake/bake';
import { bakeStreet } from '@/engine/mapExport';
import { generateStreet, streetDefaults } from '@/engine/street';

interface Report {
  name: string;
  width: number;
  height: number;
  opaque: number;
  total: number;
  colors: number;
  dark: number;
  anchor: { x: number; y: number };
  png: string;
}

const lines: string[] = [];
const reports: Report[] = [];
let failed = 0;

function say(s: string): void {
  lines.push(s);
  const el = document.getElementById('log');
  if (el) el.textContent = lines.join('\n');
}

function ok(name: string, cond: boolean, detail = ''): void {
  if (!cond) failed++;
  say(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function section(name: string): void {
  say(`\n${name}`);
}

function png(pixels: Uint8ClampedArray, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(w, h);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function measure(pixels: Uint8ClampedArray, w: number, h: number, anchor: { x: number; y: number }, name: string): Report {
  const seen = new Set<number>();
  let opaque = 0;
  let dark = 0;
  for (let i = 0; i < w * h; i++) {
    const a = pixels[i * 4 + 3];
    if (a > 8) {
      opaque++;
      const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
      seen.add((r << 16) | (g << 8) | b);
      // near-black pixels are the outline pass having drawn something
      if (r < 40 && g < 40 && b < 40) dark++;
    }
  }
  return { name, width: w, height: h, opaque, total: w * h, colors: seen.size, dark, anchor, png: png(pixels, w, h) };
}

function run(): void {
  // ------------------------------------------------------ a single building
  section('a single building bakes in a real browser');
  let one: Report | null = null;
  try {
    const recipe = newRecipe('machiya', 20250101, 'japanese');
    const g = generateBuilding(recipe);
    ok('the generator returns geometry', !!g.geometry, `${g.plan.template} ${g.footprint.w}x${g.footprint.d}`);

    const volume = { x: Math.max(g.footprint.w + 1, 5), y: 6, z: Math.max(g.footprint.d + 1, 5) };
    const out = bakeBuilding(g.geometry, volume, { light: 'day', season: 'summer', pxPerUnit: 32, pixelSize: 2, span: g.footprint.w });
    ok('the bake returns pixels', out.pixels.length === out.width * out.height * 4, `${out.width}x${out.height}`);

    one = measure(out.pixels, out.width, out.height, out.anchor, 'machiya');
    reports.push(one);
    ok('something was drawn', one.opaque > one.total * 0.05, `${((one.opaque / one.total) * 100).toFixed(1)}% opaque`);
    ok('it is not the whole frame', one.opaque < one.total * 0.98, `${((one.opaque / one.total) * 100).toFixed(1)}%`);
    ok('it has real colour in it', one.colors > 40, `${one.colors} distinct colours`);
    ok('the outline pass drew outlines', one.dark > 0, `${one.dark} near-black pixels`);
    ok('the anchor sits inside the sprite', one.anchor.x > 0 && one.anchor.x < one.width && one.anchor.y > 0 && one.anchor.y < one.height, `${one.anchor.x}, ${one.anchor.y}`);
    ok('the sprite is a whole number of art pixels', one.width % 2 === 0 && one.height % 2 === 0, `${one.width}x${one.height}`);

    // the roof should be above the anchor and the ground below it
    let topOpaque = 0;
    for (let y = 0; y < one.anchor.y; y++) {
      for (let x = 0; x < one.width; x++) if (out.pixels[(y * one.width + x) * 4 + 3] > 8) topOpaque++;
    }
    ok('the building stands above its ground point', topOpaque > one.opaque * 0.5, `${topOpaque} of ${one.opaque}`);
  } catch (err) {
    ok('a single building bakes', false, err instanceof Error ? err.message : String(err));
  }

  // --------------------------------------------------- night and seasons
  section('the same building bakes at other times of day');
  try {
    const g = generateBuilding(newRecipe('machiya', 20250101, 'japanese'));
    const volume = { x: Math.max(g.footprint.w + 1, 5), y: 6, z: Math.max(g.footprint.d + 1, 5) };
    const day = bakeBuilding(g.geometry, volume, { light: 'day', season: 'summer', pxPerUnit: 32, pixelSize: 2, span: g.footprint.w });
    const night = bakeBuilding(g.geometry, volume, { light: 'night', season: 'summer', pxPerUnit: 32, pixelSize: 2, span: g.footprint.w });
    const winter = bakeBuilding(g.geometry, volume, { light: 'day', season: 'winter', pxPerUnit: 32, pixelSize: 2, span: g.footprint.w });
    const dn = measure(night.pixels, night.width, night.height, night.anchor, 'night');
    const dw = measure(winter.pixels, winter.width, winter.height, winter.anchor, 'winter');
    reports.push(measure(day.pixels, day.width, day.height, day.anchor, 'day'), dn, dw);

    let diff = 0;
    for (let i = 0; i < day.pixels.length; i += 4) if (Math.abs(day.pixels[i] - night.pixels[i]) > 12) diff++;
    ok('night is visibly darker than day', diff > day.width * day.height * 0.05, `${diff} pixels differ`);
    let sdiff = 0;
    for (let i = 0; i < day.pixels.length; i += 4) if (Math.abs(day.pixels[i] - winter.pixels[i]) > 12) sdiff++;
    ok('winter differs from summer', sdiff > day.width * day.height * 0.02, `${sdiff} pixels differ`);
    ok('night still draws something', dn.opaque > 0, `${dn.opaque} opaque`);
  } catch (err) {
    ok('the same building bakes at other times of day', false, err instanceof Error ? err.message : String(err));
  }

  // -------------------------------------------- a whole street, one frame
  section('a whole street bakes in one shared frame');
  try {
    const d = streetDefaults('shopping');
    const map = generateStreet({ id: 's1', name: 'Harness street', preset: 'shopping', seed: 4242, lots: d.lots, depth: d.depth });
    ok('the street has buildings on it', map.buildings.length > 0, `${map.buildings.length} buildings`);

    const street = bakeStreet(map, { pxPerUnit: 32, pixelSize: 2, light: 'day', season: 'summer' });
    ok('no building was skipped', street.problems.length === 0, street.problems.map((p) => `${p.asset}: ${p.reason}`).join('; '));

    const sizes = street.buildings.map((b) => `${b.sprites[0]?.bake.width}x${b.sprites[0]?.bake.height}`);
    ok('every building produced a sprite', sizes.every((s) => s !== 'undefinedxundefined'), sizes.join(' '));
    ok('every building shares one sprite size', new Set(sizes).size === 1, sizes.join(' '));

    // the shared frame is the whole point: all the sprites are the same size,
    // so the same world point lands on the same pixel in every one of them
    const first = street.buildings[0].sprites[0].bake;
    const p0 = first.project(0, 0, 0);
    const allSame = street.buildings.every((b) => {
      const p = b.sprites[0].bake.project(0, 0, 0);
      return Math.abs(p.x - p0.x) < 1e-6 && Math.abs(p.y - p0.y) < 1e-6;
    });
    ok('the world origin lands on the same pixel in every sprite', allSame, `${p0.x.toFixed(1)}, ${p0.y.toFixed(1)}`);

    // and every sprite should have something in it
    const empty = street.buildings.filter((b) => {
      const px = b.sprites[0].bake.pixels;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 8) n++;
      return n < 16;
    });
    ok('no building came out empty', empty.length === 0, empty.map((b) => b.placed.id).join(', '));

    for (const b of street.buildings.slice(0, 3)) {
      const s = b.sprites[0].bake;
      reports.push(measure(s.pixels, s.width, s.height, s.anchor, b.placed.id));
    }
    const g = street.ground.bake;
    reports.push(measure(g.pixels, g.width, g.height, g.anchor, 'ground'));

    // the ground strip should be a continuous band, not empty. It is a long
    // diagonal in a mostly-empty frame, so the fill fraction is naturally low
    // and a horizontal run is short; what matters is that every row through
    // the band crosses exactly one contiguous piece of it.
    let groundOpaque = 0;
    for (let i = 3; i < g.pixels.length; i += 4) if (g.pixels[i] > 8) groundOpaque++;
    let crossed = 0, multi = 0, rows = 0;
    for (let y = Math.floor(g.height * 0.25); y < g.height * 0.75; y += 8) {
      rows++;
      let runs = 0, inRun = false;
      for (let x = 0; x < g.width; x++) {
        const a = g.pixels[(y * g.width + x) * 4 + 3] > 8;
        if (a && !inRun) runs++;
        inRun = a;
      }
      if (runs >= 1) crossed++;
      if (runs > 2) multi++;
    }
    ok(
      'the ground strip is a solid band',
      groundOpaque > g.width * g.height * 0.04 && crossed > rows * 0.8 && multi < rows * 0.1,
      `${((groundOpaque / (g.width * g.height)) * 100).toFixed(1)}%, ${crossed}/${rows} rows crossed, ${multi} broken`,
    );

    say(`\n        basis: x(${screenBasis(64).x.x.toFixed(3)}, ${screenBasis(64).x.y.toFixed(3)}) z(${screenBasis(64).z.x.toFixed(3)}, ${screenBasis(64).z.y.toFixed(3)})`);
  } catch (err) {
    ok('a whole street bakes', false, err instanceof Error ? err.message : String(err));
  }

  // ------------------------------------------------------------- the batch
  section('a batch of buildings shares one camera');
  try {
    const geos = [0, 1, 2, 3].map((i) => generateBuilding(newRecipe('machiya', 1000 + i * 77, 'japanese')).geometry);
    const out = bakeBatch(
      geos.map((geometry) => ({ geometry, light: 'day' as const, season: 'summer' as const, span: 4 })),
      { x: 8, y: 7, z: 8 },
      { pxPerUnit: 32, pixelSize: 2 },
    );
    ok('the batch returns one sprite per entry', out.length === 4, `${out.length}`);
    ok('they all share a size', new Set(out.map((o) => `${o.width}x${o.height}`)).size === 1, out.map((o) => `${o.width}x${o.height}`).join(' '));
    const distinct = new Set(out.map((o) => o.pixels.join('').length + ':' + o.pixels.slice(0, 400).join(',')));
    ok('different seeds give different sprites', distinct.size > 1, `${distinct.size} distinct`);
  } catch (err) {
    ok('a batch of buildings shares one camera', false, err instanceof Error ? err.message : String(err));
  }

  say(`\n${failed === 0 ? 'all good' : `${failed} FAILED`}`);
}

function handBack(): void {
  // the sprites ride out of the page in a script tag so they can be saved
  const tag = document.createElement('script');
  tag.type = 'application/json';
  tag.id = 'sprites';
  tag.textContent = JSON.stringify(reports.map((r) => ({ ...r, png: r.png.replace(/^data:image\/png;base64,/, '') })));
  document.body.appendChild(tag);
}

window.addEventListener('error', (e) => {
  say(`\n  FAIL  the page threw — ${e.message}`);
  failed++;
  handBack();
});

try {
  run();
} catch (err) {
  say(`\n  FAIL  the harness threw — ${err instanceof Error ? err.message : String(err)}`);
  failed++;
}

handBack();
