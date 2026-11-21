import * as THREE from 'three';

const NSRC = 12;

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const SIM = /* glsl */ `
precision highp float;
uniform highp sampler2D tState;
uniform sampler2D tSolid;
uniform vec2 uSize;
uniform vec4 uField;
uniform float uC2;
uniform float uDamp;
uniform float uVisc;
uniform int uCount;
uniform vec4 uSrcA[${NSRC}];
uniform vec4 uSrcB[${NSRC}];

vec2 at(ivec2 p) { return texelFetch(tState, clamp(p, ivec2(0), ivec2(uSize) - 1), 0).rg; }
vec2 nb(ivec2 p, vec2 c) {
  float s = texture2D(tSolid, (vec2(p) + 0.5) / uSize).r;
  return s > 0.5 ? c : at(p);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 uv = gl_FragCoord.xy / uSize;
  if (texture2D(tSolid, uv).r > 0.5) { gl_FragColor = vec4(0.0); return; }
  vec2 c = at(p);
  vec2 e = nb(p + ivec2(1, 0), c), w = nb(p + ivec2(-1, 0), c), n = nb(p + ivec2(0, 1), c), s = nb(p + ivec2(0, -1), c);
  vec2 ne = nb(p + ivec2(1, 1), c), nw = nb(p + ivec2(-1, 1), c), se = nb(p + ivec2(1, -1), c), sw = nb(p + ivec2(-1, -1), c);
  vec2 lap = (4.0 * (e + w + n + s) + (ne + nw + se + sw) - 20.0 * c) / 6.0;
  float v = (c.g + uC2 * lap.r + uVisc * lap.g) * uDamp;
  float h = c.r + v;

  vec2 world = uField.xy + uv * uField.zw;
  for (int i = 0; i < ${NSRC}; i++) {
    if (i >= uCount) break;
    vec2 a = uSrcA[i].xy, ab = uSrcA[i].zw - a;
    float l2 = dot(ab, ab);
    float t = l2 > 1e-8 ? clamp(dot(world - a, ab) / l2, 0.0, 1.0) : 0.0;
    vec2 d = world - (a + ab * t);
    float q2 = dot(d, d) / (uSrcB[i].x * uSrcB[i].x);
    if (q2 < 12.0) h -= uSrcB[i].y * (1.0 - uSrcB[i].z * q2) * exp(-q2);
  }

  float rim = min(min(uv.x, 1.0 - uv.x) * uSize.x, min(uv.y, 1.0 - uv.y) * uSize.y);
  float open = smoothstep(0.0, 48.0, rim);
  h *= mix(0.90, 0.9997, open);
  v *= mix(0.80, 1.0, open);
  gl_FragColor = vec4(h, v, 0.0, 1.0);
}
`;

const SLOPE = /* glsl */ `
precision highp float;
uniform highp sampler2D tState;
uniform vec2 uSize;
uniform float uInv2dx;
float H(ivec2 p) { return texelFetch(tState, clamp(p, ivec2(0), ivec2(uSize) - 1), 0).r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 c = texelFetch(tState, p, 0).rg;
  gl_FragColor = vec4((H(p + ivec2(1, 0)) - H(p - ivec2(1, 0))) * uInv2dx, (H(p + ivec2(0, 1)) - H(p - ivec2(0, 1))) * uInv2dx, c.r, c.g);
}
`;

export class Ripples {
  /** Bounds are in meters, speed in m/s, and life in seconds. */
  constructor(renderer, o) {
    this.renderer = renderer;
    this.x0 = o.x0;
    this.z0 = o.z0;
    this.w = o.x1 - o.x0;
    this.d = o.z1 - o.z0;
    const long = o.long || 2048,
      dx = Math.max(this.w, this.d) / long;
    this.dx = dx;
    this.nx = Math.max(8, Math.round(this.w / dx));
    this.nz = Math.max(8, Math.round(this.d / dx));
    this.speed = o.speed || 0.72;
    const cfl = (this.speed * (1 / 60)) / dx;
    if (cfl > 0.8) this.speed = 0.8 * dx * 60;
    const life = o.life || 3.2;

    const full = renderer.extensions.has('EXT_color_buffer_float');
    const state = () =>
      new THREE.WebGLRenderTarget(this.nx, this.nz, {
        type: full ? THREE.FloatType : THREE.HalfFloatType,
        format: THREE.RGFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
    this.a = state();
    this.b = state();
    this.slope = new THREE.WebGLRenderTarget(this.nx, this.nz, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
    });
    this.slope.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.texture = this.slope.texture;

    this.solidData = new Uint8Array(4);
    this.solid = new THREE.DataTexture(this.solidData, 2, 2, THREE.RedFormat, THREE.UnsignedByteType);
    this.solid.minFilter = this.solid.magFilter = THREE.LinearFilter;
    this.solid.needsUpdate = true;

    const srcA = [],
      srcB = [];
    for (let i = 0; i < NSRC; i++) {
      srcA.push(new THREE.Vector4());
      srcB.push(new THREE.Vector4(1, 0, 1, 0));
    }
    this.sim = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SIM,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
      uniforms: {
        tState: { value: null },
        tSolid: { value: this.solid },
        uSize: { value: new THREE.Vector2(this.nx, this.nz) },
        uField: { value: new THREE.Vector4(this.x0, this.z0, this.w, this.d) },
        uC2: { value: ((this.speed * (1 / 60)) / dx) ** 2 },
        uDamp: { value: Math.exp(-(2 / life) / 60) },
        uVisc: { value: 0.035 },
        uCount: { value: 0 },
        uSrcA: { value: srcA },
        uSrcB: { value: srcB },
      },
    });
    this.grad = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SLOPE,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
      uniforms: {
        tState: { value: null },
        uSize: { value: new THREE.Vector2(this.nx, this.nz) },
        uInv2dx: { value: 1 / (2 * dx) },
      },
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(tri, this.sim);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.scene.matrixWorldAutoUpdate = false;
    this.cam = new THREE.Camera();

    this.cap = 96;
    this.q = new Float32Array(this.cap * 7);
    this.head = 0;
    this.count = 0;
    this.fieldUniform = new THREE.Vector4(this.x0, this.z0, 1 / this.w, 1 / this.d);
    this._color = new THREE.Color();
    this.clear();
  }

  clear() {
    const r = this.renderer,
      prev = r.getRenderTarget(),
      a = r.getClearAlpha();
    r.getClearColor(this._color);
    r.setClearColor(0x000000, 0);
    for (const t of [this.a, this.b, this.slope]) {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setClearColor(this._color, a);
    r.setRenderTarget(prev);
    this.count = 0;
  }

  /** Sample solid obstacles once on a coarse grid. */
  setSolids(fn, cell = 0.06) {
    const nx = Math.max(2, Math.round(this.w / cell)),
      nz = Math.max(2, Math.round(this.d / cell)),
      data = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      const z = this.z0 + ((j + 0.5) / nz) * this.d;
      for (let i = 0; i < nx; i++) data[j * nx + i] = fn(this.x0 + ((i + 0.5) / nx) * this.w, z) ? 255 : 0;
    }
    this.solid.dispose();
    this.solid = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
    this.solid.minFilter = this.solid.magFilter = THREE.LinearFilter;
    this.solid.unpackAlignment = 1;
    this.solid.needsUpdate = true;
    this.sim.uniforms.tSolid.value = this.solid;
  }

  add(x0, z0, x1, z1, radius, strength, shape = 1) {
    if (this.count >= this.cap) return;
    const i = ((this.head + this.count) % this.cap) * 7,
      q = this.q;
    q[i] = x0;
    q[i + 1] = z0;
    q[i + 2] = x1;
    q[i + 3] = z1;
    q[i + 4] = Math.max(radius, this.dx * 1.6);
    q[i + 5] = strength;
    q[i + 6] = shape;
    this.count++;
  }

  step() {
    const r = this.renderer,
      u = this.sim.uniforms,
      q = this.q;
    const n = Math.min(this.count, NSRC);
    for (let k = 0; k < n; k++) {
      const i = ((this.head + k) % this.cap) * 7;
      u.uSrcA.value[k].set(q[i], q[i + 1], q[i + 2], q[i + 3]);
      u.uSrcB.value[k].set(q[i + 4], q[i + 5], q[i + 6], 0);
    }
    this.head = (this.head + n) % this.cap;
    this.count -= n;
    u.uCount.value = n;

    const prevTarget = r.getRenderTarget(),
      prevAuto = r.autoClear,
      prevXr = r.xr.enabled,
      prevShadow = r.shadowMap.autoUpdate,
      prevNeeds = r.shadowMap.needsUpdate;
    r.autoClear = false;
    r.xr.enabled = false;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = false;
    u.tState.value = this.a.texture;
    this.quad.material = this.sim;
    r.setRenderTarget(this.b);
    r.render(this.scene, this.cam);
    const t = this.a;
    this.a = this.b;
    this.b = t;
    this.grad.uniforms.tState.value = this.a.texture;
    this.quad.material = this.grad;
    r.setRenderTarget(this.slope);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.xr.enabled = prevXr;
    r.shadowMap.autoUpdate = prevShadow;
    r.shadowMap.needsUpdate = prevNeeds;
  }

  dispose() {
    this.a.dispose();
    this.b.dispose();
    this.slope.dispose();
    this.solid.dispose();
    this.sim.dispose();
    this.grad.dispose();
    this.quad.geometry.dispose();
  }
}
