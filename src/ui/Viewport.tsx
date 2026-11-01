// The viewport. It shows one baked sprite at a time, at 1:1 or zoomed with
// nearest-neighbour scaling so the pixels stay square, on a checkerboard that
// makes the transparent parts of the sprite obvious.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Grid3x3, Maximize2, Ruler } from 'lucide-react';
import type { BakedAsset } from '@/engine/service';
import { downloadFile, spritePNG } from '@/engine/service';
import type { LightPresetId, SeasonId } from '@/engine/types';
import { Btn, Empty, Spinner } from './kit';

export function Viewport({
  baked,
  busy,
  error,
  light,
  season,
  tilePixels,
  assetName,
}: {
  baked: BakedAsset | null;
  busy: boolean;
  error: string | null;
  light: LightPresetId;
  season: SeasonId;
  tilePixels: number;
  assetName: string;
}): JSX.Element {
  const [zoom, setZoom] = useState(3);
  const [showGrid, setShowGrid] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sprite = useMemo(() => {
    if (!baked) return null;
    return baked.sprites.find((s) => s.light === light && s.season === season) ?? baked.sprites[0] ?? null;
  }, [baked, light, season]);

  const url = useMemo(() => (sprite ? sprite.bake.toCanvas().toDataURL('image/png') : null), [sprite]);

  // revoke nothing: data URLs are not blob URLs, so there is nothing to free

  const gridStyle = useMemo(() => {
    if (!showGrid || !sprite) return undefined;
    const step = tilePixels * zoom;
    if (step < 6) return undefined;
    return {
      backgroundImage:
        'linear-gradient(rgba(200,150,63,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(200,150,63,0.22) 1px, transparent 1px)',
      backgroundSize: `${step}px ${step}px`,
      // line the grid up with the sprite's anchor, which is where its origin is
      backgroundPosition: `${sprite.bake.anchor.x * zoom}px ${sprite.bake.anchor.y * zoom}px`,
    } as const;
  }, [showGrid, sprite, tilePixels, zoom]);

  const [fitZoom, setFitZoom] = useState(3);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !sprite) return;
    const measure = (): void => {
      const w = el.clientWidth - 64;
      const h = el.clientHeight - 64;
      if (w <= 0 || h <= 0) return;
      const z = Math.min(w / sprite.bake.width, h / sprite.bake.height);
      setFitZoom(Math.max(1, Math.min(12, Math.floor(z * 2) / 2)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sprite]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-300)]">Preview</span>
        {sprite && (
          <span className="font-mono text-[11px] text-[var(--ink-400)]">
            {sprite.bake.width}x{sprite.bake.height}px
            {sprite.bake.pixelSize > 1 && ` · ${sprite.bake.artWidth}x${sprite.bake.artHeight} art`}
          </span>
        )}
        {busy && <Spinner label="baking" />}
        <div className="ml-auto flex items-center gap-1">
          <Btn variant="ghost" title="Fit to the window" onClick={() => setZoom(fitZoom)}>
            <Maximize2 size={13} />
          </Btn>
          <Btn variant="ghost" title={showGrid ? 'Hide the tile grid' : 'Show the tile grid'} onClick={() => setShowGrid((v) => !v)}>
            <Grid3x3 size={13} className={showGrid ? 'text-[var(--brass-400)]' : ''} />
          </Btn>
          <div className="mx-1 h-4 w-px bg-white/10" />
          {[1, 2, 3, 4, 6].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                zoom === z ? 'bg-[var(--ink-700)] text-[var(--ink-100)]' : 'text-[var(--ink-400)] hover:text-[var(--ink-100)]'
              }`}
            >
              {z}x
            </button>
          ))}
          <div className="mx-1 h-4 w-px bg-white/10" />
          <Btn
            title="Download this sprite as a PNG"
            disabled={!sprite}
            onClick={() => sprite && downloadFile(spritePNG(sprite), `${assetName.replace(/\s+/g, '_').toLowerCase()}_${light}_${season}.png`, 'image/png')}
          >
            <Download size={13} />
            PNG
          </Btn>
        </div>
      </div>

      <div ref={canvasRef} className="checker grid-lines relative min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="absolute inset-x-0 top-0 z-10 border-b border-[var(--rust-500)]/40 bg-[var(--rust-500)]/15 px-3 py-2 text-[12px] text-[var(--ink-100)]">
            This building could not be rendered: {error}
          </div>
        )}
        {!sprite && !busy && !error && <Empty>Select a building on the left, or add one, and its sprite appears here.</Empty>}
        {sprite && url && (
          <div className="flex min-h-full min-w-full items-center justify-center p-8">
            <div className="relative" style={{ width: sprite.bake.width * zoom, height: sprite.bake.height * zoom }}>
              <div className="absolute inset-0" style={gridStyle} />
              <img
                src={url}
                alt={`${assetName}, ${light}, ${season}`}
                className="pixelated absolute inset-0 h-full w-full select-none"
                draggable={false}
              />
              {/* the anchor: the pixel the building stands on */}
              <div
                className="pointer-events-none absolute"
                style={{ left: sprite.bake.anchor.x * zoom - 5, top: sprite.bake.anchor.y * zoom - 5 }}
                title="sprite anchor"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" className="text-[var(--brass-400)]">
                  <path d="M5.5 0v11M0 5.5h11" stroke="currentColor" strokeWidth="1" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {sprite && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] px-3 py-2 text-[11px] text-[var(--ink-400)]">
          <span className="inline-flex items-center gap-1.5">
            <Ruler size={12} />
            anchor {sprite.bake.anchor.x}, {sprite.bake.anchor.y} px
          </span>
          <span>{tilePixels}px per tile</span>
          <span>
            {baked?.generated.footprint.w} x {baked?.generated.footprint.d} tiles
          </span>
          <span>door faces {baked?.generated.footprint.facing}</span>
          <span>seed {baked?.generated.seedCode}</span>
          {sprite.bands.length > 0 && <span>{sprite.bands.length} occlusion bands</span>}
        </div>
      )}
    </div>
  );
}
