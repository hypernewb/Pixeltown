// The asset list. One row per building, with its own baked thumbnail. The list
// doubles as the place you generate into: the templates are the buttons at the
// top, so there is no separate "generator" screen to go and find.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { getPack } from '@/engine/packs/registry';
import { bakeAsset } from '@/engine/service';
import type { AssetEntry } from '@/engine/project';
import type { BuildingTemplate } from '@/engine/packs/pack';
import { Btn } from './kit';

// A tiny bake for the row thumbnail. Deliberately at one pixel per art pixel:
// it is a preview of the shape, not the shipped sprite.
function useThumbnail(asset: AssetEntry, pxPerUnit: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const last = useRef('');

  useEffect(() => {
    const key = JSON.stringify([asset.recipe, pxPerUnit]);
    if (key === last.current) return;
    last.current = key;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        const baked = bakeAsset(asset, { pxPerUnit: 12, pixelSize: 1, shadow: false });
        if (cancelled) return;
        setUrl(baked.sprites[0]?.bake.toCanvas().toDataURL('image/png') ?? null);
      } catch {
        if (!cancelled) setUrl(null);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [asset, pxPerUnit]);

  return url;
}

function Thumb({ asset, pxPerUnit }: { asset: AssetEntry; pxPerUnit: number }): JSX.Element {
  const url = useThumbnail(asset, pxPerUnit);
  return (
    <div className="checker flex h-9 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-white/[0.06]">
      {url ? (
        <img src={url} alt="" className="pixelated max-h-full max-w-full" draggable={false} />
      ) : (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-[var(--ink-600)] border-t-[var(--brass-400)]" />
      )}
    </div>
  );
}

function Row({
  asset,
  active,
  pxPerUnit,
  onSelect,
  onDuplicate,
  onRemove,
}: {
  asset: AssetEntry;
  active: boolean;
  pxPerUnit: number;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
        active ? 'border-[var(--brass-600)]/60 bg-[var(--brass-500)]/[0.10]' : 'border-transparent hover:border-white/[0.08] hover:bg-[var(--ink-850)]'
      }`}
      onClick={onSelect}
    >
      <Thumb asset={asset} pxPerUnit={pxPerUnit} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[12px] ${active ? 'text-[var(--ink-100)]' : 'text-[var(--ink-200)]'}`}>{asset.name}</div>
        <div className="truncate font-mono text-[10px] text-[var(--ink-400)]">
          {asset.recipe.template} · {asset.lights.length} light{asset.lights.length > 1 ? 's' : ''} · {asset.seasons.length} season
          {asset.seasons.length > 1 ? 's' : ''}
          {asset.recipe.locked.length > 0 && ` · ${asset.recipe.locked.length} pinned`}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Btn
          variant="ghost"
          title="Duplicate with a new seed"
          onClick={() => {
            onDuplicate();
          }}
        >
          <Copy size={12} />
        </Btn>
        <Btn
          variant="ghost"
          title="Delete this building"
          onClick={() => {
            onRemove();
          }}
        >
          <Trash2 size={12} className="text-[var(--rust-500)]" />
        </Btn>
      </div>
    </div>
  );
}

export function AssetList({
  assets,
  selectedId,
  pxPerUnit,
  templates,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
}: {
  assets: AssetEntry[];
  selectedId: string | null;
  pxPerUnit: number;
  templates: BuildingTemplate[];
  onSelect: (id: string) => void;
  onAdd: (template: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}): JSX.Element {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => a.name.toLowerCase().includes(q) || a.recipe.template.includes(q));
  }, [assets, filter]);

  const pack = getPack('japanese');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/[0.06] px-3 py-2">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-300)]">Buildings</h2>
          <span className="font-mono text-[11px] text-[var(--ink-400)]">{assets.length}</span>
        </div>
        <input
          className="field mb-2 w-full px-2 py-1 text-[12px]"
          placeholder="Filter by name or type"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.description}
              onClick={() => onAdd(t.id)}
              className="rounded-md border border-white/[0.08] bg-[var(--ink-850)] px-2 py-1 text-[11px] text-[var(--ink-200)] transition-colors hover:border-[var(--brass-600)]/60 hover:bg-[var(--ink-800)] hover:text-[var(--ink-100)]"
            >
              + {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <p className="p-4 text-center text-[12px] leading-relaxed text-[var(--ink-400)]">
            {assets.length === 0 ? 'No buildings yet. Pick a type above to generate the first one.' : 'Nothing matches that filter.'}
          </p>
        ) : (
          <div className="space-y-0.5">
            {shown.map((a) => (
              <Row
                key={a.id}
                asset={a}
                active={a.id === selectedId}
                pxPerUnit={pxPerUnit}
                onSelect={() => onSelect(a.id)}
                onDuplicate={() => onDuplicate(a.id)}
                onRemove={() => onRemove(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] px-3 py-2 text-[10px] leading-relaxed text-[var(--ink-400)]">
        Style pack: <span className="text-[var(--ink-300)]">{pack.name}</span>
      </div>
    </div>
  );
}

