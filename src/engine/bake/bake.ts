// Baking: build the geometry into a scene, light it, render it through the
// pixel-art pass, and hand back a crisp sprite with its anchor point.
//
// This is the whole 3D-to-2D pipeline in one place. The camera angle, the pixel
// size and the art resolution are all fixed and recorded, so the same building
// can be re-baked later at any light, season or scale.
//
// The camera frames a *volume* rather than the geometry itself. That matters:
// it means two different buildings standing on the same plot come out at
// exactly the same scale, which is what lets their sprites sit side by side on
// a map without anything looking out of proportion.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PixelPass } from './pixelPass';
import { MAT, U } from './materials';
import { LIGHT_PRESETS, SEASON_PRESETS, applyLight, createLightRig, contactShadowTexture } from './lighting';
import type { CameraPreset, LightPresetId, SeasonId } from '../types';

// The one camera the studio bakes from: a classic 2:1 three-quarter view, the
// same 26.57 degrees above the ground an isometric game uses.
export const ISO_ELEVATION = Math.atan(0.5);
export const CAMERA: CameraPreset = {
  angle: Math.PI / 4,
  elevation: ISO_ELEVATION,
  viewHeight: 0,
};

// How far one world unit moves on screen, in output pixels, along each world
// axis. This is the bridge between the 3D camera and the 2D map: the exporter
// places sprites and collision with it, and the preview draws with it.
//
// It is derived from the camera rather than written down as constants. The
// familiar "half a tile across, a quarter of a tile down" rule is for a
// different elevation: at this camera's angle the ground falls by sin(elevation)
// per unit across, not one half. Hard-coding the familiar numbers put every
// building on the map in slightly the wrong place, which is exactly the kind of
// error that is invisible in the studio and obvious in the game.
export interface ScreenBasis {
  // a step of one world unit along each axis, in output pixels, y downwards
  x: { x: number; y: number };
  z: { x: number; y: number };
  y: { x: number; y: number };
  // output pixels per world unit
  scale: number;
}

export function screenBasis(screenPxPerUnit: number): ScreenBasis {
  const s = screenPxPerUnit;
  const a = CAMERA.angle;
  const e = CAMERA.elevation;
  return {
    x: { x: Math.cos(a) * s, y: Math.sin(a) * Math.sin(e) * s },
    z: { x: -Math.sin(a) * s, y: Math.cos(a) * Math.sin(e) * s },
    y: { x: 0, y: -Math.cos(e) * s },
    scale: s,
  };
}

// The volume of world the camera frames, in world units: a plot of x by z
// standing y tall. Every bake that shares a volume shares a scale.
export interface BakeVolume {
  x: number;
  y: number;
  z: number;
}

export interface BakeOptions {
  // art pixels per world unit. 32 matches the 32x32 tile grid.
  pxPerUnit?: number;
  // how many output pixels wide one art pixel is drawn
  pixelSize?: number;
  shadow?: boolean;
  outline?: number;
  pad?: number;
  // whether the baked surfaces carry the sun's own shadow. Off for a lone
  // building, on for a street's ground.
  groundShadow?: boolean;
}

export interface BakeOutput {
  // RGBA, top-down, ready to encode as a PNG
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  artWidth: number;
  artHeight: number;
  pxPerUnit: number;
  pixelSize: number;
  camera: CameraPreset;
  // where the building's ground origin sits inside the sprite, in pixels
  anchor: { x: number; y: number };
  // maps a world point to a pixel in this sprite
  project(x: number, y: number, z: number): { x: number; y: number };
  light: LightPresetId;
  season: SeasonId;
  // the browser-only view of the same pixels, built on demand
  toCanvas(): HTMLCanvasElement;
}

// One thing to bake: a building's geometry at a moment in the day and the year.
export interface BakeEntry {
  geometry: THREE.BufferGeometry | null;
  light: LightPresetId;
  season: SeasonId;
  // how wide this particular building stands, for its contact shadow
  span: number;
  // street furniture and the ground strip render with the prop material,
  // which carries the season's foliage recolor but no window glow
  prop?: boolean;
}

interface Renderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  rig: ReturnType<typeof createLightRig>;
  shadowMesh: THREE.Mesh;
  shadowTex: THREE.Texture;
}

let _r: Renderer | null = null;

function getRenderer(): Renderer {
  if (_r) return _r;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const rig = createLightRig();
  scene.add(rig.hemi, rig.sun, rig.sun.target, rig.fill, rig.fill.target);
  const shadowTex = contactShadowTexture();
  const shadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.75 }),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.005;
  _r = { renderer, scene, camera, rig, shadowMesh, shadowTex };
  return _r;
}

const _v = new THREE.Vector3();
const _center = new THREE.Vector3();

// Point the camera at the middle of the volume from the fixed studio angle and
// size the frustum so the whole volume fits, with a little air around it.
function aim(camera: THREE.OrthographicCamera, box: THREE.Box3, pad: number): void {
  box.getCenter(_center);
  const dir = new THREE.Vector3(
    Math.sin(CAMERA.angle) * Math.cos(CAMERA.elevation),
    Math.sin(CAMERA.elevation),
    Math.cos(CAMERA.angle) * Math.cos(CAMERA.elevation),
  );
  const dist = 60;
  camera.position.copy(_center).addScaledVector(dir, dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(_center);
  camera.updateMatrixWorld(true);

  const inv = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        _v.set(x, y, z).applyMatrix4(inv);
        minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x);
        minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
        minZ = Math.min(minZ, _v.z); maxZ = Math.max(maxZ, _v.z);
      }
    }
  }
  const ex = (maxX - minX) / 2 + pad;
  const ey = (maxY - minY) / 2 + pad;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  camera.left = cx - ex;
  camera.right = cx + ex;
  camera.top = cy + ey;
  camera.bottom = cy - ey;
  camera.near = Math.max(0.1, -maxZ - 6);
  camera.far = -minZ + 6;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

// Snap the frustum so exactly whole art pixels cover it, then round the output
// size up to a whole number of output pixels per art pixel.
function snap(camera: THREE.OrthographicCamera, pxPerUnit: number, pixelSize: number): { artW: number; artH: number; outW: number; outH: number } {
  const worldW = camera.right - camera.left;
  const worldH = camera.top - camera.bottom;
  const artW = Math.max(8, Math.round(worldW * pxPerUnit));
  const artH = Math.max(8, Math.round(worldH * pxPerUnit));
  const cx = (camera.left + camera.right) / 2;
  const cy = (camera.top + camera.bottom) / 2;
  const halfW = (artW / pxPerUnit) / 2;
  const halfH = (artH / pxPerUnit) / 2;
  camera.left = cx - halfW;
  camera.right = cx + halfW;
  camera.top = cy + halfH;
  camera.bottom = cy - halfH;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { artW, artH, outW: artW * pixelSize, outH: artH * pixelSize };
}

export function bakeBatch(entries: BakeEntry[], volume: BakeVolume, opts: BakeOptions = {}): BakeOutput[] {
  const R = getRenderer();
  const pxPerUnit = opts.pxPerUnit ?? 32;
  const pixelSize = Math.max(1, Math.round(opts.pixelSize ?? 2));
  const pad = opts.pad ?? 0.3;

  // the volume the camera frames: the plot, from the ground up
  const box = new THREE.Box3(
    new THREE.Vector3(-volume.x / 2, 0, -volume.z / 2),
    new THREE.Vector3(volume.x / 2, volume.y, volume.z / 2),
  );
  aim(R.camera, box, pad);
  const { artW, artH, outW, outH } = snap(R.camera, pxPerUnit, pixelSize);

  // where the building's ground origin lands: the same for every entry, since
  // the camera does not move between them
  const ndc = new THREE.Vector3(0, 0, 0).project(R.camera);
  const anchor = {
    x: Math.round((ndc.x * 0.5 + 0.5) * outW),
    y: Math.round((-ndc.y * 0.5 + 0.5) * outH),
  };

  R.renderer.setSize(outW, outH, false);
  const rt = new THREE.WebGLRenderTarget(outW, outH, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const composer = new EffectComposer(R.renderer, rt);
  composer.renderToScreen = false;
  const pix = new PixelPass(pixelSize, R.scene, R.camera, { outline: opts.outline ?? 0.42 });
  // the outline shader reads the depth buffer, so it has to be told which
  // frustum produced it: given the wrong near and far it scales the depth
  // gradient wrongly and the outlines come out at the wrong weight
  pix.setCamera(R.camera.near, R.camera.far);
  composer.addPass(pix);
  composer.addPass(new OutputPass());
  composer.setSize(outW, outH);

  const row = outW * 4;
  const buf = new Uint8Array(outW * outH * 4);
  const spanMax = Math.max(volume.x, volume.z);
  const out: BakeOutput[] = [];

  const frames: { pixels: Uint8ClampedArray; light: LightPresetId; season: SeasonId }[] = [];
  let gx0 = outW, gx1 = -1, gy0 = outH, gy1 = -1;

  for (const entry of entries) {
    // clear anything left from the last bake
    for (const child of [...R.scene.children]) {
      if (child !== R.rig.hemi && child !== R.rig.sun && child !== R.rig.sun.target
        && child !== R.rig.fill && child !== R.rig.fill.target) R.scene.remove(child);
    }

    const mesh = entry.geometry ? new THREE.Mesh(entry.geometry, entry.prop ? MAT.prop : MAT.building) : null;
    if (mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      R.scene.add(mesh);
    }
    const sh = R.shadowMesh;
    const shSize = Math.max(1.6, entry.span * 1.25);
    sh.scale.set(shSize, shSize, 1);
    sh.visible = opts.shadow !== false;
    if (sh.visible) R.scene.add(sh);

    applyLight(R.rig, LIGHT_PRESETS[entry.light], SEASON_PRESETS[entry.season], spanMax);
    // Whether the surfaces carry the sun's own shadow. Off for a single
    // building baked on its own, which already has the soft contact blob under
    // it; on for a street's ground, which has nothing else to say which way the
    // light comes from.
    if (opts.groundShadow === false) U.uShadow.value = 0;
    composer.render();
    R.renderer.readRenderTargetPixels(composer.readBuffer, 0, 0, outW, outH, buf);

    // the readback is bottom-up: flip it into top-down pixel order
    const pixels = new Uint8ClampedArray(outW * outH * 4);
    for (let y = 0; y < outH; y++) {
      pixels.set(buf.subarray((outH - 1 - y) * row, (outH - 1 - y) * row + row), y * row);
    }

    // an isometric frame always carries air: the volume's top-back corner
    // projects above the roof apex, and a small building sits in a lake of
    // nothing. Find where each frame's content actually is.
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        if (pixels[(y * outW + x) * 4 + 3] > 8) {
          if (x < gx0) gx0 = x;
          if (x > gx1) gx1 = x;
          if (y < gy0) gy0 = y;
          if (y > gy1) gy1 = y;
        }
      }
    }

    frames.push({ pixels, light: entry.light, season: entry.season });
  }

  // One crop for the whole batch: the union of every entry's content plus a
  // margin of whole art tiles. Cropping per-entry would give each sprite its own
  // size and origin, and the sprites would stop being interchangeable; the
  // shared frame is what lets a sprite drop onto any tile at the same scale.
  // Every crop edge stays on the art-pixel grid, so the nearest-neighbour
  // upscale never smears a block.
  const tile = pxPerUnit * pixelSize;
  const margin = Math.max(pixelSize, Math.round(tile * 1.2));
  let cx0 = 0, cy0 = 0, cx1 = outW, cy1 = outH;
  if (gx1 >= gx0 && gy1 >= gy0) {
    cx0 = Math.max(0, Math.floor((gx0 - margin) / pixelSize) * pixelSize);
    cy0 = Math.max(0, Math.floor((gy0 - margin) / pixelSize) * pixelSize);
    cx1 = Math.min(outW, Math.ceil((gx1 + margin + 1) / pixelSize) * pixelSize);
    cy1 = Math.min(outH, Math.ceil((gy1 + margin + 1) / pixelSize) * pixelSize);
  }
  const W = cx1 - cx0;
  const Ht = cy1 - cy0;
  const crop = W < outW || Ht < outH;

  const slice = (src: Uint8ClampedArray): Uint8ClampedArray => {
    const dst = new Uint8ClampedArray(W * Ht * 4);
    for (let y = 0; y < Ht; y++) {
      const from = (y + cy0) * outW * 4 + cx0 * 4;
      dst.set(src.subarray(from, from + W * 4), y * W * 4);
    }
    return dst;
  };

  for (const frame of frames) {
    const pixels = crop ? slice(frame.pixels) : frame.pixels;
    out.push({
      pixels,
      width: W,
      height: Ht,
      artWidth: artW,
      artHeight: artH,
      pxPerUnit,
      pixelSize,
      camera: CAMERA,
      anchor: { x: anchor.x - cx0, y: anchor.y - cy0 },
      project(wx: number, wy: number, wz: number) {
        const p = new THREE.Vector3(wx, wy, wz).project(R.camera);
        return { x: (p.x * 0.5 + 0.5) * outW - cx0, y: (-p.y * 0.5 + 0.5) * outH - cy0 };
      },
      light: frame.light,
      season: frame.season,
      toCanvas(): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = Ht;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = ctx.createImageData(W, Ht);
          img.data.set(pixels);
          ctx.putImageData(img, 0, 0);
        }
        return canvas;
      },
    });
  }

  pix.dispose();
  composer.dispose();
  rt.dispose();

  return out;
}

export function bakeBuilding(geometry: THREE.BufferGeometry | null, volume: BakeVolume, opts: BakeOptions & { light: LightPresetId; season: SeasonId; span?: number }): BakeOutput {
  const [only] = bakeBatch(
    [{ geometry, light: opts.light, season: opts.season, span: opts.span ?? Math.max(volume.x, volume.z) }],
    volume,
    opts,
  );
  return only;
}

// Warm the shared renderer up before the first bake so the first sprite is not
// slow to appear.
export function prewarmBake(): void {
  getRenderer();
}

export { U };
