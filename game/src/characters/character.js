import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  Rig,
  Graph,
  LocomotionBlend,
  stripMixamoPrefix,
  compileClip,
  extractRoot,
  removeRoot,
  detrend,
  namedMask,
} from './animation-graph.js';
import { Retarget } from './retarget.js';
import { DEG } from '../core/math.js';

const LOOPING =
  /^(idle|(walk|run)_[fblr]$|sprint$|walk_careful_ip$|block_idle$|kneel_idle|pray_idle$|hurt_idle$|strafe)/;

export class Character {
  /** Clip data and per-character pose fixes come from clip-data.js. */
  constructor(ctx, o) {
    this.ctx = ctx;
    this.name = o.name || o.ref || o.model;
    this.figure = o.model;
    this.data = o.data || {};
    const src = ctx.assets.gltf(o.model);
    this.root = new THREE.Group();
    this.root.name = 'character:' + o.model;
    this.model = cloneSkinned(src.scene);
    this.root.add(this.model);
    this.scale = o.scale || 1;
    this.model.scale.setScalar(this.scale);
    this.bones = {};
    this.meshes = [];
    this.model.traverse((n) => {
      if (n.isBone) this.bones[stripMixamoPrefix(n.name)] = n;
      if (n.isMesh) {
        this.meshes.push(n);
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false;
      }
    });
    const hips = this.bones.Hips;
    if (!hips) throw new Error(`"${o.model}" has no Hips bone: is it a Mixamo rig?`);
    this.refModel = null;
    if (o.ref) {
      const ref = (this.refModel = cloneSkinned(ctx.assets.gltf(o.ref).scene)),
        skins = [];
      ref.traverse((n) => {
        if (n.isMesh) skins.push(n);
      });
      for (const m of skins) m.parent.remove(m);
      ref.name = 'reference:' + o.ref;
      ref.visible = false;
      ref.scale.setScalar(this.scale);
      this.root.add(ref);
    }
    let refHips = null;
    if (this.refModel)
      this.refModel.traverse((n) => {
        if (n.isBone && stripMixamoPrefix(n.name) === 'Hips' && !refHips) refHips = n;
      });
    if (this.refModel && !refHips) throw new Error(`"${o.ref}" has no Hips bone: is it a Mixamo rig?`);
    this.hipsName = (refHips || hips).name;
    this.rig = new Rig(this.refModel || this.model);
    const want = o.restFix !== undefined ? !!o.restFix : ctx.params.flag('restfix', !!this.data.$restOn);
    let baked = false;
    ctx.assets.gltf(o.clips).scene.traverse((n) => {
      if (n.userData && n.userData.restBaked) baked = true;
    });
    this.restBaked = baked;
    this.restFix = want && !baked && !!this.data.$rest;
    this.listeners = [];
    this.speed = 1;
    this.graph = new Graph(
      this.rig,
      (name) => this.clips.get(name) || null,
      (name, clip, data) => this.fire(name, clip, data),
    );
    this.clips = new Map();
    for (const raw of ctx.assets.gltf(o.clips).animations) this.addClip(raw);
    this.action = null;
    this.clip = null;
    this.mover = null;
    this.masks = new Map();
    this.motion = { x: 0, z: 0, yaw: 0 };
    this.sockets = new Map();
    this.hurt = this.defaultHurtCapsules();
    if (this.data.$fix) this.graph.setFix(this.data.$fix);
    if (this.restFix) this.rig.setRestFix(this.data.$rest);
    this.retarget = this.refModel ? new Retarget(this.rig, this.model) : null;
    if (this.data.$contact) this.graph.setContact(this.data.$contact);
    const sw = (opt, key, def) => (opt !== undefined ? !!opt : ctx.params.flag(key, !!def));
    this.floorFit = sw(o.floorFit, 'floorfit', this.data.$floorOn);
    this.footPlant = sw(o.footPlant, 'footplant', this.data.$plantOn);
    if (this.data.$body && this.data.$arm) this.graph.setBody(this.data.$body, this.data.$arm);
    const bf = o.bodyFit !== undefined ? o.bodyFit : ctx.params.has('bodyfit') ? ctx.params.get('bodyfit') : undefined;
    this.bodyFit = bf === undefined ? !!this.data.$bodyOn : bf !== false && bf !== 0 && bf !== '0';
    this.bodyFitAll = bf === 'all';
    if (this.retarget) this.bodyFit = false;
    this._owner = null;
    this._trace = null;
  }
  get bodyFit() {
    return this.graph.bodyFit;
  }
  set bodyFit(v) {
    this.graph.bodyFit = !!v && this.graph.arms.length > 0;
  }
  get bodyFitAll() {
    return this._bodyAll;
  }
  set bodyFitAll(v) {
    this._bodyAll = !!v;
  }
  bodyClear(point, margin = 0.07) {
    return this.graph.bodyClear(point, margin);
  }
  get owner() {
    if (this._owner) return this._owner;
    const c = this.ctx,
      b = c && c.boss,
      p = c && c.player;
    return (this._owner = b && b.char === this ? b : p && p.char === this ? p : null);
  }
  get shown() {
    const o = this.owner;
    return !!(o && o.puppet);
  }
  get floorFit() {
    return this.graph.floorFit;
  }
  set floorFit(v) {
    this.graph.floorFit = !!v && this.graph.limbs.length > 0;
  }
  get footPlant() {
    return this.graph.footPlant;
  }
  set footPlant(v) {
    this.graph.footPlant = !!v && this.graph.limbs.length > 0;
    if (!v) this.graph.unplant();
  }

  addClip(raw, name = raw.name) {
    const d = this.data[name] || {},
      hp = this.hipsName + '.position',
      hq = this.hipsName + '.quaternion';
    const tracks = raw.tracks
      .filter((t) => t.name.endsWith('.quaternion') || t.name === hp)
      .map((t) => ({ name: t.name, times: t.times, values: t.values, src: t }));
    const loop = d.loop !== undefined ? d.loop : LOOPING.test(name);
    const pos = tracks.find((t) => t.name === hp),
      rot = tracks.find((t) => t.name === hq);
    let root = null,
      carried = null;
    const own = (t) => {
      t.values = t.values.slice();
      t.src = null;
      return t.values;
    };
    if (pos && (!loop || d.root)) {
      const yaw = d.yaw && rot && rot.times.length === pos.times.length;
      const r = extractRoot(pos.times, pos.values, yaw ? rot.values : null);
      if (d.root !== undefined ? d.root : r.net > 0.12 || r.path > 0.5) {
        removeRoot(r, own(pos), yaw ? own(rot) : null);
        root = r;
      }
    } else if (pos && d.root !== false) {
      const p = pos.values,
        n = pos.times.length;
      if (Math.hypot(p[(n - 1) * 3] - p[0], p[(n - 1) * 3 + 2] - p[2]) > 0.25) carried = detrend(pos.times, own(pos));
    }
    const data =
      carried && d.groundSpeed === undefined
        ? Object.assign({}, d, {
            groundSpeed: Math.hypot(carried[0], carried[1]),
            dir: [carried[0] / Math.hypot(carried[0], carried[1]), carried[1] / Math.hypot(carried[0], carried[1])],
          })
        : d;
    const events = (d.events || []).slice();
    if (typeof d.recover === 'number' && !events.some((e) => e.name === 'recover'))
      events.push({ t: d.recover, name: 'recover' });
    events.sort((a, b) => a.t - b.t);
    const entry = {
      name,
      duration: raw.duration,
      loop,
      root,
      speed: d.speed || 1,
      fade: d.fade,
      events,
      data,
      kind: d.kind || (loop ? 'idle' : 'act'),
      trim: d.trim || null,
      recover: typeof d.recover === 'number' ? d.recover : null,
      sampler: compileClip(this.rig, tracks, raw.duration),
      _clip: null,
      floor: Array.isArray(d.floor) && d.floor.length >= 4 ? Float32Array.from(d.floor) : null,
      apart: typeof d.apart === 'number' ? d.apart : 0,
      kneel: Array.isArray(d.kneel) && d.kneel.length >= 3 ? Float32Array.from(d.kneel) : null,
      headBack: typeof d.headBack === 'number' ? d.headBack : 0,
      body: d.body !== false,
      get clip() {
        if (!this._clip)
          this._clip = new THREE.AnimationClip(
            name,
            raw.duration,
            tracks.map(
              (t) =>
                t.src ||
                (t.name.endsWith('.position')
                  ? new THREE.VectorKeyframeTrack(t.name, t.times, t.values)
                  : new THREE.QuaternionKeyframeTrack(t.name, t.times, t.values)),
            ),
          );
        return this._clip;
      },
    };
    this.clips.set(name, entry);
    return entry;
  }
  has(name) {
    return name === '@move' ? !!this.mover : this.clips.has(name);
  }
  info(name) {
    return this.data[name] || null;
  }

  setScale(s) {
    this.scale = s;
    this.model.scale.setScalar(s);
    if (this.refModel) this.refModel.scale.setScalar(s);
    this.rig.refreshBase();
    if (this.retarget) this.retarget.refresh();
  }

  play(name, opts = {}) {
    if (name === '@move') return this.playMove(opts);
    const e = this.clips.get(name);
    if (!e) {
      console.warn(`${this.name}: no clip "${name}"`);
      return null;
    }
    const cur = this.action;
    if (cur && this.clip === e && !opts.force && e.loop && this.graph.front === cur) {
      if (opts.speed) cur.timeScale = opts.speed * e.speed;
      return cur;
    }
    const fade = opts.fade !== undefined ? opts.fade : e.fade !== undefined ? e.fade : 0.15;
    const loop = opts.loop !== undefined ? opts.loop : e.loop;
    const trim = opts.trim && e.trim ? e.trim : null,
      start = trim ? trim[0] : 0,
      end = trim ? trim[1] : e.duration;
    let at = opts.at !== undefined && opts.at !== null ? opts.at : start;
    if ((opts.at === undefined || opts.at === null) && loop && !opts.force) {
      const base = this.graph.base;
      for (let i = base.length - 1; i >= 0; i--)
        if (!base[i].isMove && base[i].entry === e) {
          at = base[i].time;
          break;
        }
    }
    const p = this.graph.play(e, { fade, loop, speed: (opts.speed || 1) * e.speed, at, start, end });
    this.action = p;
    this.clip = e;
    return p;
  }

  locomotion(set, opts) {
    for (const k of [set.idle, set.sprint, ...Object.values(set.walk || {}), ...Object.values(set.run || {})])
      if (k && !this.clips.has(k)) throw new Error(`${this.name}: locomotion() names a clip it has not got: "${k}"`);
    const was = this.mover,
      front = was && this.graph.front === was;
    this.mover = new LocomotionBlend(this.graph, set, opts);
    if (was) {
      const i = this.graph.base.indexOf(was);
      if (i >= 0) {
        this.mover.alpha = was.alpha;
        this.mover.fade = was.fade;
        this.mover.weight = was.weight;
        this.mover.phase = was.phase;
        this.graph.base[i] = this.mover;
      }
      if (front) {
        this.graph.front = this.mover;
        this.action = this.mover;
        this.clip = this.mover.entry;
      }
    }
    return this;
  }
  playMove(opts = {}) {
    const mv = this.mover;
    if (!mv) {
      console.warn(`${this.name}: play('@move') before locomotion()`);
      return null;
    }
    if (this.graph.front === mv) return mv;
    mv.fresh = true;
    mv.flipT = 0;
    this.graph.push(mv, opts.fade !== undefined ? opts.fade : 0.2);
    this.action = mv;
    this.clip = mv.entry;
    return mv;
  }
  move(vx, vz) {
    const mv = this.mover;
    if (mv) {
      mv.vx = vx / this.scale;
      mv.vz = vz / this.scale;
    }
  }

  maskFor(mask) {
    if (typeof mask !== 'string') return namedMask(this.rig, mask);
    let m = this.masks.get(mask);
    if (!m) this.masks.set(mask, (m = namedMask(this.rig, mask)));
    return m;
  }
  overlay(name, opts = {}) {
    const e = this.clips.get(name);
    if (!e) {
      console.warn(`${this.name}: no clip "${name}"`);
      return null;
    }
    const cur = this.graph.overlayFront;
    if (cur && cur.name === name && !opts.force && cur.play.loop) {
      if (opts.weight !== undefined) cur.gain = opts.weight;
      if (opts.speed) cur.play.timeScale = opts.speed * e.speed;
      return cur.play;
    }
    const trim = opts.trim && e.trim ? e.trim : null,
      start = trim ? trim[0] : 0,
      end = trim ? trim[1] : e.duration;
    return this.graph.overlay(e, {
      mask: this.maskFor(opts.mask || 'upper'),
      fade: opts.fade !== undefined ? opts.fade : 0.15,
      loop: opts.loop !== undefined ? opts.loop : e.loop,
      speed: (opts.speed || 1) * e.speed,
      weight: opts.weight !== undefined ? opts.weight : 1,
      at: opts.at !== undefined && opts.at !== null ? opts.at : start,
      hold: !!opts.hold,
      start,
      end,
    });
  }
  overlayOff(fade = 0.15) {
    this.graph.overlayOff(fade);
  }
  get overlayName() {
    const o = this.graph.overlayFront;
    return o ? o.name : null;
  }
  get overlayAction() {
    const o = this.graph.overlayFront;
    return o ? o.play : null;
  }

  additive(name, opts = {}) {
    const e = this.clips.get(name);
    if (!e) {
      console.warn(`${this.name}: no clip "${name}"`);
      return null;
    }
    if (typeof opts === 'number') opts = { weight: opts };
    const at = opts.at !== undefined ? opts.at : 0;
    return this.graph.additive(e, {
      weight: opts.weight !== undefined ? opts.weight : 1,
      speed: (opts.speed || 1) * e.speed,
      at,
      end: opts.end !== undefined ? opts.end : e.duration,
      fadeIn: opts.fadeIn !== undefined ? opts.fadeIn : 0.04,
      fadeOut: opts.fadeOut !== undefined ? opts.fadeOut : 0.18,
      mask: opts.mask ? this.maskFor(opts.mask) : null,
    });
  }

  look(point, opts) {
    const L = this.graph.look;
    if (typeof opts === 'number') opts = { weight: opts };
    L.target = point || null;
    L.on = !!point;
    if (!opts) return;
    const ang = (v) => (v > 3.5 ? v * DEG : v);
    if (opts.weight !== undefined) L.weight = opts.weight;
    if (opts.speed !== undefined) L.speed = opts.speed;
    if (opts.head !== undefined) L.head = opts.head;
    if (opts.chest !== undefined) L.chest = opts.chest;
    if (opts.limit !== undefined) L.limit = ang(opts.limit);
    if (opts.limitPitch !== undefined) L.limitPitch = ang(opts.limitPitch);
    if (opts.offsetY !== undefined) L.offsetY = opts.offsetY;
    if (opts.always !== undefined) L.always = !!opts.always;
  }

  get time() {
    return this.action ? this.action.time : 0;
  }
  get duration() {
    return this.clip ? this.clip.duration : 0;
  }
  get phase() {
    return this.clip ? this.action.time / this.clip.duration : 0;
  }
  get done() {
    return !!this.action && this.action.done;
  }
  get clipName() {
    return this.clip ? this.clip.name : null;
  }
  get recover() {
    return this.clip && this.clip.recover !== undefined ? this.clip.recover : null;
  }
  get recovered() {
    const r = this.recover;
    return r !== null ? this.time >= r : this.done;
  }

  update(dt) {
    this.graph.realDt = dt;
    if (this._trace && dt > 0) this.traceStep();
    if (this.graph.bodyFit) this.graph.bodyShown = this._bodyAll || this.shown ? 1 : 0;
    const m = this.motion,
      g = this.graph.update(dt * this.speed, this.root.rotation.y, this.root.position);
    if (this.retarget) this.retarget.apply();
    m.x = g.x * this.scale;
    m.z = g.z * this.scale;
    m.yaw = g.yaw;
    return m;
  }
  trace(seconds, name) {
    this._trace = {
      left: Math.max(1, Math.round(seconds * 60)),
      name,
      t0: this.ctx.game && typeof this.ctx.game.time === 'number' ? this.ctx.game.time : 0,
      bones: this.rig.bones.map((b) => stripMixamoPrefix(b.name)),
      steps: [],
    };
  }
  traceStep() {
    const T = this._trace,
      r5 = (v) => Math.round(v * 1e5) / 1e5,
      h = this.rig.bones[this.rig.hips].position,
      row = [r5(h.x), r5(h.y), r5(h.z)];
    for (const b of this.rig.bones)
      row.push(r5(b.quaternion.x), r5(b.quaternion.y), r5(b.quaternion.z), r5(b.quaternion.w));
    T.steps.push(row);
    if (--T.left > 0) return;
    this._trace = null;
    if (typeof fetch === 'function')
      fetch('/__shot/' + T.name, {
        method: 'POST',
        body: JSON.stringify({ t0: T.t0, bones: T.bones, steps: T.steps }),
      }).catch((e) => console.error('trace: ' + e.message));
  }
  fire(name, clip, data) {
    for (const fn of this.listeners) fn({ name, clip, data });
  }
  on(fn) {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  tposeWorld(bone, out = new THREE.Quaternion()) {
    if (this.retarget) return this.retarget.tposeWorld(bone, out);
    const i = this.rig.index[bone];
    if (i === undefined) throw new Error(`${this.name}: no bone "${bone}"`);
    const w = this.rig.tposeWorld();
    return out.set(w[i * 4], w[i * 4 + 1], w[i * 4 + 2], w[i * 4 + 3]);
  }

  socket(bone, key = bone, opts) {
    let s = this.sockets.get(key);
    if (!s) {
      const b = this.bones[bone];
      if (!b) throw new Error(`${this.name}: no bone "${bone}"`);
      s = new THREE.Object3D();
      s.name = 'socket:' + key;
      b.add(s);
      this.sockets.set(key, s);
      if (opts && opts.square) this.tposeWorld(bone, s.quaternion).invert();
    }
    return s;
  }

  defaultHurtCapsules() {
    const B = this.bones,
      list = [];
    const add = (a, b, r) => {
      if (B[a] && B[b]) list.push({ a: B[a], b: B[b], r });
    };
    add('Hips', 'Spine2', 0.24);
    add('Spine2', 'Head', 0.2);
    add('Head', 'HeadTop_End', 0.14);
    for (const s of ['Left', 'Right']) {
      add(s + 'UpLeg', s + 'Leg', 0.13);
      add(s + 'Leg', s + 'Foot', 0.1);
      add(s + 'Arm', s + 'ForeArm', 0.09);
      add(s + 'ForeArm', s + 'Hand', 0.08);
    }
    return list;
  }

  dispose() {
    this.listeners.length = 0;
    this.graph.base.length = 0;
    this.graph.overlays.length = 0;
    this.graph.additives.length = 0;
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
