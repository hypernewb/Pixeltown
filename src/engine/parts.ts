// Part locking. Every part of a building is decided by the recipe's seed, so a
// building is always reproducible. Locking is what lets the artist re-roll a
// seed for fresh variation while pinning the parts they already approved: the
// pinned decisions are copied off the previous build and written back over the
// new plan.

import type { BuildPlan } from './packs/pack';
import type { PartSlot, RoofStyle } from './types';

// Which plan flag each optional part slot drives. Slots that are not a simple
// on/off decision (walls, door, windows) are steered by an override instead and
// need no flag here.
const FLAG: Partial<Record<PartSlot, keyof BuildPlan['parts']>> = {
  balcony: 'balcony',
  shopfront: 'shopfront',
  awning: 'awning',
  sign: 'sign',
  props: 'vending',
};

export interface PinnedParts {
  flags: Partial<Record<keyof BuildPlan['parts'], boolean>>;
  roofStyle: RoofStyle | null;
}

export function captureLocks(plan: BuildPlan, slots: readonly PartSlot[]): PinnedParts {
  const pinned: PinnedParts = { flags: {}, roofStyle: null };
  for (const slot of slots) {
    if (slot === 'roof') pinned.roofStyle = plan.roofStyle;
    const key = FLAG[slot];
    if (key) pinned.flags[key] = plan.parts[key];
  }
  return pinned;
}

export function applyLocks(plan: BuildPlan, pinned: PinnedParts | null): void {
  if (!pinned) return;
  for (const [key, value] of Object.entries(pinned.flags)) {
    if (value != null) plan.parts[key as keyof BuildPlan['parts']] = value;
  }
  if (pinned.roofStyle) plan.roofStyle = pinned.roofStyle;
}

// The slots the inspector can offer for a given building: the optional parts
// that actually exist on it, plus the roof.
export function lockableSlots(plan: BuildPlan): PartSlot[] {
  const out: PartSlot[] = ['roof'];
  for (const [slot, key] of Object.entries(FLAG)) {
    if (plan.parts[key as keyof BuildPlan['parts']]) out.push(slot as PartSlot);
  }
  return out;
}
