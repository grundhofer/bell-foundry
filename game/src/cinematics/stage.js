import * as THREE from 'three';
import { clamp, Spring } from './curves.js';
import { handFrame, palmThumb } from '../characters/weapons.js';
import { angleDiff } from '../core/math.js';

const _v = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _qi = new THREE.Quaternion(),
  _r = new THREE.Quaternion(),
  _ax = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0),
  _gapv = new THREE.Vector3();

class HeadTurn {
  constructor(f) {
    const B = f.char.bones;
    this.f = f;
    this.bones = [B.Spine2, B.Neck, B.Head].filter(Boolean);
    this.share = this.bones.length === 3 ? [0.18, 0.3, 0.52] : this.bones.map(() => 1 / this.bones.length);
    this.base = this.bones.map(() => new THREE.Quaternion());
    this.last = this.bones.map(() => new THREE.Quaternion());
    this.mine = this.bones.map(() => false);
    this.yaw = new Spring(0);
    this.pitch = new Spring(0);
    this.point = new THREE.Vector3();
    this.weight = 0;
    this.rate = 3;
    this.limit = 1.0;
    this.on = false;
  }
  aim(point, o = {}) {
    if (point) {
      this.point.copy(point);
      this.weight = o.weight === undefined ? 1 : o.weight;
      this.on = true;
    } else this.weight = 0;
    this.rate = o.rate || o.speed || 3;
    this.limit = o.limit || 1.0;
  }
  drop() {
    for (let i = 0; i < this.bones.length; i++)
      if (this.mine[i] && this.bones[i].quaternion.equals(this.last[i])) this.bones[i].quaternion.copy(this.base[i]);
    this.mine.fill(false);
    this.on = false;
    this.yaw.reset(0);
    this.pitch.reset(0);
  }
  update(dt) {
    if (!this.on) return;
    const f = this.f,
      head = this.bones[this.bones.length - 1];
    let wy = 0,
      wp = 0;
    if (this.weight > 0) {
      head.getWorldPosition(_v);
      const dx = this.point.x - _v.x,
        dy = this.point.y - _v.y,
        dz = this.point.z - _v.z;
      wy = clamp(angleDiff(Math.atan2(dx, dz), f.yaw), -this.limit, this.limit) * this.weight;
      wp = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.45, 0.45) * this.weight;
    }
    const yaw = this.yaw.step(wy, this.rate, dt),
      pitch = this.pitch.step(wp, this.rate, dt);
    if (this.weight === 0 && Math.abs(yaw) < 2e-3 && Math.abs(pitch) < 2e-3) {
      this.drop();
      return;
    }
    _ax.set(Math.cos(f.yaw + yaw), 0, -Math.sin(f.yaw + yaw));
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i],
        k = this.share[i];
      if (!this.mine[i] || !b.quaternion.equals(this.last[i])) this.base[i].copy(b.quaternion);
      _r.setFromAxisAngle(UP, yaw * k);
      _q.setFromAxisAngle(_ax, -pitch * k);
      _r.multiply(_q);
      b.parent.getWorldQuaternion(_q);
      _qi.copy(_q).invert();
      b.quaternion.copy(_qi).multiply(_r).multiply(_q).multiply(this.base[i]);
      this.last[i].copy(b.quaternion);
      this.mine[i] = true;
    }
  }
}

const _ga = new THREE.Vector3(),
  _gb = new THREE.Vector3(),
  _gc = new THREE.Vector3(),
  _gt = new THREE.Vector3(),
  _gu = new THREE.Vector3(),
  _gw = new THREE.Vector3();
const _gf = new THREE.Vector3(),
  _gB = new THREE.Vector3(),
  _gn = new THREE.Vector3(),
  _fd = new THREE.Vector3(),
  _nd = new THREE.Vector3(),
  _gx = new THREE.Vector3(),
  _gs = new THREE.Vector3();
const _gh = new THREE.Vector3();
const _m1 = new THREE.Matrix4(),
  _m2 = new THREE.Matrix4(),
  _d0 = new THREE.Quaternion(),
  _d1 = new THREE.Quaternion(),
  _d2 = new THREE.Quaternion(),
  _hq = new THREE.Quaternion(),
  _pq = new THREE.Quaternion(),
  _pi = new THREE.Quaternion();
const IDENT = new THREE.Quaternion();
const acos1 = (x) => Math.acos(x < -1 ? -1 : x > 1 ? 1 : x);
function turnWorld(bone, dq) {
  bone.parent.matrixWorld.decompose(_gs, _pq, _gs);
  bone.quaternion.premultiply(_pi.copy(_pq).invert().multiply(dq).multiply(_pq));
  bone.updateMatrixWorld(true);
}
class Grasp {
  constructor(f, side = 'Right') {
    const B = f.char.bones;
    this.f = f;
    this.sign = side === 'Right' ? 1 : -1;
    this.upper = B[side + 'Arm'];
    this.fore = B[side + 'ForeArm'];
    this.hand = B[side + 'Hand'];
    this.index = B[side + 'HandIndex1'];
    this.thumb = B[side + 'HandThumb1'];
    this.fingers = [1, 2, 3].map((k) => B[side + 'HandIndex' + k]).filter(Boolean);
    this.thumbs = [1, 2, 3].map((k) => B[side + 'HandThumb' + k]).filter(Boolean);
    this.ok = !!(this.upper && this.fore && this.hand && this.index && this.thumb);
    this.palm = this.ok ? palmThumb(f.char, side) : null;
    this.kitFingers = !!f.char.retarget;
    this.point = new THREE.Vector3();
    this.axis = new THREE.Vector3(0, 1, 0);
    this.weight = 0;
    this.grip = 0;
    this.swing = 0;
    this.hollow = [0.05, 0.031];
    const sock = this.kitFingers && B.RightHand && B.RightHand.children.find((c) => c.name === 'grip:Right');
    if (sock && sock.userData.rest) {
      const H = handFrame(f.char, 'Right', {}),
        d = new THREE.Vector3().setFromMatrixPosition(sock.userData.rest).sub(H.hand);
      this.hollow = [d.dot(H.f), d.dot(H.n)];
    }
    this.curl = [74, 86, 55];
    this.wrap = [38, 24, 32];
  }
  frame() {
    _gh.setFromMatrixPosition(this.hand.matrixWorld);
    _gf.setFromMatrixPosition(this.index.matrixWorld).sub(_gh).normalize();
    if (this.palm) _gB.copy(this.palm).transformDirection(this.hand.matrixWorld);
    else _gB.setFromMatrixPosition(this.thumb.matrixWorld).sub(_gh);
    _gB.addScaledVector(_gf, -_gB.dot(_gf)).normalize();
    _gn.crossVectors(_gB, _gf);
    if (this.sign < 0) _gn.negate();
  }
  update() {
    const w = this.weight;
    if (!this.ok || w <= 0.001) return;
    const S = this.f.char.scale || 1,
      up = this.upper,
      fo = this.fore,
      ha = this.hand,
      A = this.axis;
    _ga.setFromMatrixPosition(up.matrixWorld);
    _fd.copy(this.point).sub(_ga);
    _fd.addScaledVector(A, -_fd.dot(A)).normalize();
    if (this.swing) _fd.applyAxisAngle(A, this.swing);
    _nd.crossVectors(A, _fd);
    if (this.sign < 0) _nd.negate();
    this.frame();
    _m1.makeBasis(_gf, _gB, _gn).transpose();
    _m2.makeBasis(_fd, A, _nd).multiply(_m1);
    _d0.setFromRotationMatrix(_m2);
    if (w < 0.999) _d0.copy(IDENT).slerp(_d2.setFromRotationMatrix(_m2), w);
    ha.matrixWorld.decompose(_gs, _hq, _gs);
    _hq.premultiply(_d0);
    _gc.setFromMatrixPosition(ha.matrixWorld);
    _gt
      .copy(this.point)
      .addScaledVector(_fd, -this.hollow[0] * S)
      .addScaledVector(_nd, -this.hollow[1] * S)
      .sub(_gc)
      .multiplyScalar(w)
      .add(_gc);
    _gb.setFromMatrixPosition(fo.matrixWorld);
    const l1 = _ga.distanceTo(_gb),
      l2 = _gb.distanceTo(_gc),
      eps = 0.002 * l1;
    const lat = Math.min(Math.max(_ga.distanceTo(_gt), Math.abs(l1 - l2) + eps), l1 + l2 - eps);
    _gu.subVectors(_gc, _ga).normalize();
    _gw.subVectors(_gb, _ga).normalize();
    const a0 = acos1(_gu.dot(_gw)),
      b0 = acos1(-_gw.dot(_gx.subVectors(_gc, _gb).normalize()));
    _gx.crossVectors(_gu, _gw);
    if (_gx.lengthSq() < 1e-10) _gx.set(0, 0, 1);
    _gx.normalize();
    const a1 = acos1((l1 * l1 + lat * lat - l2 * l2) / (2 * l1 * lat)),
      b1 = acos1((l1 * l1 + l2 * l2 - lat * lat) / (2 * l1 * l2));
    _d1.setFromAxisAngle(_gx, b1 - b0);
    _d0.setFromAxisAngle(_gx, a1 - a0);
    _gw.subVectors(_gt, _ga).normalize();
    _d2.setFromUnitVectors(_gu, _gw).multiply(_d0);
    turnWorld(fo, _d1);
    turnWorld(up, _d2);
    fo.matrixWorld.decompose(_gs, _pq, _gs);
    ha.quaternion.copy(_pq.invert().multiply(_hq));
    ha.updateMatrixWorld(true);
    const g = this.grip * w;
    if (g <= 0.001 || this.kitFingers) return;
    this.frame();
    for (let i = 0; i < this.fingers.length; i++)
      turnWorld(this.fingers[i], _d0.setFromAxisAngle(_gB, (this.sign * this.curl[i] * g * Math.PI) / 180));
    if (this.thumbs.length) {
      this.frame();
      turnWorld(this.thumbs[0], _d0.setFromAxisAngle(_gf, (-this.sign * this.wrap[0] * g * Math.PI) / 180));
      if (this.thumbs[1]) {
        _gn.applyQuaternion(_d0);
        _gx
          .setFromMatrixPosition(this.thumbs[1].matrixWorld)
          .sub(_gu.setFromMatrixPosition(this.thumbs[0].matrixWorld))
          .normalize()
          .cross(_gn)
          .normalize();
        for (let i = 1; i < this.thumbs.length; i++)
          turnWorld(this.thumbs[i], _d0.setFromAxisAngle(_gx, (this.wrap[i] * g * Math.PI) / 180));
      }
    }
  }
}

export class DampedSpring {
  constructor(x = 0, v = 0) {
    this.x = x;
    this.v = v;
  }
  set(x, v = 0) {
    this.x = x;
    this.v = v;
    return this;
  }
  step(target, omega, zeta, dt) {
    this.v += (omega * omega * (target - this.x) - 2 * zeta * omega * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class ArmPendulum {
  constructor() {
    this.on = false;
    this.phi = 0;
    this.w = 0;
    this.phi0 = 1;
    this.len = 1;
    this.x = 1;
    this.z = 0;
  }
  release(shoulder, hand, w0 = 0) {
    const ex = hand.x - shoulder.x,
      ey = hand.y - shoulder.y,
      ez = hand.z - shoulder.z,
      l = Math.hypot(ex, ey, ez) || 1,
      h = Math.hypot(ex, ez);
    this.on = true;
    this.len = l;
    this.phi = this.phi0 = Math.max(0.02, Math.acos(clamp(-ey / l, -1, 1)));
    this.w = w0;
    if (h > 1e-4) {
      this.x = ex / h;
      this.z = ez / h;
    }
    return this;
  }
  step(g, drag, stop, dt) {
    const pull = Math.sin(this.phi) + 0.6 * Math.max(0, -Math.cos(this.phi));
    this.w += (-g * pull - drag * this.w) * dt;
    this.phi += this.w * dt;
    if (this.phi < -stop) {
      this.phi = -stop;
      this.w = Math.abs(this.w) * 0.25;
    }
    return this.phi;
  }
  get down() {
    return clamp(1 - this.phi / this.phi0, 0, 1);
  }
  point(shoulder, len, out, fold = 0.4) {
    const sn = Math.sin(this.phi),
      l = len * (1 - fold * sn * sn),
      s = sn * l;
    return out.set(shoulder.x + this.x * s, shoulder.y - Math.cos(this.phi) * l, shoulder.z + this.z * s);
  }
}

export class Stage {
  constructor(ctx) {
    this.ctx = ctx;
    this.dirty = new Set();
    this.turns = new Map();
    this.points = new Map();
    this.planted = false;
    this.grasps = new Map();
    this.graspsL = new Map();
    this.relaxed = null;
    this.keyRest = new Map();
    this.posed = new Map();
    this.kept = new Map();
    this.held = new Map();
    this.lookOpts = {
      weight: 1,
      speed: 3,
      limit: undefined,
      limitPitch: undefined,
      always: true,
      head: undefined,
      chest: undefined,
    };
    this.lookOff = { speed: 3, limitPitch: undefined };
    this.playMode = 'free';
    this.subtitleOn = false;
    this.nameOn = false;
  }
  get pilgrim() {
    return this.ctx.player;
  }

  puppets(on) {
    this.ctx.player.puppet = on;
    this.ctx.boss.puppet = on;
  }

  place(f, x, z, yaw) {
    const near =
      Math.abs(f.pos.x - x) + Math.abs(f.pos.z - z) < 0.02 &&
      (yaw === undefined || Math.abs(angleDiff(yaw, f.yaw)) < 0.01);
    f.pos.set(x, 0, z);
    if (yaw !== undefined) f.yaw = yaw;
    if (!near) this.dirty.add(f);
  }

  has(f, clip) {
    const c = f.char;
    return c.has ? c.has(clip) : !!(c.clips && c.clips.has(clip));
  }

  play(f, clip, o = {}) {
    if (!this.has(f, clip)) {
      console.warn(`cine: ${f.name || 'fighter'} has no clip "${clip}"`);
      clip = 'idle';
    }
    const fade = o.fade === undefined ? 0.3 : o.fade;
    const a = f.char.play(clip, { fade, at: o.at || 0, speed: o.speed || 1, loop: o.loop, force: true });
    if (a && o.speed === 0) a.timeScale = 0;
    if (fade === 0) this.dirty.add(f);
    return a;
  }

  flush() {
    if (!this.dirty.size) return;
    for (const f of this.dirty) {
      const turn = this.turns.get(f);
      if (turn) turn.mine.fill(false);
      const own = f.char.retarget && f.kit && f.kit.hands,
        hold = own ? [] : this.fingers(f);
      for (const h of hold) h.q.copy(h.bone.quaternion);
      f.char.update(0);
      if (own) f.kit.hands();
      else for (const h of hold) h.bone.quaternion.copy(h.q);
      f.root.updateMatrixWorld(true);
      if (f.kit && f.kit.teleport) f.kit.teleport();
    }
    this.dirty.clear();
  }

  // A retargeted figure's fingers belong to its kit, which a re-pose here would not run again.
  fingers(f) {
    let list = this.held.get(f);
    if (!list) {
      list = [];
      if (f.char.retarget)
        for (const k in f.char.bones)
          if (/Hand(Index|Thumb|Middle|Ring|Pinky)\d$/.test(k))
            list.push({ bone: f.char.bones[k], q: new THREE.Quaternion() });
      this.held.set(f, list);
    }
    return list;
  }

  bone(f, name, out) {
    const b = f.char.bones[name];
    if (b) b.getWorldPosition(out);
    else out.set(f.pos.x, 1.5 * (f.char.scale || 1), f.pos.z);
    return out;
  }

  look(f, point, o = {}) {
    const c = f.char;
    if (point) {
      let p = this.points.get(f);
      if (!p) this.points.set(f, (p = new THREE.Vector3()));
      point = p.copy(point);
    }
    if (c.look && !Stage.ownLook) {
      const q = this.lookOpts;
      if (point) {
        q.weight = o.weight === undefined ? 1 : o.weight;
        q.speed = o.rate || 3;
        q.limit = o.limit;
        q.limitPitch = o.limitPitch;
        q.head = o.head;
        q.chest = o.chest;
        c.look(point, q);
      } else {
        this.lookOff.speed = o.rate || 3;
        this.lookOff.limitPitch = o.limitPitch;
        c.look(null, this.lookOff);
      }
      return;
    }
    let t = this.turns.get(f);
    if (!t) {
      if (!point) return;
      this.turns.set(f, (t = new HeadTurn(f)));
    }
    t.aim(point, o);
  }

  /** Restore the eased head and chest pose when a cutscene hands back control. */
  lookKeep(f, rate = 3) {
    const L = f.char.graph && f.char.graph.look;
    if (L && 'amount' in L && !this.kept.has(f))
      this.kept.set(f, { yaw: L.yaw, pitch: L.pitch, amount: L.amount, rate, t: 0, fresh: true });
  }

  update(dt) {
    this.ctx.player.root.updateMatrixWorld();
    this.ctx.boss.root.updateMatrixWorld();
    for (const t of this.turns.values()) t.update(dt);
    for (const g of this.grasps.values()) g.update();
    for (const g of this.graspsL.values()) g.update();
    for (const k of this.kept.values()) {
      if (k.fresh) k.fresh = false;
      else k.t += dt;
    }
  }

  grasp(f, side = 'Right') {
    const m = side === 'Right' ? this.grasps : this.graspsL;
    let g = m.get(f);
    if (!g) m.set(f, (g = new Grasp(f, side)));
    return g;
  }

  relax(f, on, fade = 0.3) {
    const c = f.char;
    if (!c.overlay || !this.has(f, 'look_around')) return;
    if (on) {
      const h = c.overlay('look_around', { mask: 'upper', fade, loop: true, at: 5.5, force: true });
      if (h) h.timeScale = 0;
      this.relaxed = f;
    } else if (c.overlayName === 'look_around') {
      c.overlayOff(fade);
      this.relaxed = null;
    }
  }

  pose(f, clip, at, weight, mask = 'arms') {
    const c = f.char;
    if (!c.overlay || !this.has(f, clip)) return;
    if (weight <= 0.002) {
      if (c.overlayName === clip) c.overlayOff(0.12);
      this.posed.delete(f);
      return;
    }
    const h = c.overlay(clip, { mask, weight, loop: true, at, fade: 0 });
    if (h) h.timeScale = 0;
    this.posed.set(f, clip);
  }

  mark(f, clip, name, fallback) {
    const c = f.char,
      i = c.info ? c.info(clip) : null,
      v = i && i.marks ? i.marks[name] : undefined;
    return Number.isFinite(v) ? v : fallback;
  }

  carried(f, clip, t, out) {
    const cl = f.char.clips,
      e = cl && cl.get ? cl.get(clip) : null,
      r = e && e.root;
    out.x = 0;
    out.z = 0;
    out.yaw = 0;
    if (!r || !r.times || r.times.length < 2) return false;
    const T = r.times,
      n = T.length;
    let lo = 0,
      hi = n - 1;
    // eslint-disable-next-line no-useless-assignment -- this branch only keeps lo = 0 (and skips the checks below); hi is reset after the search
    if (t <= T[0]) hi = 1;
    else if (t >= T[n - 1]) lo = n - 2;
    else
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (T[m] <= t) lo = m;
        else hi = m;
      }
    hi = lo + 1;
    const k = clamp((t - T[lo]) / (T[hi] - T[lo]), 0, 1);
    out.x = r.x[lo] + (r.x[hi] - r.x[lo]) * k;
    out.z = r.z[lo] + (r.z[hi] - r.z[lo]) * k;
    out.yaw = r.yaw[lo] + (r.yaw[hi] - r.yaw[lo]) * k;
    return true;
  }

  step(f, side) {
    const b = f.char.bones[side === 'l' ? 'LeftFoot' : 'RightFoot'];
    if (!b) return;
    b.getWorldPosition(_v);
    _v.y = 0;
    this.ctx.bus.emit('step', { who: f === this.ctx.boss ? 'boss' : 'player', pos: _v, foot: side, run: false });
  }

  pivot(f, px, pz, dyaw) {
    const c = Math.cos(dyaw),
      s = Math.sin(dyaw),
      x = f.pos.x - px,
      z = f.pos.z - pz;
    f.pos.x = px + x * c + z * s;
    f.pos.z = pz - x * s + z * c;
    f.yaw += dyaw;
  }

  hidePilgrim() {
    const p = this.ctx.player,
      d = this.ctx.arena.spawn.door;
    this.place(p, d.x, d.z + 8, Math.PI);
  }

  plant(x, z, yaw = 0) {
    const k = this.ctx.boss.kit;
    if (k.plantSword) {
      k.plantSword(x, z, yaw);
      this.planted = true;
    }
  }
  take() {
    const k = this.ctx.boss.kit;
    if (k.takeSword && (this.planted || k.swordPlanted)) k.takeSword();
    this.planted = false;
  }
  /** How much the boss glows: her light in cutscenes follows it (Boss.updateLight). */
  glow(level) {
    this.ctx.boss.kit.glow = level;
  }
  blade(glow) {
    const s = this.ctx.boss.kit.sword;
    if (s) s.glow = glow;
  }
  fade(k) {
    this.ctx.boss.kit.fade = k;
  }
  sheathe(on) {
    const k = this.ctx.player.kit;
    if (k.sheathe) k.sheathe(on);
  }
  key(f, k) {
    const look = f.root && f.root.userData && f.root.userData.look;
    if (!look || typeof look.key !== 'number') return;
    if (!this.keyRest.has(f)) this.keyRest.set(f, look.key);
    look.key = k === undefined ? this.keyRest.get(f) : k;
  }

  ripple(x, z, strength = 1, radius = 0.4) {
    const w = this.ctx.water;
    if (w && w.ripple) w.ripple(x, z, strength, radius);
  }
  wake(x0, z0, x1, z1, strength = 1) {
    const w = this.ctx.water;
    if (w && w.wake) w.wake(x0, z0, x1, z1, strength);
  }
  snuff(x, z, radius, seconds) {
    const c = this.ctx.candles;
    if (c && c.snuff) c.snuff(_v.set(x, 0, z), radius, seconds);
  }
  snuffAll(seconds) {
    const c = this.ctx.candles;
    if (c && c.snuffAll) c.snuffAll(seconds);
  }
  relight(fraction, seconds) {
    const c = this.ctx.candles;
    if (c && c.relight) c.relight(fraction, seconds);
  }
  gust(x, z, power = 0.8) {
    const v = this.ctx.vfx;
    if (v && v.gust) v.gust(_v.set(x, 0, z), power);
  }
  mood(candle, gold) {
    const m = this.ctx.gfx.mood;
    if (candle !== undefined) m.candle = candle;
    if (gold !== undefined) m.gold = gold;
  }
  candlelight() {
    const c = this.ctx.candles;
    return c ? (typeof c.burning === 'number' ? c.burning : c.lit) : 1;
  }
  bossLight(level) {
    const b = this.ctx.boss;
    if ('lightLevel' in b) b.lightLevel = level;
  }
  candleNear(x, z, out) {
    const c = this.ctx.candles;
    out.set(x, 0.12, z);
    if (c && c.litNear) {
      let best = 1e9,
        found = false;
      for (let k = 0; k < 3; k++)
        if (c.litNear(x, z, _v, k)) {
          const d = (_v.x - x) * (_v.x - x) + (_v.z - z) * (_v.z - z);
          if (d < best) {
            best = d;
            out.copy(_v);
            found = true;
          }
        }
      if (!found) out.set(x, 0.12, z);
      return out;
    }
    const list = c && (c.items || c.list);
    if (!list) return out;
    let best = 1e9;
    for (const it of list) {
      if (it.to === 0 || it.lit === false) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < best) {
        best = d;
        out.set(it.x, it.y === undefined ? 0.15 : it.y, it.z);
      }
    }
    return out;
  }
  candleGap(x, z) {
    const c = this.ctx.candles;
    if (!c || !c.litNear) return 99;
    this.candleNear(x, z, _gapv);
    const d = Math.hypot(_gapv.x - x, _gapv.z - z);
    return d < 1e-4 ? 99 : d;
  }

  voice(name, text, seconds, who = 'boss') {
    const ctx = this.ctx;
    if (ctx.audio && ctx.audio.voice) {
      const p = ctx.audio.voice(name);
      if (p && p.catch) p.catch(() => {});
    }
    if (ctx.ui && ctx.ui.subtitle) {
      ctx.ui.subtitle(text, seconds);
      this.subtitleOn = true;
    }
    ctx.bus.emit('subtitle', { text, seconds, who });
  }
  sound(name, pos, volume = 1) {
    const a = this.ctx.audio;
    if (a && a.play) a.play(name, pos ? { pos, volume } : { volume });
  }
  nameCard(text, seconds) {
    const ui = this.ctx.ui;
    if (ui && ui.nameCard) {
      ui.nameCard(text, seconds);
      this.nameOn = !!text;
    }
  }
  hush() {
    const ui = this.ctx.ui;
    if (this.subtitleOn && ui && ui.subtitle) ui.subtitle(null, 0);
    if (this.nameOn && ui && ui.nameCard) ui.nameCard(null);
    this.subtitleOn = false;
    this.nameOn = false;
  }

  release() {
    for (const [f, t] of this.turns) {
      t.drop();
      if (f.char.look) f.char.look(null);
    }
    this.turns.clear();
    this.grasps.clear();
    this.graspsL.clear();
    if (this.relaxed) this.relax(this.relaxed, false, 0.2);
    for (const [f, clip] of this.posed) if (f.char.overlayName === clip) f.char.overlayOff(0);
    this.posed.clear();
    const p = this.ctx.player,
      b = this.ctx.boss;
    if (p.char.look) p.char.look(null);
    if (b.char.look) b.char.look(null);
    for (const [f, k] of this.kept) {
      const L = f.char.graph && f.char.graph.look;
      this.lookOff.speed = k.rate;
      f.char.look(null, this.lookOff);
      if (L && 'amount' in L) {
        L.yaw = k.yaw;
        L.pitch = k.pitch;
        L.amount = k.amount * Math.exp(-k.rate * k.t);
      }
    }
    this.kept.clear();
    this.bossLight(null);
    b.pos.y = 0;
    for (const f of this.keyRest.keys()) this.key(f);
    this.puppets(false);
  }
}
Stage.ownLook = false;
