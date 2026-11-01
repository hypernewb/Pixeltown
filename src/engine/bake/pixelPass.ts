// Pixel-art rendering: the scene is drawn at a fraction of the output
// resolution, edges are found from the depth and normal buffers, silhouettes
// get dark outlines and creases a light highlight, then everything is scaled
// up with crisp nearest-neighbour pixels.
//
// Ported from Kinstead's render/pixelPass.js (MIT).

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec4 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float persp;
uniform float outline;
uniform float highlight;
varying vec2 vUv;

float R(float x, float y) { return texture2D(tDepth, vUv + vec2(x, y) * resolution.zw).r; }
float lin(float r) { return persp > 0.5 ? cameraNear * cameraFar / (cameraFar - r * (cameraFar - cameraNear)) : r * (cameraFar - cameraNear); }
float D(float x, float y) { return lin(R(x, y)); }
vec3 Nr(float x, float y) { return texture2D(tNormal, vUv + vec2(x, y) * resolution.zw).rgb * 2.0 - 1.0; }

float nEdge(float x, float y, float d, vec3 n) {
  float dd = D(x, y) - d;
  vec3 nn = Nr(x, y);
  float bias = clamp(smoothstep(-0.01, 0.01, dot(n - nn, vec3(1.0, 1.0, 1.0))), 0.0, 1.0);
  float front = clamp(sign(dd * 0.25 + 0.0025), 0.0, 1.0);
  return (1.0 - dot(n, nn)) * front * bias;
}

void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float r = R(0.0, 0.0), d = lin(r);
  vec3 n = Nr(0.0, 0.0);
  float rl = R(-1.0, 0.0), rr = R(1.0, 0.0), ru = R(0.0, 1.0), rd = R(0.0, -1.0);
  float unit = persp > 0.5 ? d * d * (cameraFar - cameraNear) / (cameraFar * cameraNear) : cameraFar - cameraNear;
  float lap = max(abs(rl + rr - 2.0 * r), abs(ru + rd - 2.0 * r)) * unit;
  float gap = lin(max(max(rl, rr), max(ru, rd))) - d;
  float de = step(0.06, lap) * step(0.06, gap);
  float ne = step(0.12, nEdge(0.0, -1.0, d, n) + nEdge(0.0, 1.0, d, n) + nEdge(-1.0, 0.0, d, n) + nEdge(1.0, 0.0, d, n));
  float k = de > 0.0 ? (1.0 - outline) : (1.0 + highlight * ne);
  gl_FragColor = vec4(c.rgb * k, c.a);
}`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export interface PixelPassOptions {
  outline?: number;
  highlight?: number;
}

export class PixelPass extends Pass {
  pixelSize: number;
  scene: THREE.Scene;
  camera: THREE.Camera;
  resolution = new THREE.Vector2();
  renderResolution = new THREE.Vector2(1, 1);
  private beauty: THREE.WebGLRenderTarget;
  private normals: THREE.WebGLRenderTarget;
  private normalMaterial = new THREE.MeshNormalMaterial();
  // Depth is stored non-linearly, so the edge test has to be told the camera's
  // own near and far. Guessing them scales the depth gradient wrongly and the
  // outlines quietly stop appearing, so the bake camera sets these each time.
  private near = 1;
  private far = 100;
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;
  private _vis = new Map<THREE.Object3D, boolean>();

  constructor(pixelSize: number, scene: THREE.Scene, camera: THREE.Camera, opts: PixelPassOptions = {}) {
    super();
    this.pixelSize = pixelSize;
    this.scene = scene;
    this.camera = camera;
    const rt = (): THREE.WebGLRenderTarget =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
    this.beauty = rt();
    this.beauty.depthTexture = new THREE.DepthTexture(1, 1);
    this.normals = rt();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tNormal: { value: null },
        resolution: { value: new THREE.Vector4(1, 1, 1, 1) },
        cameraNear: { value: this.near },
        cameraFar: { value: this.far },
        persp: { value: 0 },
        outline: { value: opts.outline ?? 0.42 },
        highlight: { value: opts.highlight ?? 0.22 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setCamera(near: number, far: number): void {
    this.near = near;
    this.far = far;
  }

  setSize(width: number, height: number): void {
    this.resolution.set(width, height);
    const x = Math.max(1, Math.floor(width / this.pixelSize));
    const y = Math.max(1, Math.floor(height / this.pixelSize));
    this.renderResolution.set(x, y);
    this.beauty.setSize(x, y);
    this.normals.setSize(x, y);
    this.material.uniforms.resolution.value.set(x, y, 1 / x, 1 / y);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.cameraNear.value = this.near;
    u.cameraFar.value = this.far;
    u.persp.value = (this.camera as THREE.PerspectiveCamera).isPerspectiveCamera ? 1 : 0;
    renderer.setRenderTarget(this.beauty);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    // normals: leave out particles, overlays and other see-through things
    const vis = this._vis;
    this.scene.traverse((o) => {
      vis.set(o, o.visible);
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (m && m.transparent)) o.visible = false;
    });
    const old = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.normalMaterial;
    renderer.setRenderTarget(this.normals);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = old;
    this.scene.traverse((o) => {
      const v = vis.get(o);
      if (v !== undefined) o.visible = v;
    });
    vis.clear();
    u.tDiffuse.value = this.beauty.texture;
    u.tDepth.value = this.beauty.depthTexture;
    u.tNormal.value = this.normals.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose(): void {
    this.beauty.dispose();
    this.normals.dispose();
    this.normalMaterial.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
