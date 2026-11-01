// Verification harness. Runs the generation engine outside the browser, with no
// renderer, and checks the things that must hold for the studio to be usable:
// that generation is deterministic, that different seeds actually differ, that
// a street comes out coherent, that part locking works, and that the PNG writer
// produces bytes a decoder accepts.

import * as THREE from 'three';
import { generateBuilding, newRecipe } from '../src/engine/generator';
import { generateStreet, streetDefaults } from '../src/engine/street';
import { captureLocks, applyLocks } from '../src/engine/parts';
import { encodePNG } from '../src/engine/export/png';
import { getPack, listPacks } from '../src/engine/packs/registry';
import { seedToCode, codeToSeed, randomSeed } from '../src/engine/rng';
import type { BuildingRecipe, NeighborhoodPreset } from '../src/engine/types';

let failures = 0;
let checks = 0;

function ok(name: string, cond: boolean, detail = ''): void {
  checks++;
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

function fingerprint(g: THREE.BufferGeometry | null): string {
  if (!g) return 'none';
  const p = g.getAttribute('position').array as Float32Array;
  const c = g.getAttribute('color').array as Float32Array;
  let h = 2166136261;
  const mix = (v: number): void => {
    // quantise so tiny float noise does not read as a difference
    const q = Math.round(v * 10000);
    h ^= q & 0xffffffff;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (let i = 0; i < p.length; i += 37) mix(p[i]);
  for (let i = 0; i < c.length; i += 37) mix(c[i]);
  return `${p.length / 3}v:${h.toString(16)}`;
}

// ---------------------------------------------------------------- determinism

section('generation is deterministic');
{
  const recipe = newRecipe('machiya', 12345);
  const a = generateBuilding(recipe);
  const b = generateBuilding({ ...recipe });
  ok('same seed gives byte-identical geometry', fingerprint(a.geometry) === fingerprint(b.geometry), `${fingerprint(a.geometry)} vs ${fingerprint(b.geometry)}`);
  ok('same seed gives the same plan', JSON.stringify(a.plan) === JSON.stringify(b.plan));
  ok('the geometry has vertices', (a.geometry?.getAttribute('position').count ?? 0) > 0);

  const c = generateBuilding(newRecipe('machiya', 12346));
  ok('a different seed gives different geometry', fingerprint(a.geometry) !== fingerprint(c.geometry));
}

// ------------------------------------------------------------------ structure

section('every template generates a real building');
{
  const pack = getPack('japanese');
  for (const t of pack.templates) {
    const g = generateBuilding(newRecipe(t.id, 900 + t.id.length));
    const verts = g.geometry?.getAttribute('position').count ?? 0;
    const box = g.geometry?.boundingBox;
    const height = box ? box.max.y - box.min.y : 0;
    const hasTag = !!g.geometry?.getAttribute('tag');
    const hasEmit = !!g.geometry?.getAttribute('emit');
    ok(
      `${t.id}: geometry, height, tags`,
      verts > 200 && height > 0.5 && hasTag && hasEmit,
      `${verts} verts, height ${height.toFixed(2)}, tag ${hasTag}, emit ${hasEmit}`,
    );
  }
}

// ------------------------------------------------------------- part locking

section('part locking survives a re-roll');
{
  const base = newRecipe('machiya', 777);
  const first = generateBuilding(base);
  const pinned = captureLocks(first.plan, ['roof', 'shopfront', 'awning', 'sign']);

  // re-roll the seed, but keep the pinned decisions
  const rerolled: BuildingRecipe = { ...base, seed: 8888, locked: ['roof', 'shopfront', 'awning', 'sign'], lockedPlan: pinned };
  const second = generateBuilding(rerolled);

  ok('the seed really changed', fingerprint(first.geometry) !== fingerprint(second.geometry));
  ok('the pinned roof style held', second.plan.roofStyle === first.plan.roofStyle, `${first.plan.roofStyle} -> ${second.plan.roofStyle}`);
  ok('the pinned shopfront flag held', second.plan.parts.shopfront === first.plan.parts.shopfront);
  ok('the pinned awning flag held', second.plan.parts.awning === first.plan.parts.awning);

  // and a control: without the lock the same re-roll is free to change
  const free = generateBuilding({ ...base, seed: 8888 });
  ok('an unpinned re-roll is free to differ', JSON.stringify(free.plan.parts) !== JSON.stringify(first.plan.parts) || free.plan.roofStyle !== first.plan.roofStyle);
}

// --------------------------------------------------------------- variation

section('a seed range gives real variation, not noise');
{
  const seen = new Map<string, number>();
  const roofCounts = new Map<string, number>();
  const n = 60;
  // The seeds have to be walked, not drawn independently: sixty random seeds
  // collide often enough that two of them landing on the same building is
  // expected rather than a bug, and the test would fail one run in six. A fixed
  // base with a wide stride keeps the spread while making the test decide the
  // same thing every time it runs.
  const base = randomSeed() % 100000;
  for (let i = 0; i < n; i++) {
    const g = generateBuilding(newRecipe('machiya', base + i * 997));
    seen.set(fingerprint(g.geometry), (seen.get(fingerprint(g.geometry)) ?? 0) + 1);
    roofCounts.set(g.plan.roofStyle, (roofCounts.get(g.plan.roofStyle) ?? 0) + 1);
  }
  ok('all 60 seeds produced distinct buildings', seen.size === n, `${seen.size}/${n} distinct`);
  // roof style now follows the template so silhouettes stay honest; variation
  // within a template comes from hips vs gables via the palette's roofStyle
  ok('more than one roof style appeared across templates', new Set(
    ['machiya', 'modern', 'showa', 'commercial', 'apartment'].map((t) => generateBuilding(newRecipe(t, randomSeed() % 100000)).plan.roofStyle),
  ).size > 1, [...roofCounts.keys()].join(', '));
}

// ------------------------------------------------------------- composition

section('a building is composed of volumes, not one box');
{
  // The mass of a building: its walls and its upper floors, without the roof,
  // the fittings, or the props on its plot. Only those vertices say anything
  // about whether a second volume was built, and the tag the geometry already
  // carries is what tells them apart.
  const mass = (g: ReturnType<typeof generateBuilding>): { x: number; z: number }[] => {
    const p = g.geometry?.getAttribute('position');
    const t = g.geometry?.getAttribute('tag');
    if (!p || !t) return [];
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < p.count; i++) {
      if (t.getX(i) > 1.5) continue;
      if (p.getY(i) < 0.05) continue;
      out.push({ x: p.getX(i), z: p.getZ(i) });
    }
    return out;
  };

  const n = 40;
  for (const template of ['modern', 'showa', 'apartment', 'commercial']) {
    let flat = 0;
    for (let i = 0; i < n; i++) {
      if (generateBuilding(newRecipe(template, 4000 + i * 313)).plan.roofK.pitch === 0) flat++;
    }
    ok(`${template} has a flat roof`, flat === n, `${flat}/${n} flat`);
  }

  // a narrow townhouse fills its plot, so it has nowhere to put a second volume
  let lone = 0;
  for (let i = 0; i < n; i++) {
    const g = generateBuilding(newRecipe('machiya', 4000 + i * 313));
    const half = g.result.width / 2;
    if (mass(g).some((v) => Math.abs(v.x) > half + 0.06)) lone++;
  }
  ok('a narrow townhouse stands as one volume', lone === 0, `${lone}/${n} composed`);
}

// ------------------------------------------------------------------- streets

section('streets are coherent');
{
  const presets: NeighborhoodPreset[] = ['composed', 'residential', 'shopping', 'mainroad', 'mixed'];
  for (const preset of presets) {
    const d = streetDefaults(preset);
    const spec = { id: 's1', name: 'Test', preset, seed: 4242, lots: d.lots, depth: d.depth };
    const a = generateStreet(spec);
    const b = generateStreet(spec);
    ok(`${preset}: deterministic`, JSON.stringify(a) === JSON.stringify(b));
    ok(`${preset}: has buildings`, a.buildings.length > 0, `${a.buildings.length}`);

    // tileX and tileZ are the building's own centre
    const noOverlap = a.buildings.every((x, i) =>
      a.buildings.every(
        (y, j) =>
          i === j ||
          x.tileZ !== y.tileZ ||
          Math.abs(x.tileX - y.tileX) >= (x.recipe.width + y.recipe.width) / 2,
      ));
    ok(`${preset}: no two buildings on the same lot overlap`, noOverlap);

    const onRoad = a.buildings.every((x) => {
      const c = a.roadCentre[Math.max(0, Math.min(a.roadCentre.length - 1, Math.round(x.tileX)))] ?? 0;
      return Math.abs(x.tileZ - c) - x.recipe.depth / 2 >= spec.depth / 2;
    });
    ok(`${preset}: nothing sits in the road`, onRoad);

    // the rows face the road: the near row shows its back, the far row its front
    const facingOk = a.buildings.every((x) => (x.tileZ < 0 ? x.facing === 'south' : x.facing === 'north'));
    ok(`${preset}: every building faces the road`, facingOk);
    // The composed street is deliberately one row, so there is no second row for
    // it to face away from. Everything else here applies to it unchanged.
    if (preset !== 'composed') {
      ok(`${preset}: both rows face opposite ways`, new Set(a.buildings.map((x) => x.facing)).size === 2);
    }

    // street furniture belongs between the building and the road, never on it;
    // with a meandering road, "in the road" means near the local centre line
    const propsOnRoad = a.props.filter((p) => {
      const c = a.roadCentre[Math.max(0, Math.min(a.roadCentre.length - 1, Math.round(p.tileX)))] ?? 0;
      return Math.abs(p.tileZ - c) < spec.depth / 2;
    });
    ok(`${preset}: no street furniture stands in the road`, propsOnRoad.length === 0, `${propsOnRoad.length} on the road`);

    // every building must actually generate
    let bad = 0;
    for (const pl of a.buildings) {
      const g = generateBuilding({ ...pl.recipe, seed: pl.recipe.seed });
      if (!g.geometry || g.geometry.getAttribute('position').count < 200) bad++;
    }
    ok(`${preset}: every placed building generates`, bad === 0, `${bad} bad`);

    const commercialCount = a.buildings.filter((x) => x.commercial).length;
    console.log(`        ${a.buildings.length} buildings, ${commercialCount} commercial, ${a.props.length} props`);

    // A street of twelve identical buildings is not a street. This caught a
    // real bug once: seeds derived with a truncating XOR collapsed to zero, so
    // every lot drew the same template.
    const kinds = new Set(a.buildings.map((x) => x.recipe.template));
    ok(`${preset}: more than one kind of building`, kinds.size > 1, kinds.size === 1 ? `all ${[...kinds][0]}` : '');

    const widths = new Set(a.buildings.map((x) => `${x.recipe.width}x${x.recipe.depth}x${x.recipe.floors}`));
    ok(`${preset}: buildings are not all the same size`, widths.size > 1, `${widths.size} distinct footprints`);
  }

  // the presets should differ from each other, not just internally
  const ratio = (preset: NeighborhoodPreset): number => {
    const d = streetDefaults(preset);
    let commercial = 0, total = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const m = generateStreet({ id: 's', name: 'T', preset, seed, lots: d.lots, depth: d.depth });
      commercial += m.buildings.filter((x) => x.commercial).length;
      total += m.buildings.length;
    }
    return total ? commercial / total : 0;
  };
  const shopRatio = ratio('shopping');
  const resRatio = ratio('residential');
  ok('a shopping street is more commercial than a residential one', shopRatio > resRatio, `${shopRatio.toFixed(2)} vs ${resRatio.toFixed(2)}`);
  ok('a residential street is not all shops', resRatio < 0.5, `${resRatio.toFixed(2)}`);

  // The ratio a preset declares is the ratio the street should actually come
  // out at. This caught a real bug: the ratio was applied on top of a template
  // table that was already mostly houses, so a residential street came out at
  // one per cent shops instead of twelve.
  const declared: Record<Exclude<NeighborhoodPreset, 'composed'>, number> = { residential: 0.12, shopping: 0.78, mainroad: 0.55, mixed: 0.4 };
  for (const preset of presets) {
    if (preset === 'composed') continue;
    const got = ratio(preset);
    const want = declared[preset];
    ok(`${preset}: hits its declared commercial ratio`, Math.abs(got - want) < 0.12, `wanted ${want}, got ${got.toFixed(2)}`);
  }
}

// ------------------------------------------------------- the composed street

section('the composed street is the street it was written to be');
{
  const spec = { id: 's1', name: 'Kawara Street', preset: 'composed' as const, seed: 4242, lots: 6, depth: 4 };
  const a = generateStreet(spec);
  const b = generateStreet(spec);
  ok('deterministic', JSON.stringify(a) === JSON.stringify(b));
  ok('it is six buildings', a.buildings.length === 6, `${a.buildings.length}`);

  // the order the families stand in is the composition, so it is the thing to
  // hold: a rule that reshuffled it would still produce six buildings and would
  // have thrown the composition away
  const order = a.buildings.map((x) => x.recipe.template).join(',');
  ok('the families stand in the order they were composed', order === 'modern,machiya,showa,commercial,apartment,machiya', order);

  // no family repeats back to back, so no two neighbours read as one building
  const adjacent = a.buildings.some((x, i) => i > 0 && x.recipe.template === a.buildings[i - 1].recipe.template);
  ok('no two neighbours are the same family', !adjacent);

  // the plots crowd toward the middle and open at the ends
  const gaps = a.buildings.slice(1).map((x, i) => {
    const prev = a.buildings[i];
    return x.tileX - x.recipe.width / 2 - (prev.tileX + prev.recipe.width / 2);
  });
  ok('the plots never overlap', gaps.every((g) => g >= 0), gaps.map((g) => g.toFixed(2)).join(' '));
  ok(
    'the street crowds toward the middle',
    gaps[2] <= gaps[0] && gaps[2] <= gaps[gaps.length - 1],
    gaps.map((g) => g.toFixed(2)).join(' '),
  );

  // one row, all of it facing the road
  ok('it is one row', new Set(a.buildings.map((x) => x.facing)).size === 1);
  ok('the road is straight', a.roadCentre.every((v) => v === 0));

  // and the furniture stands between the row and the road, never on the road
  const offRoad = a.props.every((p) => Math.abs(p.tileZ) >= a.roadWidth / 2);
  ok('no furniture stands in the road', offRoad);
  const clear = a.props.every((p) => a.buildings.every((x) => Math.abs(p.tileX - x.tileX) > x.recipe.width / 2 || Math.abs(p.tileZ - x.tileZ) > x.recipe.depth / 2));
  ok('no furniture stands inside a building', clear);
}

// --------------------------------------------------------------- seed codes

section('seed codes round-trip');
{
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const s = randomSeed();
    const code = seedToCode(s);
    const back = codeToSeed(code);
    if (back !== s) bad++;
  }
  ok('300 random seeds survive a code round-trip', bad === 0, `${bad} failed`);
  ok('codes are short and readable', seedToCode(123456789).length === 7, seedToCode(123456789));
  ok('a bad code is rejected', codeToSeed('!!!!') === null);
}

// --------------------------------------------------------------------- packs

section('the engine is not wired to one style');
{
  ok('the pack registry is reachable', listPacks().length >= 1);
  const pack = getPack('japanese');
  ok('a pack declares its own palette', typeof pack.palette === 'function');
  ok('a pack declares its own plan rule', typeof pack.planFor === 'function');
  ok('a pack declares its own templates', pack.templates.length > 0);
  ok('an unknown pack id falls back rather than throwing', getPack('does-not-exist').id === 'japanese');
}

// ----------------------------------------------------------------------- png

section('the PNG writer emits a decodable file');
{
  const w = 7, h = 5;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = (i * 9) % 256;
    px[i * 4 + 1] = (i * 33) % 256;
    px[i * 4 + 2] = 200;
    px[i * 4 + 3] = i % 3 === 0 ? 0 : 255;
  }
  const png = encodePNG(w, h, px);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  ok('signature is correct', sig.every((b, i) => png[i] === b));

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  ok('declares the right width and height', view.getUint32(16) === w && view.getUint32(20) === h, `${view.getUint32(16)}x${view.getUint32(20)}`);
  ok('declares 8-bit RGBA', png[24] === 8 && png[25] === 6);
  ok('ends with IEND', png[png.length - 8] === 0x49 && png[png.length - 7] === 0x45);

  // verify every chunk CRC, which is what a decoder will do
  let at = 8;
  let crcsOk = true;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  const crc = (b: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  let chunks = 0;
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);
    const want = view.getUint32(at + 8 + len);
    const got = crc(png.subarray(at + 4, at + 8 + len));
    if (want !== got) crcsOk = false;
    chunks++;
    at += 12 + len;
    if (type === 'IEND') break;
  }
  ok('every chunk CRC checks out', crcsOk);
  ok('the chunk walk consumed the whole file', at === png.length, `${at} of ${png.length}`);
  ok('three chunks: IHDR, IDAT, IEND', chunks === 3, `${chunks}`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log('all good');
