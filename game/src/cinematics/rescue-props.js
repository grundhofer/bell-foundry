import * as THREE from 'three';
import { WATER_Y } from '../core/constants.js';
import {
  GLSL_OUT,
  PREMULTIPLIED_BLENDING,
  updatePassUniforms,
  blankTexture,
  makeNoiseTexture,
} from '../graphics/effects/common.js';

export const SPOTLIGHT = {
  height: 18,
  radius: 1.45,
  color: [1.0, 0.95, 0.86],
  lamp: 5200,
  beam: 0.04,
  pool: 0.4,
  bounce: 7,
};

const _c = new THREE.Color();

const BEAM_VERT = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const BEAM_FRAG = /* glsl */ `
uniform sampler2D tNoise;
uniform sampler2D tDepth;
uniform float uSoft, uTime, uGain, uTan, uLen, uFloor, uR;
uniform vec2 uRes, uNearFar;
uniform vec3 uApex, uColor;
varying vec3 vW;
#include <packing>
float density(vec3 p) {
  vec3 q = p - uApex; float h = -q.y;
  if (h <= 0.0 || h > uLen) return 0.0;
  float R = h * uTan, r = length(q.xz), x = r / R;
  float edge = 1.0 - smoothstep(0.78, 1.0, x);
  float core = 0.55 + 0.45 * (1.0 - x * x);
  float near = clamp(uR / R, 1.0, 7.0);
  float fromDark = smoothstep(0.5, 5.0, h);
  float ang = atan(q.z, q.x);
  float n = texture2D(tNoise, vec2(ang * 0.32 + x * 0.25, h * 0.045 - uTime * 0.012)).r;
  float m = texture2D(tNoise, vec2(p.x * 0.35 + uTime * 0.01, p.z * 0.35 + h * 0.08)).a;
  float dust = 0.72 + 0.5 * n + 1.4 * m * m * m;
  float foot = 1.0 + 0.5 * exp(-max(p.y - uFloor, 0.0) * 2.5);
  return edge * core * near * fromDark * dust * foot;
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vW - ro);
  float c2 = 1.0 / (1.0 + uTan * uTan);
  vec3 co = ro - uApex; vec3 V = vec3(0.0, -1.0, 0.0);
  float dv = dot(rd, V), cv = dot(co, V);
  float A = dv * dv - c2, Bq = 2.0 * (dv * cv - dot(rd, co) * c2), Cq = cv * cv - dot(co, co) * c2;
  float t0 = 0.0, t1 = length(vW - ro);
  float disc = Bq * Bq - 4.0 * A * Cq;
  bool inside = Cq > 0.0 && cv > 0.0;
  if (disc > 0.0 && abs(A) > 1e-6) {
    float s = sqrt(disc), ta = (-Bq - s) / (2.0 * A), tb = (-Bq + s) / (2.0 * A);
    float lo = min(ta, tb), hi = max(ta, tb);
    bool loOk = dot(co + rd * lo, V) > 0.0, hiOk = dot(co + rd * hi, V) > 0.0;
    if (inside) { t0 = 0.0; t1 = min(t1, (loOk && lo > 0.0) ? lo : ((hiOk && hi > 0.0) ? hi : t1)); }
    else if (loOk && hiOk) { t0 = max(lo, 0.0); t1 = min(t1, hi); }
    else if (hiOk) { t0 = max(hi, 0.0); }
    else if (loOk) { t1 = min(t1, lo); }
  }
  if (abs(rd.y) > 1e-5) {
    float tf = (uFloor - ro.y) / rd.y, ta2 = (uApex.y - ro.y) / rd.y;
    if (rd.y < 0.0) { t1 = min(t1, tf); t0 = max(t0, ta2); } else { t0 = max(t0, tf); t1 = min(t1, ta2); }
  }
  if (uSoft > 0.5) {
    float sceneZ = -perspectiveDepthToViewZ(texture2D(tDepth, gl_FragCoord.xy / uRes).x, uNearFar.x, uNearFar.y);
    vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    t1 = min(t1, sceneZ / max(dot(rd, fwd), 1e-3));
  }
  if (t1 <= t0) discard;
  const int STEPS = 22;
  float dt = (t1 - t0) / float(STEPS);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float sum = 0.0;
  for (int i = 0; i < STEPS; i++) { float t = t0 + (float(i) + jitter) * dt; sum += density(ro + rd * t) * smoothstep(1.0, 7.0, t); }
  sum *= dt;
  float cs = dot(rd, vec3(0.0, 1.0, 0.0)), g = 0.35, hg = pow((1.0 + g * g) / (1.0 + g * g - 2.0 * g * cs), 1.5);
  vec3 col = uColor * (sum * uGain * hg);
  if (dot(col, vec3(1.0)) < 1e-4) discard;
  gl_FragColor = vec4(col, 0.0);
  ${GLSL_OUT}
}`;

const POOL_FRAG = /* glsl */ `
uniform float uGain, uTime;
uniform vec3 uColor;
uniform sampler2D tNoise;
varying vec2 vUv;
void main() {
  vec2 d = vUv * 2.0 - 1.0; float r = length(d);
  float edge = 1.0 - smoothstep(0.62, 1.0, r);
  float lift = 0.55 + 0.45 * (1.0 - r * r);
  float n = texture2D(tNoise, d * 0.6 + vec2(uTime * 0.01, 0.0)).r;
  float halo = 0.12 * exp(-max(0.0, r - 1.0) * 9.0) * step(1.0, r);
  float i = edge * lift * (0.9 + 0.2 * n) + halo;
  if (i < 1e-3) discard;
  gl_FragColor = vec4(uColor * (i * uGain), 0.0);
  ${GLSL_OUT}
}`;

const ADD = { ...PREMULTIPLIED_BLENDING, fog: false };

export class RescueProps {
  constructor(ctx) {
    this.ctx = ctx;
    this.time = 0;
    this.level = 0;
    this.at = new THREE.Vector3();
    const scene = ctx.scene,
      noise = (this.noise = makeNoiseTexture());
    const group = (this.group = new THREE.Group());
    group.name = 'rescue';
    scene.add(group);
    const col = new THREE.Color().setRGB(SPOTLIGHT.color[0], SPOTLIGHT.color[1], SPOTLIGHT.color[2]);

    const len = SPOTLIGHT.height - WATER_Y,
      tan = SPOTLIGHT.radius / len,
      top = 0.4;
    const cone = new THREE.CylinderGeometry(top * tan * 1.05 + 0.02, SPOTLIGHT.radius * 1.05, len - top, 48, 1, false);
    cone.translate(0, -(top + (len - top) / 2), 0);
    const bu = (this.beamU = {
      tNoise: { value: noise },
      tDepth: { value: blankTexture() },
      uSoft: { value: 0 },
      uRes: { value: new THREE.Vector2(1600, 900) },
      uNearFar: { value: new THREE.Vector2(0.1, 400) },
      uTime: { value: 0 },
      uGain: { value: 0 },
      uTan: { value: tan },
      uLen: { value: len },
      uFloor: { value: WATER_Y },
      uR: { value: SPOTLIGHT.radius },
      uApex: { value: new THREE.Vector3(0, SPOTLIGHT.height, 0) },
      uColor: { value: col.clone() },
    });
    const beamMat = (this.beamMat = Object.assign(
      new THREE.ShaderMaterial({
        name: 'rescue.beam',
        uniforms: bu,
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
      }),
      ADD,
      { side: THREE.BackSide, depthTest: false },
    ));
    const beam = (this.beam = new THREE.Mesh(cone, beamMat));
    beam.name = 'rescue:beam';
    beam.frustumCulled = false;
    beam.renderOrder = 16;
    beam.onBeforeRender = (renderer, sc, camera) => {
      updatePassUniforms(renderer, camera, ctx, bu);
      beamMat.uniformsNeedUpdate = true;
    };
    group.add(beam);

    const pu = (this.poolU = {
      uGain: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: col.clone() },
      tNoise: { value: noise },
    });
    const disc = new THREE.PlaneGeometry(SPOTLIGHT.radius * 2.6, SPOTLIGHT.radius * 2.6);
    disc.rotateX(-Math.PI / 2);
    const poolMat = (this.poolMat = Object.assign(
      new THREE.ShaderMaterial({
        name: 'rescue.pool',
        uniforms: pu,
        fragmentShader: POOL_FRAG,
        vertexShader:
          'varying vec2 vUv; void main() { vUv = (uv - 0.5) * 1.3 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      }),
      ADD,
      { depthTest: true },
    ));
    const pool = (this.pool = new THREE.Mesh(disc, poolMat));
    pool.name = 'rescue:pool';
    pool.frustumCulled = false;
    pool.renderOrder = 15;
    pool.layers.set(2);
    group.add(pool);

    const L = ctx.gfx.lights;
    this.lamp = L && L.spot ? L.spot : null;
    if (this.lamp) this.lamp.color.copy(col);
    this.bounce = L && L.managed && L.managed.flash && L.managed.flash[1] ? L.managed.flash[1] : null;
    if (this.bounce) this.bounce.userData.noAir = true;
    this.side = new THREE.Vector3(1, 0, 0);

    // what the old founder brings: look/recast.js puts the molten drop in here and sets its height
    const offering = (this.offering = new THREE.Group());
    offering.name = 'rescue:offering';
    this.height = 0;
    this.glow = new THREE.Color(1.0, 0.66, 0.26);
    this.boost = 1;
    group.add(offering);
    this.hide();
  }

  spot(x, z, level, side) {
    this.level = level;
    this.at.set(x, WATER_Y, z);
    const on = level > 1e-3;
    this.beam.visible = on;
    this.pool.visible = on;
    this.beam.position.set(x, SPOTLIGHT.height, z);
    this.beamU.uApex.value.set(x, SPOTLIGHT.height, z);
    this.pool.position.set(x, WATER_Y + 0.004, z);
    this.beamU.uGain.value = SPOTLIGHT.beam * level;
    this.poolU.uGain.value = SPOTLIGHT.pool * level;
    const L = this.lamp;
    if (L) {
      L.intensity = SPOTLIGHT.lamp * level;
      L.position.set(x, SPOTLIGHT.height, z);
      L.target.position.set(x, 0, z);
      L.angle = Math.atan((SPOTLIGHT.radius * 1.08) / SPOTLIGHT.height);
      L.penumbra = 0.2;
      L.distance = 0;
      L.decay = 2;
      L.updateMatrixWorld();
      L.target.updateMatrixWorld();
    }
    const Bn = this.bounce;
    if (Bn) {
      if (side) this.side.copy(side);
      if (!(this.boost > 1)) Bn.color.copy(this.lamp ? this.lamp.color : Bn.color);
      Bn.intensity = SPOTLIGHT.bounce * level * (this.boost || 1);
      Bn.position.set(x + this.side.x * 0.95, WATER_Y + 0.35, z + this.side.z * 0.95);
      Bn.updateMatrixWorld();
    }
  }

  show(on) {
    this.offering.visible = on;
    if (on) this.burst(0);
  }
  hide() {
    this.offering.visible = false;
    this.spot(0, 0, 0);
  }

  burst(k) {
    const s = k <= 0 ? 1 : Math.max(0.001, 1 - k * k * (3 - 2 * k));
    this.offering.scale.setScalar(s);
    const glow = k > 0 ? Math.sin(Math.min(1, k * 1.25) * Math.PI) : 0;
    if (this.bounce) {
      _c.copy(this.lamp ? this.lamp.color : this.glow).lerp(this.glow, glow);
      this.bounce.color.copy(_c);
      this.boost = 1 + 0.6 * glow;
    }
    if (k >= 1) {
      this.offering.visible = false;
      this.boost = 1;
    }
  }

  update(dt) {
    this.time += dt;
    this.beamU.uTime.value = this.time;
    this.poolU.uTime.value = this.time;
  }
}
