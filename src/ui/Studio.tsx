// PixelTown Studio. A three-pane tool: the library on the left, the preview in
// the middle, and whatever you are working on on the right.
//
// The right pane holds one job at a time — build, street, or export — rather
// than stacking editing modes on one screen, and the preview never goes away.

import { useEffect, useMemo, useState } from 'react';
import { Building2, FileDown, Moon, Route, Sun } from 'lucide-react';
import { LIGHT_PRESETS, SEASON_PRESETS } from '@/engine/bake/lighting';
import { prewarmBake } from '@/engine/bake/bake';
import { getPack } from '@/engine/packs/registry';
import type { LightPresetId, SeasonId } from '@/engine/types';
import { AssetList } from './AssetList';
import { ExportPanel } from './ExportPanel';
import { Inspector } from './Inspector';
import { StreetView } from './StreetView';
import { Viewport } from './Viewport';
import { Segmented } from './kit';
import { useStudio } from './useStudio';

type Tab = 'build' | 'street' | 'export';

export default function Studio(): JSX.Element {
  const s = useStudio();
  const [tab, setTab] = useState<Tab>('build');

  // bring the shared renderer up once, so the very first bake is not the slow one
  useEffect(() => {
    const id = requestAnimationFrame(() => prewarmBake());
    return () => cancelAnimationFrame(id);
  }, []);

  const pack = getPack('japanese');

  const sprite = useMemo(() => {
    const list = s.bake.baked?.sprites ?? [];
    return list.find((v) => v.light === s.light && v.season === s.season) ?? list[0] ?? null;
  }, [s.bake.baked, s.light, s.season]);

  // which light and season are on screen, in the header
  const variantLabel = `${LIGHT_PRESETS[s.light]?.name ?? s.light} · ${SEASON_PRESETS[s.season]?.name ?? s.season}`;

  return (
    <div className="flex h-full flex-col bg-[var(--ink-950)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[var(--ink-900)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--brass-500)] text-[13px] font-bold text-[#1a1305]">
            P
          </span>
          <div className="leading-tight">
            <input
              className="w-44 rounded bg-transparent px-1 py-0.5 text-[13px] font-semibold text-[var(--ink-100)] transition-colors hover:bg-[var(--ink-850)] focus:bg-[var(--ink-850)]"
              value={s.project.name}
              onChange={(e) => s.renameProject(e.target.value)}
              aria-label="Project name"
            />
            <div className="px-1 text-[10px] text-[var(--ink-400)]">3D to 2D pixel-art asset studio</div>
          </div>
        </div>

        <span className="mx-1 h-6 w-px bg-white/[0.07]" />

        <nav className="flex gap-1" aria-label="Sections">
          {(
            [
              { id: 'build', label: 'Build', icon: Building2 },
              { id: 'street', label: 'Street', icon: Route },
              { id: 'export', label: 'Export', icon: FileDown },
            ] as { id: Tab; label: string; icon: typeof Building2 }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                tab === t.id ? 'bg-[var(--ink-700)] text-[var(--ink-100)]' : 'text-[var(--ink-300)] hover:bg-[var(--ink-850)] hover:text-[var(--ink-100)]'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[11px] text-[var(--ink-400)] lg:inline">{variantLabel}</span>
          {/* the light and season on screen, which is also what a new asset is
              baked for — one control, one meaning */}
          <div className="flex items-center gap-1">
            {(['day', 'night'] as LightPresetId[]).map((l) => (
              <button
                key={l}
                type="button"
                title={LIGHT_PRESETS[l].name}
                onClick={() => s.setLight(l)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  s.light === l ? 'bg-[var(--ink-700)] text-[var(--ink-100)]' : 'text-[var(--ink-400)] hover:text-[var(--ink-100)]'
                }`}
              >
                {l === 'day' ? <Sun size={12} /> : <Moon size={12} />}
                {LIGHT_PRESETS[l].name}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5">
            {(['spring', 'summer', 'autumn', 'winter'] as SeasonId[]).map((sea) => (
              <button
                key={sea}
                type="button"
                title={SEASON_PRESETS[sea].name}
                onClick={() => s.setSeason(sea)}
                className={`rounded px-1.5 py-1 text-[11px] transition-colors ${
                  s.season === sea ? 'bg-[var(--ink-700)] text-[var(--ink-100)]' : 'text-[var(--ink-400)] hover:text-[var(--ink-100)]'
                }`}
              >
                {SEASON_PRESETS[sea].name.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] shrink-0 border-r border-white/[0.07] bg-[var(--ink-900)] md:block">
          <AssetList
            assets={s.project.assets}
            selectedId={s.selectedId}
            pxPerUnit={s.project.pxPerUnit}
            templates={pack.templates}
            onSelect={s.select}
            onAdd={s.addAsset}
            onDuplicate={s.duplicateAsset}
            onRemove={s.removeAsset}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {tab === 'street' ? (
            <StreetView
              map={s.project.map}
              projectName={s.project.name}
              onGenerate={s.generateMap}
              light={s.light}
              season={s.season}
              pxPerUnit={s.project.pxPerUnit}
              pixelSize={s.project.pixelSize}
            />
          ) : (
            <Viewport
              baked={s.bake.baked}
              busy={s.bake.busy}
              error={s.bake.error}
              light={s.light}
              season={s.season}
              tilePixels={s.project.pxPerUnit * s.project.pixelSize}
              assetName={s.selected?.name ?? 'sprite'}
            />
          )}
        </main>

        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-white/[0.07] bg-[var(--ink-900)] lg:w-[330px]">
          {tab === 'build' ? (
            s.selected ? (
              <Inspector
                asset={s.selected}
                baked={s.bake.baked}
                onRename={(name) => s.renameAsset(s.selected!.id, name)}
                onRecipe={(patch) => s.patchRecipe(s.selected!.id, patch as never)}
                onOverride={(slot, value) => s.setOverride(s.selected!.id, slot, value)}
                onReroll={() => s.reroll(s.selected!.id)}
                onLocked={(slot, locked) => s.setLocked(s.selected!.id, slot, locked)}
                onVariants={(lights, seasons) => s.setVariants(s.selected!.id, lights, seasons)}
              />
            ) : (
              <div className="p-6 text-center text-[12px] leading-relaxed text-[var(--ink-400)]">
                Nothing selected. Choose a building on the left, or add a new one from the buttons above the list.
              </div>
            )
          ) : tab === 'street' ? (
            <div className="space-y-2 p-2">
              <div className="panel p-3">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-300)]">Street</h2>
                <p className="text-[11px] leading-relaxed text-[var(--ink-400)]">
                  A street is generated from a preset and a seed. The buildings on it are laid out along a road, each one baked as
                  its own sprite at the project's scale, so a street and a single exported building always match.
                </p>
              </div>
              <div className="panel p-3">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-300)]">Presets</h2>
                <dl className="space-y-1.5 text-[11px] leading-relaxed">
                  {[
                    ['Residential', 'Mostly houses and machiya, few shops, no lanterns.'],
                    ['Shopping', 'Narrow shops and restaurants, awnings and signs, lanterns where they fit.'],
                    ['Main road', 'Wider frontages, offices and apartment blocks, vending machines.'],
                    ['Mixed', 'A bit of everything, the way a real neighborhood thins out.'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[var(--ink-200)]">{k}</dt>
                      <dd className="text-[var(--ink-400)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ) : (
            <ExportPanel
              project={s.project}
              assets={s.project.assets}
              selected={s.selected}
              baked={s.bake.baked}
              onReplace={s.replaceProject}
              onOutput={s.setOutput}
            />
          )}
        </aside>
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-white/[0.07] bg-[var(--ink-900)] px-3 py-1.5 text-[10px] text-[var(--ink-400)]">
        <span>{pack.name} style pack</span>
        <span className="h-3 w-px bg-white/10" />
        <span>Fixed three-quarter camera, 2:1</span>
        <span className="h-3 w-px bg-white/10" />
        <span>Work is saved in this browser</span>
        <span className="ml-auto hidden sm:inline">
          {sprite ? `${sprite.bake.width} x ${sprite.bake.height}px · anchor ${sprite.bake.anchor.x}, ${sprite.bake.anchor.y}` : 'no sprite'}
        </span>
      </footer>
    </div>
  );
}
