// Shared materials plus the small shader patches for night glow, snow and the
// procedural surface detail that gives a wall its grain.
//
// Ported from Kinstead's render/materials.js (MIT).

import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uNight: { value: 0 }, // 0 day, 1 night: windows and lamps
  uLate: { value: 0 }, // 0 to 1 past midnight: windows switch off
  uSnow: { value: 0 }, // winter snow cover
  uFresh: { value: 0 },
  uLeafA: { value: new THREE.Color('#4e8038') }, // summer foliage
  uLeafB: { value: new THREE.Color('#6a9a4a') }, // its lighter shade
  uLeafK: { value: 0 }, // 1 when the season should recolor foliage
  uGrime: { value: 1 }, // how heavily the season darkens a wall's base
  // How much of the sun's shadow reaches the picture. Shadows are the only cue
  // that says which way the light comes from, so when the ground is baked as
  // its own pass the shadow has to come with it: a street whose road carries no
  // shadows looks lit from nowhere.
  uShadow: { value: 1 },
};

const HEAD = 'uniform float uTime;\nuniform float uNight;\nuniform float uLate;\nuniform float uSnow;\nuniform float uFresh;\nuniform vec3 uLeafA;\nuniform vec3 uLeafB;\nuniform float uLeafK;\nuniform float uGrime;\nuniform float uShadow;\n';

const SNOW_ROOF = `
{
  vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
  float snowAmt = max(uSnow, uFresh) * 0.9 * smoothstep(0.38, 0.72, wN.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowAmt);
}
`;

const SNOW = `
{
  vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
  float snowAmt = uSnow * 0.85 * smoothstep(0.55, 0.92, wN.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowAmt);
}
`;

// light: null for electric light, 'candle' for a building without power,
// 'off' for one that has stopped work.
const EMIT = (light: string | null): string => `
{
  // a leaf rides in this attribute too, to carry which of the season's two
  // greens it takes; its marker is above every glow mode, so it never lights
  float m = vEmit.w > 5.0 ? 0.0 : vEmit.w;
  float on = 0.0;
  if (m >= 3.0) on = smoothstep(0.1, 0.45, uNight);
  else if (m >= 2.0) on = 1.0;
  else if (m >= 1.0) {
    float r = m - 1.0;
    on = smoothstep(r * 0.6, r * 0.6 + 0.25, uNight) * (1.0 - step(r, uLate * 0.8));
  }
  ${
    light === 'candle'
      ? 'on *= m >= 2.0 && m < 3.0 ? 1.0 : 0.3;\n  vec3 tint = vec3(1.0, 0.7, 0.42);'
      : light === 'off'
        ? 'on = 0.0;\n  vec3 tint = vec3(1.0);'
        : 'vec3 tint = vec3(1.0);'
  }
  totalEmissiveRadiance += vEmit.rgb * tint * on * (1.0 + uNight * 0.5);
}
`;

// Pixel-art surface detail drawn procedurally in world space: brick courses on
// a wall, tile courses on a roof, and the grain that keeps a flat face from
// looking printed. The ground-grime band (darkening toward y=0) is Kinstead's
// weather() pass, moved into the shader so it costs nothing per vertex.
//
// Two rules keep the texture scale honest, and both are about the art pixel.
//
// A course is a whole number of art pixels tall. The pixel pass resolves one
// art pixel, so a course of one and a half pixels lands on a different part of
// the grid on every facet and the pattern crawls as the sprite is scaled.
//
// And the grain is sampled every *two* art pixels, not every one. Sampled at
// the output's own resolution it is not texture at all: it is static, and it
// is the single biggest source of the muddiness this look has to avoid. At two
// pixels it reads as the tone of a material.
const PATTERN_BUILDING = `
{
  vec3 pN = normalize(inverseTransformDirection(normal, viewMatrix));
  float ay = abs(pN.y);
  float along = abs(pN.x) > abs(pN.z) ? vWPos.z : vWPos.x;
  float grain = fract(sin(dot(floor(vWPos.xyz * 16.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  if (vEmit.w < 0.5) {
    int kind = int(floor(vSurf + 0.5));
    if (ay < 0.35) {
      if (kind == 1) {
        // a brick wall: courses two art pixels tall and four long
        float row = floor(vWPos.y / 0.0625);
        float course = step(fract(vWPos.y / 0.0625), 0.18);
        float joint = step(fract(along / 0.125 + row * 0.5), 0.1);
        diffuseColor.rgb *= (1.0 - 0.07 * max(course, joint * 0.7)) * (0.985 + 0.03 * grain);
      } else if (kind == 2) {
        // boards: a faint seam every eight art pixels, grain kept quiet
        float seam = step(fract(along / 0.25), 0.125);
        diffuseColor.rgb *= (1.0 - 0.035 * seam) * (0.99 + 0.015 * grain);
      } else if (kind == 3) {
        // formwork: tie lines every eight art pixels, panel joints a metre apart
        float tie = step(fract(vWPos.y / 0.25), 0.125);
        float panel = step(fract(along / 1.0), 0.03125);
        diffuseColor.rgb *= (1.0 - 0.03 * tie - 0.04 * panel) * (0.99 + 0.015 * grain);
      } else if (kind == 4) {
        // corrugated sheet: a trough every four art pixels across the sheet
        float trough = step(fract(along / 0.125), 0.25);
        diffuseColor.rgb *= (1.0 - 0.06 * trough) * (0.99 + 0.015 * grain);
      } else {
        diffuseColor.rgb *= 0.99 + 0.02 * grain;
      }
    } else if (ay < 0.93) {
      if (kind == 1) {
        // a roof's tile courses are lines of constant height, so rows every two
        // art pixels of height read as clean courses down the roof
        float row = floor(vWPos.y / 0.0625);
        float course = step(fract(vWPos.y / 0.0625), 0.3);
        float joint = step(fract(along / 0.1875 + row * 0.5), 0.12);
        diffuseColor.rgb *= (1.0 - 0.12 * max(course, joint * 0.6)) * (0.985 + 0.03 * grain);
      } else {
        diffuseColor.rgb *= 0.99 + 0.02 * grain;
      }
    } else {
      diffuseColor.rgb *= 0.99 + 0.02 * grain;
    }
    // grime toward the ground: full strength at the base, gone by 0.32 up. How
    // heavily it gathers is the season's business — a wet winter stains a wall
    // far more than high summer does.
    float grime = (1.0 - smoothstep(0.0, 0.32, vWPos.y)) * uGrime;
    diffuseColor.rgb *= 1.0 - 0.2 * min(grime, 1.4);
  }
}
`;

// Foliage recolors per season. The geometry marks every leaf with tag 6 and
// carries, in the red channel of its emit attribute, where between the season's
// two greens that particular leaf sits; the shader swaps the built-in colour
// for the pair the season supplies.
const LEAF = `
{
  if (uLeafK > 0.5 && vEmit.w > 5.5) {
    diffuseColor.rgb = mix(uLeafA, uLeafB, clamp(vEmit.r, 0.0, 1.0));
  }
}
`;

export interface PatchOptions {
  snow?: false | 'roof' | 'plain';
  emit?: boolean;
  light?: string | null;
  pattern?: boolean;
  leaf?: boolean;
  tag?: boolean;
}

export function patch(material: THREE.Material, opts: PatchOptions, key: string): THREE.Material {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    let vs = HEAD + shader.vertexShader;
    let fs = HEAD + shader.fragmentShader;
    // the emit attribute carries both a glow and, on foliage, the season shade.
    // Whichever option asks for it first installs the varying; asking twice
    // would declare it twice, which a shader compiler rejects outright.
    let hasEmit = false;
    const needEmit = (): void => {
      if (hasEmit) return;
      hasEmit = true;
      vs = vs
        .replace('#include <common>', '#include <common>\nattribute vec4 emit;\nvarying vec4 vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;');
      fs = fs.replace('#include <common>', '#include <common>\nvarying vec4 vEmit;');
    };
    if (opts.emit) {
      needEmit();
      fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + EMIT(opts.light ?? null));
    }
    if (opts.pattern) {
      vs = vs
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nattribute float surface;\nvarying float vSurf;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSurf = surface;');
      fs = fs
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying float vSurf;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + PATTERN_BUILDING);
    }
    if (opts.leaf) {
      needEmit();
      fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + LEAF);
    }
    if (opts.snow) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (opts.snow === 'roof' ? SNOW_ROOF : SNOW));
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => key;
  return material;
}

const baseBuilding = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 });

export const MAT = {
  building: patch(baseBuilding(), { snow: 'roof', emit: true, pattern: true }, 'bld'),
  buildingCandle: patch(baseBuilding(), { snow: 'roof', emit: true, pattern: true, light: 'candle' }, 'bldC'),
  buildingOff: patch(baseBuilding(), { snow: 'roof', emit: true, pattern: true, light: 'off' }, 'bldO'),
  // props and ground: plain, but they carry the foliage recolor and the tag
  prop: patch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }), { emit: true, leaf: true }, 'prop'),
  side: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
  // a plain shadow-catcher for the ground the studio stands the building on
  ground: new THREE.MeshStandardMaterial({ color: '#cfc9ba', roughness: 0.98, metalness: 0 }),
};

export function disposeMaterials(): void {
  for (const m of Object.values(MAT)) m.dispose();
}
