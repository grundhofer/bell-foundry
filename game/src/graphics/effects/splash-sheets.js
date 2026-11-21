import * as THREE from 'three';
import { WATER_Y } from '../../core/constants.js';
import { GLSL_OUT, PREMULTIPLIED_BLENDING } from './common.js';

const U = 80,
  V = 9,
  G = 9.8;

const vert = (probe) => /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
attribute vec4 iD;
uniform float uTime;
uniform float uWaterY;
uniform sampler2D tNoise;
varying vec4 vUvN;
varying vec4 vP;
varying vec4 vLight;
varying vec4 vTint;
${probe.glsl}
void main() {
  float u = position.x, v = position.y;
  float tau = uTime - iA.z, life = iC.x, age = tau / life;
  float alive = step(0.0, tau) * step(tau, life);
  float arc = iB.x, R = max(iB.y, 0.4);
  float th = iA.w + (u * 2.0 - 1.0) * arc;
  float s = iC.z * 37.0;
  float ua = th * max(1.0, floor(R * 0.6 + 0.5)) / 6.2831853;
  float lobe = textureLod(tNoise, vec2(ua + iC.z * 3.0, iC.z * 7.0 + 0.2), 0.0).r;
  float spike = textureLod(tNoise, vec2(ua * 3.0 + 0.4, iC.z * 5.0 + 0.6), 0.0).g;
  float thin = textureLod(tNoise, vec2(ua * 8.0 + 0.7, iC.z * 3.0 + 0.1), 0.0).g;
  float lobes = 0.72 + 0.3 * lobe;
  float c = lobes + (0.3 * spike * spike + 0.14 * thin * thin) * v * v;
  float launch = iB.w * c * pow(v, 0.72);
  float y = launch * tau - ${(G * 0.5).toFixed(2)} * tau * tau;
  float r = iB.y + iB.z * (0.25 + 0.75 * v) * (0.7 + 0.45 * lobes) * (1.0 - exp(-1.3 * tau)) / 1.3;
  vec3 wp = vec3(iA.x + sin(th) * r, uWaterY + max(y, 0.0), iA.y + cos(th) * r);
  vec3 radial = vec3(sin(th), 0.0, cos(th));
  float facing = 0.55 + 0.45 * dot(radial, normalize(vec3(uMoonDir.x, 0.0, uMoonDir.z) + 1e-4));
  vec3 light = (uAmbCol * 0.9 + uMoonCol * (0.1 + 0.22 * facing) + fxPoints(wp) * 0.35) * fxAir(cameraPosition, wp).a;
  float kx = max(1.0, floor(R * 1.1 + 0.5)) / 6.2831853;
  vUvN = vec4(u, v, th * kx + iC.z * 9.0, v * 0.5 + iC.z * 3.0 - tau * 0.05);
  vP = vec4(age, iC.z, y, arc < 3.1 ? 1.0 : 0.0);
  vLight = vec4(light, iC.y * alive);
  vTint = iD; vTint.w = iC.w;
  gl_Position = alive > 0.5 ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tNoise;
uniform float uGain;
varying vec4 vUvN;
varying vec4 vP;
varying vec4 vLight;
varying vec4 vTint;
void main() {
  float u = vUvN.x, v = vUvN.y, age = vP.x, h = vP.z, drops = vTint.w;
  vec2 nuv = vUvN.zw;
  vec4 n = texture2D(tNoise, nuv);
  vec4 n2 = texture2D(tNoise, nuv * vec2(2.6, 1.3) + 0.31);
  vec4 n3 = texture2D(tNoise, nuv * vec2(5.0, 0.8) + 0.67);
  float strands = n.b * 0.5 + n2.b * 0.3 + n3.b * 0.2;
  float f = strands * 0.7 + n2.g * 0.3 + (1.0 - v) * 0.3;
  float worn = mix(0.1, 0.96, age) + v * v * 0.2;
  float dens = smoothstep(worn, worn + 0.24, f);
  float rim = smoothstep(worn + 0.3, worn + 0.04, f) * dens;
  float dots = smoothstep(0.3, 0.6, texture2D(tNoise, nuv * vec2(7.0, 1.6) + 0.19).a);
  dens *= mix(1.0, 0.25 + 1.6 * dots, clamp(drops + 0.35 + age * 0.6, 0.0, 1.0));
  float a = dens * smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.8, 1.0, v)) * mix(1.0, 0.7, v) * (1.0 - smoothstep(0.75, 1.0, age));
  if (vP.w > 0.5) a *= smoothstep(0.0, 0.16, u) * smoothstep(1.0, 0.84, u);
  a = clamp(a * vLight.a, 0.0, 1.0);
  if (a < 0.003) discard;
  vec3 col = vLight.rgb * vTint.rgb * (0.35 + 2.2 * rim + 1.2 * dots + 0.8 * strands * strands);
  gl_FragColor = vec4(col * a * uGain, a * 0.85);
  ${GLSL_OUT}
}`;

export class SplashSheets {
  constructor(ctx, probe, noise, capacity = 24) {
    this.ctx = ctx;
    this.capacity = capacity;
    this.head = 0;
    this.until = -1;
    this.now = 0;
    this.dirty = false;
    const pos = new Float32Array((U + 1) * (V + 1) * 3),
      idx = [];
    for (let j = 0; j <= V; j++)
      for (let i = 0; i <= U; i++) {
        const o = (j * (U + 1) + i) * 3;
        pos[o] = i / U;
        pos[o + 1] = j / V;
      }
    for (let j = 0; j < V; j++)
      for (let i = 0; i < U; i++) {
        const a = j * (U + 1) + i,
          b = a + 1,
          c = a + U + 1,
          d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    const geo = (this.geometry = new THREE.InstancedBufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.attr = ['iA', 'iB', 'iC', 'iD'].map((name) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    });
    geo.instanceCount = capacity;
    for (let o = 2; o < capacity * 4; o += 4) this.attr[0].array[o] = -1e6;
    const mat = (this.material = Object.assign(
      new THREE.ShaderMaterial({
        name: 'fx.sheets',
        uniforms: Object.assign(
          { uTime: { value: 0 }, uWaterY: { value: WATER_Y }, tNoise: { value: noise }, uGain: { value: 1 } },
          probe.uniforms,
        ),
        vertexShader: vert(probe),
        fragmentShader: FRAG,
      }),
      PREMULTIPLIED_BLENDING,
    ));
    const mesh = (this.mesh = new THREE.Mesh(geo, mat));
    mesh.name = 'fx.sheets';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 12;
    mesh.visible = false;
  }

  spawn(x, z, yaw, arc, r0, out, up, opacity = 0.5, drops = 0.25, delay = 0, seed = 0.5, r = 0.74, g = 0.81, b = 0.9) {
    const i = this.head,
      o = i * 4,
      [A, B, C, D] = this.attr,
      life = (2 * up * 1.25) / G;
    A.array[o] = x;
    A.array[o + 1] = z;
    A.array[o + 2] = this.now + delay;
    A.array[o + 3] = yaw;
    B.array[o] = arc;
    B.array[o + 1] = r0;
    B.array[o + 2] = out;
    B.array[o + 3] = up;
    C.array[o] = life;
    C.array[o + 1] = opacity;
    C.array[o + 2] = seed;
    C.array[o + 3] = drops;
    D.array[o] = r;
    D.array[o + 1] = g;
    D.array[o + 2] = b;
    D.array[o + 3] = 1;
    this.head = (i + 1) % this.capacity;
    this.dirty = true;
    const end = this.now + delay + life;
    if (end > this.until) this.until = end;
    return life;
  }
  update(time) {
    this.now = time;
    this.mesh.visible = time <= this.until + 0.05;
  }
  frame(time) {
    this.material.uniforms.uTime.value = time;
    if (this.dirty) {
      this.dirty = false;
      for (const a of this.attr) a.needsUpdate = true;
    }
  }
  rebase(by) {
    const a = this.attr[0].array;
    for (let o = 2; o < a.length; o += 4) a[o] -= by;
    this.until -= by;
    this.now -= by;
    this.dirty = true;
  }
  clear() {
    const a = this.attr[2].array;
    for (let o = 0; o < a.length; o += 4) a[o] = 0;
    this.until = -1;
    this.dirty = true;
    this.mesh.visible = false;
  }
  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
