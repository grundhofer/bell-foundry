// Sample and blend animation clips without a Three.js mixer.
import * as THREE from 'three';
import { TAU, DEG, clamp } from '../core/math.js';

export const stripMixamoPrefix = (n) => n.replace(/^mixamorig\d*:?/, '');
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const FLIP = 0.16;
const SNAP_HIPS = Math.cos(0.45 / 2),
  SNAP_SPINE = Math.cos(0.2 / 2);
const unsmooth = (y) => (y <= 0 ? 0 : y >= 1 ? 1 : 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3));
const _v = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _qy = new THREE.Quaternion(),
  _up = new THREE.Vector3(0, 1, 0),
  _m = new THREE.Matrix4(),
  _s = new THREE.Vector3();

function qmul(o, oi, a, ai, b, bi) {
  const ax = a[ai],
    ay = a[ai + 1],
    az = a[ai + 2],
    aw = a[ai + 3],
    bx = b[bi],
    by = b[bi + 1],
    bz = b[bi + 2],
    bw = b[bi + 3];
  o[oi] = ax * bw + aw * bx + ay * bz - az * by;
  o[oi + 1] = ay * bw + aw * by + az * bx - ax * bz;
  o[oi + 2] = az * bw + aw * bz + ax * by - ay * bx;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}
function qcmul(o, oi, a, ai, b, bi) {
  const ax = -a[ai],
    ay = -a[ai + 1],
    az = -a[ai + 2],
    aw = a[ai + 3],
    bx = b[bi],
    by = b[bi + 1],
    bz = b[bi + 2],
    bw = b[bi + 3];
  o[oi] = ax * bw + aw * bx + ay * bz - az * by;
  o[oi + 1] = ay * bw + aw * by + az * bx - ax * bz;
  o[oi + 2] = az * bw + aw * bz + ax * by - ay * bx;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}
function qnorm(o, oi) {
  const x = o[oi],
    y = o[oi + 1],
    z = o[oi + 2],
    w = o[oi + 3],
    l = Math.sqrt(x * x + y * y + z * z + w * w);
  if (l > 1e-12) {
    const k = 1 / l;
    o[oi] = x * k;
    o[oi + 1] = y * k;
    o[oi + 2] = z * k;
    o[oi + 3] = w * k;
  } else {
    o[oi] = 0;
    o[oi + 1] = 0;
    o[oi + 2] = 0;
    o[oi + 3] = 1;
  }
}
const _r = new Float64Array(3);
function qrot(q, qi, x, y, z) {
  const qx = q[qi],
    qy = q[qi + 1],
    qz = q[qi + 2],
    qw = q[qi + 3];
  const tx = 2 * (qy * z - qz * y),
    ty = 2 * (qz * x - qx * z),
    tz = 2 * (qx * y - qy * x);
  _r[0] = x + qw * tx + qy * tz - qz * ty;
  _r[1] = y + qw * ty + qz * tx - qx * tz;
  _r[2] = z + qw * tz + qx * ty - qy * tx;
  return _r;
}
function qaxis(o, oi, x, y, z, angle) {
  const h = angle * 0.5,
    s = Math.sin(h);
  o[oi] = x * s;
  o[oi + 1] = y * s;
  o[oi + 2] = z * s;
  o[oi + 3] = Math.cos(h);
}

function splitYaw(q, o) {
  const x = q[o],
    y = q[o + 1],
    z = q[o + 2],
    w = q[o + 3],
    l = Math.hypot(y, w);
  if (l < 1e-6) return 0;
  const sy = y / l,
    cw = w / l;
  q[o] = cw * x - sy * z;
  q[o + 1] = 0;
  q[o + 2] = cw * z + sy * x;
  q[o + 3] = l;
  return wrapPi(2 * Math.atan2(y, w));
}
function joinYaw(q, o, yaw) {
  const sy = Math.sin(yaw * 0.5),
    cw = Math.cos(yaw * 0.5),
    x = q[o],
    y = q[o + 1],
    z = q[o + 2],
    w = q[o + 3];
  q[o] = cw * x + sy * z;
  q[o + 1] = cw * y + sy * w;
  q[o + 2] = cw * z - sy * x;
  q[o + 3] = cw * w - sy * y;
}

export class Rig {
  constructor(model) {
    this.model = model;
    this.bones = [];
    this.index = {};
    model.traverse((n) => {
      if (n.isBone) {
        this.index[stripMixamoPrefix(n.name)] = this.bones.length;
        this.bones.push(n);
      }
    });
    const n = (this.count = this.bones.length);
    this.parent = new Int16Array(n);
    this.rest = new Float32Array(n * 4);
    this.restPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const b = this.bones[i];
      this.parent[i] = b.parent && b.parent.isBone ? this.index[stripMixamoPrefix(b.parent.name)] : -1;
      b.quaternion.toArray(this.rest, i * 4);
      b.position.toArray(this.restPos, i * 3);
    }
    this.hips = this.index.Hips;
    this.rest0 = this.rest.slice();
    this.fixQ = new Float32Array(n * 4);
    this.fixed = new Uint8Array(n);
    this._tpose = null;
    for (let i = 0; i < n; i++) this.fixQ[i * 4 + 3] = 1;
    const I = this.index,
      chain = (names) => names.map((k) => I[k]).filter((k) => k !== undefined);
    this.spine = chain(['Spine', 'Spine1', 'Spine2']);
    this.lookChain = chain(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']);
    this.baseQ = new Float32Array([0, 0, 0, 1]);
    this.baseP = new Float32Array(3);
    this.baseS = 1;
    this.refreshBase();
    this.fwd = new Float32Array(n * 3);
    this.restWorld = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = this.parent[i];
      if (p < 0) qmul(this.restWorld, i * 4, this.baseQ, 0, this.rest, i * 4);
      else qmul(this.restWorld, i * 4, this.restWorld, p * 4, this.rest, i * 4);
      const w = this.restWorld,
        o = i * 4;
      _q.set(-w[o], -w[o + 1], -w[o + 2], w[o + 3]);
      _v.set(0, 0, 1).applyQuaternion(_q);
      _v.toArray(this.fwd, i * 3);
    }
  }
  refreshBase() {
    const hips = this.bones[this.hips],
      top = this.model.parent || this.model;
    _m.identity();
    for (let o = hips.parent; o && o !== top; o = o.parent) {
      o.updateMatrix();
      _m.premultiply(o.matrix);
    }
    _m.decompose(_v, _q, _s);
    _v.toArray(this.baseP);
    _q.toArray(this.baseQ);
    this.baseS = _s.x;
  }
  bone(name) {
    return this.index[name];
  }
  setRestFix(map) {
    this.rest.set(this.rest0);
    this.fixed.fill(0);
    if (!map) return;
    for (const name in map) {
      const i = this.index[name],
        k = map[name];
      if (i === undefined || !k || k.length !== 4) continue;
      this.fixQ[i * 4] = k[0];
      this.fixQ[i * 4 + 1] = k[1];
      this.fixQ[i * 4 + 2] = k[2];
      this.fixQ[i * 4 + 3] = k[3];
      this.fixed[i] = 1;
      qmul(this.rest, i * 4, this.fixQ, i * 4, this.rest0, i * 4);
    }
    this._tpose = null;
  }
  tposeWorld() {
    if (!this._tpose) {
      const w = (this._tpose = new Float32Array(this.count * 4));
      for (let i = 0; i < this.count; i++) {
        const p = this.parent[i];
        if (p < 0) qmul(w, i * 4, this.baseQ, 0, this.rest, i * 4);
        else qmul(w, i * 4, w, p * 4, this.rest, i * 4);
      }
    }
    return this._tpose;
  }
  mask(names, feather) {
    const m = new Float32Array(this.count);
    for (const name of names) {
      const i = this.index[name];
      if (i !== undefined) m[i] = 1;
    }
    for (let i = 0; i < this.count; i++) {
      const p = this.parent[i];
      if (p >= 0 && m[p] === 1) m[i] = 1;
    }
    if (feather)
      for (const k in feather) {
        const i = this.index[k];
        if (i !== undefined) m[i] = Math.max(m[i], feather[k]);
      }
    return m;
  }
}

export function namedMask(rig, name) {
  if (name instanceof Float32Array) return name;
  if (Array.isArray(name)) return rig.mask(name);
  switch (name) {
    case 'upper':
      return rig.mask(['Spine2'], { Spine: 0.35, Spine1: 0.7 });
    case 'arms':
      return rig.mask(['LeftShoulder', 'RightShoulder']);
    case 'left-arm':
      return rig.mask(['LeftShoulder']);
    case 'right-arm':
      return rig.mask(['RightShoulder']);
    case 'head':
      return rig.mask(['Neck']);
    case 'torso':
      return rig.mask(['Spine']);
    case 'legs':
      return rig.mask(['LeftUpLeg', 'RightUpLeg']);
    case 'left-leg':
      return rig.mask(['LeftUpLeg']);
    case 'right-leg':
      return rig.mask(['RightUpLeg']);
    case 'lower':
      return rig.mask(['LeftUpLeg', 'RightUpLeg'], { Hips: 1 });
    case 'all':
      return new Float32Array(rig.count).fill(1);
    default:
      throw new Error(`no mask named "${name}"`);
  }
}

/** Tracks with shared key times reuse one interval lookup. */
export function compileClip(rig, tracks, duration) {
  const groups = [];
  const same = (a, b) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const has = new Uint8Array(rig.count);
  for (const t of tracks) {
    const dot = t.name.lastIndexOf('.'),
      bone = rig.index[stripMixamoPrefix(t.name.slice(0, dot))],
      prop = t.name.slice(dot + 1);
    if (bone === undefined) continue;
    let g = groups.find((x) => same(x.times, t.times));
    if (!g) {
      const T = t.times,
        n = T.length;
      let uniform = n > 1,
        step = n > 1 ? (T[n - 1] - T[0]) / (n - 1) : 0;
      for (let i = 0; i < n && uniform; i++) if (Math.abs(T[i] - (T[0] + i * step)) > 1e-4) uniform = false;
      groups.push((g = { times: T, n, uniform, step, bones: [], values: [], pos: null }));
    }
    if (prop === 'quaternion') {
      g.bones.push(bone);
      g.values.push(t.values);
      has[bone] = 1;
    } else if (prop === 'position' && bone === rig.hips) g.pos = t.values;
  }
  return { groups, duration, has };
}

export function sampleClip(rig, c, t, out, pos) {
  out.set(rig.rest);
  const h = rig.hips * 3;
  pos[0] = rig.restPos[h];
  pos[1] = rig.restPos[h + 1];
  pos[2] = rig.restPos[h + 2];
  for (let gi = 0; gi < c.groups.length; gi++) {
    const g = c.groups[gi],
      T = g.times,
      n = g.n;
    let i = 0,
      a = 0;
    if (n > 1) {
      if (t <= T[0]) {
        i = 0;
        a = 0;
      } else if (t >= T[n - 1]) {
        i = n - 2;
        a = 1;
      } else if (g.uniform) {
        i = Math.min(n - 2, Math.floor((t - T[0]) / g.step));
        if (T[i] > t) i--;
        else if (T[i + 1] <= t && i < n - 2) i++;
        a = (t - T[i]) / (T[i + 1] - T[i]);
      } else {
        let lo = 0,
          hi = n - 1;
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1;
          if (T[m] <= t) lo = m;
          else hi = m;
        }
        i = lo;
        a = (t - T[lo]) / (T[hi] - T[lo]);
      }
    }
    const p = i * 4,
      q = n > 1 ? p + 4 : p,
      bones = g.bones,
      vals = g.values,
      fixed = rig.fixed;
    for (let k = 0; k < bones.length; k++) {
      const v = vals[k],
        o = bones[k] * 4,
        ax = v[p],
        ay = v[p + 1],
        az = v[p + 2],
        aw = v[p + 3];
      let bx = v[q],
        by = v[q + 1],
        bz = v[q + 2],
        bw = v[q + 3];
      if (ax * bx + ay * by + az * bz + aw * bw < 0) {
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
      }
      out[o] = ax + (bx - ax) * a;
      out[o + 1] = ay + (by - ay) * a;
      out[o + 2] = az + (bz - az) * a;
      out[o + 3] = aw + (bw - aw) * a;
      if (fixed[bones[k]]) qmul(out, o, rig.fixQ, o, out, o);
    }
    if (g.pos) {
      const v = g.pos,
        p3 = i * 3,
        q3 = n > 1 ? p3 + 3 : p3;
      pos[0] = v[p3] + (v[q3] - v[p3]) * a;
      pos[1] = v[p3 + 1] + (v[q3 + 1] - v[p3 + 1]) * a;
      pos[2] = v[p3 + 2] + (v[q3 + 2] - v[p3 + 2]) * a;
    }
  }
}

export function extractRoot(times, posValues, rotValues) {
  const n = times.length,
    x = new Float32Array(n),
    z = new Float32Array(n),
    yaw = new Float32Array(n);
  const p = posValues,
    x0 = p[0],
    z0 = p[2];
  let path = 0;
  for (let i = 0; i < n; i++) {
    x[i] = p[i * 3] - x0;
    z[i] = p[i * 3 + 2] - z0;
    if (i) path += Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  if (rotValues) {
    let y0 = 0,
      last = 0;
    for (let i = 0; i < n; i++) {
      _q.fromArray(rotValues, i * 4);
      _v.set(0, 0, 1).applyQuaternion(_q);
      let a = Math.atan2(_v.x, _v.z);
      if (i === 0) y0 = a;
      a -= y0;
      while (a - last > Math.PI) a -= TAU;
      while (a - last < -Math.PI) a += TAU;
      yaw[i] = last = a;
    }
  }
  return { times, x, z, yaw, path, net: Math.hypot(x[n - 1], z[n - 1]), turn: yaw[n - 1], end: times[n - 1] };
}
export function removeRoot(root, posValues, rotValues) {
  const p = posValues,
    x0 = p[0],
    z0 = p[2];
  for (let i = 0; i < root.times.length; i++) {
    p[i * 3] = x0;
    p[i * 3 + 2] = z0;
  }
  if (rotValues)
    for (let i = 0; i < root.times.length; i++) {
      _qy.setFromAxisAngle(_up, -root.yaw[i]);
      _q.fromArray(rotValues, i * 4)
        .premultiply(_qy)
        .toArray(rotValues, i * 4);
    }
  else root.yaw.fill(0);
}
export function detrend(times, posValues) {
  const n = times.length,
    p = posValues,
    T = times[n - 1] - times[0],
    dx = p[(n - 1) * 3] - p[0],
    dz = p[(n - 1) * 3 + 2] - p[2];
  for (let i = 0; i < n; i++) {
    const f = (times[i] - times[0]) / T;
    p[i * 3] -= dx * f;
    p[i * 3 + 2] -= dz * f;
  }
  return [dx / T, dz / T];
}
function sampleRoot(root, t, out) {
  const T = root.times,
    n = T.length;
  if (t <= T[0]) {
    out.x = root.x[0];
    out.z = root.z[0];
    out.yaw = root.yaw[0];
    return out;
  }
  if (t >= T[n - 1]) {
    out.x = root.x[n - 1];
    out.z = root.z[n - 1];
    out.yaw = root.yaw[n - 1];
    return out;
  }
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (T[m] <= t) lo = m;
    else hi = m;
  }
  const k = (t - T[lo]) / (T[hi] - T[lo]);
  out.x = root.x[lo] + (root.x[hi] - root.x[lo]) * k;
  out.z = root.z[lo] + (root.z[hi] - root.z[lo]) * k;
  out.yaw = root.yaw[lo] + (root.yaw[hi] - root.yaw[lo]) * k;
  return out;
}
const _ra = { x: 0, z: 0, yaw: 0 },
  _rb = { x: 0, z: 0, yaw: 0 };
function rootSpan(root, a, b, m) {
  const A = sampleRoot(root, a, _ra),
    B = sampleRoot(root, b, _rb);
  const dx = B.x - A.x,
    dz = B.z - A.z,
    c0 = Math.cos(-A.yaw),
    s0 = Math.sin(-A.yaw);
  const lx = dx * c0 + dz * s0,
    lz = -dx * s0 + dz * c0;
  const c1 = Math.cos(m.yaw),
    s1 = Math.sin(m.yaw);
  m.x += lx * c1 + lz * s1;
  m.z += -lx * s1 + lz * c1;
  m.yaw += B.yaw - A.yaw;
}

let serial = 0;
export class ClipPlayback {
  constructor() {
    this.id = ++serial;
    this.entry = null;
    this.time = 0;
    this.timeScale = 1;
    this.loop = false;
    this.paused = false;
    this.start = 0;
    this.end = 0;
    this.alpha = 1;
    this.fade = 0;
    this.weight = 0;
    this.lastT = 0;
    this.wraps = 0;
    this.live = false;
    this.isMove = false;
    this.motion = { x: 0, z: 0, yaw: 0 };
    this.finished = false;
  }
  set(entry, o) {
    this.entry = entry;
    this.loop = o.loop;
    this.timeScale = o.speed;
    this.paused = false;
    this.start = o.start;
    this.end = o.end;
    this.time = clamp(o.at, 0, entry.duration);
    this.lastT = this.time;
    this.wraps = 0;
    this.alpha = o.fade > 0 ? 0 : 1;
    this.fade = o.fade;
    this.live = true;
    this.finished = false;
    return this;
  }
  get name() {
    return this.entry.name;
  }
  get duration() {
    return this.entry.duration;
  }
  get done() {
    return !this.loop && this.time >= this.end - 1e-3;
  }
  getClip() {
    return this.entry.clip;
  }
  isRunning() {
    return this.live && !this.paused && !this.done;
  }
  setEffectiveTimeScale(s) {
    this.timeScale = s;
    return this;
  }
  getEffectiveWeight() {
    return this.weight;
  }
  stop() {
    this.paused = true;
    return this;
  }
  advance(dt) {
    const m = this.motion;
    m.x = 0;
    m.z = 0;
    m.yaw = 0;
    this.lastT = this.time;
    this.wraps = 0;
    if (this.paused) return;
    const e = this.entry,
      root = e.root;
    let t = this.time + dt * this.timeScale;
    if (this.loop) {
      const len = this.end - this.start;
      if (len > 1e-6 && (t >= this.end || t < this.start)) {
        if (t >= this.end) {
          if (root) {
            rootSpan(root, this.time, this.end, m);
          }
          while (t >= this.end) {
            t -= len;
            this.wraps++;
            if (root && t >= this.end) rootSpan(root, this.start, this.end, m);
          }
          if (root) rootSpan(root, this.start, t, m);
        } else {
          if (root) rootSpan(root, this.time, this.start, m);
          while (t < this.start) {
            t += len;
            this.wraps--;
            if (root && t < this.start) rootSpan(root, this.end, this.start, m);
          }
          if (root) rootSpan(root, this.end, t, m);
        }
      } else if (root) rootSpan(root, this.time, t, m);
    } else {
      t = clamp(t, 0, this.end > 0 ? Math.max(this.end, this.time) : e.duration);
      if (root) rootSpan(root, this.time, t, m);
    }
    this.time = t;
  }
  sample(graph, out, pos) {
    sampleClip(graph.rig, this.entry.sampler, this.time, out, pos);
    if (graph.floorFit && this.entry.floor) pos[1] += floorAt(this.entry.floor, this.time);
  }
}
function floorAt(k, t) {
  const n = k.length;
  if (t <= k[0]) return k[1];
  if (t >= k[n - 2]) return k[n - 1];
  let i = 2;
  while (k[i] < t) i += 2;
  return k[i - 1] + ((k[i + 1] - k[i - 1]) * (t - k[i - 2])) / (k[i] - k[i - 2]);
}

export class LocomotionBlend {
  constructor(graph, set, opts) {
    this.id = ++serial;
    this.isMove = true;
    this.graph = graph;
    this.live = true;
    this.paused = false;
    this.alpha = 1;
    this.fade = 0;
    this.weight = 0;
    this.timeScale = 1;
    this.loop = true;
    this.motion = { x: 0, z: 0, yaw: 0 };
    this.wraps = 0;
    this.vx = 0;
    this.vz = 0;
    this.sx = 0;
    this.sz = 0;
    this.phase = 0;
    this.rate = 1;
    this.amp = 0;
    this.stand = 1;
    this.cycle = 1;
    this.theta = 0;
    this.pR = 0.5;
    this.idleTime = 0;
    this.stepL = false;
    this.stepR = false;
    this.lenL = 0.5;
    this.lenR = 0.5;
    this.entry = {
      name: '@move',
      loop: true,
      duration: 1,
      events: [],
      root: null,
      clip: null,
      kind: 'move',
      data: {},
      recover: null,
    };
    this.idle = set.idle ? graph.entry(set.idle) : null;
    this.clips = [];
    const add = (name, gait, angle, fallback) => {
      const e = name && graph.entry(name);
      if (!e) return;
      const d = e.data || {},
        T = e.duration;
      const tl = (e.events.find((x) => x.name === 'foot-l') || { t: 0 }).t,
        tr = (e.events.find((x) => x.name === 'foot-r') || { t: T / 2 }).t;
      let pr = ((tr - tl) / T) % 1;
      if (pr < 0) pr += 1;
      pr = clamp(pr, 0.2, 0.8);
      const ang = d.dir ? Math.atan2(d.dir[0], d.dir[1]) : angle;
      const st = d.stance,
        share = (a, b) => {
          let u = ((b - a) / T) % 1;
          if (u < 0) u += 1;
          return clamp(u, 0.05, 0.9);
        };
      this.clips.push({
        entry: e,
        name,
        gait,
        angle: ang,
        speed: d.groundSpeed || fallback,
        T,
        pl: tl / T,
        pr,
        uL: st ? share(st[0], st[1]) : 0.5,
        uR: st ? share(st[2], st[3]) : 0.5,
        w: 0,
        delta: 0,
        time: 0,
        pelvis: 0,
        stride: 0,
        mean: null,
        meanPos: new Float32Array(3),
      });
    };
    const dirs = { f: 0, l: Math.PI / 2, b: Math.PI, r: -Math.PI / 2 };
    for (const k in dirs) {
      if (set.walk && set.walk[k]) add(set.walk[k], 0, dirs[k], 1.4);
      if (set.run && set.run[k]) add(set.run[k], 1, dirs[k], 4);
    }
    if (set.sprint) add(set.sprint, 2, 0, 6.2);
    this.maxRate = (opts && opts.maxRate) || 1.45;
    this.baseGait = this.clips.some((c) => c.gait === 0) ? 0 : 1;
    this.families = [];
    this.active = 0;
    const slow = this.clips.filter((c) => c.gait === this.baseGait).reduce((m, c) => Math.min(m, c.speed), Infinity);
    this.standBelow = (opts && opts.standBelow) || 0.09 * (Number.isFinite(slow) ? slow : 1.4);
    if (this.clips.length) this.sort();
  }
  get name() {
    return '@move';
  }
  get duration() {
    return this.cycle;
  }
  get time() {
    return this.phase * this.cycle;
  }
  set time(v) {
    this.phase = (((v / this.cycle) % 1) + 1) % 1;
  }
  get done() {
    return false;
  }
  get start() {
    return 0;
  }
  get end() {
    return this.cycle;
  }
  getClip() {
    return null;
  }
  isRunning() {
    return this.live && !this.paused;
  }

  timeOf(c, ph, p) {
    const u = ph < p ? (ph / p) * c.pr : c.pr + ((ph - p) / (1 - p)) * (1 - c.pr);
    let f = (u + c.pl) % 1;
    if (f < 0) f += 1;
    return f * c.T;
  }
  sort() {
    const g = this.graph,
      rig = g.rig,
      P = g.tmpA,
      pp = g.posA,
      Q = g.tmpB,
      qp = g.posB,
      n = rig.count * 4,
      N = 12;
    const feet = [rig.index.LeftToeBase, rig.index.RightToeBase].filter((b) => b !== undefined),
      h = rig.hips;
    const reach = (pose, pos, ang, lo, hi) => {
      for (let f = 0; f < feet.length; f++) {
        const r = g.bonePos(pose, pos, feet[f]),
          u = r[0] * Math.sin(ang) + r[2] * Math.cos(ang);
        if (u < lo[f]) lo[f] = u;
        if (u > hi[f]) hi[f] = u;
      }
    };
    const span = (lo, hi) => {
      let s = 0;
      for (let f = 0; f < feet.length; f++) s += hi[f] - lo[f];
      return feet.length ? s / feet.length : 0;
    };
    for (const c of this.clips) {
      let sx = 0,
        sz = 0;
      const lo = [Infinity, Infinity],
        hi = [-Infinity, -Infinity];
      c.mean = new Float32Array(n);
      c.meanPos.fill(0);
      for (let k = 0; k < N; k++) {
        sampleClip(rig, c.entry.sampler, this.timeOf(c, k / N, c.pr), P, pp);
        const r = qrot(P, h * 4, rig.fwd[h * 3], rig.fwd[h * 3 + 1], rig.fwd[h * 3 + 2]);
        sx += r[0];
        sz += r[2];
        reach(P, pp, c.angle, lo, hi);
        accumulateQuaternions(c.mean, P, 1 / N, n, k === 0);
        c.meanPos[0] += pp[0] / N;
        c.meanPos[1] += pp[1] / N;
        c.meanPos[2] += pp[2] / N;
      }
      for (let o = 0; o < n; o += 4) qnorm(c.mean, o);
      c.pelvis = Math.atan2(sx, sz);
      c.stride = span(lo, hi);
    }
    const mixes = (a, b) => {
      if (a === b) return 1;
      const mid = a.angle + wrapPi(b.angle - a.angle) / 2,
        p = (a.pr + b.pr) / 2,
        lo = [Infinity, Infinity],
        hi = [-Infinity, -Infinity],
        out = g.pose;
      for (let k = 0; k < N; k++) {
        sampleClip(rig, a.entry.sampler, this.timeOf(a, k / N, p), P, pp);
        g.turnLegs(P, pp, wrapPi(mid - a.angle));
        sampleClip(rig, b.entry.sampler, this.timeOf(b, k / N, p), Q, qp);
        g.turnLegs(Q, qp, wrapPi(mid - b.angle));
        accumulateQuaternions(out, P, 0.5, n, true);
        accumulateQuaternions(out, Q, 0.5, n, false);
        for (let o = 0; o < n; o += 4) qnorm(out, o);
        pp[0] = (pp[0] + qp[0]) / 2;
        pp[1] = (pp[1] + qp[1]) / 2;
        pp[2] = (pp[2] + qp[2]) / 2;
        reach(out, pp, mid, lo, hi);
      }
      return span(lo, hi) / Math.max(1e-4, 0.5 * (a.stride + b.stride));
    };
    const base = this.clips.filter((c) => c.gait === this.baseGait);
    let fwd = base[0],
      back = base[0];
    for (const c of base) {
      if (Math.abs(c.angle) < Math.abs(fwd.angle)) fwd = c;
      if (Math.abs(c.angle) > Math.abs(back.angle)) back = c;
    }
    const anchors = [fwd];
    if (back !== fwd && Math.abs(back.angle) > 2.1 && mixes(fwd, back) < 0.62) anchors.push(back);
    this.mixTable = {};
    const fams = anchors.map((a) => ({
      anchor: a,
      clips: [],
      gaits: [[], [], []],
      w: [[], [], []],
      tot: [
        { S: 0, T: 1, L: 0, m: 0 },
        { S: 0, T: 1, L: 0, m: 0 },
        { S: 0, T: 1, L: 0, m: 0 },
      ],
      cost: 0,
      amp: 0,
      rate: 1,
      gw: [0, 0, 0],
      k: 0,
    }));
    for (const c of this.clips) {
      let placed = false;
      const score = anchors.map((a) => mixes(a, c));
      this.mixTable[c.name] = score.map((x) => +x.toFixed(2));
      score.forEach((x, i) => {
        if (x >= 0.62) {
          fams[i].clips.push(c);
          placed = true;
        }
      });
      if (!placed) {
        let best = 0;
        anchors.forEach((a, i) => {
          if (Math.abs(wrapPi(a.angle - c.angle)) < Math.abs(wrapPi(anchors[best].angle - c.angle))) best = i;
        });
        fams[best].clips.push(c);
      }
    }
    for (const f of fams)
      for (const c of f.clips) {
        f.gaits[c.gait].push(c);
        f.w[c.gait].push(0);
      }
    for (const f of fams) for (const l of f.gaits) l.sort((a, b) => a.angle - b.angle);
    for (const f of fams)
      f.pair = f.gaits.map((l) => l.map((c, i) => (l.length > 1 ? clamp(mixes(c, l[(i + 1) % l.length]), 0.5, 1) : 1)));
    this.families = fams;
    this.active = 0;
    fams[0].k = 1;
  }
  ask(fam, theta) {
    fam.cost = 9;
    for (let g = 0; g < 3; g++) {
      const list = fam.gaits[g],
        w = fam.w[g],
        tot = fam.tot[g];
      tot.S = 0;
      tot.T = 0;
      tot.L = 0;
      tot.m = 0;
      tot.k = 1;
      if (!list.length) continue;
      let lo = 0,
        hi = 0,
        dLo = Infinity,
        dHi = Infinity;
      for (let i = 0; i < list.length; i++) {
        w[i] = 0;
        let d = (theta - list[i].angle) % TAU;
        if (d < 0) d += TAU;
        if (d < dLo) {
          dLo = d;
          lo = i;
        }
        const e = d > 0 ? TAU - d : 0;
        if (e < dHi) {
          dHi = e;
          hi = i;
        }
      }
      const arc = dLo + dHi;
      if (lo !== hi && arc <= 2.4) {
        w[hi] = dLo / arc;
        w[lo] = 1 - w[hi];
        tot.m = 1;
        tot.k = 1 - (1 - fam.pair[g][lo]) * 4 * w[lo] * w[hi];
      } else {
        const i = dLo <= dHi ? lo : hi,
          d = Math.min(dLo, dHi);
        w[i] = 1;
        tot.m = g === this.baseGait ? 1 : clamp((70 * DEG - d) / (25 * DEG), 0, 1);
      }
      let cost = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (w[i] <= 0) continue;
        tot.S += w[i] * c.speed;
        tot.T += w[i] * c.T;
        tot.L += w[i] * c.speed * c.T;
        cost += w[i] * Math.abs(wrapPi(c.pelvis + wrapPi(theta - c.angle)));
      }
      tot.S *= tot.k;
      tot.L *= tot.k;
      if (g === this.baseGait) fam.cost = cost;
    }
    return fam;
  }
  mix(fam, s) {
    const W = fam.tot[0],
      R = fam.tot[1],
      P = fam.tot[2],
      gw = fam.gw;
    gw[0] = 0;
    gw[1] = 0;
    gw[2] = 0;
    fam.amp = 0;
    fam.rate = 1;
    const hasWalk = W.S > 0 && W.m > 0,
      hasRun = R.S > 0 && R.m > 0,
      hasSprint = P.S > 0 && P.m > 0;
    if (!hasWalk && !hasRun) return;
    const slowest = hasWalk ? W : R;
    if (s <= slowest.S) {
      fam.rate = clamp(Math.sqrt(s / slowest.S), 0.6, 1);
      fam.amp = clamp(s / (fam.rate * slowest.S), 0, 1);
      gw[hasWalk ? 0 : 1] = 1;
      return;
    }
    fam.amp = 1;
    if (!hasRun) {
      gw[0] = 1;
      return;
    }
    if (hasWalk && s < R.S) {
      gw[1] = clamp((s - W.S) / (R.S - W.S), 0, 1) * R.m;
      gw[0] = 1 - gw[1];
      return;
    }
    gw[1] = hasWalk ? R.m : 1;
    gw[0] = 1 - gw[1];
    if (hasSprint && s > R.S) {
      gw[2] = clamp((s - R.S) / (P.S - R.S), 0, 1) * P.m * gw[1];
      gw[1] -= gw[2];
    }
  }
  advance(dt) {
    const k = 1 - Math.exp(-dt * 9);
    this.sx += (this.vx - this.sx) * k;
    this.sz += (this.vz - this.sz) * k;
    const s = Math.hypot(this.sx, this.sz),
      fams = this.families;
    const theta = s > 1e-3 ? Math.atan2(this.sx, this.sz) : this.theta;
    this.theta = theta;
    if (this.flipT > 0) this.flipT -= dt;
    for (let i = 0; i < fams.length; i++) {
      this.ask(fams[i], theta);
      this.mix(fams[i], s);
    }
    if (fams.length > 1) {
      let best = this.active;
      for (let i = 0; i < fams.length; i++) if (fams[i].cost + 0.2 < fams[best].cost) best = i;
      this.active = best;
      const step = dt / 0.22;
      let sum = 0;
      for (let i = 0; i < fams.length; i++) {
        const f = fams[i];
        f.k = i === best ? Math.min(1, f.k + step) : Math.max(0, f.k - step);
        sum += f.k;
      }
      for (let i = 0; i < fams.length; i++) fams[i].k /= sum || 1;
    }
    let amp = 0,
      rate = 0,
      T = 0,
      L = 0,
      pr = 0,
      sum = 0,
      keep = 0;
    for (let i = 0; i < this.clips.length; i++) this.clips[i].w = 0;
    for (let i = 0; i < fams.length; i++) {
      const f = fams[i],
        kf = fams.length > 1 ? smooth01(f.k) : 1;
      if (kf <= 0) continue;
      amp += kf * f.amp;
      rate += kf * f.rate;
      for (let g = 0; g < 3; g++) {
        const list = f.gaits[g],
          w = f.w[g],
          gw = f.gw[g];
        if (gw <= 0) continue;
        keep += kf * gw * f.tot[g].k;
        for (let j = 0; j < list.length; j++) list[j].w += kf * gw * w[j];
      }
    }
    for (let i = 0; i < this.clips.length; i++) sum += this.clips[i].w;
    if (sum > 1e-5)
      for (let i = 0; i < this.clips.length; i++) {
        const c = this.clips[i];
        c.w /= sum;
        T += c.w * c.T;
        L += c.w * c.speed * c.T;
        pr += c.w * c.pr;
        c.delta = wrapPi(theta - c.angle);
      }
    else {
      T = this.cycle;
      pr = this.pR;
      amp = 0;
      rate = 1;
    }
    L *= keep > 0 ? keep : 1;
    if (amp >= 1 - 1e-6 && L > 1e-5) rate = clamp((s * T) / L, 0.5, this.maxRate);
    const wasStanding = this.stand > 0.97,
      halt = this.graph.footPlant && Math.hypot(this.vx, this.vz) < this.standBelow * 0.5;
    const standing = this.idle ? halt || (this.stand > 0.5 ? s < this.standBelow * 1.5 : s < this.standBelow) : false;
    this.stand = clamp(this.stand + (standing ? dt : -dt) / 0.24, 0, 1);
    if (!this.idle) this.stand = 0;
    if (wasStanding && !standing) this.phase = this.sx > 0.05 * (s + 1e-6) ? pr + 0.03 : 0.03;
    this.amp = amp;
    this.rate = rate;
    this.cycle = T > 1e-3 ? T : 1;
    this.pR = pr > 0 ? pr : 0.5;
    this.entry.duration = this.cycle;
    if (sum > 1e-5) {
      const p = this.pR;
      let lenL = 0,
        lenR = 0;
      for (let i = 0; i < this.clips.length; i++) {
        const c = this.clips[i];
        if (c.w <= 0) continue;
        const a = p / c.pr,
          b = (1 - p) / (1 - c.pr);
        lenL += c.w * (c.uL <= c.pr ? c.uL * a : p + (c.uL - c.pr) * b);
        lenR += c.w * (c.uR <= 1 - c.pr ? c.uR * b : 1 - p + (c.uR - (1 - c.pr)) * a);
      }
      this.lenL = lenL;
      this.lenR = lenR;
    }
    this.wraps = 0;
    this.stepL = false;
    this.stepR = false;
    if (!this.paused) {
      if (this.stand < 1 && sum > 1e-5) {
        const before = this.phase,
          loud = amp > 0.2 && this.stand < 0.5;
        let ph = before + (dt * this.timeScale * rate) / this.cycle;
        if (ph >= 1) {
          ph -= Math.floor(ph);
          this.wraps = 1;
          this.stepL = loud;
        }
        if (before < this.pR && ph >= this.pR && !this.wraps) this.stepR = loud;
        this.phase = ph;
      }
      if (this.idle) {
        this.idleTime += dt * this.timeScale;
        if (this.idleTime >= this.idle.duration) this.idleTime %= this.idle.duration;
      }
    }
  }
  sample(graph, out, pos) {
    const rig = graph.rig,
      tmp = graph.tmpB,
      tp = graph.posB,
      n = rig.count * 4;
    let first = true;
    pos[0] = 0;
    pos[1] = 0;
    pos[2] = 0;
    const idleW = smooth01(this.stand),
      amp = this.amp,
      h4 = rig.hips * 4;
    let yaw = 0,
      total = 0;
    if (this.idle && idleW > 1e-4) {
      sampleClip(rig, this.idle.sampler, this.idleTime, tmp, tp);
      yaw += splitYaw(tmp, h4) * idleW;
      total += idleW;
      accumulateQuaternions(out, tmp, idleW, n, first);
      first = false;
      pos[0] += tp[0] * idleW;
      pos[1] += tp[1] * idleW;
      pos[2] += tp[2] * idleW;
    }
    for (let i = 0; i < this.clips.length; i++) {
      const c = this.clips[i],
        w = c.w * (1 - idleW);
      if (w < 1e-4) continue;
      c.time = this.timeOf(c, this.phase, this.pR);
      sampleClip(rig, c.entry.sampler, c.time, tmp, tp);
      if (amp < 0.999) {
        const mean = c.mean,
          a = amp,
          b = 1 - amp;
        for (let o = 0; o < n; o += 4) {
          const k =
            tmp[o] * mean[o] + tmp[o + 1] * mean[o + 1] + tmp[o + 2] * mean[o + 2] + tmp[o + 3] * mean[o + 3] < 0
              ? -b
              : b;
          tmp[o] = tmp[o] * a + mean[o] * k;
          tmp[o + 1] = tmp[o + 1] * a + mean[o + 1] * k;
          tmp[o + 2] = tmp[o + 2] * a + mean[o + 2] * k;
          tmp[o + 3] = tmp[o + 3] * a + mean[o + 3] * k;
        }
        tp[0] = tp[0] * a + c.meanPos[0] * b;
        tp[1] = tp[1] * a + c.meanPos[1] * b;
        tp[2] = tp[2] * a + c.meanPos[2] * b;
      }
      if (Math.abs(c.delta) > 1e-3) graph.turnLegs(tmp, tp, c.delta);
      yaw += splitYaw(tmp, h4) * w;
      total += w;
      accumulateQuaternions(out, tmp, w, n, first);
      first = false;
      pos[0] += tp[0] * w;
      pos[1] += tp[1] * w;
      pos[2] += tp[2] * w;
    }
    if (first) {
      out.set(rig.rest);
      const h = rig.hips * 3;
      pos[0] = rig.restPos[h];
      pos[1] = rig.restPos[h + 1];
      pos[2] = rig.restPos[h + 2];
    } else {
      for (let o = 0; o < n; o += 4) qnorm(out, o);
      joinYaw(out, h4, yaw / total);
    }
    const sp2 = rig.spine && rig.spine.length ? rig.spine[rig.spine.length - 1] * 4 : h4;
    if (!this.lastOut) {
      this.lastOut = new Float32Array(n);
      this.fromOut = new Float32Array(n);
      this.lastPos = new Float32Array(3);
      this.fromPos = new Float32Array(3);
      this.raw = new Float32Array(8);
      this.flipT = 0;
      this.fresh = true;
    }
    {
      const r = this.raw,
        dh = Math.abs(out[h4] * r[0] + out[h4 + 1] * r[1] + out[h4 + 2] * r[2] + out[h4 + 3] * r[3]),
        ds = Math.abs(out[sp2] * r[4] + out[sp2 + 1] * r[5] + out[sp2 + 2] * r[6] + out[sp2 + 3] * r[7]);
      if (!this.fresh && idleW < 0.98 && (dh < SNAP_HIPS || ds < SNAP_SPINE)) {
        this.fromOut.set(this.lastOut);
        this.fromPos[0] = this.lastPos[0];
        this.fromPos[1] = this.lastPos[1];
        this.fromPos[2] = this.lastPos[2];
        this.flipT = FLIP;
      }
      r[0] = out[h4];
      r[1] = out[h4 + 1];
      r[2] = out[h4 + 2];
      r[3] = out[h4 + 3];
      r[4] = out[sp2];
      r[5] = out[sp2 + 1];
      r[6] = out[sp2 + 2];
      r[7] = out[sp2 + 3];
      this.fresh = false;
    }
    if (this.flipT > 0) {
      const k = smooth01(1 - this.flipT / FLIP),
        from = this.fromOut,
        fp = this.fromPos;
      for (let o = 0; o < n; o += 4) {
        const sg =
          from[o] * out[o] + from[o + 1] * out[o + 1] + from[o + 2] * out[o + 2] + from[o + 3] * out[o + 3] < 0
            ? -(1 - k)
            : 1 - k;
        out[o] = out[o] * k + from[o] * sg;
        out[o + 1] = out[o + 1] * k + from[o + 1] * sg;
        out[o + 2] = out[o + 2] * k + from[o + 2] * sg;
        out[o + 3] = out[o + 3] * k + from[o + 3] * sg;
        qnorm(out, o);
      }
      pos[0] = pos[0] * k + fp[0] * (1 - k);
      pos[1] = pos[1] * k + fp[1] * (1 - k);
      pos[2] = pos[2] * k + fp[2] * (1 - k);
    }
    this.lastOut.set(out.subarray ? out.subarray(0, n) : out);
    this.lastPos[0] = pos[0];
    this.lastPos[1] = pos[1];
    this.lastPos[2] = pos[2];
  }
}

function accumulateQuaternions(acc, src, w, n, first) {
  if (first) {
    for (let i = 0; i < n; i++) acc[i] = src[i] * w;
    return;
  }
  for (let o = 0; o < n; o += 4) {
    const k =
      acc[o] * src[o] + acc[o + 1] * src[o + 1] + acc[o + 2] * src[o + 2] + acc[o + 3] * src[o + 3] < 0 ? -w : w;
    acc[o] += src[o] * k;
    acc[o + 1] += src[o + 1] * k;
    acc[o + 2] += src[o + 2] * k;
    acc[o + 3] += src[o + 3] * k;
  }
}

const MAX_BASE = 5;
const KNEE = 0.02;
const BODY_CLEAR = 0.02;
const BODY_WRIST = 0.07;
const BODY_JOINED = [0.27, 0.33];
const BODY_SOFT = 0.04;
const BODY_BLEND = 0.01;
const BODY_SHARE = 0.015;
const BODY_IN = 0.06,
  BODY_OUT = 0.2;
const BODY_RATE = 0.9;
const BODY_CAP = 0.8;
const BODY_EASY = [0.05, 0.025, 0.7],
  BODY_ELBOW = [0.82, -0.57];
const BODY_MOST = 0.16;
const BODY_LEFT = [0.015, 0.045];
const BODY_SURE = [0.1, 0.3];
const LOOK_BY_KIND = {
  idle: 1,
  move: 1,
  turn: 1,
  act: 0.7,
  cast: 0.6,
  attack: 0.45,
  jump: 0.4,
  react: 0.25,
  dodge: 0,
  death: 0,
};

export class Graph {
  constructor(rig, entry, emit) {
    this.rig = rig;
    this.entry = entry;
    this.emit = emit;
    const n = rig.count * 4;
    this.pose = new Float32Array(n);
    this.pos = new Float32Array(3);
    this.tmpA = new Float32Array(n);
    this.posA = new Float32Array(3);
    this.tmpB = new Float32Array(n);
    this.posB = new Float32Array(3);
    this.world = new Float32Array(n);
    this.base = [];
    this.overlays = [];
    this.additives = [];
    this.spare = [];
    this.motion = { x: 0, z: 0, yaw: 0 };
    this.fixBones = null;
    this.fixQ = null;
    this.fixY = 0;
    this.look = {
      target: null,
      on: false,
      weight: 1,
      speed: 6,
      head: 0.65,
      chest: 0.35,
      limit: 70 * DEG,
      limitPitch: 40 * DEG,
      always: false,
      yaw: 0,
      pitch: 0,
      amount: 0,
      offsetY: 0,
    };
    this.q4 = new Float32Array(16);
    this.front = null;
    this.written = false;
    this.ground = true;
    this.groundMax = 0.15;
    this.lift = 0;
    this.feet = [];
    this.standY = 1;
    const hp = [rig.restPos[rig.hips * 3], rig.restPos[rig.hips * 3 + 1], rig.restPos[rig.hips * 3 + 2]];
    for (const side of ['Left', 'Right']) {
      const foot = rig.index[side + 'Foot'],
        toe = rig.index[side + 'ToeBase'];
      if (foot === undefined || toe === undefined) continue;
      const a = Array.from(this.bonePos(rig.rest0, hp, foot)),
        t = Array.from(this.bonePos(rig.rest0, hp, toe));
      let w = [0, 0, 0, 1];
      const chainUp = [];
      for (let k = foot; k >= 0; k = rig.parent[k]) chainUp.unshift(k);
      for (const k of chainUp) {
        const o = [0, 0, 0, 0];
        qmul(o, 0, w, 0, rig.rest0, k * 4);
        w = o;
      }
      const dx = t[0] - a[0],
        dz = t[2] - a[2],
        dl = Math.hypot(dx, dz) || 1,
        heel = [(-dx / dl) * 0.055, -a[1], (-dz / dl) * 0.055];
      const r = qrot([-w[0], -w[1], -w[2], w[3]], 0, heel[0], heel[1], heel[2]);
      this.feet.push({ bone: foot, x: r[0], y: r[1], z: r[2] });
      this.feet.push({ bone: toe, x: 0, y: 0, z: 0, up: Math.max(0, t[1]) });
    }
    this.standY = hp[1];
    this.floorFit = false;
    this.footPlant = false;
    this.wq = new Float32Array(n);
    this.wp = new Float32Array(rig.count * 3);
    this.limbs = [];
    this.planted = { have: false, x: 0, z: 0, yaw: 0, off: 0 };
    this.realDt = 0;
    this.kc = new Float64Array(3);
    this.ik = new Float64Array(8);
    this.bodyFit = false;
    this.bodyShown = 1;
    this.body = null;
    this.arms = [];
    this.bodyHit = new Float64Array(8);
    this.bodyPt = new Float64Array(8);
    this.bodyNear = [];
    this.bodyN = new Float64Array(3);
    this.bodyTry = null;
    this.bodyBusy = false;
    this.bodyLog = null;
  }

  play(entry, o) {
    const p = new ClipPlayback().set(entry, o);
    this.push(p, o.fade);
    return p;
  }
  push(item, fade) {
    const i = this.base.indexOf(item),
      had = i >= 0 ? item.weight : 0;
    if (i >= 0) this.base.splice(i, 1);
    item.alpha = fade > 0 && this.base.length ? unsmooth(had) : 1;
    item.fade = fade;
    item.live = true;
    this.base.push(item);
    this.front = item;
    while (this.base.length > MAX_BASE) this.retire(this.base.shift());
    if (item.alpha >= 1) while (this.base.length > 1) this.retire(this.base.shift());
  }
  retire(item) {
    item.live = false;
  }

  overlay(entry, o) {
    for (const ov of this.overlays)
      if (ov.out === 0) {
        ov.out = o.fade > 0 ? o.fade : 1e-3;
      }
    const ov = {
      play: new ClipPlayback().set(entry, {
        loop: o.loop,
        speed: o.speed,
        at: o.at,
        fade: 0,
        start: o.start,
        end: o.end,
      }),
      mask: o.mask,
      gain: o.weight,
      w: o.fade > 0 ? 0 : 1,
      fadeIn: o.fade,
      out: 0,
      hold: o.hold,
      name: entry.name,
    };
    this.overlays.push(ov);
    while (this.overlays.length > 3) this.retire(this.overlays.shift().play);
    return ov.play;
  }
  overlayOff(fade) {
    for (const ov of this.overlays) if (ov.out === 0) ov.out = fade > 0 ? fade : 1e-3;
  }
  get overlayFront() {
    for (let i = this.overlays.length - 1; i >= 0; i--) if (this.overlays[i].out === 0) return this.overlays[i];
    return null;
  }
  additive(entry, o) {
    const a = (this.additives.length >= 3 ? this.additives.shift() : this.spare.pop()) || {
      ref: new Float32Array(this.rig.count * 4),
      refPos: new Float32Array(3),
    };
    a.entry = entry;
    a.time = o.at;
    a.t0 = o.at;
    a.end = o.end;
    a.speed = o.speed;
    a.gain = o.weight;
    a.fadeIn = o.fadeIn;
    a.fadeOut = o.fadeOut;
    a.mask = o.mask || null;
    sampleClip(this.rig, entry.sampler, o.at, a.ref, a.refPos);
    for (let k = 0; k < a.ref.length; k += 4) qnorm(a.ref, k);
    this.additives.push(a);
    return a;
  }

  setFix(fix) {
    this.fixBones = null;
    this.fixY = 0;
    if (!fix) return;
    const bones = [],
      qs = [];
    for (const k in fix) {
      if (k === 'hipsY') {
        this.fixY = fix[k];
        continue;
      }
      const i = this.rig.index[k];
      if (i === undefined) continue;
      const a = fix[k];
      _q.setFromEuler(new THREE.Euler(a[0] * DEG, a[1] * DEG, a[2] * DEG, 'XYZ'));
      bones.push(i);
      qs.push(_q.x, _q.y, _q.z, _q.w);
    }
    if (bones.length) {
      this.fixBones = new Int16Array(bones);
      this.fixQ = new Float32Array(qs);
    }
  }

  turnLegs(pose, pos, delta) {
    const rig = this.rig,
      h = rig.hips * 4,
      q = this.q4,
      sp = rig.spine;
    qmul(q, 0, rig.baseQ, 0, pose, h);
    if (sp.length > 1) qmul(q, 4, q, 0, pose, sp[0] * 4);
    if (sp.length > 2) qmul(q, 8, q, 4, pose, sp[1] * 4);
    const back = -delta / (sp.length || 1);
    for (let k = 0; k < sp.length; k++) {
      const o = sp[k] * 4,
        w = k * 4;
      qaxis(q, 12, 0, 1, 0, back);
      qmul(q, 12, q, 12, q, w);
      qcmul(q, 12, q, w, q, 12);
      qmul(pose, o, q, 12, pose, o);
    }
    qaxis(q, 12, 0, 1, 0, delta);
    qmul(q, 12, q, 12, rig.baseQ, 0);
    qcmul(q, 12, rig.baseQ, 0, q, 12);
    qmul(pose, h, q, 12, pose, h);
    const c = Math.cos(delta),
      s = Math.sin(delta),
      x = pos[0],
      z = pos[2];
    pos[0] = x * c + z * s;
    pos[2] = -x * s + z * c;
  }

  /** The optional offset is in bone space. The result is reused. */
  bonePos(pose, pos, b, x = 0, y = 0, z = 0) {
    const rig = this.rig,
      rp = rig.restPos,
      par = rig.parent;
    for (let k = b; k >= 0; k = par[k]) {
      const r = qrot(pose, k * 4, x, y, z);
      if (par[k] < 0) {
        x = r[0] + pos[0];
        y = r[1] + pos[1];
        z = r[2] + pos[2];
      } else {
        x = r[0] + rp[k * 3];
        y = r[1] + rp[k * 3 + 1];
        z = r[2] + rp[k * 3 + 2];
      }
    }
    _r[0] = x;
    _r[1] = y;
    _r[2] = z;
    return _r;
  }

  update(dt, rootYaw, rootPos) {
    const rig = this.rig,
      n = rig.count * 4,
      m = this.motion;
    m.x = 0;
    m.z = 0;
    m.yaw = 0;
    const base = this.base;
    if (!base.length) return m;
    for (let i = 0; i < base.length; i++) {
      const it = base[i];
      it.advance(dt);
      if (it.alpha < 1) it.alpha = it.fade > 0 ? Math.min(1, it.alpha + dt / it.fade) : 1;
    }
    for (let i = base.length - 1; i > 0; i--)
      if (base[i].alpha >= 1) {
        for (let k = 0; k < i; k++) this.retire(base[k]);
        base.splice(0, i);
        break;
      }
    let left = 1;
    for (let i = base.length - 1; i >= 0; i--) {
      const it = base[i],
        a = i === 0 ? 1 : smooth01(it.alpha);
      it.weight = left * a;
      left *= 1 - a;
    }
    const pose = this.pose,
      pos = this.pos,
      front = base[base.length - 1];
    if (base.length === 1) front.sample(this, pose, pos);
    else {
      let first = true,
        yaw = 0,
        ref = 0,
        total = 0;
      const h4 = rig.hips * 4;
      pos[0] = 0;
      pos[1] = 0;
      pos[2] = 0;
      for (let i = base.length - 1; i >= 0; i--) {
        const it = base[i],
          w = it.weight;
        if (w < 1e-4) continue;
        it.sample(this, this.tmpA, this.posA);
        let psi = splitYaw(this.tmpA, h4);
        if (first) ref = psi;
        else psi = ref + wrapPi(psi - ref);
        yaw += psi * w;
        total += w;
        accumulateQuaternions(pose, this.tmpA, w, n, first);
        first = false;
        pos[0] += this.posA[0] * w;
        pos[1] += this.posA[1] * w;
        pos[2] += this.posA[2] * w;
      }
      for (let o = 0; o < n; o += 4) qnorm(pose, o);
      joinYaw(pose, h4, yaw / total);
      pos[0] /= total;
      pos[1] /= total;
      pos[2] /= total;
    }
    for (let o = 0; o < n; o += 4) qnorm(pose, o);
    for (let i = 0; i < base.length; i++) {
      const it = base[i],
        w = it === front ? 1 : it.weight;
      if (w > 0) {
        m.x += it.motion.x * w;
        m.z += it.motion.z * w;
        m.yaw += it.motion.yaw * w;
      }
    }
    for (let i = 0; i < this.overlays.length; i++) {
      const ov = this.overlays[i],
        p = ov.play;
      p.advance(dt);
      if (ov.out > 0) {
        ov.w -= dt / ov.out;
        if (ov.w <= 0) {
          this.retire(p);
          this.overlays.splice(i--, 1);
          continue;
        }
      } else {
        if (ov.w < 1) ov.w = ov.fadeIn > 0 ? Math.min(1, ov.w + dt / ov.fadeIn) : 1;
        if (!p.loop && !ov.hold && p.time >= p.end - Math.max(0.12, ov.fadeIn) * Math.abs(p.timeScale))
          ov.out = Math.max(0.12, ov.fadeIn);
      }
      const f = smooth01(ov.w) * ov.gain;
      if (f <= 1e-4) continue;
      p.sample(this, this.tmpA, this.posA);
      const mask = ov.mask,
        src = this.tmpA;
      for (let b = 0, o = 0; o < n; b++, o += 4) {
        const k = mask[b] * f;
        if (k <= 0) continue;
        const s =
            pose[o] * src[o] + pose[o + 1] * src[o + 1] + pose[o + 2] * src[o + 2] + pose[o + 3] * src[o + 3] < 0
              ? -k
              : k,
          j = 1 - k;
        pose[o] = pose[o] * j + src[o] * s;
        pose[o + 1] = pose[o + 1] * j + src[o + 1] * s;
        pose[o + 2] = pose[o + 2] * j + src[o + 2] * s;
        pose[o + 3] = pose[o + 3] * j + src[o + 3] * s;
        qnorm(pose, o);
      }
      const hk = mask[rig.hips] * f;
      if (hk > 0) {
        pos[0] += (this.posA[0] - pos[0]) * hk;
        pos[1] += (this.posA[1] - pos[1]) * hk;
        pos[2] += (this.posA[2] - pos[2]) * hk;
      }
    }
    for (let i = 0; i < this.additives.length; i++) {
      const a = this.additives[i];
      a.time += dt * a.speed;
      if (a.time >= a.end) {
        this.additives.splice(i--, 1);
        this.spare.push(a);
        continue;
      }
      const w =
        a.gain *
        Math.min(
          1,
          a.fadeIn > 0 ? (a.time - a.t0) / (a.fadeIn * a.speed) : 1,
          a.fadeOut > 0 ? (a.end - a.time) / (a.fadeOut * a.speed) : 1,
        );
      if (w <= 1e-4) continue;
      sampleClip(rig, a.entry.sampler, a.time, this.tmpA, this.posA);
      const src = this.tmpA,
        ref = a.ref,
        has = a.entry.sampler.has,
        q = this.q4,
        mask = a.mask;
      for (let b = 0, o = 0; o < n; b++, o += 4) {
        if (!has[b]) continue;
        const k = mask ? w * mask[b] : w;
        if (k <= 1e-4) continue;
        qcmul(q, 0, ref, o, src, o);
        const sg = q[3] < 0 ? -k : k;
        q[0] *= sg;
        q[1] *= sg;
        q[2] *= sg;
        q[3] = 1 + (Math.abs(q[3]) - 1) * k;
        qmul(pose, o, pose, o, q, 0);
        qnorm(pose, o);
      }
      const hk = mask ? w * mask[rig.hips] : w;
      pos[0] += (this.posA[0] - a.refPos[0]) * hk;
      pos[1] += (this.posA[1] - a.refPos[1]) * hk;
      pos[2] += (this.posA[2] - a.refPos[2]) * hk;
    }
    if (this.fixBones) {
      const fb = this.fixBones,
        fq = this.fixQ;
      for (let k = 0; k < fb.length; k++) {
        const o = fb[k] * 4;
        qmul(pose, o, fq, k * 4, pose, o);
      }
    }
    pos[1] += this.fixY;
    if (this.floorFit && this.limbs.length) this.lift = 0;
    else if (this.ground && this.feet.length) {
      let low = 0;
      for (let k = 0; k < this.feet.length; k++) {
        const f = this.feet[k],
          y = this.bonePos(pose, pos, f.bone, f.x, f.y, f.z)[1] - (f.up || 0);
        if (y < low) low = y;
      }
      const want = Math.min(this.groundMax, -low) * smooth01((pos[1] / this.standY - 0.6) / 0.15);
      this.lift = want > this.lift ? want : Math.max(want, this.lift - dt * 0.25);
      pos[1] += this.lift;
    }
    this.applyLook(dt, rootYaw, rootPos, front);
    const floored = (this.floorFit || this.footPlant) && this.limbs.length > 0;
    if (floored) this.solveFloorContacts(dt, rootYaw, rootPos, front);
    if (this.bodyFit && this.body && this.bodyShown > 0) this.solveArmBodyCollision(dt, !floored);
    else if (this.bodyBusy) this.resetArmBodyCollision();
    const bones = rig.bones;
    for (let b = 0, o = 0; o < n; b++, o += 4) bones[b].quaternion.set(pose[o], pose[o + 1], pose[o + 2], pose[o + 3]);
    bones[rig.hips].position.set(pos[0], pos[1], pos[2]);
    this.written = true;
    this.events(front);
    for (let i = 0; i < this.overlays.length; i++) if (this.overlays[i].out === 0) this.events(this.overlays[i].play);
    return m;
  }

  setContact(map) {
    const rig = this.rig,
      I = rig.index,
      wq = this.wq,
      wp = this.wp,
      q = this.q4;
    this.limbs.length = 0;
    if (!map) return;
    this.computeWorldPose(rig.rest0, [
      rig.restPos[rig.hips * 3],
      rig.restPos[rig.hips * 3 + 1],
      rig.restPos[rig.hips * 3 + 2],
    ]);
    const local = (b, x, y, z, out) => {
      q[0] = -wq[b * 4];
      q[1] = -wq[b * 4 + 1];
      q[2] = -wq[b * 4 + 2];
      q[3] = wq[b * 4 + 3];
      const r = qrot(q, 0, x, y, z);
      out[0] = r[0];
      out[1] = r[1];
      out[2] = r[2];
    };
    const add = (upper, lower, end, toe, leg, side) => {
      const U = I[upper],
        M = I[lower],
        E = I[end],
        T = toe ? I[toe] : undefined;
      if (U === undefined || M === undefined || E === undefined || !map[end] || rig.parent[U] < 0) return;
      const L = {
        leg,
        side,
        upper: U,
        lower: M,
        end: E,
        toe: T !== undefined && map[toe] ? T : -1,
        pts: new Float32Array(map[end]),
        toePts: new Float32Array((toe && map[toe]) || []),
        more: leg
          ? []
          : Object.keys(map)
              .filter((k) => k !== end && k.startsWith(end) && I[k] !== undefined)
              .map((k) => ({ bone: I[k], pts: new Float32Array(map[k]) })),
        kneeU: new Float32Array((leg && map[upper]) || []),
        kneeM: new Float32Array((leg && map[lower]) || []),
        hinge: new Float32Array(3),
        toeHinge: new Float32Array(3),
        reach:
          Math.hypot(rig.restPos[M * 3], rig.restPos[M * 3 + 1], rig.restPos[M * 3 + 2]) +
          Math.hypot(rig.restPos[E * 3], rig.restPos[E * 3 + 1], rig.restPos[E * 3 + 2]),
        on: false,
        x: 0,
        z: 0,
        yaw: 0,
        ox: 0,
        oz: 0,
        oyaw: 0,
        rel: 1,
        step: -1,
        sx: 0,
        sz: 0,
        syaw: 0,
        err: 0,
        spent: false,
        heading: 0,
        kw: 0,
        kwS: 0,
        skin: 0,
      };
      const ux = wp[M * 3] - wp[U * 3],
        uy = wp[M * 3 + 1] - wp[U * 3 + 1],
        bz = leg ? -1 : 1,
        hl = Math.hypot(uy, ux) || 1;
      local(M, (uy * bz) / hl, (-ux * bz) / hl, 0, L.hinge);
      local(E, 1, 0, 0, L.toeHinge);
      this.limbs.push(L);
    };
    add('LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', true, 0);
    add('RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', true, 1);
    add('LeftArm', 'LeftForeArm', 'LeftHand', null, false, 0);
    add('RightArm', 'RightForeArm', 'RightHand', null, false, 1);
  }

  computeWorldPose(pose, pos) {
    const rig = this.rig,
      par = rig.parent,
      rp = rig.restPos,
      wq = this.wq,
      wp = this.wp,
      n = rig.count;
    for (let b = 0, o = 0, o3 = 0; b < n; b++, o += 4, o3 += 3) {
      const p = par[b];
      if (p < 0) {
        wq[o] = pose[o];
        wq[o + 1] = pose[o + 1];
        wq[o + 2] = pose[o + 2];
        wq[o + 3] = pose[o + 3];
        wp[o3] = pos[0];
        wp[o3 + 1] = pos[1];
        wp[o3 + 2] = pos[2];
      } else {
        qmul(wq, o, wq, p * 4, pose, o);
        const r = qrot(wq, p * 4, rp[o3], rp[o3 + 1], rp[o3 + 2]);
        wp[o3] = wp[p * 3] + r[0];
        wp[o3 + 1] = wp[p * 3 + 1] + r[1];
        wp[o3 + 2] = wp[p * 3 + 2] + r[2];
      }
    }
  }
  lowest(b, pts) {
    const wq = this.wq,
      o = b * 4,
      x = wq[o],
      y = wq[o + 1],
      z = wq[o + 2],
      w = wq[o + 3];
    const a = 2 * (x * y + z * w),
      c = 1 - 2 * (x * x + z * z),
      d = 2 * (y * z - x * w);
    let low = Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      const h = a * pts[i] + c * pts[i + 1] + d * pts[i + 2];
      if (h < low) low = h;
    }
    return this.wp[b * 3 + 1] + low;
  }

  solveLimbIk(L, tx, ty, tz, yaw, pole = 0, px = 0, pz = 1) {
    const k = this.ik;
    k[0] = tx;
    k[1] = ty;
    k[2] = tz;
    k[3] = yaw;
    k[4] = pole;
    k[5] = px;
    k[6] = pz;
    k[7] = 0;
    this.solveLimbIkFromBuffer(L);
  }
  solveLimbIkFromBuffer(L) {
    const ik = this.ik,
      tx = ik[0],
      ty = ik[1],
      tz = ik[2],
      yaw = ik[3],
      pole = ik[4],
      px = ik[5],
      pz = ik[6],
      plain = ik[7] !== 0;
    const rig = this.rig,
      wq = this.wq,
      wp = this.wp,
      pose = this.pose,
      q = this.q4,
      rp = rig.restPos,
      U = L.upper,
      M = L.lower,
      E = L.end,
      u3 = U * 3,
      m3 = M * 3,
      e3 = E * 3;
    const hx = wp[u3],
      hy = wp[u3 + 1],
      hz = wp[u3 + 2];
    const ux = wp[m3] - hx,
      uy = wp[m3 + 1] - hy,
      uz = wp[m3 + 2] - hz,
      vx = wp[e3] - wp[m3],
      vy = wp[e3 + 1] - wp[m3 + 1],
      vz = wp[e3 + 2] - wp[m3 + 2];
    const l1 = plain ? Math.sqrt(ux * ux + uy * uy + uz * uz) : Math.hypot(ux, uy, uz),
      l2 = plain ? Math.sqrt(vx * vx + vy * vy + vz * vz) : Math.hypot(vx, vy, vz),
      d0 = plain
        ? Math.sqrt((ux + vx) * (ux + vx) + (uy + vy) * (uy + vy) + (uz + vz) * (uz + vz))
        : Math.hypot(ux + vx, uy + vy, uz + vz);
    let dx = tx - hx,
      dy = ty - hy,
      dz = tz - hz;
    const d = plain ? Math.sqrt(dx * dx + dy * dy + dz * dz) : Math.hypot(dx, dy, dz);
    if (d < 1e-6 || l1 < 1e-6 || l2 < 1e-6) return;
    const full = (l1 + l2) * 0.9995,
      soft = 0.93 * full;
    let want = d;
    if (want > soft) want = soft + (full - soft) * (1 - Math.exp(-(want - soft) / (full - soft)));
    want = clamp(Math.max(want, Math.min(d, d0)), Math.abs(l1 - l2) * 1.001 + 1e-5, full);
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const nl = plain ? Math.sqrt(nx * nx + ny * ny + nz * nz) : Math.hypot(nx, ny, nz);
    if (nl > 1e-4 * l1 * l2) {
      nx /= nl;
      ny /= nl;
      nz /= nl;
    } else {
      const r = qrot(wq, M * 4, L.hinge[0], L.hinge[1], L.hinge[2]);
      nx = r[0];
      ny = r[1];
      nz = r[2];
    }
    const psi0 = Math.atan2(nl, ux * vx + uy * vy + uz * vz),
      psi1 = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - want * want) / (2 * l1 * l2), -1, 1));
    qaxis(q, 0, nx, ny, nz, psi1 - psi0);
    let r = qrot(q, 0, vx, vy, vz);
    const ax = ux + r[0],
      ay = uy + r[1],
      az = uz + r[2],
      al = (plain ? Math.sqrt(ax * ax + ay * ay + az * az) : Math.hypot(ax, ay, az)) || 1;
    const k = want / d;
    dx *= k;
    dy *= k;
    dz *= k;
    let cx = ay * dz - az * dy,
      cy = az * dx - ax * dz,
      cz = ax * dy - ay * dx,
      cw = al * want + ax * dx + ay * dy + az * dz,
      cl = plain ? Math.sqrt(cx * cx + cy * cy + cz * cz + cw * cw) : Math.hypot(cx, cy, cz, cw);
    if (cl < 1e-9) {
      cx = nx;
      cy = ny;
      cz = nz;
      cw = 0;
      cl = 1;
    }
    q[4] = cx / cl;
    q[5] = cy / cl;
    q[6] = cz / cl;
    q[7] = cw / cl;
    qmul(q, 8, q, 4, wq, U * 4);
    qmul(q, 12, q, 0, wq, M * 4);
    qmul(q, 12, q, 4, q, 12);
    if (pole > 0) {
      const ex = dx / want,
        ey = dy / want,
        ez = dz / want;
      r = qrot(q, 8, rp[m3], rp[m3 + 1], rp[m3 + 2]);
      let kx = r[0],
        ky = r[1],
        kz = r[2];
      const ka = kx * ex + ky * ey + kz * ez;
      kx -= ka * ex;
      ky -= ka * ey;
      kz -= ka * ez;
      const pa = px * ex + pz * ez;
      let wx = px - pa * ex,
        wy = -pa * ey,
        wz = pz - pa * ez;
      const kl = plain ? Math.sqrt(kx * kx + ky * ky + kz * kz) : Math.hypot(kx, ky, kz),
        wl = plain ? Math.sqrt(wx * wx + wy * wy + wz * wz) : Math.hypot(wx, wy, wz);
      if (kl > 1e-4 && wl > 0.25) {
        const sin = ((ky * wz - kz * wy) * ex + (kz * wx - kx * wz) * ey + (kx * wy - ky * wx) * ez) / (kl * wl),
          cos = (kx * wx + ky * wy + kz * wz) / (kl * wl);
        qaxis(q, 0, ex, ey, ez, Math.atan2(sin, cos) * pole * Math.min(1, (wl - 0.25) / 0.25));
        qmul(q, 8, q, 0, q, 8);
        qmul(q, 12, q, 0, q, 12);
      }
    }
    qcmul(pose, U * 4, wq, rig.parent[U] * 4, q, 8);
    qnorm(pose, U * 4);
    qcmul(pose, M * 4, q, 8, q, 12);
    qnorm(pose, M * 4);
    for (let i = 0; i < 4; i++) {
      wq[U * 4 + i] = q[8 + i];
      wq[M * 4 + i] = q[12 + i];
    }
    if (yaw) {
      qaxis(q, 0, 0, 1, 0, yaw);
      qmul(wq, E * 4, q, 0, wq, E * 4);
    }
    qcmul(pose, E * 4, wq, M * 4, wq, E * 4);
    qnorm(pose, E * 4);
    r = qrot(wq, U * 4, rp[m3], rp[m3 + 1], rp[m3 + 2]);
    wp[m3] = hx + r[0];
    wp[m3 + 1] = hy + r[1];
    wp[m3 + 2] = hz + r[2];
    r = qrot(wq, M * 4, rp[e3], rp[e3 + 1], rp[e3 + 2]);
    wp[e3] = wp[m3] + r[0];
    wp[e3 + 1] = wp[m3 + 1] + r[1];
    wp[e3 + 2] = wp[m3 + 2] + r[2];
  }

  bendToesAboveFloor(L) {
    const rig = this.rig,
      wq = this.wq,
      wp = this.wp,
      pose = this.pose,
      q = this.q4,
      T = L.toe,
      E = L.end,
      t3 = T * 3,
      rp = rig.restPos,
      pts = L.toePts;
    let r = qrot(wq, E * 4, rp[t3], rp[t3 + 1], rp[t3 + 2]);
    wp[t3] = wp[E * 3] + r[0];
    wp[t3 + 1] = wp[E * 3 + 1] + r[1];
    wp[t3 + 2] = wp[E * 3 + 2] + r[2];
    qmul(wq, T * 4, wq, E * 4, pose, T * 4);
    const jy = wp[t3 + 1];
    let left = 0;
    for (let pass = 0; pass < 3; pass++) {
      const o = T * 4,
        x = wq[o],
        y = wq[o + 1],
        z = wq[o + 2],
        w = wq[o + 3],
        a = 2 * (x * y + z * w),
        c = 1 - 2 * (x * x + z * z),
        d = 2 * (y * z - x * w);
      let low = 0,
        at = -1;
      for (let i = 0; i < pts.length; i += 3) {
        const h = jy + a * pts[i] + c * pts[i + 1] + d * pts[i + 2];
        if (h < low) {
          low = h;
          at = i;
        }
      }
      left = -low;
      if (at < 0 || low > -5e-4) {
        left = 0;
        break;
      }
      if (pass === 2) break;
      r = qrot(wq, E * 4, L.toeHinge[0], L.toeHinge[1], L.toeHinge[2]);
      const hx = r[0],
        hy = r[1],
        hz = r[2];
      r = qrot(wq, o, pts[at], pts[at + 1], pts[at + 2]);
      const px = r[0],
        py = r[1],
        pz = r[2],
        hp = hx * px + hy * py + hz * pz;
      const A = py - hy * hp,
        B = hz * px - hx * pz,
        C = -jy - hy * hp,
        R = Math.hypot(A, B);
      if (R < 1e-6) break;
      if (Math.abs(C) > R) break;
      const mid = Math.atan2(B, A),
        half = Math.acos(C / R),
        t1 = wrapPi(mid - half),
        t2 = wrapPi(mid + half),
        ok1 = t1 <= 0 && t1 > -1.25,
        ok2 = t2 <= 0 && t2 > -1.25;
      if (!ok1 && !ok2) break;
      qaxis(q, 0, hx, hy, hz, ok1 && (!ok2 || t1 > t2) ? t1 : t2);
      qmul(wq, o, q, 0, wq, o);
    }
    qcmul(pose, T * 4, wq, E * 4, wq, T * 4);
    qnorm(pose, T * 4);
    return left;
  }

  headBack(limit, w) {
    const rig = this.rig,
      I = rig.index,
      C = I.Spine2,
      N = I.Neck,
      H = I.Head,
      wq = this.wq,
      pose = this.pose,
      q = this.q4;
    if (C === undefined || N === undefined || H === undefined) return;
    let r = qrot(wq, C * 4, 0, 1, 0);
    const ux = r[0],
      uy = r[1],
      uz = r[2];
    r = qrot(wq, C * 4, rig.fwd[C * 3], rig.fwd[C * 3 + 1], rig.fwd[C * 3 + 2]);
    const fx = r[0],
      fy = r[1],
      fz = r[2];
    r = qrot(wq, H * 4, 0, 1, 0);
    const hx = r[0],
      hy = r[1],
      hz = r[2];
    const back = Math.atan2(-(hx * fx + hy * fy + hz * fz), hx * ux + hy * uy + hz * uz),
      from = limit * 0.65;
    if (back <= from) return;
    const over = (back - (from + (limit - from) * (1 - Math.exp(-(back - from) / (limit - from))))) * w;
    if (over <= 1e-4) return;
    let ax = fy * uz - fz * uy,
      ay = fz * ux - fx * uz,
      az = fx * uy - fy * ux;
    const al = Math.hypot(ax, ay, az) || 1;
    qaxis(q, 0, ax / al, ay / al, az / al, -over);
    qmul(wq, N * 4, q, 0, wq, N * 4);
    qcmul(pose, N * 4, wq, rig.parent[N] * 4, wq, N * 4);
    qnorm(pose, N * 4);
    qmul(wq, H * 4, wq, N * 4, pose, H * 4);
  }
  kneeLowestY(L) {
    const wq = this.wq,
      wp = this.wp,
      kc = this.kc;
    let low = Infinity;
    for (let part = 0; part < 2; part++) {
      const b = part ? L.lower : L.upper,
        pts = part ? L.kneeM : L.kneeU,
        o = b * 4,
        x = wq[o],
        y = wq[o + 1],
        z = wq[o + 2],
        w = wq[o + 3];
      const a = 2 * (x * y + z * w),
        c = 1 - 2 * (x * x + z * z),
        d = 2 * (y * z - x * w);
      let at = -1,
        h = Infinity;
      for (let i = 0; i < pts.length; i += 3) {
        const v = a * pts[i] + c * pts[i + 1] + d * pts[i + 2];
        if (v < h) {
          h = v;
          at = i;
        }
      }
      if (at >= 0 && wp[b * 3 + 1] + h < low) {
        low = wp[b * 3 + 1] + h;
        const r = qrot(wq, o, pts[at], pts[at + 1], pts[at + 2]);
        kc[0] = wp[b * 3] + r[0];
        kc[1] = low;
        kc[2] = wp[b * 3 + 2] + r[2];
      }
    }
    return low;
  }
  kneel(L, w) {
    const rig = this.rig,
      wq = this.wq,
      wp = this.wp,
      pose = this.pose,
      q = this.q4,
      rp = rig.restPos,
      U = L.upper,
      M = L.lower,
      E = L.end,
      u3 = U * 3;
    const KNEE = L.skin,
      h = this.kneeLowestY(L) + KNEE;
    if (!(h > 1e-3) || h > 0.45) return;
    const cx = this.kc[0] - wp[u3],
      cy = this.kc[1] - wp[u3 + 1],
      cz = this.kc[2] - wp[u3 + 2],
      hl = Math.hypot(cx, cz);
    if (hl < 0.1) return;
    const R = Math.hypot(cy, hl),
      t = clamp(Math.acos(clamp((-KNEE - wp[u3 + 1]) / R, -1, 1)) - Math.atan2(hl, cy), 0, 0.9) * w;
    if (t < 1e-4) return;
    qaxis(q, 0, cz / hl, 0, -cx / hl, t);
    qmul(wq, U * 4, q, 0, wq, U * 4);
    qcmul(pose, U * 4, wq, rig.parent[U] * 4, wq, U * 4);
    qnorm(pose, U * 4);
    for (let k = 0; k < 3; k++) {
      const b = k === 0 ? M : k === 1 ? E : L.toe;
      if (b < 0) break;
      const p = rig.parent[b],
        b3 = b * 3;
      qmul(wq, b * 4, wq, p * 4, pose, b * 4);
      const r = qrot(wq, p * 4, rp[b3], rp[b3 + 1], rp[b3 + 2]);
      wp[b3] = wp[p * 3] + r[0];
      wp[b3 + 1] = wp[p * 3 + 1] + r[1];
      wp[b3 + 2] = wp[p * 3 + 2] + r[2];
    }
  }
  kneelWeightAt(entry, t, side) {
    const k = entry.kneel;
    let w = 0;
    for (let i = 0; i < k.length; i += 3) {
      if (k[i + 2] !== 2 && k[i + 2] !== side) continue;
      const a = k[i],
        b = k[i + 1],
        inn = a <= 0.02 ? 1 : smooth01((t - a) / 0.2),
        out = b >= entry.duration - 0.02 ? 1 : smooth01((b - t) / 0.2);
      if (t >= a && t <= b) w = Math.max(w, Math.min(inn, out));
    }
    return w;
  }

  unplant() {
    for (let i = 0; i < this.limbs.length; i++) {
      const L = this.limbs[i];
      L.on = false;
      L.step = -1;
      L.rel = 1;
      L.spent = false;
      L.err = 0;
    }
    this.planted.have = false;
  }

  /** Keep hands and feet above the floor, and planted feet in place. */
  solveFloorContacts(dt, rootYaw, rootPos, front) {
    const limbs = this.limbs,
      wp = this.wp,
      S = this.rig.baseS,
      P = this.planted,
      fit = this.floorFit;
    this.computeWorldPose(this.pose, this.pos);
    const mv = front && front.isMove ? front : null;
    const c = Math.cos(rootYaw),
      s = Math.sin(rootYaw);
    let turning = 0;
    if (P.have) {
      const dyaw = Math.abs(wrapPi(rootYaw - P.yaw));
      if (Math.hypot(rootPos.x - P.x, rootPos.z - P.z) > 0.6 * S || dyaw > 1) this.unplant();
      else if (dt > 0) {
        turning = dyaw / dt;
        if (mv) {
          const rdt = this.realDt > 0 ? this.realDt : dt;
          const ax = (rootPos.x - P.x) / (S * rdt),
            az = (rootPos.z - P.z) / (S * rdt),
            ex = ax * c - az * s - mv.vx,
            ez = ax * s + az * c - mv.vz;
          const off = Math.hypot(ex, ez) > 0.3 + 0.35 * Math.hypot(mv.vx, mv.vz) ? 1 : 0;
          P.off += (off - P.off) * Math.min(1, dt * (off ? 12 : 4));
        }
      }
    }
    P.x = rootPos.x;
    P.z = rootPos.z;
    P.yaw = rootYaw;
    P.have = true;
    const plant = this.footPlant && mv !== null && P.off < 0.5,
      standing = plant && mv.stand > 0.5;
    if (fit && front && front.entry && front.entry.headBack) this.headBack(front.entry.headBack * DEG, front.weight);
    let apart = 0,
      ux = 0,
      uy = 0,
      uz = 0;
    if (fit && front && front.entry && front.entry.apart && limbs.length === 4 && !limbs[2].leg) {
      const a3 = limbs[2].end * 3,
        b3 = limbs[3].end * 3,
        dx = wp[a3] - wp[b3] + 0.03,
        dy = wp[a3 + 1] - wp[b3 + 1],
        dz = wp[a3 + 2] - wp[b3 + 2],
        dl = Math.hypot(dx, dy, dz);
      apart = 0.5 * front.entry.apart * front.weight * (1 - smooth01((dl - 0.2) / 0.1));
      ux = dx / dl;
      uy = dy / dl;
      uz = dz / dl;
    }
    if (fit) {
      let drop = 0,
        room = Infinity;
      const base = this.base,
        n3 = this.rig.count * 3;
      for (let i = 0; i < limbs.length; i++) {
        const L = limbs[i];
        L.kw = 0;
        if (!L.leg || !L.kneeU.length) continue;
        const u = L.upper * 3,
          m = L.lower * 3,
          f = L.end * 3,
          ax = wp[u] - wp[m],
          ay = wp[u + 1] - wp[m + 1],
          az = wp[u + 2] - wp[m + 2],
          bx = wp[f] - wp[m],
          by = wp[f + 1] - wp[m + 1],
          bz = wp[f + 2] - wp[m + 2];
        L.skin =
          KNEE *
          smooth01(
            ((ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) || 1) + 0.17) / 0.81,
          );
        const h = this.kneeLowestY(L) + L.skin;
        if (h < room) room = h;
        for (let k = 0; k < base.length; k++) {
          const it = base[k];
          if (!it.isMove && it.entry.kneel && it.weight > 1e-3)
            L.kw += it.weight * this.kneelWeightAt(it.entry, it.time, L.side);
        }
        const want = Math.min(1, L.kw) * (1 - smooth01((h - 0.24) / 0.12));
        L.kw = L.kwS = dt > 0 ? L.kwS + clamp(want - L.kwS, -dt * 5, dt * 5) : L.kwS;
        if (L.kw <= 1e-3) {
          L.kw = 0;
          continue;
        }
        const steep = (wp[L.upper * 3 + 1] - wp[L.lower * 3 + 1]) / (L.reach * 0.47);
        if (h > 0.01) drop = Math.max(drop, L.kw * smooth01((steep - 0.35) / 0.3) * 0.9 * h);
      }
      drop = Math.min(0.3, drop, Math.max(0, room));
      if (drop > 1e-4) {
        this.pos[1] -= drop;
        for (let o = 1; o < n3; o += 3) wp[o] -= drop;
      }
    }
    for (let i = 0; i < limbs.length; i++) {
      const L = limbs[i],
        E = L.end,
        e3 = E * 3,
        kneeling = fit && L.leg ? L.kw : 0;
      if (kneeling > 0) this.kneel(L, kneeling);
      const ax0 = wp[e3],
        ay0 = wp[e3 + 1],
        az0 = wp[e3 + 2];
      let tx = ax0,
        ty = ay0,
        tz = az0,
        yaw = 0,
        moved = false,
        held = false,
        clear = 0,
        hx = 0,
        hz = 1;
      if (L.leg) {
        const fx = L.toe >= 0 ? wp[L.toe * 3] - tx : 0,
          fz = L.toe >= 0 ? wp[L.toe * 3 + 2] - tz : 0,
          bx = tx + fx,
          bz = tz + fz;
        const wx = rootPos.x + (bx * c + bz * s) * S,
          wz = rootPos.z + (-bx * s + bz * c) * S;
        if (fx * fx + fz * fz > 9e-4) L.heading = Math.atan2(fx, fz) + rootYaw;
        const heading = L.heading,
          other = limbs[i ^ 1];
        let want = false;
        clear = 0;
        if (standing) want = turning < (L.on || L.step >= 0 ? 2.4 : 1.6);
        else if (plant) {
          let u = mv.phase - (L.side ? mv.pR : 0);
          if (u < 0) u += 1;
          const up = (L.side ? mv.lenR : mv.lenL) - 0.04;
          want = u > 0.02 && u < up;
          if (u >= up) clear = 0.04 * Math.sin(Math.PI * Math.min(1, (u - up) / (1.01 - up))) * (1 - mv.stand * 2);
        }
        if (L.rel < 1 && dt > 0) L.rel = Math.min(1, L.rel + dt / 0.14);
        let X = wx,
          Z = wz,
          H = heading,
          lift = 0;
        if (L.step >= 0) {
          if (dt > 0) L.step += dt / (standing ? 0.24 : 0.17);
          if (L.step >= 1) {
            L.step = -1;
            L.rel = 1;
            L.err = 0;
            if (want) {
              L.on = true;
              L.x = wx;
              L.z = wz;
              L.yaw = heading;
              this.emit(L.side ? 'foot-r' : 'foot-l', '@move', null);
            }
          } else {
            const k = smooth01(L.step);
            X = L.sx + (wx - L.sx) * k;
            Z = L.sz + (wz - L.sz) * k;
            H = L.syaw + wrapPi(heading - L.syaw) * k;
            lift = 0.05 * Math.sin(Math.PI * L.step);
            moved = true;
          }
        } else if (!want) {
          if (L.on) this.letGo(L, wx, wz, heading);
          L.spent = false;
          L.err = 0;
        } else if (!L.on && !L.spent && (!standing || mv.stand > 0.97 || this.lowest(E, L.pts) < 0.03)) {
          const f = L.rel < 1 ? 1 - smooth01(L.rel) : 0;
          L.on = true;
          L.x = wx + L.ox * f;
          L.z = wz + L.oz * f;
          L.yaw = heading + L.oyaw * f;
          L.rel = 1;
          L.err = 0;
        }
        if (L.on) {
          const ex = (L.x - wx) / S,
            ez = (L.z - wz) / S,
            err = Math.hypot(ex, ez),
            eyaw = Math.abs(wrapPi(L.yaw - heading));
          const mx = tx + ex * c - ez * s,
            mz = tz + ex * s + ez * c,
            far =
              Math.hypot(mx - wp[L.upper * 3], ty - wp[L.upper * 3 + 1], mz - wp[L.upper * 3 + 2]) > 0.985 * L.reach &&
              err > 0.02;
          L.err = err;
          if (standing ? err > 0.085 || eyaw > 0.5 || far : err > 0.3 || eyaw > 1.1 || far) {
            if (other.step < 0 && (err >= other.err || !other.on || !standing)) {
              L.step = 0;
              L.on = false;
              L.sx = L.x;
              L.sz = L.z;
              L.syaw = L.yaw;
            } else if (err > 0.5) {
              this.letGo(L, wx, wz, heading);
              L.spent = true;
            }
          }
          if (L.on) {
            X = L.x;
            Z = L.z;
            H = L.yaw;
            moved = true;
            held = true;
          } else if (L.step >= 0) {
            X = L.sx;
            Z = L.sz;
            H = L.syaw;
            moved = true;
          }
        }
        if (!L.on && L.step < 0 && L.rel < 1) {
          const f = 1 - smooth01(L.rel);
          X = wx + L.ox * f;
          Z = wz + L.oz * f;
          H = heading + L.oyaw * f;
          moved = true;
        }
        if (moved) {
          const dxw = (X - rootPos.x) / S,
            dzw = (Z - rootPos.z) / S;
          yaw = wrapPi(H - heading);
          const cy = Math.cos(yaw),
            sy = Math.sin(yaw);
          tx = dxw * c - dzw * s - (fx * cy + fz * sy);
          tz = dxw * s + dzw * c - (-fx * sy + fz * cy);
          ty += lift;
          hx = Math.sin(H - rootYaw);
          hz = Math.cos(H - rootYaw);
        }
      }
      if (apart > 0 && !L.leg) {
        const k = L.side ? -apart : apart;
        tx += ux * k;
        ty += uy * k;
        tz += uz * k;
        moved = true;
      }
      if (fit) {
        let low = this.lowest(E, L.pts);
        for (let k = 0; k < L.more.length; k++) {
          const h = this.lowest(L.more[k].bone, L.more[k].pts);
          if (h < low) low = h;
        }
        if (low < clear) {
          ty += Math.min(0.3, clear - low);
          moved = true;
        } else if (held && low < 0.05) {
          ty -= low;
          moved = true;
        } else if (kneeling > 0.5 && low < 0.12) {
          ty -= low * Math.min(1, kneeling);
          moved = true;
        }
      }
      if (moved)
        this.solveLimbIk(
          L,
          tx,
          ty,
          tz,
          yaw,
          L.leg ? smooth01((Math.hypot(tx - ax0, tz - az0) - 0.07) / 0.2) : 0,
          hx,
          hz,
        );
      if (fit && L.toe >= 0 && L.toePts.length) {
        const left = this.bendToesAboveFloor(L);
        if (left > 1e-3) this.solveLimbIk(L, wp[e3], wp[e3 + 1] + Math.min(0.3, left), wp[e3 + 2], 0);
      }
      if (kneeling > 0 && moved) this.kneel(L, kneeling);
    }
  }
  letGo(L, wx, wz, heading) {
    L.ox = L.x - wx;
    L.oz = L.z - wz;
    L.oyaw = wrapPi(L.yaw - heading);
    L.on = false;
    L.rel = 0;
  }

  setBody(body, arm) {
    const rig = this.rig,
      I = rig.index,
      wq = this.wq,
      wp = this.wp,
      q = this.q4;
    this.body = null;
    this.arms.length = 0;
    this.bodyBusy = false;
    if (!body || !arm || !body.parts) return;
    const parts = [];
    for (const p of body.parts) {
      const b = I[p.bone];
      if (b === undefined || !p.r || p.r.length !== p.nh * body.na || p.nh < 2) continue;
      let rmax = 0;
      for (let i = 0; i < p.r.length; i++) if (p.r[i] > rmax) rmax = p.r[i];
      parts.push({
        bone: b,
        h0: p.h0,
        dh: p.dh,
        nh: p.nh,
        r: Float32Array.from(p.r),
        rmax,
        lo: p.h0 - BODY_CAP * p.dh,
        hi: p.h0 + (p.nh - 1 + BODY_CAP) * p.dh,
        ox: 0,
        oy: 0,
        oz: 0,
        m: new Float64Array(9),
      });
    }
    if (!parts.length) return;
    this.computeWorldPose(rig.rest0, [
      rig.restPos[rig.hips * 3],
      rig.restPos[rig.hips * 3 + 1],
      rig.restPos[rig.hips * 3 + 2],
    ]);
    for (let side = 0; side < 2; side++) {
      const s = side ? 'Right' : 'Left',
        U = I[s + 'Arm'],
        M = I[s + 'ForeArm'],
        E = I[s + 'Hand'];
      if (U === undefined || M === undefined || E === undefined || rig.parent[U] < 0 || !arm[s + 'ForeArm']) continue;
      let L = null;
      for (const l of this.limbs) if (!l.leg && l.end === E) L = l;
      if (!L) {
        L = { leg: false, side, upper: U, lower: M, end: E, hinge: new Float32Array(3) };
        const ux = wp[M * 3] - wp[U * 3],
          uy = wp[M * 3 + 1] - wp[U * 3 + 1],
          hl = Math.hypot(uy, ux) || 1;
        q[0] = -wq[M * 4];
        q[1] = -wq[M * 4 + 1];
        q[2] = -wq[M * 4 + 2];
        q[3] = wq[M * 4 + 3];
        const r = qrot(q, 0, uy / hl, -ux / hl, 0);
        L.hinge[0] = r[0];
        L.hinge[1] = r[1];
        L.hinge[2] = r[2];
      }
      const probes = [],
        group = (bone, list, fore) => {
          const pts = Float32Array.from(list),
            n = pts.length / 3;
          let cx = 0,
            cy = 0,
            cz = 0,
            far = 0;
          for (let i = 0; i < pts.length; i += 3) {
            cx += pts[i] / n;
            cy += pts[i + 1] / n;
            cz += pts[i + 2] / n;
          }
          for (let i = 0; i < pts.length; i += 3)
            far = Math.max(far, Math.hypot(pts[i] - cx, pts[i + 1] - cy, pts[i + 2] - cz));
          probes.push({ bone, pts, fore, cx, cy, cz, far, near: new Uint8Array(parts.length) });
        };
      group(M, arm[s + 'ForeArm'], true);
      for (const k in arm)
        if (k.startsWith(s + 'Hand') && I[k] !== undefined && arm[k].length) group(I[k], arm[k], false);
      if (arm[s + 'HandEasy'] && arm[s + 'HandEasy'].length) group(E, arm[s + 'HandEasy'], false);
      const sub = [];
      for (let b = 0; b < rig.count; b++) {
        let p = rig.parent[b];
        while (p >= 0 && p !== E) p = rig.parent[p];
        if (p === E) sub.push(b);
      }
      this.arms.push({
        L,
        side,
        U,
        M,
        E,
        probes,
        sub: Int16Array.from(sub),
        fore: Math.hypot(rig.restPos[E * 3], rig.restPos[E * 3 + 1], rig.restPos[E * 3 + 2]),
        upper: Math.hypot(rig.restPos[M * 3], rig.restPos[M * 3 + 1], rig.restPos[M * 3 + 2]),
        raw: new Float32Array(12),
        rawW: new Float32Array(14),
        ox: 0,
        oy: 0,
        oz: 0,
        on: false,
        wx: 0,
        wy: 0,
        wz: 0,
        deep: 0,
        near: 0,
      });
    }
    if (!this.arms.length) return;
    let most = 0;
    for (const A of this.arms) {
      let n = 1;
      for (const G of A.probes) n += G.pts.length / 3;
      if (n > most) most = n;
    }
    this.bodyTry = new Float64Array(most * 5);
    this.bodyWr = new Float64Array(parts.length * 2);
    this.bodyAll = Uint8Array.from(parts, (_, i) => i);
    this.body = {
      na: body.na,
      parts,
      clear: typeof body.clear === 'number' ? body.clear : BODY_CLEAR,
      wrist: typeof body.wrist === 'number' ? body.wrist : BODY_WRIST,
    };
  }
  resetArmBodyCollision() {
    for (let i = 0; i < this.arms.length; i++) {
      const A = this.arms[i];
      A.ox = A.oy = A.oz = 0;
      A.wx = A.wy = A.wz = 0;
      A.deep = 0;
      A.on = false;
    }
    this.bodyBusy = false;
  }

  measureBodyDistance(idx, n) {
    const list = this.bodyNear,
      na = this.body.na,
      hit = this.bodyHit,
      P = this.bodyPt,
      px = P[0],
      py = P[1],
      pz = P[2];
    let best = P[3],
      next = P[3],
      two = false;
    for (let q = 0; q < n; q++) {
      const i = idx[q],
        p = list[i],
        m = p.m,
        dx = px - p.ox,
        dy = py - p.oy,
        dz = pz - p.oz,
        y = dx * m[3] + dy * m[4] + dz * m[5];
      if (y < p.lo || y > p.hi) continue;
      const x = dx * m[0] + dy * m[1] + dz * m[2],
        z = dx * m[6] + dy * m[7] + dz * m[8],
        rho = Math.sqrt(x * x + z * z);
      if (rho - p.rmax >= next) continue;
      const s = Math.abs(x) + Math.abs(z);
      let a = s < 1e-12 ? 0 : z / s;
      if (x < 0) a = 2 - a;
      else if (a < 0) a += 4;
      let fh = (y - p.h0) / p.dh,
        cap = 1;
      const top = p.nh - 1;
      if (fh < 0) {
        cap = 1 + fh / BODY_CAP;
        fh = 0;
      } else if (fh > top) {
        cap = 1 - (fh - top) / BODY_CAP;
        fh = top;
      }
      let i0 = fh | 0;
      if (i0 > top - 1) i0 = top - 1;
      const u = fh - i0,
        fa = a * na * 0.25;
      let j = fa | 0;
      const v = fa - j;
      if (j >= na) j -= na;
      const j1 = j + 1 === na ? 0 : j + 1,
        r = p.r,
        o = i0 * na,
        o1 = o + na;
      const d =
        rho - ((r[o + j] * (1 - v) + r[o + j1] * v) * (1 - u) + (r[o1 + j] * (1 - v) + r[o1 + j1] * v) * u) * cap;
      if (d < best) {
        if (best < P[3]) {
          next = best;
          hit[4] = hit[0];
          hit[5] = hit[1];
          hit[6] = hit[2];
          two = true;
        }
        best = d;
        hit[0] = i;
        hit[1] = x;
        hit[2] = z;
      } else if (d < next) {
        next = d;
        hit[4] = i;
        hit[5] = x;
        hit[6] = z;
        two = true;
      }
    }
    hit[3] = best;
    hit[7] = two ? next : 1e9;
  }
  collectBodyPartsInReach(n, out) {
    const list = this.bodyNear,
      P = this.bodyPt,
      px = P[0],
      py = P[1],
      pz = P[2],
      reach = P[4];
    let k = 0;
    for (let i = 0; i < n; i++) {
      const p = list[i],
        m = p.m,
        dx = px - p.ox,
        dy = py - p.oy,
        dz = pz - p.oz,
        y = dx * m[3] + dy * m[4] + dz * m[5];
      if (y < p.lo - reach || y > p.hi + reach) continue;
      const x = dx * m[0] + dy * m[1] + dz * m[2],
        z = dx * m[6] + dy * m[7] + dz * m[8],
        r = p.rmax + reach;
      if (x * x + z * z < r * r) out[k++] = i;
    }
    return k;
  }
  computeBodyPushNormal(side) {
    const hit = this.bodyHit,
      N = this.bodyN,
      wr = this.bodyWr,
      k1 = hit[0] | 0,
      k2 = hit[4] | 0,
      w = 1 - (hit[7] - hit[3]) / BODY_SHARE;
    hit[1] = wr[k1 * 2];
    hit[2] = wr[k1 * 2 + 1];
    this.computeBodyPartNormal(k1, side);
    if (w <= 0) return;
    const ax = N[0],
      ay = N[1],
      az = N[2],
      w2 = w * w;
    hit[1] = wr[k2 * 2];
    hit[2] = wr[k2 * 2 + 1];
    this.computeBodyPartNormal(k2, side);
    const bx = ax + N[0] * w2,
      by = ay + N[1] * w2,
      bz = az + N[2] * w2,
      l = Math.sqrt(bx * bx + by * by + bz * bz);
    if (l > 1e-6) {
      N[0] = bx / l;
      N[1] = by / l;
      N[2] = bz / l;
    } else {
      N[0] = ax;
      N[1] = ay;
      N[2] = az;
    }
  }
  computeBodyPartNormal(k, side) {
    const m = this.bodyNear[k].m,
      N = this.bodyN,
      x = this.bodyHit[1],
      z = this.bodyHit[2],
      l = Math.sqrt(x * x + z * z);
    if (l > 1e-5) {
      N[0] = (x * m[0] + z * m[6]) / l;
      N[1] = (x * m[1] + z * m[7]) / l;
      N[2] = (x * m[2] + z * m[8]) / l;
      return;
    }
    const sx = side ? -1 : 1,
      a = sx * m[3];
    let nx = sx - a * m[3],
      ny = -a * m[4],
      nz = -a * m[5];
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    N[0] = nx / nl;
    N[1] = ny / nl;
    N[2] = nz / nl;
  }

  solveArmBodyCollision(dt, needFk) {
    const B = this.body,
      arms = this.arms,
      wq = this.wq,
      wp = this.wp,
      pose = this.pose,
      rig = this.rig,
      par = rig.parent,
      rp = rig.restPos,
      near = this.bodyNear,
      hit = this.bodyHit,
      N = this.bodyN;
    if (needFk) this.computeWorldPose(pose, this.pos);
    let free = 1;
    if (arms.length === 2) {
      const a = arms[0].E * 3,
        b = arms[1].E * 3;
      free = smooth01(
        (Math.sqrt(
          (wp[a] - wp[b]) * (wp[a] - wp[b]) +
            (wp[a + 1] - wp[b + 1]) * (wp[a + 1] - wp[b + 1]) +
            (wp[a + 2] - wp[b + 2]) * (wp[a + 2] - wp[b + 2]),
        ) -
          BODY_JOINED[0]) /
          (BODY_JOINED[1] - BODY_JOINED[0]),
      );
    }
    let leave = 0;
    {
      const base = this.base;
      for (let i = 0; i < base.length; i++) {
        const it = base[i];
        if (!it.isMove && it.entry.body === false) leave += it.weight;
      }
    }
    const allow = free * (this.bodyShown < 1 ? this.bodyShown : 1) * (leave >= 1 ? 0 : 1 - leave),
      clear = B.clear,
      wristClear = B.wrist,
      FAR = Math.max(clear, wristClear) + BODY_SOFT + 0.005,
      tries = this.bodyTry,
      wr = this.bodyWr,
      Pt = this.bodyPt;
    Pt[3] = FAR;
    let framed = false,
      busy = false;
    for (let ai = 0; ai < arms.length; ai++) {
      const A = arms[ai],
        U = A.U,
        M = A.M,
        E = A.E,
        u4 = U * 4,
        m4 = M * 4,
        e4 = E * 4,
        m3 = M * 3,
        e3 = E * 3;
      A.deep = 0;
      A.near = 0;
      A.wx = 0;
      A.wy = 0;
      A.wz = 0;
      if (allow <= 0 && !A.on) continue;
      const wx = wp[e3],
        wy = wp[e3 + 1],
        wz = wp[e3 + 2];
      A.rawW[11] = wx;
      A.rawW[12] = wy;
      A.rawW[13] = wz;
      let tx = wx,
        ty = wy,
        tz = wz,
        solved = false;
      if (allow > 0) {
        if (!framed) {
          framed = true;
          for (let k = 0; k < B.parts.length; k++) {
            const p = B.parts[k],
              o = p.bone * 4,
              x = wq[o],
              y = wq[o + 1],
              z = wq[o + 2],
              w = wq[o + 3],
              m = p.m;
            m[0] = 1 - 2 * (y * y + z * z);
            m[1] = 2 * (x * y + z * w);
            m[2] = 2 * (x * z - y * w);
            m[3] = 2 * (x * y - z * w);
            m[4] = 1 - 2 * (x * x + z * z);
            m[5] = 2 * (y * z + x * w);
            m[6] = 2 * (x * z + y * w);
            m[7] = 2 * (y * z - x * w);
            m[8] = 1 - 2 * (x * x + y * y);
            p.ox = wp[p.bone * 3];
            p.oy = wp[p.bone * 3 + 1];
            p.oz = wp[p.bone * 3 + 2];
          }
        }
        let nn = 0;
        {
          const o = e4,
            x = wq[o],
            y = wq[o + 1],
            z = wq[o + 2],
            w = wq[o + 3],
            hx = 2 * (x * y - z * w),
            hy = 1 - 2 * (x * x + z * z),
            hz = 2 * (y * z + x * w);
          const ex = wp[m3],
            ey = wp[m3 + 1],
            ez = wp[m3 + 2],
            reach = 0.12 + FAR;
          for (let k = 0; k < B.parts.length; k++) {
            const p = B.parts[k],
              m = p.m;
            let hitIt = false;
            for (let c = 0; c < 4 && !hitIt; c++) {
              const f = c === 1 ? 0.5 : 1,
                px = c < 2 ? ex + (wx - ex) * (c ? f : 0) : c === 2 ? wx : wx + hx * 0.17,
                py = c < 2 ? ey + (wy - ey) * (c ? f : 0) : c === 2 ? wy : wy + hy * 0.17,
                pz = c < 2 ? ez + (wz - ez) * (c ? f : 0) : c === 2 ? wz : wz + hz * 0.17;
              const dx = px - p.ox,
                dy = py - p.oy,
                dz = pz - p.oz,
                h = dx * m[3] + dy * m[4] + dz * m[5];
              if (h < p.lo - reach || h > p.hi + reach) continue;
              const lx = dx * m[0] + dy * m[1] + dz * m[2],
                lz = dx * m[6] + dy * m[7] + dz * m[8];
              if (lx * lx + lz * lz < (p.rmax + reach) * (p.rmax + reach)) hitIt = true;
            }
            if (hitIt) near[nn++] = p;
          }
        }
        A.near = nn;
        if (nn > 0) {
          const raw = A.raw,
            rawW = A.rawW;
          for (let i = 0; i < 4; i++) {
            raw[i] = pose[u4 + i];
            raw[4 + i] = pose[m4 + i];
            raw[8 + i] = pose[e4 + i];
            rawW[i] = wq[u4 + i];
            rawW[4 + i] = wq[m4 + i];
          }
          rawW[8] = wp[m3];
          rawW[9] = wp[m3 + 1];
          rawW[10] = wp[m3 + 2];
          rawW[11] = wx;
          rawW[12] = wy;
          rawW[13] = wz;
          let ease = 0,
            left = 0,
            first = 0,
            sure = 1;
          for (let it = 0; it < 5; it++) {
            if (it) {
              this.restoreRawArmPose(A);
              Pt[5] = tx - wx;
              Pt[6] = ty - wy;
              Pt[7] = tz - wz;
              this.reachArmToOffsetTarget(A);
              solved = true;
            }
            const sub = A.sub;
            for (let i = 0; i < sub.length; i++) {
              const b = sub[i],
                p = par[b],
                b3 = b * 3,
                p4 = p * 4;
              qmul(wq, b * 4, wq, p4, pose, b * 4);
              const qx = wq[p4],
                qy = wq[p4 + 1],
                qz = wq[p4 + 2],
                qw = wq[p4 + 3],
                x = rp[b3],
                y = rp[b3 + 1],
                z = rp[b3 + 2],
                ux = 2 * (qy * z - qz * y),
                uy = 2 * (qz * x - qx * z),
                uz = 2 * (qx * y - qy * x);
              wp[b3] = wp[p * 3] + x + qw * ux + qy * uz - qz * uy;
              wp[b3 + 1] = wp[p * 3 + 1] + y + qw * uy + qz * ux - qx * uz;
              wp[b3 + 2] = wp[p * 3 + 2] + z + qw * uz + qx * uy - qy * ux;
            }
            let n = 0,
              lack = -BODY_SOFT;
            for (let k = 0; k < nn; k++) {
              const p = near[k],
                m = p.m,
                dx = wp[e3] - p.ox,
                dy = wp[e3 + 1] - p.oy,
                dz = wp[e3 + 2] - p.oz;
              wr[k * 2] = dx * m[0] + dy * m[1] + dz * m[2];
              wr[k * 2 + 1] = dx * m[6] + dy * m[7] + dz * m[8];
            }
            for (let g = 0; g < A.probes.length; g++) {
              const G = A.probes[g],
                b = G.bone,
                o = b * 4,
                pts = G.pts,
                bx = wp[b * 3],
                by = wp[b * 3 + 1],
                bz = wp[b * 3 + 2];
              const x = wq[o],
                y = wq[o + 1],
                z = wq[o + 2],
                w = wq[o + 3];
              const a0 = 1 - 2 * (y * y + z * z),
                a1 = 2 * (x * y - z * w),
                a2 = 2 * (x * z + y * w),
                b0 = 2 * (x * y + z * w),
                b1 = 1 - 2 * (x * x + z * z),
                b2 = 2 * (y * z - x * w),
                c0 = 2 * (x * z - y * w),
                c1 = 2 * (y * z + x * w),
                c2 = 1 - 2 * (x * x + y * y);
              Pt[0] = bx + a0 * G.cx + a1 * G.cy + a2 * G.cz;
              Pt[1] = by + b0 * G.cx + b1 * G.cy + b2 * G.cz;
              Pt[2] = bz + c0 * G.cx + c1 * G.cy + c2 * G.cz;
              Pt[4] = FAR + G.far;
              const gn = this.collectBodyPartsInReach(nn, G.near);
              if (!gn) continue;
              const gi = G.near;
              for (let i = 0; i < pts.length; i += 3) {
                const lx = pts[i],
                  ly = pts[i + 1],
                  lz = pts[i + 2];
                Pt[0] = bx + a0 * lx + a1 * ly + a2 * lz;
                Pt[1] = by + b0 * lx + b1 * ly + b2 * lz;
                Pt[2] = bz + c0 * lx + c1 * ly + c2 * lz;
                this.measureBodyDistance(gi, gn);
                const c = clear - hit[3];
                if (c <= -BODY_SOFT) continue;
                const t = n++ * 5;
                tries[t] = c;
                if (c > lack) lack = c;
                tries[t + 4] = G.fore ? (A.upper + A.fore) / (A.upper + (ly > 0 ? ly : 0)) : 1;
                this.computeBodyPushNormal(A.side);
                tries[t + 1] = N[0];
                tries[t + 2] = N[1];
                tries[t + 3] = N[2];
              }
            }
            {
              Pt[0] = wp[e3];
              Pt[1] = wp[e3 + 1];
              Pt[2] = wp[e3 + 2];
              this.measureBodyDistance(this.bodyAll, nn);
              const c = wristClear - hit[3];
              if (c > -BODY_SOFT) {
                const t = n++ * 5;
                tries[t] = c;
                tries[t + 4] = 1;
                if (c > lack) lack = c;
                this.computeBodyPushNormal(A.side);
                tries[t + 1] = N[0];
                tries[t + 2] = N[1];
                tries[t + 3] = N[2];
              }
            }
            if (it === 0) {
              A.deep = lack;
              const u = -lack / BODY_SOFT;
              ease = u >= 1 ? -lack : u <= -1 ? 0 : BODY_SOFT * (u + 1) * (u + 1) * 0.25;
            }
            const most = lack + ease;
            if (most < 5e-4) break;
            if (it === 0) first = most;
            else if (it === 2) {
              sure = 1 - smooth01((most / first - BODY_SURE[0]) / (BODY_SURE[1] - BODY_SURE[0]));
              if (sure <= 0) {
                tx = wx;
                ty = wy;
                tz = wz;
                break;
              }
            }
            if (it === 4) {
              left = most;
              break;
            }
            let sx = 0,
              sy = 0,
              sz = 0,
              sw = 0;
            const floor = most - ease - BODY_BLEND;
            for (let i = 0; i < n; i++) {
              const t = i * 5,
                k0 = tries[t] - floor;
              if (k0 <= 0) continue;
              const k = k0 * k0,
                g = tries[t + 4];
              sx += tries[t + 1] * g * k;
              sy += tries[t + 2] * g * k;
              sz += tries[t + 3] * g * k;
              sw += k;
            }
            if (this.bodyLog)
              this.bodyLog.push([
                ai,
                it,
                most,
                Math.hypot(sx, sy, sz) / sw,
                n,
                sx / sw,
                sy / sw,
                sz / sw,
                tx - wx,
                ty - wy,
                tz - wz,
                ease,
              ]);
            tx += (sx / sw) * most;
            ty += (sy / sw) * most;
            tz += (sz / sw) * most;
            const far = Math.sqrt((tx - wx) * (tx - wx) + (ty - wy) * (ty - wy) + (tz - wz) * (tz - wz));
            if (far > BODY_MOST) {
              const k = BODY_MOST / far;
              tx = wx + (tx - wx) * k;
              ty = wy + (ty - wy) * k;
              tz = wz + (tz - wz) * k;
            }
          }
          if (solved) this.restoreRawArmPose(A);
          if (left > BODY_LEFT[0]) sure *= 1 - smooth01((left - BODY_LEFT[0]) / (BODY_LEFT[1] - BODY_LEFT[0]));
          if (sure < 1) {
            tx = wx + (tx - wx) * sure;
            ty = wy + (ty - wy) * sure;
            tz = wz + (tz - wz) * sure;
          }
        }
      }
      const gx = (tx - wx) * allow,
        gy = (ty - wy) * allow,
        gz = (tz - wz) * allow;
      A.wx = gx;
      A.wy = gy;
      A.wz = gz;
      if (dt > 0) {
        const k =
          1 -
          Math.exp(-dt / (gx * gx + gy * gy + gz * gz > A.ox * A.ox + A.oy * A.oy + A.oz * A.oz ? BODY_IN : BODY_OUT));
        let mx = (gx - A.ox) * k,
          my = (gy - A.oy) * k,
          mz = (gz - A.oz) * k;
        const m = Math.sqrt(mx * mx + my * my + mz * mz),
          top = BODY_RATE * dt;
        if (m > top) {
          const c = top / m;
          mx *= c;
          my *= c;
          mz *= c;
        }
        A.ox += mx;
        A.oy += my;
        A.oz += mz;
      } else {
        A.ox = gx;
        A.oy = gy;
        A.oz = gz;
      }
      if (A.ox * A.ox + A.oy * A.oy + A.oz * A.oz < 1e-10) {
        A.ox = A.oy = A.oz = 0;
        A.on = false;
        continue;
      }
      A.on = true;
      busy = true;
      Pt[5] = A.ox;
      Pt[6] = A.oy;
      Pt[7] = A.oz;
      this.reachArmToOffsetTarget(A);
    }
    this.bodyBusy = busy;
  }
  reachArmToOffsetTarget(A) {
    const wp = this.wp,
      P = this.bodyPt,
      ik = this.ik,
      u3 = A.U * 3,
      sx = wp[u3],
      sy = wp[u3 + 1],
      sz = wp[u3 + 2],
      ox = P[5],
      oy = P[6],
      oz = P[7];
    let tx = A.rawW[11] + ox,
      ty = A.rawW[12] + oy,
      tz = A.rawW[13] + oz,
      pole = 0;
    const dx = tx - sx,
      dy = ty - sy,
      dz = tz - sz,
      d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const k = smooth01(Math.sqrt(ox * ox + oy * oy + oz * oz) / BODY_EASY[0]) * smooth01((-dy / d - 0.6) / 0.3);
    if (k > 0) {
      const most = (A.upper + A.fore) * (1 - BODY_EASY[1] * k);
      if (d > most) {
        const s = most / d;
        tx = sx + dx * s;
        ty = sy + dy * s;
        tz = sz + dz * s;
      }
      pole = BODY_EASY[2] * k;
    }
    ik[0] = tx;
    ik[1] = ty;
    ik[2] = tz;
    ik[3] = 0;
    ik[4] = pole;
    ik[5] = A.side ? -BODY_ELBOW[0] : BODY_ELBOW[0];
    ik[6] = BODY_ELBOW[1];
    ik[7] = 1;
    this.solveLimbIkFromBuffer(A.L);
  }
  bodyClear(p, margin) {
    const B = this.body;
    if (!B) return 0;
    const parts = B.parts,
      near = this.bodyNear,
      bones = this.rig.bones,
      P = this.bodyPt,
      hit = this.bodyHit,
      N = this.bodyN,
      n = parts.length;
    let S = 1;
    for (let k = 0; k < n; k++) {
      const q = parts[k],
        e = bones[q.bone].matrixWorld.elements,
        m = q.m,
        s = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]) || 1;
      S = s;
      m[0] = e[0] / s;
      m[1] = e[1] / s;
      m[2] = e[2] / s;
      m[3] = e[4] / s;
      m[4] = e[5] / s;
      m[5] = e[6] / s;
      m[6] = e[8] / s;
      m[7] = e[9] / s;
      m[8] = e[10] / s;
      q.ox = e[12] / s;
      q.oy = e[13] / s;
      q.oz = e[14] / s;
      near[k] = q;
    }
    const x0 = p.x / S,
      y0 = p.y / S,
      z0 = p.z / S;
    let x = x0,
      y = y0,
      z = z0;
    P[3] = margin + 0.005;
    for (let pass = 0; pass < 3; pass++) {
      P[0] = x;
      P[1] = y;
      P[2] = z;
      this.measureBodyDistance(this.bodyAll, n);
      const lack = margin - hit[3];
      if (lack < 5e-4) break;
      this.computeBodyPartNormal(hit[0] | 0, x < 0 ? 1 : 0);
      x += N[0] * lack;
      y += N[1] * lack;
      z += N[2] * lack;
    }
    p.x = x * S;
    p.y = y * S;
    p.z = z * S;
    return Math.sqrt((x - x0) * (x - x0) + (y - y0) * (y - y0) + (z - z0) * (z - z0)) * S;
  }
  restoreRawArmPose(A) {
    const pose = this.pose,
      wq = this.wq,
      wp = this.wp,
      raw = A.raw,
      rawW = A.rawW,
      u4 = A.U * 4,
      m4 = A.M * 4,
      e4 = A.E * 4,
      m3 = A.M * 3,
      e3 = A.E * 3;
    for (let i = 0; i < 4; i++) {
      pose[u4 + i] = raw[i];
      pose[m4 + i] = raw[4 + i];
      pose[e4 + i] = raw[8 + i];
      wq[u4 + i] = rawW[i];
      wq[m4 + i] = rawW[4 + i];
    }
    wp[m3] = rawW[8];
    wp[m3 + 1] = rawW[9];
    wp[m3 + 2] = rawW[10];
    wp[e3] = rawW[11];
    wp[e3 + 1] = rawW[12];
    wp[e3 + 2] = rawW[13];
  }

  events(it) {
    if (it.isMove) {
      if (it.stepL) this.emit('foot-l', '@move', null);
      if (it.stepR) this.emit('foot-r', '@move', null);
      return;
    }
    const e = it.entry,
      ev = e.events;
    if (!ev.length) return;
    const t0 = it.lastT,
      t = it.time;
    if (it.wraps === 0) {
      if (t > t0) {
        for (let i = 0; i < ev.length; i++) if (ev[i].t > t0 && ev[i].t <= t) this.emit(ev[i].name, e.name, ev[i].data);
      } else if (t < t0) {
        for (let i = 0; i < ev.length; i++) if (ev[i].t >= t && ev[i].t < t0) this.emit(ev[i].name, e.name, ev[i].data);
      }
    } else if (it.wraps > 0) {
      for (let i = 0; i < ev.length; i++)
        if ((ev[i].t > t0 && ev[i].t <= it.end) || (ev[i].t >= it.start && ev[i].t <= t))
          this.emit(ev[i].name, e.name, ev[i].data);
    } else {
      for (let i = 0; i < ev.length; i++)
        if ((ev[i].t < t0 && ev[i].t >= it.start) || (ev[i].t <= it.end && ev[i].t >= t))
          this.emit(ev[i].name, e.name, ev[i].data);
    }
  }

  applyLook(dt, rootYaw, rootPos, front) {
    const L = this.look,
      rig = this.rig,
      chain = rig.lookChain;
    if ((!L.on && L.amount < 1e-3 && Math.abs(L.yaw) < 1e-3 && Math.abs(L.pitch) < 1e-3) || chain.length < 6) {
      L.amount = 0;
      L.yaw = 0;
      L.pitch = 0;
      return;
    }
    const pose = this.pose,
      W = this.world,
      q = this.q4;
    let px = rig.baseP[0],
      py = rig.baseP[1],
      pz = rig.baseP[2];
    {
      const r = qrot(rig.baseQ, 0, this.pos[0] * rig.baseS, this.pos[1] * rig.baseS, this.pos[2] * rig.baseS);
      px += r[0];
      py += r[1];
      pz += r[2];
    }
    qmul(W, chain[0] * 4, rig.baseQ, 0, pose, chain[0] * 4);
    for (let k = 1; k < chain.length; k++) {
      const b = chain[k],
        p = rig.parent[b],
        rp = rig.restPos;
      const r = qrot(W, p * 4, rp[b * 3] * rig.baseS, rp[b * 3 + 1] * rig.baseS, rp[b * 3 + 2] * rig.baseS);
      px += r[0];
      py += r[1];
      pz += r[2];
      qmul(W, b * 4, W, p * 4, pose, b * 4);
    }
    const head = chain[5],
      chest = chain[3];
    let r = qrot(W, head * 4, rig.fwd[head * 3], rig.fwd[head * 3 + 1], rig.fwd[head * 3 + 2]);
    const hYaw = Math.atan2(r[0], r[2]),
      hPitch = Math.asin(clamp(r[1], -1, 1));
    r = qrot(W, chest * 4, rig.fwd[chest * 3], rig.fwd[chest * 3 + 1], rig.fwd[chest * 3 + 2]);
    const cYaw = Math.atan2(r[0], r[2]);
    let wantYaw = 0,
      wantPitch = 0,
      amount = 0;
    if (L.on && L.target) {
      const t = L.target,
        dx = t.x - rootPos.x,
        dy = t.y + L.offsetY - rootPos.y,
        dz = t.z - rootPos.z;
      const c = Math.cos(rootYaw),
        s = Math.sin(rootYaw);
      const lx = dx * c - dz * s - px,
        ly = dy - py,
        lz = dx * s + dz * c - pz,
        flat = Math.hypot(lx, lz);
      if (flat + Math.abs(ly) > 1e-4) {
        const tYaw = Math.atan2(lx, lz),
          tPitch = Math.atan2(ly, flat);
        const fromChest = wrapPi(tYaw - cYaw),
          off = Math.abs(fromChest);
        const kind = front && front.entry ? front.entry.kind : 'idle',
          byKind = L.always ? 1 : LOOK_BY_KIND[kind] !== undefined ? LOOK_BY_KIND[kind] : 0.7;
        const reach = Math.min(2.2, L.limit / Math.max(0.35, 1 - L.chest));
        amount = L.weight * byKind * (1 - smooth01((off - reach - 0.3) / 0.6));
        wantYaw = wrapPi(cYaw + clamp(fromChest, -reach, reach) - hYaw);
        wantPitch = clamp(tPitch, -L.limitPitch, L.limitPitch) - hPitch;
      }
    }
    const k = 1 - Math.exp(-dt * L.speed);
    L.amount += (amount - L.amount) * k;
    if (amount > 0) {
      L.yaw += (wantYaw - L.yaw) * k;
      L.pitch += (wantPitch - L.pitch) * k;
    }
    const yaw = L.yaw * L.amount,
      pitch = L.pitch * L.amount;
    if (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4) return;
    const ax = Math.cos(hYaw + yaw),
      az = -Math.sin(hYaw + yaw);
    for (let j = 2; j < 6; j++) {
      const b = chain[j],
        p = rig.parent[b],
        sh = (j < 4 ? L.chest : L.head) * (j % 2 ? 0.6 : 0.4);
      if (sh <= 0) continue;
      qaxis(q, 0, 0, 1, 0, yaw * sh);
      qaxis(q, 4, ax, 0, az, -pitch * sh);
      qmul(q, 0, q, 4, q, 0);
      qmul(q, 8, q, 0, W, p * 4);
      qcmul(q, 8, W, p * 4, q, 8);
      qmul(pose, b * 4, q, 8, pose, b * 4);
      qnorm(pose, b * 4);
    }
  }
}
