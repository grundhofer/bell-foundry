import * as THREE from 'three';
import { WATER_Y } from '../../core/constants.js';
import { Rng, GLSL_OUT, PREMULTIPLIED_BLENDING } from './common.js';

// Foundry-only marks of the boss weapon hitting the floor: sparks, dust, a cooling crack, molten bronze, a shock ring.
// Presentation only: nothing here feeds back into the fight.

const G = 9.8,
  CELL = 256,
  HEAD = 0.7; // hammer head centre, metres behind the tip anchor
const BUDGET = {
  low: { sparks: 0.4, drops: 6, cracks: 6, splats: 10 },
  medium: { sparks: 0.7, drops: 14, cracks: 10, splats: 20 },
  high: { sparks: 1, drops: 22, cracks: 14, splats: 32 },
  ultra: { sparks: 1.2, drops: 28, cracks: 14, splats: 32 },
};
const MAX = { drops: 96, cracks: 14, splats: 32, rings: 4, later: 8 };
const CRACK = { life: 7.5, fade: 7 },
  SPLAT = { life: 2.2, fade: 3.5 };
const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _f = new THREE.Vector3(),
  _t = new THREE.Vector3(),
  _b = new THREE.Vector3();
const _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _m = new THREE.Matrix4(),
  _c = new THREE.Color(),
  _z = new THREE.Vector3(0, 0, 1);

function crackAtlas(rng) {
  const size = CELL * 2,
    segs = [[], [], [], []],
    blobs = [[], [], [], []];
  const walk = (k, x, y, a, len, w, depth) => {
    const n = 6 + ((rng.next() * 4) | 0),
      step = len / n;
    for (let i = 0; i < n; i++) {
      a += (rng.next() - 0.5) * 0.7;
      const nx = x + Math.cos(a) * step,
        ny = y + Math.sin(a) * step,
        ww = w * (1 - i / (n + 2));
      segs[k].push([x, y, nx, ny, ww]);
      if (depth < 2 && rng.next() < 0.28)
        walk(
          k,
          nx,
          ny,
          a + (rng.next() < 0.5 ? -1 : 1) * (0.5 + 0.5 * rng.next()),
          len * (0.35 + 0.25 * rng.next()),
          ww * 0.7,
          depth + 1,
        );
      x = nx;
      y = ny;
    }
  };
  for (let k = 0; k < 2; k++) {
    const n = 5 + k * 2,
      a0 = rng.next() * 6.283;
    for (let i = 0; i < n; i++)
      walk(
        k,
        CELL / 2,
        CELL / 2,
        a0 + (i / n) * 6.283 + (rng.next() - 0.5) * 0.5,
        CELL * (0.3 + 0.17 * rng.next()),
        4.5,
        0,
      );
    blobs[k].push([CELL / 2, CELL / 2, 9]);
  }
  walk(2, CELL / 2, CELL / 2, 0, CELL * 0.46, 5, 0);
  walk(2, CELL / 2, CELL / 2, Math.PI, CELL * 0.46, 5, 0);
  blobs[2].push([CELL / 2, CELL / 2, 7]);
  blobs[3].push([CELL / 2, CELL / 2, CELL * 0.16]);
  for (let i = 0; i < 9; i++) {
    const a = rng.next() * 6.283,
      r = CELL * (0.14 + 0.24 * rng.next());
    blobs[3].push([CELL / 2 + Math.cos(a) * r, CELL / 2 + Math.sin(a) * r, CELL * (0.02 + 0.04 * rng.next())]);
  }
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * 6.283,
      r = CELL * 0.3;
    segs[3].push([CELL / 2, CELL / 2, CELL / 2 + Math.cos(a) * r, CELL / 2 + Math.sin(a) * r, 5]);
  }

  const layer = (widen, blur, scorch) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    for (let k = 0; k < 4; k++) {
      const ox = (k % 2) * CELL,
        oy = (k >> 1) * CELL;
      g.save();
      g.beginPath();
      g.rect(ox, oy, CELL, CELL);
      g.clip();
      g.translate(ox, oy);
      if (scorch) {
        const r = k === 3 ? CELL * 0.42 : CELL * 0.48,
          gr = g.createRadialGradient(CELL / 2, CELL / 2, 0, CELL / 2, CELL / 2, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)');
        gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        if (k === 2) {
          g.translate(CELL / 2, CELL / 2);
          g.scale(1, 0.32);
          g.translate(-CELL / 2, -CELL / 2);
        }
        g.fillRect(0, 0, CELL, CELL);
      } else {
        g.strokeStyle = '#fff';
        g.fillStyle = '#fff';
        g.lineCap = 'round';
        g.shadowColor = '#fff';
        g.shadowBlur = blur;
        for (const s of segs[k]) {
          g.lineWidth = Math.max(0.8, s[4] * widen);
          g.beginPath();
          g.moveTo(s[0], s[1]);
          g.lineTo(s[2], s[3]);
          g.stroke();
        }
        for (const b of blobs[k]) {
          g.beginPath();
          g.arc(b[0], b[1], b[2] * (widen > 1 ? 1.4 : 1), 0, 6.283);
          g.fill();
        }
      }
      g.restore();
    }
    return g.getImageData(0, 0, size, size).data;
  };
  const core = layer(1, 0, false),
    glow = layer(3.5, 14, false),
    soot = layer(1, 0, true);
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = core[i];
    px[i + 1] = glow[i];
    px[i + 2] = soot[i];
    px[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(px, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  tex.name = 'impacts.cracks';
  return tex;
}

const DECAL_VERT = /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
uniform float uTime;
varying vec2 vUv;
varying vec4 vC;
varying vec3 vT;
void main() {
  float age = uTime - iB.z;
  vec2 p = vec2(position.x * iB.x, position.z * iB.y);
  float c = cos(iA.w), s = sin(iA.w);
  vec3 wp = vec3(iA.x + p.x * c - p.y * s, iA.y, iA.z + p.x * s + p.y * c);
  vec2 cell = vec2(mod(iC.x, 2.0), floor(iC.x / 2.0));
  vUv = (uv * 0.97 + 0.015 + cell) * 0.5;
  vC = iC; vT = vec3(age, iB.w, length(uv - 0.5) * 2.0);
  bool alive = age >= 0.0 && age <= iB.w + iC.w;
  gl_Position = alive ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const DECAL_FRAG = /* glsl */ `
uniform sampler2D tCrack;
uniform float uTime;
uniform float uCalm;
varying vec2 vUv;
varying vec4 vC;
varying vec3 vT;
vec3 ramp(float h) {
  vec3 c = mix(vec3(0.0), vec3(0.5, 0.04, 0.01), smoothstep(0.0, 0.22, h));
  c = mix(c, vec3(1.0, 0.3, 0.04), smoothstep(0.18, 0.5, h));
  c = mix(c, vec3(1.0, 0.72, 0.32), smoothstep(0.45, 0.8, h));
  return mix(c, vec3(1.0, 0.96, 0.88), smoothstep(0.8, 1.0, h));
}
void main() {
  vec4 t = texture2D(tCrack, vUv);
  float age = vT.x, life = vT.y, d = vT.z;
  float open = smoothstep(d - 0.15, d, age * 9.0);
  float k = clamp(age / life, 0.0, 1.0), heat = pow(1.0 - k, 1.25);
  float h = clamp(heat * (0.45 + 0.7 * t.r) - 0.25 * d * k, 0.0, 1.0);
  float flash = 1.0 + 2.5 * uCalm * (1.0 - smoothstep(0.0, 0.2, age));
  float flicker = 0.88 + 0.12 * sin(uTime * 21.0 + vC.y * 40.0 + d * 13.0);
  float gain = mix(0.6, 13.0, h * h) * (0.55 + 0.45 * vC.z) * flash * flicker;
  vec3 em = ramp(h) * gain * (t.r + 0.4 * t.g * h) * open;
  float fade = 1.0 - smoothstep(life, life + vC.w, age);
  float dark = clamp((t.b * 0.7 + t.r * 0.85) * open * fade, 0.0, 0.92);
  gl_FragColor = vec4(em * fade, dark);
  ${GLSL_OUT}
}`;

class Decals {
  constructor(mat, cap, name) {
    const geo = new THREE.InstancedBufferGeometry(),
      plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    geo.index = plane.index;
    geo.attributes.position = plane.attributes.position;
    geo.attributes.uv = plane.attributes.uv;
    this.A = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.B = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4).fill(-1e4), 4);
    this.C = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (let i = 0; i < cap; i++) this.B.array[i * 4 + 3] = 0;
    geo.setAttribute('iA', this.A);
    geo.setAttribute('iB', this.B);
    geo.setAttribute('iC', this.C);
    geo.instanceCount = cap;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -90;
    this.mesh.layers.set(2);
    this.mesh.visible = false;
    this.cap = cap;
    this.head = 0;
    this.until = -1;
  }
  add(x, y, z, rot, sx, sz, born, life, variant, seed, power, fade, limit) {
    const i = this.head;
    this.head = (this.head + 1) % Math.max(1, Math.min(this.cap, limit));
    const o = i * 4;
    this.A.array.set([x, y, z, rot], o);
    this.B.array.set([sx, sz, born, life], o);
    this.C.array.set([variant, seed, power, fade], o);
    this.A.needsUpdate = this.B.needsUpdate = this.C.needsUpdate = true;
    this.until = Math.max(this.until, born + life + fade);
    this.mesh.visible = true;
  }
  clear() {
    this.B.array.fill(-1e4);
    for (let i = 0; i < this.cap; i++) this.B.array[i * 4 + 3] = 0;
    this.B.needsUpdate = true;
    this.until = -1;
    this.mesh.visible = false;
    this.head = 0;
  }
}

const RING_SEG = 72;
const RING_VERT = /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
uniform float uTime;
varying vec3 vQ;
void main() {
  float age = uTime - iA.w, k = clamp(age / iB.z, 0.0, 1.0);
  float R = mix(iB.x, iB.y, 1.0 - pow(1.0 - k, 2.4)), w = mix(0.06, 0.45, k) * (0.6 + 0.4 * iB.w);
  float th = position.x * 6.2831853, rr = max(0.01, R + position.y * w);
  vec3 wp = vec3(iA.x + cos(th) * rr, iA.y, iA.z + sin(th) * rr);
  vQ = vec3(position.y, k, th);
  bool alive = age >= 0.0 && age <= iB.z;
  gl_Position = alive ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const RING_FRAG = /* glsl */ `
uniform float uCalm;
varying vec3 vQ;
void main() {
  float q = vQ.x, k = vQ.y;
  float edge = smoothstep(-1.0, 0.35, q) * (1.0 - smoothstep(0.35, 1.0, q));
  float broken = 0.75 + 0.25 * sin(vQ.z * 17.0 + k * 9.0) * sin(vQ.z * 5.0 - k * 4.0);
  vec3 col = mix(vec3(1.0, 0.55, 0.25) * 1.6, vec3(0.5, 0.58, 0.66) * 0.5, smoothstep(0.0, 0.45, k));
  gl_FragColor = vec4(col * edge * broken * pow(1.0 - k, 2.5) * uCalm, 0.0);
  ${GLSL_OUT}
}`;

function ringGeometry() {
  const n = RING_SEG + 1,
    pos = new Float32Array(n * 2 * 3),
    idx = [];
  for (let i = 0; i < n; i++) {
    pos.set([i / RING_SEG, -1, 0], i * 3);
    pos.set([i / RING_SEG, 1, 0], (n + i) * 3);
  }
  for (let i = 0; i < RING_SEG; i++) idx.push(i, n + i, i + 1, n + i, n + i + 1, i + 1);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Impacts {
  constructor(ctx) {
    this.ctx = ctx;
    this.on = !ctx.params.has('novfx');
    this.t = 0;
    this.off = false;
    this.wet = false;
    if (!this.on) return;
    this.rng = new Rng(20261120);
    this.group = new THREE.Group();
    this.group.name = 'impacts';
    ctx.scene.add(this.group);
    this.u = { uTime: { value: 0 }, uCalm: { value: 1 }, tCrack: { value: crackAtlas(new Rng(7)) } };
    this.decalMat = new THREE.ShaderMaterial(
      Object.assign(
        {
          uniforms: this.u,
          vertexShader: DECAL_VERT,
          fragmentShader: DECAL_FRAG,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        },
        PREMULTIPLIED_BLENDING,
      ),
    );
    this.decalMat.side = THREE.FrontSide;
    this.cracks = new Decals(this.decalMat, MAX.cracks, 'impacts.cracks');
    this.splats = new Decals(this.decalMat, MAX.splats, 'impacts.splats');
    this.group.add(this.cracks.mesh, this.splats.mesh);

    const rg = ringGeometry();
    this.ringA = new THREE.InstancedBufferAttribute(new Float32Array(MAX.rings * 4).fill(-1e4), 4);
    this.ringB = new THREE.InstancedBufferAttribute(new Float32Array(MAX.rings * 4).fill(1), 4);
    rg.setAttribute('iA', this.ringA);
    rg.setAttribute('iB', this.ringB);
    rg.instanceCount = MAX.rings;
    this.ringMat = new THREE.ShaderMaterial(
      Object.assign({ uniforms: this.u, vertexShader: RING_VERT, fragmentShader: RING_FRAG }, PREMULTIPLIED_BLENDING),
    );
    this.ringMesh = new THREE.Mesh(rg, this.ringMat);
    this.ringMesh.name = 'impacts.rings';
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = -89;
    this.ringMesh.layers.set(2);
    this.ringMesh.visible = false;
    this.ringHead = 0;
    this.ringUntil = -1;
    this.group.add(this.ringMesh);

    this.drops = [];
    for (let i = 0; i < MAX.drops; i++)
      this.drops.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heat: 1, size: 0.03, seed: 0 });
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 7, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
      MAX.drops,
    );
    this.dropMesh.name = 'impacts.bronze';
    this.dropMesh.frustumCulled = false;
    this.dropMesh.count = 0;
    this.dropMesh.castShadow = false;
    for (let i = 0; i < MAX.drops; i++) this.dropMesh.setColorAt(i, _c.setRGB(1, 1, 1));
    this.group.add(this.dropMesh);
    this.later = [];
    for (let i = 0; i < MAX.later; i++) this.later.push({ on: false, t: 0, x: 0, z: 0, power: 1, radius: 1 });

    const bus = ctx.bus;
    this.offs = [
      bus.on('boss-slam', (e) => {
        if (e && e.weapon) this.guard(() => this.strike(e));
      }),
      bus.on('state', (e) => {
        if (e && (e.to === 'fight' || e.to === 'title' || e.to === 'intro') && e.from !== 'phase' && e.from !== 'intro')
          this.clear();
      }),
    ];
  }

  guard(fn) {
    if (this.off) return;
    try {
      fn();
    } catch (e) {
      this.off = true;
      this.group.visible = false;
      console.error('impacts: switched off after an error: ' + (e && e.stack ? e.stack : e));
    }
  }
  budget() {
    const q = this.ctx.gfx && this.ctx.gfx.quality;
    return BUDGET[q] || BUDGET.high;
  }
  calm() {
    const s = this.ctx.ui && this.ctx.ui.settings;
    return !!(s && s.reducedMotion);
  }
  floorAt(x, z) {
    const a = this.ctx.arena,
      g = a && a.ground ? a.ground(x, z) : 0;
    this.wet = g < WATER_Y - 0.01;
    return this.wet ? WATER_Y + 0.006 : g + 0.006;
  }

  strike(e) {
    const ctx = this.ctx,
      game = ctx.game;
    if (!ctx.look || (game && game.state !== 'fight')) return;
    const B = this.budget(),
      calm = this.calm(),
      r = this.rng,
      power = Math.max(0.2, Math.min(1.5, e.power === undefined ? 1 : e.power));
    const sw = ctx.boss && ctx.boss.kit && ctx.boss.kit.sword;
    const hammer = !!(sw && sw.kind === 'hammer'),
      line = !!e.line && !hammer;
    let x = e.pos.x,
      z = e.pos.z,
      fx = 0,
      fz = 1,
      len = 0;
    if (sw && sw.tip && sw.base) {
      sw.tip.getWorldPosition(_t);
      sw.base.getWorldPosition(_b);
      fx = _t.x - _b.x;
      fz = _t.z - _b.z;
      len = Math.hypot(fx, fz);
      if (len > 1e-3) {
        fx /= len;
        fz /= len;
      } else {
        fx = 0;
        fz = 1;
      }
      if (hammer) {
        const L = _t.distanceTo(_b),
          u = L > 1 ? 1 - HEAD / L : 1;
        x = _b.x + (_t.x - _b.x) * u;
        z = _b.z + (_t.z - _b.z) * u;
      } else if (!line) {
        x = _t.x;
        z = _t.z;
      }
    }
    const y = this.floorAt(x, z),
      wet = this.wet,
      t = this.t;
    _p.set(x, y + 0.05, z);

    const rot = Math.atan2(fz, fx);
    if (line && len > 1)
      this.cracks.add(
        x,
        y,
        z,
        rot,
        Math.min(8, len * 1.25),
        1.4 + 0.8 * power,
        t,
        CRACK.life * (0.8 + 0.3 * power),
        2,
        r.next(),
        power,
        CRACK.fade,
        B.cracks,
      );
    else {
      const s = 2.2 + 2.6 * power;
      this.cracks.add(
        x,
        y,
        z,
        r.next() * 6.283,
        s,
        s,
        t,
        CRACK.life * (0.7 + 0.4 * power),
        (r.next() * 2) | 0,
        r.next(),
        power,
        CRACK.fade,
        B.cracks,
      );
    }

    const vfx = ctx.vfx;
    if (vfx && !vfx.off) {
      const n = Math.round((10 + 26 * power) * B.sparks);
      if (calm) {
        if (vfx.embers) vfx.embers(_p, Math.round(n * 0.5));
      } else if (vfx.sparks) {
        _d.set(fx * 0.55, 1, fz * 0.55).normalize();
        vfx.sparks(_p, _d, n, 1.2 + power);
        _d.set(-fx * 0.3 + fz * 0.6, 0.8, -fz * 0.3 - fx * 0.6).normalize();
        vfx.sparks(_p, _d, Math.round(n * 0.5), 0.8 + power);
      }
      if (vfx.embers) vfx.embers(_p, Math.round((6 + 10 * power) * B.sparks));
      if (vfx.dust) {
        const k = Math.round((3 + 5 * power) * Math.min(1, B.sparks + 0.2));
        for (let i = 0; i < k; i++) {
          const a = (i / k) * 6.283 + r.next(),
            d = 0.3 + 0.6 * power;
          _f.set(x + Math.cos(a) * d, y + 0.1, z + Math.sin(a) * d);
          vfx.dust(_f, 1);
        }
      }
    }

    const nd = Math.round(B.drops * Math.min(1.2, 0.35 + 0.6 * power));
    for (let i = 0, made = 0; i < this.drops.length && made < nd; i++) {
      const q = this.drops[i];
      if (q.on) continue;
      made++;
      const a = r.next() * 6.283,
        out = (1.2 + 3.8 * r.next()) * (0.7 + 0.3 * power),
        up = (2.4 + 4.2 * r.next()) * (0.75 + 0.25 * power);
      q.on = true;
      q.x = x + Math.cos(a) * 0.15;
      q.y = y + 0.08;
      q.z = z + Math.sin(a) * 0.15;
      q.vx = Math.cos(a) * out + fx * 1.2;
      q.vy = up;
      q.vz = Math.sin(a) * out + fz * 1.2;
      q.heat = 1;
      q.size = 0.018 + 0.03 * r.next() * r.next();
      q.seed = r.next();
    }

    const R = 2.5 + 3.5 * power,
      i = this.ringHead;
    this.ringHead = (this.ringHead + 1) % MAX.rings;
    this.ringA.array.set([x, (wet ? WATER_Y : y) + 0.012, z, t], i * 4);
    this.ringB.array.set([0.3, R, 0.45 + 0.2 * power, power], i * 4);
    this.ringA.needsUpdate = this.ringB.needsUpdate = true;
    this.ringUntil = Math.max(this.ringUntil, t + 0.7);
    this.ringMesh.visible = true;
    this.queue(0.12, x, z, 2.2 * power, R * 0.45);
    this.queue(0.3, x, z, 1.4 * power, R * 0.8);
  }

  queue(after, x, z, power, radius) {
    for (const l of this.later)
      if (!l.on) {
        l.on = true;
        l.t = this.t + after;
        l.x = x;
        l.z = z;
        l.power = power;
        l.radius = radius;
        return;
      }
  }

  splash(q) {
    const ctx = this.ctx,
      y = this.floorAt(q.x, q.z),
      wet = this.wet,
      r = this.rng,
      s = q.size * (5 + 4 * r.next());
    this.splats.add(
      q.x,
      y + 0.002,
      q.z,
      r.next() * 6.283,
      s,
      s,
      this.t,
      SPLAT.life * (wet ? 0.6 : 1),
      3,
      r.next(),
      0.5 + 0.5 * q.heat,
      SPLAT.fade,
      this.budget().splats,
    );
    const vfx = ctx.vfx;
    _f.set(q.x, y + 0.03, q.z);
    if (vfx && !vfx.off) {
      if (vfx.embers && r.next() < 0.6) vfx.embers(_f, 2);
      if (wet && vfx.dust && r.next() < 0.35) vfx.dust(_f, 1);
    }
    if (wet && ctx.water && ctx.water.ripple) ctx.water.ripple(q.x, q.z, 0.25, 0.12);
  }

  update(dt) {
    if (this.on && !this.off) this.guard(() => this.step(dt));
  }
  step(dt) {
    this.t += dt;
    for (const q of this.drops) {
      if (!q.on) continue;
      q.vy -= G * dt;
      const drag = 1 - 0.25 * dt;
      q.vx *= drag;
      q.vz *= drag;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      q.heat = Math.max(0, q.heat - dt * 0.5);
      if (q.vy < 0 && q.y <= this.floorAt(q.x, q.z)) {
        q.on = false;
        this.splash(q);
      } else if (q.y < -1) q.on = false;
    }
    for (const l of this.later)
      if (l.on && this.t >= l.t) {
        l.on = false;
        const w = this.ctx.water;
        if (w && w.ripple) w.ripple(l.x, l.z, l.power, l.radius);
      }
    if (this.cracks.mesh.visible && this.t > this.cracks.until) this.cracks.mesh.visible = false;
    if (this.splats.mesh.visible && this.t > this.splats.until) this.splats.mesh.visible = false;
    if (this.ringMesh.visible && this.t > this.ringUntil) this.ringMesh.visible = false;
  }

  frame(dt, alpha = 0) {
    if (this.on && !this.off) this.guard(() => this.draw(alpha));
  }
  draw(alpha) {
    const DT = this.ctx.DT || 1 / 60,
      lead = alpha * DT;
    this.u.uTime.value = this.t + lead;
    this.u.uCalm.value = this.calm() ? 0.4 : 1;
    const m = this.dropMesh;
    let n = 0;
    for (const q of this.drops) {
      if (!q.on) continue;
      _p.set(q.x + q.vx * lead, q.y + q.vy * lead, q.z + q.vz * lead);
      _d.set(q.vx, q.vy, q.vz);
      const sp = _d.length();
      if (sp > 1e-4) _d.divideScalar(sp);
      else _d.copy(UP);
      _q.setFromUnitVectors(_z, _d);
      _s.set(q.size, q.size, q.size * (1 + sp * 0.12));
      _m.compose(_p, _q, _s);
      m.setMatrixAt(n, _m);
      const h = q.heat,
        g = 0.6 + 7 * h * h;
      _c.setRGB(1.0 * g, (0.25 + 0.4 * h) * g, (0.05 + 0.2 * h * h) * g);
      m.setColorAt(n, _c);
      n++;
    }
    m.count = n;
    if (n) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    if (!this.on) return;
    this.cracks.clear();
    this.splats.clear();
    for (const q of this.drops) q.on = false;
    this.dropMesh.count = 0;
    for (const l of this.later) l.on = false;
    this.ringA.array.fill(-1e4);
    this.ringA.needsUpdate = true;
    this.ringMesh.visible = false;
    this.ringUntil = -1;
  }

  dispose() {
    if (!this.on) return;
    for (const off of this.offs) off();
    this.ctx.scene.remove(this.group);
    this.cracks.mesh.geometry.dispose();
    this.splats.mesh.geometry.dispose();
    this.decalMat.dispose();
    this.u.tCrack.value.dispose();
    this.ringMesh.geometry.dispose();
    this.ringMat.dispose();
    this.dropMesh.geometry.dispose();
    this.dropMesh.material.dispose();
    this.dropMesh.dispose();
  }
}
