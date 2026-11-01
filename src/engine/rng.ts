// Seeded randomness. Every generator in the studio draws from here, so any
// building, street or town can be rebuilt exactly from its seed.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  private _f: () => number;

  constructor(seed: number) {
    this._f = mulberry32(seed >>> 0);
  }

  next(): number {
    return this._f();
  }

  float(a = 0, b = 1): number {
    return a + (b - a) * this._f();
  }

  int(a: number, b: number): number {
    return a + Math.floor(this._f() * (b - a + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this._f() * arr.length)];
  }

  chance(p: number): boolean {
    return this._f() < p;
  }

  weighted<K extends string | null>(table: readonly (readonly [K, number])[]): K {
    let t = this._f() * table.reduce((a, b) => a + b[1], 0);
    for (const [k, w] of table) if ((t -= w) <= 0) return k;
    return table[0][0];
  }
}

export function hash2(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function strHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Derive one integer seed from another. This is the integer companion to hash2:
// hash2 returns a fraction for things like scattering, while this returns a
// seed you can hand to an RNG. Mixing seeds with XOR by accident is easy to do
// and silently produces the same value every time, which is why it lives here
// with a name that says what it is for.
export function mixSeed(base: number, a: number, b = 0): number {
  let h = Math.imul(base >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (a + 0x165667b1), 0x85ebca6b);
  h = Math.imul(h ^ (b + 0x27d4eb2f), 0xc2b2ae35);
  h ^= h >>> 15;
  return h >>> 0;
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// A seed the artist can read, write down and share.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function seedToCode(seed: number): string {
  let n = seed >>> 0;
  let out = '';
  for (let i = 0; i < 7; i++) {
    out += ALPHABET[n % ALPHABET.length];
    n = Math.floor(n / ALPHABET.length);
  }
  return out;
}

export function codeToSeed(code: string): number | null {
  let n = 0;
  for (let i = code.length - 1; i >= 0; i--) {
    const d = ALPHABET.indexOf(code[i].toLowerCase());
    if (d < 0) return null;
    n = n * ALPHABET.length + d;
  }
  return n >>> 0;
}

export function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}
