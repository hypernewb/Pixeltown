// The service layer the studio talks to. It owns the expensive steps: turning a
// recipe into geometry, baking it into sprites, and packing a Godot export. The
// UI only ever calls in here, so none of it needs to know about three.js.

import { bakeBatch, type BakeVolume, type BakeOutput, type BakeEntry } from './bake/bake';
import { generateBuilding, type GeneratedBuilding } from './generator';
import { bandsFor, exportGodot, type GodotFile, type PartBand } from './export/godot';
import { encodePNG } from './export/png';
import type { AssetEntry } from './project';
import type { BuildingRecipe, LightPresetId, SeasonId } from './types';

export interface BakedSprite {
  light: LightPresetId;
  season: SeasonId;
  bake: BakeOutput;
  bands: PartBand[];
}

export interface BakedAsset {
  assetId: string;
  generated: GeneratedBuilding;
  sprites: BakedSprite[];
  volume: BakeVolume;
  // the grid, in output pixels
  tilePixels: number;
}

// A tight box around the building, plus a little air. Because the camera frames
// this and pxPerUnit is fixed, two assets of different sizes still come out at
// the same scale.
function volumeFor(generated: GeneratedBuilding): BakeVolume {
  const box = generated.geometry?.boundingBox;
  const w = generated.result.width + 0.9;
  const d = generated.result.depth + 0.9;
  const y = Math.max(0.6, (box ? box.max.y : generated.result.height) + 0.3);
  return { x: Math.max(w, 1.5), y, z: Math.max(d, 1.5) };
}

export interface BakeAssetOptions {
  pxPerUnit: number;
  pixelSize: number;
  outline?: number;
  shadow?: boolean;
}

export function bakeAsset(asset: AssetEntry, opts: BakeAssetOptions): BakedAsset {
  const generated = generateBuilding(asset.recipe);
  const volume = volumeFor(generated);

  const entries: BakeEntry[] = [];
  const pairs: { light: LightPresetId; season: SeasonId }[] = [];
  for (const light of asset.lights) {
    for (const season of asset.seasons) {
      entries.push({ geometry: generated.geometry, light, season, span: Math.max(volume.x, volume.z) });
      pairs.push({ light, season });
    }
  }
  if (!entries.length) {
    entries.push({ geometry: generated.geometry, light: 'day', season: 'summer', span: Math.max(volume.x, volume.z) });
    pairs.push({ light: 'day', season: 'summer' });
  }

  const bakes = bakeBatch(entries, volume, {
    pxPerUnit: opts.pxPerUnit,
    pixelSize: opts.pixelSize,
    outline: opts.outline,
    shadow: opts.shadow,
  });

  const sprites: BakedSprite[] = bakes.map((bake, i) => ({
    light: pairs[i].light,
    season: pairs[i].season,
    bake,
    bands: bandsFor(generated.geometry, bake),
  }));

  return {
    assetId: asset.id,
    generated,
    sprites,
    volume,
    tilePixels: Math.max(1, Math.round(opts.pxPerUnit * opts.pixelSize)),
  };
}

export function spriteKey(assetId: string, light: LightPresetId, season: SeasonId): string {
  return `${assetId}::${light}::${season}`;
}

// The single PNG for one sprite, for a download or a drag out of the gallery.
export function spritePNG(sprite: BakedSprite): Uint8Array {
  return encodePNG(sprite.bake.width, sprite.bake.height, sprite.bake.pixels);
}

export function exportAssetToGodot(asset: AssetEntry, baked: BakedAsset): GodotFile[] {
  return exportGodot({
    assetName: asset.name || asset.recipe.template,
    recipe: baked.generated.recipe,
    footprint: baked.generated.footprint,
    sprites: baked.sprites.map((s) => ({ bake: s.bake, light: s.light, season: s.season, bands: s.bands })),
    tilePixels: baked.tilePixels,
  });
}

// ---------------------------------------------------------------- downloads

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // give the browser a moment to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadFile(bytes: Uint8Array, filename: string, type = 'application/octet-stream'): void {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  triggerDownload(new Blob([copy], { type }), filename);
}

export function downloadText(text: string, filename: string, type = 'text/plain'): void {
  triggerDownload(new Blob([text], { type }), filename);
}

export function downloadJSON(value: unknown, filename: string): void {
  downloadText(JSON.stringify(value, null, 2), filename, 'application/json');
}

// ------------------------------------------------------------------- export

export interface GodotBundle {
  files: GodotFile[];
  // one entry per asset that could not be exported, and why
  problems: { asset: string; reason: string }[];
}

export function bundleGodot(assets: { entry: AssetEntry; baked: BakedAsset }[]): GodotBundle {
  const files: GodotFile[] = [];
  const problems: GodotBundle['problems'] = [];
  const used = new Set<string>();

  for (const { entry, baked } of assets) {
    try {
      const produced = exportAssetToGodot(entry, baked);
      // keep names distinct even when two assets share a template name
      let prefix = '';
      if (used.has(produced[0]?.path ?? '')) prefix = `${entry.id}_`;
      for (const f of produced) {
        const path = prefix && f.path !== 'README.md' ? `${prefix}${f.path}` : f.path;
        used.add(path);
        files.push({ ...f, path });
      }
    } catch (err) {
      problems.push({ asset: entry.name, reason: err instanceof Error ? err.message : 'export failed' });
    }
  }

  files.push({
    path: 'project.json',
    kind: 'text',
    bytes: new TextEncoder().encode(
      JSON.stringify(
        {
          exportedFrom: 'PixelTown Studio',
          godot: '4.x, 2D',
          assets: assets.map(({ entry, baked }) => ({
            name: entry.name,
            recipe: baked.generated.recipe,
            seedCode: baked.generated.seedCode,
            footprint: baked.generated.footprint,
            variants: baked.sprites.map((s) => ({ light: s.light, season: s.season })),
          })),
        },
        null,
        2,
      ),
    ),
  });

  return { files, problems };
}

// A tiny store-only zip: no compression, which keeps this dependency-free and
// is plenty for a folder of PNGs that are already small.
export function zipFiles(files: GodotFile[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  const crc32 = (b: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const enc = new TextEncoder();

  for (const file of files) {
    const name = enc.encode(file.path);
    const crc = crc32(file.bytes);
    const size = file.bytes.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    chunks.push(local, file.bytes);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, name.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += local.length + size;
  }

  let centralSize = 0;
  for (const c of central) centralSize += c.length;

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  let total = offset + centralSize + 22;
  for (const c of chunks) total += 0;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  for (const c of central) {
    out.set(c, at);
    at += c.length;
  }
  out.set(end, at);
  return out;
}

export function newAssetFromRecipe(recipe: BuildingRecipe, name: string): AssetEntry {
  return {
    id: recipe.id,
    name: name || recipe.template,
    recipe,
    lights: ['day'],
    seasons: ['summer'],
    notes: '',
  };
}

// --------------------------------------------------------------------- map

// Baking a whole street lives in mapExport.ts. It has to frame every building
// in one shared volume so they all come out at the same scale, which is a
// different job from baking a single asset and does not belong here.
