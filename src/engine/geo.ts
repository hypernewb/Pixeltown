// GeoBuilder: accumulate low-poly primitives, each with a flat per-vertex
// colour and an "emit" attribute (used for night glow), and merge them into a
// single BufferGeometry.
//
// Ported from Kinstead's render/geo.js (MIT) and kept free of any building
// logic, so every style pack builds on the same primitives.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEAF_MARK } from './tags';

function prep(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

const PRIM = {
  box: prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  boxC: prep(new THREE.BoxGeometry(1, 1, 1)),
  ico0: prep(new THREE.IcosahedronGeometry(1, 0)),
  ico1: prep(new THREE.IcosahedronGeometry(1, 1)),
  dodec: prep(new THREE.DodecahedronGeometry(1, 0)),
};

// Cached shapes are keyed by their sizes to three decimals, and built from
// those rounded sizes too: built from the exact sizes of whichever model asked
// first, every later model sharing the key would get that one's shape.
const q3 = (v: number): number => Math.round(v * 1000) / 1000;

const cylCache = new Map<string, THREE.BufferGeometry>();
function cylGeo(rt: number, rb: number, seg: number): THREE.BufferGeometry {
  rt = q3(rt);
  rb = q3(rb);
  const key = `${rt.toFixed(3)}|${rb.toFixed(3)}|${seg}`;
  let g = cylCache.get(key);
  if (!g) {
    g = prep(new THREE.CylinderGeometry(rt, rb, 1, seg, 1).translate(0, 0.5, 0));
    cylCache.set(key, g);
  }
  return g;
}

// The upper half of a unit disc, one unit deep: stood upright (see arch())
// it rounds off the top of a window or doorway.
function archGeo(seg: number): THREE.BufferGeometry {
  const key = `arch|${seg}`;
  let g = cylCache.get(key);
  if (!g) {
    g = prep(new THREE.CylinderGeometry(1, 1, 1, seg, 1, false, Math.PI / 2, Math.PI).translate(0, 0.5, 0));
    cylCache.set(key, g);
  }
  return g;
}

// Roof prism: base w x d at y=0, ridge of length `ridge` along x at height h.
// ridge = w gives a gable, ridge = 0 a pyramid, in between a hip.
function roofGeo(w: number, d: number, h: number, ridge: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2, hr = ridge / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
  const R1 = [-hr, h, 0], R2 = [hr, h, 0];
  const tris = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// Single sloped slab (a lean-to): high edge at z = -d/2, low edge at z = +d/2.
function wedgeGeo(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
  const E = [-hw, h, -hd], F = [hw, h, -hd];
  const tris = [D, C, F, D, F, E, B, A, E, B, E, F, A, D, E, C, B, F];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// Truncated pyramid: base w x d at y=0, top tw x td at y=h.
function frustumGeo(w: number, d: number, h: number, tw: number, td: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2, tx = tw / 2, tz = td / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
  const a = [-tx, h, -tz], b = [tx, h, -tz], c = [tx, h, tz], d2 = [-tx, h, tz];
  const tris = [D, C, c, D, c, d2, C, B, b, C, b, c, B, A, a, B, a, b, A, D, d2, A, d2, a, d2, c, b, d2, b, a];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// A profile in the (z, y) plane drawn out along x for `len`, centred: the
// solid of a gambrel or any other roof with a bent slope, ends closed.
function prismGeo(len: number, profile: number[][]): THREE.BufferGeometry {
  const hl = len / 2, pos: number[] = [];
  const tri = (p: number[], q: number[], r: number[], out: number[]): void => {
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) pos.push(...p, ...r, ...q);
    else pos.push(...p, ...q, ...r);
  };
  const cz = profile.reduce((s, p) => s + p[0], 0) / profile.length;
  const cy = profile.reduce((s, p) => s + p[1], 0) / profile.length;
  for (let i = 0; i < profile.length; i++) {
    const [z0, y0] = profile[i], [z1, y1] = profile[(i + 1) % profile.length];
    if (y0 === 0 && y1 === 0) continue;
    const out = [0, (y0 + y1) / 2 - cy, (z0 + z1) / 2 - cz];
    const A = [-hl, y0, z0], B = [hl, y0, z0], C = [hl, y1, z1], D = [-hl, y1, z1];
    tri(A, B, C, out);
    tri(A, C, D, out);
  }
  for (const s of [-1, 1]) {
    for (let i = 1; i < profile.length - 1; i++) {
      const P = (k: number): number[] => [s * hl, profile[k][1], profile[k][0]];
      tri(P(0), P(i), P(i + 1), [s, 0, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return g;
}

// Box with chamfered vertical edges and a softened top rim: reads far less
// "blocky" than a plain box while staying low-poly.
const bevelCache = new Map<string, THREE.BufferGeometry>();
function bevelBoxGeo(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  w = q3(w); h = q3(h); d = q3(d);
  b = q3(Math.min(b, w * 0.3, d * 0.3));
  const tb = Math.min(b * 0.8, h * 0.25);
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${b.toFixed(3)}`;
  const hit = bevelCache.get(key);
  if (hit) return hit;
  const hw = w / 2, hd = d / 2;
  const ring = (inset: number, y: number): number[][] => [
    [-hw + b, y, -hd + inset], [hw - b, y, -hd + inset], [hw - inset, y, -hd + b], [hw - inset, y, hd - b],
    [hw - b, y, hd - inset], [-hw + b, y, hd - inset], [-hw + inset, y, hd - b], [-hw + inset, y, -hd + b],
  ];
  const r0 = ring(0, 0), r1 = ring(0, h - tb), r2 = ring(tb, h);
  const pos: number[] = [];
  const tri = (a: number[], bb: number[], c: number[], out: number[]): void => {
    const ab = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) pos.push(...a, ...c, ...bb);
    else pos.push(...a, ...bb, ...c);
  };
  for (let i = 0; i < 8; i++) {
    const k = (i + 1) % 8;
    const out = [(r0[i][0] + r0[k][0]) / 2, 0, (r0[i][2] + r0[k][2]) / 2];
    tri(r0[i], r0[k], r1[k], out);
    tri(r0[i], r1[k], r1[i], out);
    const out2 = [out[0], tb, out[2]];
    tri(r1[i], r1[k], r2[k], out2);
    tri(r1[i], r2[k], r2[i], out2);
    tri([0, h, 0], r2[i], r2[k], [0, 1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  bevelCache.set(key, g);
  return g;
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

// What a building's walls are made of. The surface shader draws a different
// texture for each, and every primitive carries the code of the building it
// belongs to.
export const SURFACE = {
  render: 0,
  brick: 1,
  board: 2,
  formwork: 3,
  rib: 4,
} as const;

export class GeoBuilder {
  parts: THREE.BufferGeometry[] = [];
  stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  emitVal: [number, number, number, number] = [0, 0, 0, 0];
  // which part of the building is being drawn, so the exporter can work out
  // occlusion bands from the geometry itself rather than guessing
  tag = 0;
  surface: number = SURFACE.render;
  // per-primitive colour variation (weathering)
  vary = 0;
  private _k = 0;

  get M(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  push(x = 0, y = 0, z = 0, ry = 0, s = 1): this {
    _p.set(x, y, z);
    _q.setFromEuler(_e.set(0, ry, 0));
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    this.stack.push(this.M.clone().multiply(_m));
    return this;
  }

  pushEuler(x: number, y: number, z: number, rx: number, ry: number, rz = 0): this {
    _p.set(x, y, z);
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    this.stack.push(this.M.clone().multiply(_m));
    return this;
  }

  // Everything drawn until the matching pop() comes out mirrored left to
  // right, its triangles turned back the right way round.
  mirrorX(): this {
    _m.makeScale(-1, 1, 1);
    this.stack.push(this.M.clone().multiply(_m));
    return this;
  }

  pop(): this {
    this.stack.pop();
    return this;
  }

  glow(r: number, g: number, b: number, mode: number): this {
    this.emitVal = [r, g, b, mode];
    return this;
  }

  noGlow(): this {
    this.emitVal = [0, 0, 0, 0];
    return this;
  }

  // Foliage. The colour a leaf is built in never reaches the screen: the
  // surface shader repaints every leaf for the season being baked. What the
  // leaf does carry is `t`, which of the season's two greens to shade toward,
  // so a row of trees keeps its variation as the seasons change. It rides in
  // the red channel of the emit attribute, which a leaf never uses for glow,
  // and the marker in the alpha channel is what the shader matches on.
  leaf(t: number): this {
    this.emitVal = [Math.max(0, Math.min(1, t)), 0, 0, LEAF_MARK];
    return this;
  }

  setTag(tag: number): this {
    this.tag = tag;
    return this;
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, local: THREE.Matrix4): this {
    const g = geo.clone();
    _m2.multiplyMatrices(this.M, local);
    g.applyMatrix4(_m2);
    const n = g.attributes.position.count;
    if (_m2.determinant() < 0) {
      const p = g.attributes.position.array as Float32Array;
      for (let i = 0; i < p.length; i += 9) {
        for (let k = 0; k < 3; k++) {
          const t = p[i + 3 + k];
          p[i + 3 + k] = p[i + 6 + k];
          p[i + 6 + k] = t;
        }
      }
    }
    _c.set(color);
    if (this.vary) {
      const h = Math.sin(++this._k * 12.9898 + n * 78.233) * 43758.5453;
      const f = 1 + (h - Math.floor(h) - 0.5) * this.vary;
      _c.r *= f;
      _c.g *= f;
      _c.b *= f * 0.985;
    }
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    const em = new Float32Array(n * 4);
    const [er, eg, eb, ew] = this.emitVal;
    if (ew) {
      for (let i = 0; i < n; i++) {
        em[i * 4] = er;
        em[i * 4 + 1] = eg;
        em[i * 4 + 2] = eb;
        em[i * 4 + 3] = ew;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emit', new THREE.BufferAttribute(em, 4));
    g.setAttribute('tag', new THREE.BufferAttribute(new Float32Array(n).fill(this.tag), 1));
    g.setAttribute('surface', new THREE.BufferAttribute(new Float32Array(n).fill(this.surface), 1));
    this.parts.push(g);
    return this;
  }

  private _local(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
    _p.set(x, y, z);
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    _s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(_p, _q, _s);
  }

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, ry = 0, rx = 0, rz = 0): this {
    return this.add(PRIM.box, color, this._local(x, y, z, sx, sy, sz, rx, ry, rz));
  }

  cbox(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, ry = 0, bevel = 0.022): this {
    return this.add(bevelBoxGeo(sx, sy, sz, bevel), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }

  boxC(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, rx = 0, ry = 0, rz = 0): this {
    return this.add(PRIM.boxC, color, this._local(x, y, z, sx, sy, sz, rx, ry, rz));
  }

  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, seg: number, color: THREE.ColorRepresentation, ry = 0, rx = 0, rz = 0): this {
    const r = Math.max(rTop, rBot) || 1;
    // the cached cylinder hangs from its base, which is what a post wants;
    // laid on its side that same anchor sent the eave gutter its whole length
    // off the roof, so a rotated cylinder is centred on the point it is given
    let ox = 0, oy = 0, oz = 0;
    if (rx || rz) {
      _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
      _p.set(0, -h / 2, 0).applyQuaternion(_q);
      ox = _p.x; oy = _p.y; oz = _p.z;
    }
    return this.add(cylGeo(rTop / r, rBot / r, seg), color, this._local(x + ox, y + oy, z + oz, r, h, r, rx, ry, rz));
  }

  cone(x: number, y: number, z: number, r: number, h: number, seg: number, color: THREE.ColorRepresentation, ry = 0): this {
    return this.cyl(x, y, z, 0, r, h, seg, color, ry);
  }

  // An upright half disc facing +/- z: its flat side lies along y, centred on
  // x, and it runs from z to z + depth.
  arch(x: number, y: number, z: number, r: number, depth: number, seg: number, color: THREE.ColorRepresentation): this {
    return this.add(archGeo(seg), color, this._local(x, y, z, r, depth, r, Math.PI / 2));
  }

  sphere(x: number, y: number, z: number, r: number, color: THREE.ColorRepresentation, detail = 0, sy = 1): this {
    return this.add(detail ? PRIM.ico1 : PRIM.ico0, color, this._local(x, y, z, r, r * sy, r));
  }

  blob(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, ry = 0): this {
    return this.add(PRIM.dodec, color, this._local(x, y, z, sx, sy, sz, 0, ry, 0));
  }

  roof(x: number, y: number, z: number, w: number, d: number, h: number, ridge: number, color: THREE.ColorRepresentation, ry = 0): this {
    return this.add(roofGeo(w, d, h, ridge), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }

  wedge(x: number, y: number, z: number, w: number, d: number, h: number, color: THREE.ColorRepresentation, ry = 0): this {
    return this.add(wedgeGeo(w, d, h), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }

  frustum(x: number, y: number, z: number, w: number, d: number, h: number, tw: number, td: number, color: THREE.ColorRepresentation, ry = 0): this {
    return this.add(frustumGeo(w, d, h, tw, td), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }

  prism(x: number, y: number, z: number, len: number, profile: number[][], color: THREE.ColorRepresentation, ry = 0): this {
    return this.add(prismGeo(len, profile), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }

  // Gable roof with overhanging slabs. Ridge runs along local x (or z).
  gable(x: number, y: number, z: number, w: number, d: number, h: number, wallColor: THREE.ColorRepresentation, roofColor: THREE.ColorRepresentation, oh = 0.04, alongZ = false, t = 0.03): this {
    this.push(x, y, z, alongZ ? Math.PI / 2 : 0);
    if (alongZ) [w, d] = [d, w];
    this.roof(0, 0, 0, w, d, h, w, wallColor);
    const hd = d / 2;
    const a = Math.atan2(h, hd);
    const L = Math.hypot(hd, h) + oh;
    const cz = (hd + oh * Math.cos(a)) / 2 + (t / 2) * Math.sin(a);
    const cy = (h - oh * Math.sin(a)) / 2 + (t / 2) * Math.cos(a);
    this.boxC(0, cy, cz, w + oh * 2, t, L, roofColor, a);
    this.boxC(0, cy, -cz, w + oh * 2, t, L, roofColor, -a);
    this.boxC(0, h + t * 0.4, 0, w + oh * 2 + 0.005, t * 1.1, t * 1.6, shade(roofColor, 0.85));
    this.pop();
    return this;
  }

  // Hip roof (solid), slightly overhanging.
  hip(x: number, y: number, z: number, w: number, d: number, h: number, roofColor: THREE.ColorRepresentation, oh = 0.04, alongZ = false): this {
    this.push(x, y, z, alongZ ? Math.PI / 2 : 0);
    if (alongZ) [w, d] = [d, w];
    const W = w + oh * 2, D = d + oh * 2;
    this.box(0, -0.012, 0, W, 0.025, D, shade(roofColor, 0.8));
    this.roof(0, 0, 0, W, D, h, Math.max(0, W - D), roofColor);
    this.pop();
    return this;
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    if (!g) return null;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

export function shade(color: THREE.ColorRepresentation, k: number): THREE.Color {
  const c = new THREE.Color(color);
  c.r *= k;
  c.g *= k;
  c.b *= k;
  return c;
}

export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
