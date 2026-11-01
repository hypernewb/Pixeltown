// The inspector. Everything about the selected building lives here: its name,
// its seed, its size, the parts that make it up, and the light and season
// variants it is baked for.
//
// The part controls write overrides rather than regenerating, so changing one
// part never disturbs the rest of the building.

import { useState } from 'react';
import { Dices, Lock, Pin, Unlock } from 'lucide-react';
import { lockableSlots } from '@/engine/parts';
import { getPack } from '@/engine/packs/registry';
import { LIGHT_ORDER, LIGHT_PRESETS, SEASON_ORDER, SEASON_PRESETS } from '@/engine/bake/lighting';
import type { AssetEntry } from '@/engine/project';
import type { BakedAsset } from '@/engine/service';
import { SLOT_LABELS, type LightPresetId, type PartSlot, type SeasonId } from '@/engine/types';
import { Btn, Field, Panel, Segmented, Select, Slider, Stat, Toggle } from './kit';

export function Inspector({
  asset,
  baked,
  onRename,
  onRecipe,
  onOverride,
  onReroll,
  onLocked,
  onVariants,
}: {
  asset: AssetEntry;
  baked: BakedAsset | null;
  onRename: (name: string) => void;
  onRecipe: (patch: { width?: number; depth?: number; floors?: number; detail?: number; style?: string | null; roofStyle?: string | null }) => void;
  onOverride: (slot: PartSlot, value: string | null) => void;
  onReroll: () => void;
  onLocked: (slot: PartSlot, locked: boolean) => void;
  onVariants: (lights: LightPresetId[], seasons: SeasonId[]) => void;
}): JSX.Element {
  const pack = getPack(asset.recipe.packId);
  const template = pack.templates.find((t) => t.id === asset.recipe.template) ?? pack.templates[0];
  const plan = baked?.generated.plan ?? null;
  const generated = baked?.generated.recipe ?? asset.recipe;
  const [showAllParts, setShowAllParts] = useState(false);

  const pinnable = plan ? lockableSlots(plan) : [];
  const slotsToShow: PartSlot[] = showAllParts
    ? (Object.keys(pack.partOptions) as PartSlot[])
    : pinnable;

  return (
    <div className="space-y-2 p-2">
      <Panel title="Building">
        <div className="space-y-2">
          <Field label="Name">
            <input className="field w-full px-2 py-1 text-[12px]" value={asset.name} onChange={(e) => onRename(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <Select
                value={asset.recipe.template}
                options={pack.templates.map((t) => ({ value: t.id, label: t.name }))}
                onChange={(v) => onRecipe({})}
                disabled
              />
            </Field>
            <Field label="Material">
              <Select
                value={asset.recipe.style ?? 'auto'}
                options={[{ value: 'auto', label: 'Any material' }, ...pack.styles.map((s) => ({ value: s.id, label: s.name }))]}
                onChange={(v) => onRecipe({ style: v === 'auto' ? null : v })}
              />
            </Field>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[var(--ink-850)] p-2">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex-1 text-[11px] text-[var(--ink-300)]">
                Seed <span className="font-mono text-[var(--brass-300)]">{baked?.generated.seedCode ?? '—'}</span>
              </span>
              <Btn title="Roll a new seed. Anything pinned stays as it is." onClick={onReroll}>
                <Dices size={13} />
                Re-roll
              </Btn>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--ink-400)]">
              The seed is the whole building. Write it down and the same building comes back exactly.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Shape">
        <div className="space-y-3">
          <Field label="Width" right={<span className="font-mono text-[10px] text-[var(--ink-400)]">{template.footprint.minW}–{template.footprint.maxW}</span>}>
            <Slider value={generated.width} min={template.footprint.minW} max={template.footprint.maxW} onChange={(v) => onRecipe({ width: v })} />
          </Field>
          <Field label="Depth" right={<span className="font-mono text-[10px] text-[var(--ink-400)]">{template.footprint.minD}–{template.footprint.maxD}</span>}>
            <Slider value={generated.depth} min={template.footprint.minD} max={template.footprint.maxD} onChange={(v) => onRecipe({ depth: v })} />
          </Field>
          <Field label="Floors" right={<span className="font-mono text-[10px] text-[var(--ink-400)]">{template.floors.min}–{template.floors.max}</span>}>
            <Slider value={generated.floors} min={template.floors.min} max={template.floors.max} onChange={(v) => onRecipe({ floors: v })} />
          </Field>
          {pack.roofOptions.length > 0 && (
            <Field label="Roof material" hint="What the roof is clad in — kawara tile, standing-seam metal, thatch.">
              <Select
                value={asset.recipe.overrides.roof ?? 'auto'}
                options={[{ value: 'auto', label: 'As generated' }, ...pack.roofOptions.map((o) => ({ value: o.id, label: o.name }))!]}
                onChange={(v) => onOverride('roof', v === 'auto' ? null : v)}
              />
            </Field>
          )}
          <Field label="Roof shape">
            <Select
              value={asset.recipe.roofStyle ?? 'auto'}
              options={[
                { value: 'auto', label: 'As generated' },
                ...template.roofStyles.map((s) => ({ value: s, label: s === 'halfhip' ? 'Half-hip' : s === 'crossgable' ? 'Cross-gable' : s.charAt(0).toUpperCase() + s.slice(1) })),
              ]}
              onChange={(v) => onRecipe({ roofStyle: v === 'auto' ? null : v })}
            />
          </Field>
          <Field label="Detail" hint="How much incidental detail — signage, fittings, clutter — the building carries.">
            <Slider value={Math.round(asset.recipe.detail * 100)} min={0} max={100} step={5} onChange={(v) => onRecipe({ detail: v / 100 })} />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Parts"
        hint={plan ? 'Pin a part to keep it when you re-roll' : undefined}
        right={
          <button
            type="button"
            onClick={() => setShowAllParts((v) => !v)}
            className="text-[10px] text-[var(--ink-400)] underline decoration-dotted transition-colors hover:text-[var(--ink-200)]"
          >
            {showAllParts ? 'only what is on it' : 'show every part'}
          </button>
        }
      >
        {!plan ? (
          <p className="text-[11px] text-[var(--ink-400)]">Waiting for the first render.</p>
        ) : slotsToShow.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-400)]">This building has no optional parts.</p>
        ) : (
          <div className="space-y-2.5">
            {slotsToShow.map((slot) => {
              const options = pack.partOptions[slot] ?? [];
              const pinned = asset.recipe.locked.includes(slot);
              const current = asset.recipe.overrides[slot] ?? null;
              return (
                <div key={slot} className="rounded-lg border border-white/[0.06] bg-[var(--ink-850)] p-2">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="flex-1 text-[11px] font-medium text-[var(--ink-200)]">{SLOT_LABELS[slot] ?? slot}</span>
                    <button
                      type="button"
                      title={pinned ? 'Unpin this part' : 'Pin this part, so re-rolling leaves it alone'}
                      onClick={() => onLocked(slot, !pinned)}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                        pinned
                          ? 'bg-[var(--brass-500)]/20 text-[var(--brass-300)]'
                          : 'text-[var(--ink-400)] hover:bg-[var(--ink-700)] hover:text-[var(--ink-200)]'
                      }`}
                    >
                      {pinned ? <Lock size={10} /> : <Unlock size={10} />}
                      {pinned ? 'pinned' : 'pin'}
                    </button>
                  </div>
                  <Select
                    value={current ?? 'auto'}
                    options={[{ value: 'auto', label: 'As generated' }, ...options.map((o) => ({ value: o, label: o }))]}
                    onChange={(v) => onOverride(slot, v === 'auto' ? null : v)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Variants" hint="The one light and season this building is baked for">
        <div className="space-y-3">
          <Field label="Light">
            <Segmented
              value={asset.lights[0] ?? 'day'}
              onChange={(l) => onVariants([l], asset.seasons.slice(0, 1))}
              options={LIGHT_ORDER.map((l) => ({ value: l, label: LIGHT_PRESETS[l].name }))}
            />
          </Field>
          <Field label="Season">
            <Segmented
              value={asset.seasons[0] ?? 'summer'}
              onChange={(s) => onVariants(asset.lights.slice(0, 1), [s])}
              options={SEASON_ORDER.map((s) => ({ value: s, label: SEASON_PRESETS[s].name }))}
            />
          </Field>
        </div>
      </Panel>

      {baked && (
        <Panel title="What the exporter will write">
          <div className="space-y-0.5">
            <Stat label="Sprites" value={baked.sprites.length} />
            <Stat label="Footprint" value={`${baked.generated.footprint.w} x ${baked.generated.footprint.d} tiles`} />
            <Stat label="Door tile" value={`${baked.generated.footprint.doorTile.x}, ${baked.generated.footprint.doorTile.z}`} />
            <Stat label="Door faces" value={baked.generated.footprint.facing} mono={false} />
            <Stat label="Occlusion bands" value={baked.sprites[0]?.bands.length ?? 0} />
            <Stat label="Collision" value={`${baked.generated.result.collision.w.toFixed(1)} x ${baked.generated.result.collision.d.toFixed(1)}`} />
            <Stat label="Camera" value="2:1, 26.6 degrees" mono={false} />
            <Stat label="Scale" value={`${baked.sprites[0]?.bake.pxPerUnit ?? 32} px per unit`} />
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--ink-400)]">
            <Pin size={10} className="mt-0.5 shrink-0" />
            The full 3D recipe and the camera are saved with every export, so these sprites can be rebuilt later at another scale or angle.
          </p>
        </Panel>
      )}
    </div>
  );
}
