// The context every part-builder receives. Keeping it small and explicit is
// what lets the same part builders serve any style pack.

import type { GeoBuilder } from '../geo';
import type { RNG } from '../rng';
import type { Form, Palette, PartSlot } from '../types';

export interface SmokeSpot {
  x: number;
  y: number;
  z: number;
  kind: string;
}

export interface BuildContext {
  gb: GeoBuilder;
  rng: RNG;
  pal: Palette;
  form: Form;
  // 0..1: how much incidental detail (props, signage, clutter) to add
  detail: number;
  // which slots the artist pinned; pinned slots keep their override
  overrides: Partial<Record<PartSlot, string>>;

  frame: string;
  winH: number;
  arched: boolean;
  shutters: string | null;
  flowerBoxes: boolean;

  // ground height: flat in the studio, so the builder can be reused anywhere
  gy: (x: number, z: number) => number;
  smoke: SmokeSpot[];
  addSmoke: (x: number, y: number, z: number, kind?: string) => void;

  // the door the building opens through, once it has been drawn
  doorAt: { x: number; y: number; z: number; dx: number; dz: number } | null;
}

export function makeContext(init: Omit<BuildContext, 'gy' | 'smoke' | 'addSmoke' | 'doorAt'> & Partial<BuildContext>): BuildContext {
  const ctx: BuildContext = {
    ...init,
    gy: init.gy ?? (() => 0),
    smoke: init.smoke ?? [],
    addSmoke: init.addSmoke ?? (() => undefined),
    doorAt: init.doorAt ?? null,
  };
  if (!ctx.addSmoke || ctx.addSmoke === (() => undefined)) {
    ctx.addSmoke = (x, y, z, kind = 'home') => ctx.smoke.push({ x, y, z, kind });
  }
  return ctx;
}
