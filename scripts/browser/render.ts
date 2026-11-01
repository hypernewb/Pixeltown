// Renders the two review images: the composed street as one scene, and a 4x4
// contact sheet of building variations. Runs in the browser against the real
// bake pipeline, and writes the images through the same channel as the other
// probes so the harness can save them.

import { bakeStreet, tileToPx } from '@/engine/mapExport';
import { bakeBatch, type BakeOutput } from '@/engine/bake/bake';
import { generateBuilding, newRecipe } from '@/engine/generator';
import { generateStreet, streetDefaults } from '@/engine/street';
import { getPack } from '@/engine/packs/registry';
import { mixSeed } from '@/engine/rng';

interface Out {
  name: string;
  width: number;
  height: number;
  png: string;
}

const outputs: Out[] = [];
const log: string[] = [];

function say(line: string): void {
  log.push(line);
  const el = document.getElementById('log');
  if (el) el.textContent = log.join('\n');
}

function canvasOf(pixels: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const img = ctx.createImageData(w, h);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  return c;
}

function emit(name: string, c: HTMLCanvasElement): void {
  outputs.push({ name, width: c.width, height: c.height, png: c.toDataURL('image/png').replace(/^data:image\/png;base64,/, '') });
  say(`  rendered ${name} (${c.width}x${c.height})`);
}

// The street as one picture. Every sprite was baked in the same frame, so a
// building's sprite is placed by where its world position lands on screen,
// minus where the world origin sits inside that sprite.
function streetScene(): void {
  const d = streetDefaults('composed');
  const map = generateStreet({ id: 'street', name: 'Kawara Street', preset: 'composed', seed: 20250101, lots: d.lots, depth: d.depth });
  const bake = bakeStreet(map, { light: 'day', season: 'summer', pxPerUnit: 32, pixelSize: 2, outline: 1, shadow: true } as Parameters<typeof bakeStreet>[1]);
  const basis = bake.basis;

  type Piece = { out: BakeOutput; left: number; top: number; depth: number };
  const pieces: Piece[] = [];
  const place = (out: BakeOutput, tx: number, tz: number, depth: number): void => {
    const p = tileToPx(tx, tz, basis);
    pieces.push({ out, left: p.x - out.anchor.x, top: p.y - out.anchor.y, depth });
  };

  // the ground is one tile repeated along the street. Each copy is outlined on
  // its own, so overlapping copies would each draw their edges over the last;
  // every copy is instead clipped to the column it alone owns.
  const groundCopies: Piece[] = [];
  for (let x = bake.xRange[0]; x <= bake.xRange[1]; x++) {
    place(bake.ground.bake, x, bake.groundStripCenterZ, -1e9);
    groundCopies.push(pieces[pieces.length - 1]);
  }
  for (const b of bake.buildings) {
    const s = b.sprites[0].bake;
    place(s, b.placed.tileX, b.placed.tileZ, b.placed.tileX + b.placed.tileZ);
  }
  for (const p of bake.props) {
    const s = p.sprites[0].bake;
    place(s, p.tileX, p.tileZ, p.tileX + p.tileZ);
  }

  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const p of pieces) {
    minL = Math.min(minL, p.left);
    minT = Math.min(minT, p.top);
    maxR = Math.max(maxR, p.left + p.out.width);
    maxB = Math.max(maxB, p.top + p.out.height);
  }
  const pad = 24;
  const c = document.createElement('canvas');
  c.width = Math.ceil(maxR - minL) + pad * 2;
  c.height = Math.ceil(maxB - minT) + pad * 2;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const columnOf = (p: Piece): number => Math.round(p.left - minL) + pad;
  const toCanvas = (tx: number, tz: number): [number, number] => {
    const q = tileToPx(tx, tz, basis);
    return [q.x - minL + pad, q.y - minT + pad];
  };
  const [zNear, zFar] = [bake.groundZ[0] + 0.2, bake.groundZ[1] - 0.2];
  groundCopies.forEach((p, i) => {
    const x = bake.xRange[0] + i;
    const slab = [toCanvas(x - 0.5, zNear), toCanvas(x + 0.5, zNear), toCanvas(x + 0.5, zFar), toCanvas(x - 0.5, zFar)];
    ctx.save();
    ctx.beginPath();
    slab.forEach(([sx, sy], k) => (k === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(canvasOf(p.out.pixels, p.out.width, p.out.height), columnOf(p), Math.round(p.top - minT) + pad);
    ctx.restore();
  });
  const rest = pieces.filter((p) => !groundCopies.includes(p)).sort((a, b) => a.depth - b.depth);
  for (const p of rest) {
    ctx.drawImage(canvasOf(p.out.pixels, p.out.width, p.out.height), columnOf(p), Math.round(p.top - minT) + pad);
  }
  emit('street-scene', c);
  say(`  ${bake.buildings.length} buildings, ${bake.props.length} prop kinds, problems: ${bake.problems.length}`);
}

// Sixteen buildings in a 4x4 grid. Templates are cycled so each family appears
// the same number of times, and each cell takes its own seed.
function contactSheet(): void {
  const templates = getPack('japanese').templates.map((t) => t.id);
  const made: { geometry: ReturnType<typeof generateBuilding>['geometry']; w: number; d: number; h: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const recipe = newRecipe(templates[i % templates.length], mixSeed(4242, i, 3), 'japanese');
    const g = generateBuilding(recipe);
    if (!g.geometry) continue;
    if (!g.geometry.boundingBox) g.geometry.computeBoundingBox();
    made.push({ geometry: g.geometry, w: g.result.width, d: g.result.depth, h: g.geometry.boundingBox?.max.y ?? g.result.height });
  }
  const volume = made.reduce(
    (v, m) => ({ x: Math.max(v.x, m.w + 1), y: Math.max(v.y, m.h + 0.3), z: Math.max(v.z, m.d + 1) }),
    { x: 1.5, y: 1, z: 1.5 },
  );
  const bakes = bakeBatch(
    made.map((m) => ({ geometry: m.geometry, light: 'day' as const, season: 'summer' as const, span: Math.max(m.w, m.d) })),
    volume,
    { pxPerUnit: 32, pixelSize: 2 },
  );
  const cellW = Math.max(...bakes.map((b) => b.width));
  const cellH = Math.max(...bakes.map((b) => b.height));
  const c = document.createElement('canvas');
  c.width = cellW * 4;
  c.height = cellH * 4;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  bakes.forEach((b, i) => {
    ctx.drawImage(canvasOf(b.pixels, b.width, b.height), (i % 4) * cellW, Math.floor(i / 4) * cellH);
  });
  emit('contact-sheet', c);
}

function run(): void {
  try {
    streetScene();
    contactSheet();
  } catch (err) {
    say(`FAILED  ${err instanceof Error ? err.message : String(err)}`);
  }
  const tag = document.createElement('script');
  tag.type = 'application/json';
  tag.id = 'probe-pngs';
  tag.textContent = JSON.stringify(outputs);
  document.body.appendChild(tag);
}

run();
