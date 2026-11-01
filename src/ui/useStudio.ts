// The studio's state. Everything the artist does is a change to the project or
// to the current selection, and every change is written straight to the
// browser's own storage, so closing the tab does not lose work.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newRecipe } from '@/engine/generator';
import { captureLocks } from '@/engine/parts';
import { emptyProject, PROJECT_VERSION, type AssetEntry, type StudioProject } from '@/engine/project';
import { bakeAsset, type BakedAsset } from '@/engine/service';
import { generateStreet, streetDefaults, PRESET_LABELS } from '@/engine/street';
import type { BuildPlan } from '@/engine/packs/pack';
import type { BuildingRecipe, LightPresetId, NeighborhoodPreset, PartSlot, SeasonId, StreetSpec } from '@/engine/types';

const STORAGE_KEY = 'pixeltown.project.v1';

// ---------------------------------------------------------------- storage

function loadProject(): StudioProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedProject();
    const parsed = JSON.parse(raw) as StudioProject;
    if (!parsed || parsed.version !== PROJECT_VERSION || !Array.isArray(parsed.assets)) return seedProject();
    // maps saved before the road meandered have no centre line; a straight
    // road is exactly where their buildings were placed
    if (parsed.map && !Array.isArray(parsed.map.roadCentre)) {
      const tiles = Math.ceil(parsed.map.buildings.reduce((m, b) => Math.max(m, b.tileX), 0)) + 4;
      parsed.map = { ...parsed.map, roadCentre: new Array(Math.max(1, tiles)).fill(0) };
    }
    return parsed;
  } catch {
    return seedProject();
  }
}

// A first project that already has something in it, so the studio never opens
// on an empty screen with nothing to look at.
function seedProject(): StudioProject {
  const project = emptyProject('Kawara Street');
  const picks: [string, string][] = [
    ['modern', 'Narrow house'],
    ['machiya', 'Machiya townhouse'],
    ['showa', 'Showa shop'],
    ['commercial', 'Corner shop block'],
    ['apartment', 'Apartment block'],
    ['machiya', 'Second townhouse'],
  ];
  picks.forEach(([template, name], i) => {
    const recipe = newRecipe(template, 0x4f1a2b + i * 0x9e37, 'japanese');
    project.assets.push({
      id: recipe.id,
      name,
      recipe,
      lights: ['day', 'night'],
      seasons: ['summer'],
      notes: '',
    });
  });
  return project;
}

function saveProject(project: StudioProject): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // a full or unavailable store must not break the studio
  }
}

// ------------------------------------------------------------------ state

export interface BakeState {
  baked: BakedAsset | null;
  busy: boolean;
  error: string | null;
}

export interface StudioState {
  project: StudioProject;
  selectedId: string | null;
  selected: AssetEntry | null;
  bake: BakeState;
  light: LightPresetId;
  season: SeasonId;

  select(id: string | null): void;
  setLight(l: LightPresetId): void;
  setSeason(s: SeasonId): void;

  addAsset(template: string): void;
  duplicateAsset(id: string): void;
  removeAsset(id: string): void;
  renameAsset(id: string, name: string): void;

  patchRecipe(id: string, patch: Partial<BuildingRecipe>): void;
  setOverride(id: string, slot: PartSlot, value: string | null): void;
  reroll(id: string): void;
  setLocked(id: string, slot: PartSlot, locked: boolean): void;

  setVariants(id: string, lights: LightPresetId[], seasons: SeasonId[]): void;
  setOutput(pxPerUnit: number, pixelSize: number): void;

  generateMap(preset: NeighborhoodPreset, seed: number): void;

  renameProject(name: string): void;
  replaceProject(project: StudioProject): void;
  newProject(): void;
}

export function useStudio(): StudioState {
  const [project, setProject] = useState<StudioProject>(() => loadProject());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [light, setLight] = useState<LightPresetId>('day');
  const [season, setSeason] = useState<SeasonId>('summer');
  const [bake, setBake] = useState<BakeState>({ baked: null, busy: false, error: null });

  // The plan behind whatever is currently on screen. Re-rolling a seed reads
  // this to work out what the pinned parts were pinned at, which is what lets
  // the artist hunt for a better seed without losing approved parts. Held in a
  // ref rather than state so writing it cannot trigger another bake.
  const planRef = useRef<{ id: string; plan: BuildPlan } | null>(null);

  const primed = useRef(false);
  useEffect(() => {
    if (primed.current) return;
    primed.current = true;
    if (project.assets.length) setSelectedId(project.assets[0].id);
  }, [project.assets]);

  useEffect(() => {
    saveProject(project);
  }, [project]);

  const selected = useMemo(() => project.assets.find((a) => a.id === selectedId) ?? null, [project.assets, selectedId]);

  const update = useCallback((fn: (p: StudioProject) => StudioProject) => {
    setProject((prev) => fn(prev));
  }, []);

  const patchAsset = useCallback(
    (id: string, fn: (a: AssetEntry) => AssetEntry) => {
      update((p) => ({ ...p, assets: p.assets.map((a) => (a.id === id ? fn(a) : a)) }));
    },
    [update],
  );

  // ---------------------------------------------------------------- baking

  const bakeToken = useRef(0);
  useEffect(() => {
    if (!selected) {
      planRef.current = null;
      setBake({ baked: null, busy: false, error: null });
      return;
    }
    const token = ++bakeToken.current;
    setBake((b) => ({ ...b, busy: true, error: null }));
    let cancelled = false;
    // yield a frame so the busy state paints before the renderer blocks
    const raf = requestAnimationFrame(() => {
      if (cancelled || token !== bakeToken.current) return;
      try {
        const baked = bakeAsset(selected, { pxPerUnit: project.pxPerUnit, pixelSize: project.pixelSize });
        if (token !== bakeToken.current) return;
        planRef.current = { id: selected.id, plan: baked.generated.plan };
        setBake({ baked, busy: false, error: null });
      } catch (err) {
        if (token !== bakeToken.current) return;
        setBake({ baked: null, busy: false, error: err instanceof Error ? err.message : 'the bake failed' });
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [selected, project.pxPerUnit, project.pixelSize]);

  // The variant on screen may not be one this asset is baked for; fall back to
  // whatever it does have rather than showing nothing.
  const available = bake.baked?.sprites ?? [];
  useEffect(() => {
    if (!available.length) return;
    if (available.some((s) => s.light === light && s.season === season)) return;
    setLight(available[0].light);
    setSeason(available[0].season);
  }, [available, light, season]);

  // --------------------------------------------------------------- actions

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  const addAsset = useCallback(
    (template: string) => {
      const recipe = newRecipe(template, (Math.random() * 0x7fffffff) | 0, 'japanese');
      const entry: AssetEntry = {
        id: recipe.id,
        name: template.charAt(0).toUpperCase() + template.slice(1),
        recipe,
        lights: ['day', 'night'],
        seasons: ['summer'],
        notes: '',
      };
      update((p) => ({ ...p, assets: [...p.assets, entry] }));
      setSelectedId(entry.id);
    },
    [update],
  );

  const duplicateAsset = useCallback(
    (id: string) => {
      let newId: string | null = null;
      update((p) => {
        const src = p.assets.find((a) => a.id === id);
        if (!src) return p;
        const fresh = newRecipe(src.recipe.template, (Math.random() * 0x7fffffff) | 0, src.recipe.packId);
        newId = fresh.id;
        const copy: AssetEntry = {
          ...src,
          id: fresh.id,
          name: `${src.name} copy`,
          // a copy starts unlocked: it is a fresh variation to take a different way
          recipe: { ...src.recipe, id: fresh.id, seed: fresh.seed, locked: [], lockedPlan: null },
        };
        return { ...p, assets: [...p.assets, copy] };
      });
      if (newId) setSelectedId(newId);
    },
    [update],
  );

  const removeAsset = useCallback(
    (id: string) => {
      update((p) => ({ ...p, assets: p.assets.filter((a) => a.id !== id) }));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [update],
  );

  const renameAsset = useCallback((id: string, name: string) => patchAsset(id, (a) => ({ ...a, name })), [patchAsset]);

  const patchRecipe = useCallback(
    (id: string, patch: Partial<BuildingRecipe>) => patchAsset(id, (a) => ({ ...a, recipe: { ...a.recipe, ...patch } })),
    [patchAsset],
  );

  const setOverride = useCallback(
    (id: string, slot: PartSlot, value: string | null) =>
      patchAsset(id, (a) => {
        const overrides = { ...a.recipe.overrides };
        if (value === null) delete overrides[slot];
        else overrides[slot] = value;
        // a roof the artist picked by hand is also the roof a lock should hold
        const recipe = { ...a.recipe, overrides };
        if (slot === 'roof' && value && a.recipe.locked.includes('roof') && a.recipe.lockedPlan) {
          recipe.lockedPlan = { ...a.recipe.lockedPlan, roofStyle: a.recipe.roofStyle };
        }
        return { ...a, recipe };
      }),
    [patchAsset],
  );

  // Re-rolling keeps whatever the artist pinned, so they can hunt for a better
  // seed without losing the parts they already approved.
  const reroll = useCallback(
    (id: string) =>
      patchAsset(id, (a) => {
        const seen = planRef.current && planRef.current.id === id ? planRef.current.plan : null;
        // pin against what is on screen right now, not against a stale record
        const lockedPlan = seen && a.recipe.locked.length ? captureLocks(seen, a.recipe.locked) : null;
        return { ...a, recipe: { ...a.recipe, seed: (Math.random() * 0x7fffffff) | 0, lockedPlan } };
      }),
    [patchAsset],
  );

  const setLocked = useCallback(
    (id: string, slot: PartSlot, locked: boolean) =>
      patchAsset(id, (a) => {
        const has = a.recipe.locked.includes(slot);
        const next =
          locked && !has ? [...a.recipe.locked, slot] : !locked && has ? a.recipe.locked.filter((s) => s !== slot) : a.recipe.locked;
        const seen = planRef.current && planRef.current.id === id ? planRef.current.plan : null;
        return {
          ...a,
          recipe: { ...a.recipe, locked: next, lockedPlan: seen && next.length ? captureLocks(seen, next) : null },
        };
      }),
    [patchAsset],
  );

  const setVariants = useCallback(
    (id: string, lights: LightPresetId[], seasons: SeasonId[]) =>
      patchAsset(id, (a) => ({ ...a, lights: lights.length ? lights : ['day'], seasons: seasons.length ? seasons : ['summer'] })),
    [patchAsset],
  );

  const setOutput = useCallback((pxPerUnit: number, pixelSize: number) => update((p) => ({ ...p, pxPerUnit, pixelSize })), [update]);

  const generateMap = useCallback(
    (preset: NeighborhoodPreset, seed: number) => {
      const d = streetDefaults(preset);
      const spec: StreetSpec = { id: 'street', name: PRESET_LABELS[preset], preset, seed, lots: d.lots, depth: d.depth };
      const map = generateStreet(spec);
      update((p) => ({ ...p, map }));
    },
    [update],
  );

  const renameProject = useCallback((name: string) => update((p) => ({ ...p, name })), [update]);
  const replaceProject = useCallback((next: StudioProject) => {
    setProject(next);
    setSelectedId(next.assets[0]?.id ?? null);
  }, []);
  const newProject = useCallback(() => {
    setProject(emptyProject('Untitled project'));
    setSelectedId(null);
  }, []);

  return {
    project,
    selectedId,
    selected,
    bake,
    light,
    season,
    select,
    setLight,
    setSeason,
    addAsset,
    duplicateAsset,
    removeAsset,
    renameAsset,
    patchRecipe,
    setOverride,
    reroll,
    setLocked,
    setVariants,
    setOutput,
    generateMap,
    renameProject,
    replaceProject,
    newProject,
  };
}
