// The pack registry. Adding a look means writing one pack and registering it
// here; nothing else in the engine or the studio changes.

import type { StylePack } from './pack';
import { japanesePack } from './japanese';

const PACKS: Record<string, StylePack> = {
  [japanesePack.id]: japanesePack,
};

export function getPack(id: string): StylePack {
  return PACKS[id] ?? japanesePack;
}

export function listPacks(): StylePack[] {
  return Object.values(PACKS);
}

export function registerPack(pack: StylePack): void {
  PACKS[pack.id] = pack;
}
