// The street view. It shows the generated neighbourhood laid out on the tile
// grid, and it is the same picture the exporter writes: every building, prop
// and strip of ground here comes from one shared bake, so what you see is what
// Godot gets.
//
// Placement is not hand-tuned. One world unit along each axis moves the picture
// by a fixed amount, worked out from the camera, and that single basis places
// the ground, the sprites, the doors and the collision. The exporter uses the
// same basis, which is why the preview and the exported map agree.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { PRESET_LABELS, PRESET_ORDER } from '@/engine/street';
import { bakeStreet, exportStreet, footprintDiamond, tileToPx, type StreetBake } from '@/engine/mapExport';
import { screenBasis } from '@/engine/bake/bake';
import { downloadFile, zipFiles } from '@/engine/service';
import type { LightPresetId, MapDef, NeighborhoodPreset, SeasonId } from '@/engine/types';
import { Btn, Empty, Segmented, Spinner } from './kit';

interface Piece {
  id: string;
  url: string;
  width: number;
  height: number;
  // the pixel inside the sprite where the thing's ground point sits, so the
  // sprite is placed by that point rather than by its centre: a tall building
  // and a bicycle then land on the same tile in exactly the same way
  anchor: { x: number; y: number };
  tileX: number;
  tileZ: number;
  kind: 'building' | 'prop';
  footprint?: [number, number];
}

export function StreetView({
  map,
  projectName,
  onGenerate,
  light,
  season,
  pxPerUnit,
  pixelSize,
}: {
  map: MapDef | null;
  projectName: string;
  onGenerate: (preset: NeighborhoodPreset, seed: number) => void;
  light: LightPresetId;
  season: SeasonId;
  pxPerUnit: number;
  pixelSize: number;
}): JSX.Element {
  const [preset, setPreset] = useState<NeighborhoodPreset>(map?.preset ?? 'shopping');
  const [seed, setSeed] = useState<number>(map?.seed ?? 4242);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [ground, setGround] = useState<{ url: string; width: number; height: number } | null>(null);
  const [baked, setBaked] = useState<StreetBake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showCollision, setShowCollision] = useState(false);
  const [zoom, setZoom] = useState(1);
  const token = useRef(0);

  // A street is dozens of renders, so it happens in one pass with progress
  // reported rather than the window silently freezing.
  useEffect(() => {
    if (!map) {
      setPieces([]);
      setGround(null);
      setBaked(null);
      setProgress(null);
      return;
    }
    const mine = ++token.current;
    setProgress({ done: 0, total: 1 });
    setPieces([]);
    setGround(null);
    setBaked(null);
    setError(null);

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled || mine !== token.current) return;
      try {
        const street = bakeStreet(map, { pxPerUnit, pixelSize, light, season }, (p) => {
          if (mine === token.current) setProgress({ done: p.done, total: p.total });
        });
        if (cancelled || mine !== token.current) return;

        const out: Piece[] = [];
        for (const b of street.buildings) {
          const s = b.sprites[0];
          if (!s) continue;
          out.push({
            id: b.placed.id,
            url: s.bake.toCanvas().toDataURL('image/png'),
            width: s.bake.width,
            height: s.bake.height,
            anchor: s.bake.anchor,
            tileX: b.placed.tileX,
            tileZ: b.placed.tileZ,
            kind: 'building',
            footprint: [b.generated.footprint.w, b.generated.footprint.d],
          });
        }
        for (const p of street.props) {
          const s = p.sprites[0];
          if (!s) continue;
          out.push({
            id: p.id,
            url: s.bake.toCanvas().toDataURL('image/png'),
            width: s.bake.width,
            height: s.bake.height,
            anchor: s.bake.anchor,
            tileX: p.tileX,
            tileZ: p.tileZ,
            kind: 'prop',
          });
        }
        setPieces(out);
        setGround({
          url: street.ground.bake.toCanvas().toDataURL('image/png'),
          width: street.ground.bake.width,
          height: street.ground.bake.height,
        });
        setBaked(street);
      } catch (err) {
        if (mine === token.current) setError(err instanceof Error ? err.message : 'the street could not be baked');
      } finally {
        if (mine === token.current) setProgress(null);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [map, light, season, pxPerUnit, pixelSize]);

  // one tile on screen, in CSS pixels, and the basis for that size
  const tile = (baked?.tilePixels ?? pxPerUnit * pixelSize) * zoom;
  const basis = useMemo(() => screenBasis(tile), [tile]);

  const place = (tx: number, tz: number): { x: number; y: number } => tileToPx(tx, tz, basis);

  // Everything is placed from the map origin at tile 0,0, then the whole board
  // is shifted so nothing sits at a negative coordinate.
  const board = useMemo(() => {
    if (!baked || !ground) return { w: 1, h: 1, dx: 0, dy: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const include = (p: { x: number; y: number }, anchor: { x: number; y: number }, w: number, h: number): void => {
      minX = Math.min(minX, p.x - anchor.x * zoom);
      maxX = Math.max(maxX, p.x + (w - anchor.x) * zoom);
      minY = Math.min(minY, p.y - anchor.y * zoom);
      maxY = Math.max(maxY, p.y + (h - anchor.y) * zoom);
    };
    const stripZ = baked.groundStripCenterZ;
    const gw = ground.width * zoom;
    const gh = ground.height * zoom;
    for (let i = baked.xRange[0]; i <= baked.xRange[1]; i++) {
      const dz = baked.roadCentre?.[Math.max(0, Math.min((baked.roadCentre?.length ?? 1) - 1, i))] ?? 0;
      include(tileToPx(i, stripZ + dz, basis), baked.groundAnchor, gw, gh);
    }
    for (const p of pieces) {
      include(tileToPx(p.tileX, p.tileZ, basis), p.anchor, p.width * zoom, p.height * zoom);
    }
    if (!isFinite(minX)) return { w: 1, h: 1, dx: 0, dy: 0 };
    const pad = tile;
    return { w: maxX - minX + pad * 2, h: maxY - minY + pad * 2, dx: -minX + pad, dy: -minY + pad };
  }, [baked, ground, pieces, basis, tile, zoom]);

  const at = (tx: number, tz: number): { x: number; y: number } => {
    const p = place(tx, tz);
    return { x: p.x + board.dx, y: p.y + board.dy };
  };

  // Back to front: whatever is further along x + z is nearer the camera. The
  // same rule orders the manifest the importer reads.
  const depthOf = (p: Piece): number => {
    const b = baked?.buildings.find((x) => x.placed.id === p.id);
    const size = b ? (b.generated.footprint.w + b.generated.footprint.d) / 2 : 0.5;
    return p.tileX + p.tileZ + size;
  };

  const exportZip = (): void => {
    if (!map || !baked) return;
    const files = exportStreet({ projectName, map, baked });
    downloadFile(zipFiles(files), `${projectName.replace(/\s+/g, '_').toLowerCase()}_street_godot.zip`, 'application/zip');
  };

  const strips = baked
    ? Array.from({ length: Math.max(0, baked.xRange[1] - baked.xRange[0] + 1) }, (_, k) => baked.xRange[0] + k)
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-300)]">Street</span>
        <Segmented
          value={preset}
          onChange={setPreset}
          className="w-auto"
          options={PRESET_ORDER.map((p) => ({ value: p, label: PRESET_LABELS[p].replace(' street', '').replace(' neighborhood', '') }))}
        />
        <div className="ml-auto flex items-center gap-1">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--ink-400)]">
            seed
            <input
              type="number"
              className="field w-20 px-1.5 py-0.5 font-mono text-[11px]"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) | 0)}
            />
          </label>
          <Btn variant="ghost" title="Random seed" onClick={() => setSeed((Math.random() * 100000) | 0)}>
            <RefreshCw size={12} />
          </Btn>
          <Btn variant="primary" onClick={() => onGenerate(preset, seed)}>
            Generate street
          </Btn>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-3 py-1.5 text-[11px] text-[var(--ink-400)]">
        <button type="button" onClick={() => setShowGrid((v) => !v)} className={`transition-colors ${showGrid ? 'text-[var(--brass-400)]' : 'hover:text-[var(--ink-200)]'}`}>
          tile grid
        </button>
        <button
          type="button"
          onClick={() => setShowCollision((v) => !v)}
          className={`transition-colors ${showCollision ? 'text-[var(--brass-400)]' : 'hover:text-[var(--ink-200)]'}`}
        >
          collision
        </button>
        <span className="mx-1 h-3 w-px bg-white/10" />
        {[0.5, 1, 2].map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            className={`font-mono transition-colors ${zoom === z ? 'text-[var(--brass-400)]' : 'hover:text-[var(--ink-200)]'}`}
          >
            {z}x
          </button>
        ))}
        {baked && (
          <span className="font-mono">
            {baked.buildings.length} buildings · {baked.props.length} props
            {baked.problems.length > 0 && ` · ${baked.problems.length} skipped`}
          </span>
        )}
        {progress && <Spinner label={`baking ${progress.done} of ${progress.total}`} />}
        <div className="ml-auto">
          <Btn disabled={!baked || !!progress} onClick={exportZip} title={!baked ? 'Generate a street first' : 'Export this street for Godot 4'}>
            <Download size={12} />
            Export street for Godot
          </Btn>
        </div>
      </div>

      <div className="checker min-h-0 flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-3 rounded-lg border border-[var(--rust-500)]/40 bg-[var(--rust-500)]/10 px-3 py-2 text-[11px] text-[var(--ink-100)]">
            {error}
          </div>
        )}
        {!map ? (
          <Empty>
            No street yet. Pick a preset and generate one. Every building on it is baked in one shared frame, so the whole street holds
            together and matches your library.
          </Empty>
        ) : (
          <div className="relative" style={{ width: board.w, height: board.h }}>
            {showGrid && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                  backgroundSize: `${tile}px ${tile}px`,
                  backgroundPosition: `${board.dx}px ${board.dy}px`,
                }}
              />
            )}

            {/* the ground, one strip repeated along the street */}
            {baked &&
              ground &&
              strips.map((i) => {
                const dz = baked.roadCentre?.[Math.max(0, Math.min((baked.roadCentre?.length ?? 1) - 1, i))] ?? 0;
                const p = at(i, baked.groundStripCenterZ + dz);
                return (
                  <img
                    key={`g${i}`}
                    src={ground.url}
                    alt=""
                    aria-hidden
                    className="pixelated pointer-events-none absolute max-w-none select-none"
                    draggable={false}
                    style={{
                      left: p.x - baked.groundAnchor.x * zoom,
                      top: p.y - baked.groundAnchor.y * zoom,
                      width: ground.width * zoom,
                      height: ground.height * zoom,
                    }}
                  />
                );
              })}

            {/* collision diamonds, drawn under the sprites */}
            {showCollision &&
              pieces
                .filter((p) => p.kind === 'building' && p.footprint)
                .map((p) => {
                  const c = at(p.tileX, p.tileZ);
                  const pts = footprintDiamond(p.footprint![0], p.footprint![1], basis)
                    .map(([x, y]) => `${c.x + x},${c.y + y}`)
                    .join(' ');
                  return (
                    <svg key={`c${p.id}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                      <polygon points={pts} fill="rgba(96,165,250,0.14)" stroke="rgba(96,165,250,0.75)" strokeWidth={1} />
                    </svg>
                  );
                })}

            {/* props and buildings share one back-to-front order */}
            {pieces
              .slice()
              .sort((a, b) => depthOf(a) - depthOf(b))
              .map((p) => {
                const c = at(p.tileX, p.tileZ);
                return (
                  <img
                    key={p.id}
                    src={p.url}
                    alt={p.id}
                    title={`${p.id} at ${p.tileX.toFixed(2)}, ${p.tileZ.toFixed(2)}`}
                    className="pixelated pointer-events-none absolute max-w-none select-none"
                    draggable={false}
                    style={{
                      left: c.x - p.anchor.x * zoom,
                      top: c.y - p.anchor.y * zoom,
                      width: p.width * zoom,
                      height: p.height * zoom,
                    }}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
