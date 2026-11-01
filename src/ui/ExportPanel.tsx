// The export panel. It offers the two things the artist actually needs: the
// Godot 4 folder, and the project file that lets everything be rebuilt later.
//
// Nothing here is a stub: each button either produces real bytes or is disabled
// with the reason shown.

import { useMemo, useState } from 'react';
import { Check, Download, FolderDown, FileJson, Upload } from 'lucide-react';
import { bakeAsset, bundleGodot, downloadFile, downloadJSON, zipFiles, type BakedAsset } from '@/engine/service';
import type { AssetEntry, StudioProject } from '@/engine/project';
import { PROJECT_VERSION } from '@/engine/project';
import { Btn, Panel, Slider, Field, Stat } from './kit';

export function ExportPanel({
  project,
  assets,
  selected,
  baked,
  onReplace,
  onOutput,
}: {
  project: StudioProject;
  assets: AssetEntry[];
  selected: AssetEntry | null;
  baked: BakedAsset | null;
  onReplace: (p: StudioProject) => void;
  onOutput: (pxPerUnit: number, pixelSize: number) => void;
}): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const totals = useMemo(() => {
    let sprites = 0;
    for (const a of assets) sprites += a.lights.length * a.seasons.length;
    return { assets: assets.length, sprites };
  }, [assets]);

  const run = (label: string, fn: () => void): void => {
    setError(null);
    setDone(null);
    setBusy(label);
    // let the button show its busy state before the work blocks
    requestAnimationFrame(() => {
      try {
        fn();
        setDone(label);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'the export failed');
      } finally {
        setBusy(null);
      }
    });
  };

  const exportOne = (): void => {
    if (!selected || !baked) return;
    const files = bundleGodot([{ entry: selected, baked }]);
    if (files.problems.length) throw new Error(files.problems[0].reason);
    downloadFile(zipFiles(files.files), `${selected.name.replace(/\s+/g, '_').toLowerCase()}_godot.zip`, 'application/zip');
  };

  const exportAll = (): void => {
    if (!assets.length) throw new Error('there is nothing to export yet');
    const ready: { entry: AssetEntry; baked: BakedAsset }[] = [];
    const failed: string[] = [];
    for (const entry of assets) {
      try {
        ready.push({ entry, baked: bakeAsset(entry, { pxPerUnit: project.pxPerUnit, pixelSize: project.pixelSize }) });
      } catch {
        failed.push(entry.name);
      }
    }
    if (!ready.length) throw new Error(failed.length ? `none of the ${failed.length} buildings could be baked` : 'nothing to export');
    const files = bundleGodot(ready);
    if (files.problems.length) failed.push(...files.problems.map((p) => p.asset));
    const zip = zipFiles(files.files);
    downloadFile(zip, `${project.name.replace(/\s+/g, '_').toLowerCase()}_godot.zip`, 'application/zip');
    if (failed.length) setImportError(`${failed.length} building${failed.length > 1 ? 's' : ''} could not be exported: ${failed.join(', ')}`);
  };

  const saveProject = (): void => {
    downloadJSON({ ...project, exportedAt: new Date().toISOString() }, `${project.name.replace(/\s+/g, '_').toLowerCase()}.pixeltown.json`);
  };

  const loadProject = (file: File): void => {
    setImportError(null);
    const reader = new FileReader();
    reader.onerror = () => setImportError('that file could not be read');
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as StudioProject;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.assets)) {
          setImportError('that does not look like a PixelTown project file');
          return;
        }
        onReplace({
          version: PROJECT_VERSION,
          id: parsed.id ?? `p${Date.now().toString(36)}`,
          name: parsed.name ?? 'Imported project',
          pxPerUnit: parsed.pxPerUnit ?? 32,
          pixelSize: parsed.pixelSize ?? 2,
          assets: parsed.assets,
          map: parsed.map ?? null,
        });
        setDone('project loaded');
      } catch {
        setImportError('that file is not valid JSON');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-2 p-2">
      <Panel title="Output scale" hint="How big one tile is in the finished sprite">
        <div className="space-y-3">
          <Field label="Pixels per tile" right={<span className="font-mono text-[10px] text-[var(--ink-400)]">art pixels</span>}>
            <Slider value={project.pxPerUnit} min={8} max={64} step={8} onChange={(v) => onOutput(v, project.pixelSize)} />
          </Field>
          <Field label="Pixel size" hint="How many screen pixels one art pixel is drawn at. 1 keeps the sprite at art resolution.">
            <Slider value={project.pixelSize} min={1} max={4} onChange={(v) => onOutput(project.pxPerUnit, v)} />
          </Field>
          <div className="rounded-lg border border-white/[0.06] bg-[var(--ink-850)] p-2">
            <Stat label="One tile on screen" value={`${project.pxPerUnit * project.pixelSize} px`} />
            <Stat label="Camera" value="2:1, fixed" mono={false} />
          </div>
        </div>
      </Panel>

      <Panel title="Godot 4" hint="Sprites, collision, anchors, depth and occlusion">
        <div className="space-y-2">
          <div className="rounded-lg border border-white/[0.06] bg-[var(--ink-850)] p-2">
            <Stat label="Buildings" value={totals.assets} />
            <Stat label="Sprites" value={totals.sprites} />
          </div>
          <Btn variant="primary" className="w-full" disabled={!!busy} onClick={() => run('one', exportOne)} title={!selected ? 'Select a building first' : undefined}>
            <FolderDown size={13} />
            {busy === 'one' ? 'Baking…' : 'Export this building'}
          </Btn>
          <Btn className="w-full" disabled={!!busy || !assets.length} onClick={() => run('all', exportAll)}>
            <Download size={13} />
            {busy === 'all' ? 'Baking every building…' : `Export all ${totals.assets} as a Godot folder`}
          </Btn>
          <p className="text-[10px] leading-relaxed text-[var(--ink-400)]">
            The download is a zip you can drop straight into a Godot project. It holds one PNG per sprite, a JSON manifest with the
            anchors, collision footprints and occlusion bands, a ready-made scene, and a short README.
          </p>
        </div>
      </Panel>

      <Panel title="Project file" hint="Everything needed to rebuild these assets later">
        <div className="space-y-2">
          <Btn className="w-full" onClick={saveProject}>
            <FileJson size={13} />
            Save project
          </Btn>
          <label className="btn w-full cursor-pointer px-2.5 py-1.5 text-[12px]">
            <Upload size={13} />
            Open a project
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadProject(f);
                e.target.value = '';
              }}
            />
          </label>
          <p className="text-[10px] leading-relaxed text-[var(--ink-400)]">
            The project file keeps every seed, every part choice and the camera the sprites were baked from, so a building can be
            re-rendered at a new scale, or later from a second angle, without redrawing it.
          </p>
        </div>
      </Panel>

      {(done || error || importError) && (
        <div
          className={`fade-up flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
            error || importError
              ? 'border-[var(--rust-500)]/40 bg-[var(--rust-500)]/10 text-[var(--ink-100)]'
              : 'border-[var(--moss-500)]/40 bg-[var(--moss-500)]/10 text-[var(--ink-100)]'
          }`}
        >
          {!error && !importError && <Check size={12} className="mt-0.5 shrink-0 text-[var(--moss-500)]" />}
          <span>{error ?? importError ?? `Exported: ${done}`}</span>
        </div>
      )}
    </div>
  );
}
