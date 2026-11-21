import * as THREE from 'three';
import { WATER_Y } from '../../core/constants.js';
import { GLSL_OUT, PREMULTIPLIED_BLENDING, updatePassUniforms, blankTexture } from './common.js';

const mistVert = (probe) => /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
uniform float uTime;
uniform vec4 uDom;
uniform vec2 uWind;
uniform float uWaterY, uCentre;
varying vec2 vUv;
varying vec3 vW;
varying vec4 vI;
varying vec4 vAir;
${probe.glsl}
void main() {
  vec2 c = iA.xy + uWind * uTime * iA.w;
  vec2 rel = mod(c - uDom.xy + uDom.zw, 2.0 * uDom.zw) - uDom.zw;
  vec2 xz = uDom.xy + rel;
  float edge = smoothstep(uDom.z, uDom.z - 5.0, abs(rel.x)) * smoothstep(uDom.w, uDom.w - 5.0, abs(rel.y));
  float gather = max(smoothstep(5.0, 11.5, abs(xz.x)), smoothstep(9.0, 17.0, abs(xz.y)));
  float a = iB.z * edge * mix(uCentre, 1.0, gather);
  vec3 base = vec3(xz.x, uWaterY + iB.w, xz.y);
  vec2 toCam = cameraPosition.xz - base.xz;
  vec2 rt = normalize(vec2(toCam.y, -toCam.x) + 1e-5);
  vec3 wp = base + vec3(rt.x, 0.0, rt.y) * (position.x * iB.x) + vec3(0.0, (position.y + 0.5) * iB.y, 0.0);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vUv = position.xy + 0.5; vW = wp; vI = vec4(iA.z, a, iB.x, -mv.z);
  vAir = fxAir(cameraPosition, wp);
  gl_Position = a > 0.002 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const mistFrag = (probe) => /* glsl */ `
uniform sampler2D tNoise;
uniform sampler2D tDepth;
uniform float uTime, uSoft, uGain, uOpacity;
uniform vec2 uRes, uNearFar;
uniform vec4 uWho[2];
uniform vec4 uGust[3];
varying vec2 vUv;
varying vec3 vW;
varying vec4 vI;
varying vec4 vAir;
${probe.glsl}
#include <packing>
void main() {
  float u = vUv.x, v = vUv.y, seed = vI.x;
  float mx = 1.0 - (u * 2.0 - 1.0) * (u * 2.0 - 1.0); mx *= mx;
  float my = smoothstep(0.0, 0.22, v) * pow(1.0 - v, 1.5) * 2.2;
  vec2 nuv = vec2(u * vI.z * 0.055 + seed * 7.3 + uTime * 0.004, v * 0.32 + seed * 3.1);
  float n = texture2D(tNoise, nuv).r;
  float w = texture2D(tNoise, nuv * vec2(2.3, 1.6) + vec2(uTime * 0.007, uTime * 0.002)).g;
  float a = smoothstep(0.42, 0.98, n * 0.72 + w * 0.42) * mx * my * vI.y * uOpacity;
  for (int i = 0; i < 2; i++) { vec2 d = vW.xz - uWho[i].xy; a *= 1.0 - uWho[i].w * exp(-dot(d, d) / (uWho[i].z * uWho[i].z)); }
  for (int i = 0; i < 3; i++) {
    float tau = uTime - uGust[i].z; if (tau < 0.0 || tau > 9.0) continue;
    float R = 1.2 + tau * 3.2; vec2 d = vW.xz - uGust[i].xy;
    a *= 1.0 - clamp(uGust[i].w * exp(-tau * 0.55) * (1.0 - exp(-tau * 6.0)) * exp(-dot(d, d) / (R * R)), 0.0, 0.95);
  }
  vec3 ray = vW - cameraPosition; float dist = length(ray); ray /= dist;
  a *= smoothstep(1.2, 5.5, dist) * (1.0 - smoothstep(40.0, 60.0, dist));
  if (uSoft > 0.5) {
    float sceneZ = -perspectiveDepthToViewZ(texture2D(tDepth, gl_FragCoord.xy / uRes).x, uNearFar.x, uNearFar.y);
    a *= clamp((sceneZ - vI.w) / 0.9, 0.0, 1.0);
  }
  a = clamp(a, 0.0, 1.0);
  if (a < 0.002) discard;
  float toMoon = max(dot(ray, uMoonDir), 0.0);
  vec3 light = fxMistCol() * 1.25 + fxMoonGlow() * (0.6 + 5.0 * toMoon * toMoon * toMoon * toMoon) + fxPoints(vW) * 0.02;
  light = light * (0.8 + 0.4 * w) * vAir.a + vAir.rgb;
  gl_FragColor = vec4(light * a * uGain, a);
  ${GLSL_OUT}
}`;

export class Mist {
  constructor(ctx, probe, noise, rng, count = 84) {
    this.ctx = ctx;
    this.count = count;
    this.gusts = 0;
    const geo = (this.geometry = new THREE.InstancedBufferGeometry());
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
    );
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const A = new Float32Array(count * 4),
      B = new Float32Array(count * 4);
    const hx = 17,
      hz = 26;
    for (let i = 0; i < count; i++) {
      const o = i * 4,
        tall = rng.next();
      A[o] = rng.signed() * hx;
      A[o + 1] = rng.signed() * hz;
      A[o + 2] = rng.next();
      A[o + 3] = 0.6 + 0.8 * rng.next();
      B[o] = 6.5 + 5.5 * rng.next();
      B[o + 1] = 0.75 + 1.25 * tall * tall;
      B[o + 2] = 0.5 + 0.5 * rng.next();
      B[o + 3] = -0.04;
    }
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
    geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 4));
    geo.instanceCount = count;
    this.who = [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)];
    this.gust = [new THREE.Vector4(0, 0, -100, 0), new THREE.Vector4(0, 0, -100, 0), new THREE.Vector4(0, 0, -100, 0)];
    const u = (this.uniforms = Object.assign(
      {
        uTime: { value: 0 },
        uDom: { value: new THREE.Vector4(0, -1, hx, hz) },
        uWind: { value: new THREE.Vector2(0.075, 0.1) },
        uWaterY: { value: WATER_Y },
        uCentre: { value: 0.42 },
        tNoise: { value: noise },
        tDepth: { value: blankTexture() },
        uSoft: { value: 0 },
        uGain: { value: 1 },
        uOpacity: { value: 0.06 },
        uRes: { value: new THREE.Vector2(1600, 900) },
        uNearFar: { value: new THREE.Vector2(0.1, 400) },
        uWho: { value: this.who },
        uGust: { value: this.gust },
      },
      probe.uniforms,
    ));
    const mat = (this.material = Object.assign(
      new THREE.ShaderMaterial({
        name: 'fx.mist',
        uniforms: u,
        vertexShader: mistVert(probe),
        fragmentShader: mistFrag(probe),
      }),
      PREMULTIPLIED_BLENDING,
    ));
    const mesh = (this.mesh = new THREE.Mesh(geo, mat));
    mesh.name = 'fx.mist';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 10;
    mesh.layers.set(2);
    mesh.onBeforeRender = (renderer, scene, camera) => {
      updatePassUniforms(renderer, camera, ctx, u);
      mat.uniformsNeedUpdate = true;
    };
  }
  blow(x, z, power, time) {
    const g = this.gust[this.gusts++ % 3];
    g.set(x, z, time, Math.min(0.95, power));
  }
  update(_time) {
    const p = this.ctx.player,
      b = this.ctx.boss;
    if (p) this.who[0].set(p.pos.x, p.pos.z, 1.5, 0.75);
    if (b) this.who[1].set(b.pos.x, b.pos.z, 3.6, b.alive === false ? 0.3 : 0.8);
  }
  frame(clock) {
    this.uniforms.uTime.value = clock;
  }
  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

const dustVert = (probe) => /* glsl */ `
attribute vec4 iA;
uniform float uTime, uGain;
uniform vec3 uBox, uShaftA, uShaftDir;
uniform float uShaftR;
uniform vec2 uRes;
varying vec2 vUv;
varying vec3 vCol;
${probe.glsl}
void main() {
  float seed = iA.w;
  vec3 p = iA.xyz * uBox + vec3(sin(uTime * 0.11 + seed * 40.0) * 0.7, uTime * (0.015 + 0.03 * fract(seed * 7.0)) * (fract(seed * 3.0) > 0.4 ? -1.0 : 1.0), cos(uTime * 0.09 + seed * 23.0) * 0.7) + vec3(0.06, 0.0, 0.08) * uTime;
  vec3 q;
  q.xz = cameraPosition.xz + mod(p.xz - cameraPosition.xz + 0.5 * uBox.xz, uBox.xz) - 0.5 * uBox.xz;
  q.y = 0.12 + mod(p.y, uBox.y);
  q += 0.05 * vec3(sin(uTime * 0.7 + seed * 90.0), sin(uTime * 0.9 + seed * 50.0), cos(uTime * 0.8 + seed * 70.0));
  vec3 rel = q - uShaftA; float along = dot(rel, uShaftDir); vec3 perp = rel - uShaftDir * along; float dr = length(perp);
  vec3 e1 = normalize(cross(uShaftDir, vec3(0.0, 1.0, 0.0))), e2 = cross(uShaftDir, e1);
  float ang = atan(dot(perp, e1), dot(perp, e2));
  float lanes = 0.35 + 0.65 * smoothstep(-0.3, 0.5, cos(ang * 8.0) * cos(dr * 2.2 + 0.6));
  float shaft = (1.0 - smoothstep(uShaftR * 0.7, uShaftR, dr)) * step(0.0, along) * lanes;
  vec3 light = (uAmbCol * 0.07 + uMoonCol * shaft * 0.5 + fxCandleGlow(q.y) * 0.22 + fxPoints(q) * 0.1) * fxAir(cameraPosition, q).a;
  vec4 mv = viewMatrix * vec4(q, 1.0);
  float depth = max(-mv.z, 0.05);
  float px = depth * 2.0 / (projectionMatrix[1][1] * uRes.y);
  float size = 0.006 + 0.012 * fract(seed * 11.0);
  float nearK = 1.0 + 2.2 * (1.0 - smoothstep(0.4, 2.2, depth));
  float w = max(size * nearK, 3.0 * px);
  float tw = 0.45 + 0.55 * sin(seed * 60.0 + uTime * (0.6 + 1.6 * fract(seed * 17.0)));
  float fade = (1.0 - smoothstep(11.0, 17.0, depth)) * smoothstep(0.15, 0.5, depth);
  vCol = light * tw * fade * uGain * min(1.0, size / w) * 6.0;
  vUv = position.xy;
  mv.xy += position.xy * w;
  gl_Position = dot(vCol, vec3(1.0)) > 0.0015 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const DUST_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float d2 = dot(vUv, vUv) * 4.0; if (d2 >= 1.0) discard;
  gl_FragColor = vec4(vCol * exp(-d2 * 3.5) * (1.0 - d2), 0.0);
  ${GLSL_OUT}
}`;

export class Dust {
  constructor(ctx, probe, rng, count = 1500) {
    this.ctx = ctx;
    const geo = (this.geometry = new THREE.InstancedBufferGeometry());
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
    );
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const A = new Float32Array(count * 4);
    for (let i = 0; i < A.length; i++) A[i] = rng.next();
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
    geo.instanceCount = count;
    const u = (this.uniforms = Object.assign(
      {
        uTime: { value: 0 },
        uGain: { value: 1 },
        uBox: { value: new THREE.Vector3(26, 9.5, 26) },
        uShaftA: { value: new THREE.Vector3(0, 15, -25.5) },
        uShaftDir: { value: new THREE.Vector3(0, -0.35, 0.94) },
        uShaftR: { value: 5 },
        uRes: { value: new THREE.Vector2(1600, 900) },
      },
      probe.uniforms,
    ));
    const mat = (this.material = Object.assign(
      new THREE.ShaderMaterial({
        name: 'fx.dust',
        uniforms: u,
        vertexShader: dustVert(probe),
        fragmentShader: DUST_FRAG,
      }),
      PREMULTIPLIED_BLENDING,
    ));
    const mesh = (this.mesh = new THREE.Mesh(geo, mat));
    mesh.name = 'fx.dust';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 11;
    mesh.layers.set(2);
    mesh.onBeforeRender = (renderer, scene, camera) => {
      updatePassUniforms(renderer, camera, ctx, u);
      mat.uniformsNeedUpdate = true;
    };
    this.next = 0;
  }
  update(time) {
    if (time < this.next) return;
    this.next = time + 2;
    const a = this.ctx.arena,
      u = this.uniforms;
    if (a && a.window) {
      u.uShaftA.value.set(a.window.x, a.window.y, a.window.z);
      u.uShaftR.value = a.window.r || 5;
    }
    if (a && a.moonDir) u.uShaftDir.value.copy(a.moonDir).negate().normalize();
  }
  frame(clock) {
    this.uniforms.uTime.value = clock;
  }
  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
