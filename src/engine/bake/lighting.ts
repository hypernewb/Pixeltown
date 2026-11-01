// Light and season presets. Because the sun's direction belongs to the world
// and not the camera, one set of geometry can be re-lit for any time of day or
// year without rebuilding anything.

import * as THREE from 'three';
import { U } from './materials';
import type { LightPreset, LightPresetId, SeasonId, SeasonPreset } from '../types';

export const LIGHT_PRESETS: Record<LightPresetId, LightPreset> = {
  day: {
    id: 'day',
    name: 'Day',
    sunColor: '#fff6e2',
    sunIntensity: 2.7,
    hemiSky: '#cfe6f7',
    hemiGround: '#8a7a5e',
    hemiIntensity: 0.8,
    night: 0,
    exposure: 1.0,
    backdrop: '#dfe8ea',
  },
  afternoon: {
    id: 'afternoon',
    name: 'Afternoon',
    sunColor: '#ffd9a3',
    sunIntensity: 2.45,
    hemiSky: '#e8d8c2',
    hemiGround: '#8a7050',
    hemiIntensity: 0.9,
    night: 0,
    exposure: 1.06,
    backdrop: '#e8ddc8',
  },
  dusk: {
    id: 'dusk',
    name: 'Dusk',
    sunColor: '#ffb066',
    sunIntensity: 1.9,
    hemiSky: '#9a7f8f',
    hemiGround: '#5a4a42',
    hemiIntensity: 0.7,
    night: 0.45,
    exposure: 1.05,
    backdrop: '#8d7b86',
  },
  night: {
    id: 'night',
    name: 'Night',
    sunColor: '#6f86b8',
    sunIntensity: 0.85,
    hemiSky: '#2c3a55',
    hemiGround: '#20222e',
    hemiIntensity: 0.55,
    night: 1,
    exposure: 1.18,
    backdrop: '#232a3a',
  },
  dawn: {
    id: 'dawn',
    name: 'Dawn',
    sunColor: '#ffd2a0',
    sunIntensity: 2.0,
    hemiSky: '#b8c4d8',
    hemiGround: '#6a6250',
    hemiIntensity: 0.8,
    night: 0.25,
    exposure: 1.03,
    backdrop: '#c3c8cf',
  },
};

export const SEASON_PRESETS: Record<SeasonId, SeasonPreset> = {
  spring: { id: 'spring', name: 'Spring', foliage: '#74a84e', leafAlt: '#b0cc74', tint: [1.0, 1.04, 0.96], snow: 0, grime: 0.7 },
  summer: { id: 'summer', name: 'Summer', foliage: '#4e8038', leafAlt: '#6a9a4a', tint: [1.07, 1.0, 0.9], snow: 0, grime: 0.45 },
  autumn: { id: 'autumn', name: 'Autumn', foliage: '#b8722c', leafAlt: '#d8a03c', tint: [1.14, 0.94, 0.76], snow: 0, grime: 0.9 },
  winter: { id: 'winter', name: 'Winter', foliage: '#6d7a6a', leafAlt: '#8a9484', tint: [0.88, 0.94, 1.14], snow: 1, grime: 1.15 },
};

export const LIGHT_ORDER: LightPresetId[] = ['day', 'afternoon', 'dusk', 'night', 'dawn'];
export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

export interface LightRig {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  // A much weaker light from the opposite side to the sun. A single key light
  // gives two faces of a box the same value, which is exactly the flatness this
  // look is prone to: key and ambient alone cannot separate the front wall from
  // the flank. The fill lifts the shadowed flank just enough that it reads as a
  // second surface rather than as a hole.
  fill: THREE.DirectionalLight;
}

// One sun for the whole studio, at one place in the sky, so every sprite in a
// batch is lit from the same direction and the shadows all fall the same way.
export const SUN_DIR = new THREE.Vector3(0.42, 1, 0.3).normalize();
const FILL_DIR = new THREE.Vector3(-0.5, 0.35, -0.4).normalize();

// How much of the sun's light reaches the surface as shadow. Every bake keeps
// the sun's shadow on: a building whose own walls cast nothing reads as a
// drawing of a building rather than as one, and the direction of the shadow is
// the only cue in the picture that says where the light is.
export function createLightRig(): LightRig {
  const hemi = new THREE.HemisphereLight(LIGHT_PRESETS.day.hemiSky, LIGHT_PRESETS.day.hemiGround, 0.95);
  const sun = new THREE.DirectionalLight(LIGHT_PRESETS.day.sunColor, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.intensity = 0.92;
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = 60;
  sc.left = -8;
  sc.right = 8;
  sc.top = 8;
  sc.bottom = -8;
  const fill = new THREE.DirectionalLight('#cfe0f2', 0.3);
  return { hemi, sun, fill };
}

// The season is not a label on a sprite: it has to change the picture, or the
// choice is a dead control. It does so three ways — the ambient light takes on
// the season's cast, foliage is repainted from the season's pair of greens, and
// winter lays snow on the roofs and the ground while autumn darkens the grime.
export function applyLight(rig: LightRig, light: LightPreset, season: SeasonPreset, span: number): void {
  const [tr, tg, tb] = season.tint;
  // the season's cast goes onto the ambient light in full, and onto the sun as
  // a brightness: a low warm autumn sun and a pale cold winter one are the two
  // strongest cues that the year has moved
  rig.hemi.color.set(light.hemiSky);
  rig.hemi.color.r = Math.min(1, rig.hemi.color.r * tr);
  rig.hemi.color.g = Math.min(1, rig.hemi.color.g * tg);
  rig.hemi.color.b = Math.min(1, rig.hemi.color.b * tb);
  rig.hemi.groundColor.set(light.hemiGround);
  rig.hemi.groundColor.r = Math.min(1, rig.hemi.groundColor.r * tr);
  rig.hemi.groundColor.b = Math.min(1, rig.hemi.groundColor.b * tb);
  rig.hemi.intensity = light.hemiIntensity * (0.9 + 0.2 * (tr + tb) / 2);
  rig.sun.color.set(light.sunColor);
  rig.sun.color.r = Math.min(1, rig.sun.color.r * tr);
  rig.sun.color.g = Math.min(1, rig.sun.color.g * tg);
  rig.sun.color.b = Math.min(1, rig.sun.color.b * tb);
  rig.sun.intensity = light.sunIntensity * ((tr + tg + tb) / 3);
  rig.sun.target.position.set(0, 0, 0);
  rig.sun.position.copy(SUN_DIR).multiplyScalar(span * 2 + 8);
  rig.fill.color.set(light.hemiSky);
  rig.fill.intensity = 0.3 * (light.night > 0.5 ? 0.6 : 1);
  rig.fill.position.copy(FILL_DIR).multiplyScalar(span * 2 + 8);
  const sc = rig.sun.shadow.camera;
  const r = Math.max(4, span * 0.9);
  sc.left = -r;
  sc.right = r;
  sc.top = r;
  sc.bottom = -r;
  sc.updateProjectionMatrix();
  U.uNight.value = light.night;
  U.uLate.value = light.night > 0.8 ? 0.35 : 0;
  U.uSnow.value = season.snow;
  U.uFresh.value = 0;
  U.uLeafA.value.set(season.foliage);
  U.uLeafB.value.set(season.leafAlt);
  U.uLeafK.value = 1;
  U.uGrime.value = season.grime;
  // how much of the sun's own shadow survives: a low sun casts further and
  // darker than one overhead, so the shadow is strongest at dusk and dawn
  U.uShadow.value = light.night > 0.5 ? 0.45 : 0.9 + (1 - light.sunIntensity / 2.7) * 0.3;
}

// A soft contact shadow under the building. Kept as a separate transparent
// blob so an exported sprite stays transparent where there is no building.
export function contactShadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.42)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.2)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
