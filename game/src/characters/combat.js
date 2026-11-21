import * as THREE from 'three';
import { closestSegmentPoints, segmentEntersCylinder } from '../core/geometry.js';

const GRACE = 0.14;
const stoneHeight = (c) => (c.h !== undefined ? c.h : c.r >= 1.4 ? 1.6 : c.r <= 1.0 ? 0.95 : 0.7);
const STONE_IN = 0.05;
const PIER_R = 0.85;
const HEAD_TRIM = 0.11;
const SLICE_PLAYER = 0.14,
  SLICE_BOSS = 0.2;
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _p = new THREE.Vector3(),
  _q = new THREE.Vector3();
const _r = new THREE.Vector3(),
  _a0 = new THREE.Vector3(),
  _b0 = new THREE.Vector3(),
  _v = new THREE.Vector3(),
  _w = new THREE.Vector3();

function capsuleEnds(cap, outA, outB) {
  if (cap.bone) {
    cap.bone.updateWorldMatrix(true, false);
    outA.copy(cap.a).applyMatrix4(cap.bone.matrixWorld);
    outB.copy(cap.b).applyMatrix4(cap.bone.matrixWorld);
  } else {
    cap.a.getWorldPosition(outA);
    cap.b.getWorldPosition(outB);
  }
}
const boneName = (cap) => {
  const o = cap.bone || cap.a;
  return (o && o.name) || '';
};

export class Combat {
  constructor(ctx) {
    this.ctx = ctx;
    this.weapons = [];
    this.warnings = [];
    this.time = 0;
    this.stepNo = 0;
    this._threat = { live: false, dist: Infinity, closing: 0, eta: Infinity, vel: new THREE.Vector3(), weapon: null };
    this._extra = new Map();
    this._arms = new Map();
    this._crown = new Map();
    this._stop = {
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      u: 1,
      floor: false,
      weapon: null,
    };
  }

  addWeapon(w) {
    w.armed = null;
    w.prevBase = new THREE.Vector3();
    w.prevTip = new THREE.Vector3();
    w.fresh = true;
    w.nowBase = new THREE.Vector3();
    w.nowTip = new THREE.Vector3();
    w.vel = new THREE.Vector3();
    w.dist = Infinity;
    w.closing = 0;
    w.seen = false;
    w.inStone = false;
    this.weapons.push(w);
    return w;
  }
  removeWeapon(w) {
    const i = this.weapons.indexOf(w);
    if (i >= 0) this.weapons.splice(i, 1);
  }
  arm(w, o = {}) {
    const a = w._arm || (w._arm = { hit: new Set() });
    a.damage = o.damage !== undefined ? o.damage : w.damage || 10;
    a.poise = o.poise || 0;
    a.heavy = o.heavy !== undefined ? !!o.heavy : !!w.heavy;
    a.knockdown = !!o.knockdown;
    a.reach = o.reach || 0;
    a.weight = o.weight || null;
    a.hit.clear();
    w.armed = a;
    if (!w.seen) w.fresh = true;
    w.inStone = false;
    w.onFloor = false;
  }
  disarm(w) {
    w.armed = null;
  }
  armed(owner) {
    for (const w of this.weapons) if (w.owner === owner && w.armed) return true;
    return false;
  }

  strike(hit) {
    const t = hit.target,
      ctx = this.ctx;
    if (!t || !t.alive) return null;
    hit.blocked = false;
    hit.fatal = false;
    hit.poise = hit.poise || 0;
    hit.heavy = !!hit.heavy;
    hit.damage = hit.damage || 0;
    const scale = t.char ? t.char.scale : 1;
    if (!hit.dir) {
      hit.dir = new THREE.Vector3();
      if (hit.attacker && hit.attacker.pos) hit.dir.subVectors(t.pos, hit.attacker.pos);
      hit.dir.y = 0;
      if (hit.dir.lengthSq() < 1e-8) hit.dir.set(0, 0, 1);
      hit.dir.normalize();
    }
    if (!hit.point)
      hit.point = new THREE.Vector3(t.pos.x, 1.1 * scale, t.pos.z).addScaledVector(
        hit.dir,
        -Math.min(0.3 * scale, t.radius || 0.3),
      );
    if (hit.weight !== 'light' && hit.weight !== 'heavy' && hit.weight !== 'colossal') {
      const big = !!(hit.attacker && hit.attacker.char && hit.attacker.char.scale > 1.5);
      hit.weight = big
        ? hit.knockdown
          ? 'colossal'
          : hit.heavy || hit.weapon || hit.damage >= 28
            ? 'heavy'
            : 'light'
        : hit.heavy
          ? 'heavy'
          : 'light';
    }
    const wasDown = !!t.staggered;
    if (t.takeHit(hit) === false) return null;
    hit.fatal = !t.alive;
    if (hit.fatal || (!wasDown && t.staggered)) hit.weight = 'colossal';
    ctx.bus.emit('hit', hit);
    if (hit.blocked) ctx.bus.emit('clash', { point: hit.point });
    return hit;
  }

  warn(o) {
    if (this.warnings.length < 32)
      this.warnings.push({
        target: o.target || this.ctx.player,
        at: this.time + Math.max(0, o.eta || 0),
        kind: o.kind || 'blow',
      });
  }
  nextWarningEta(target) {
    let best = Infinity;
    for (const w of this.warnings) if (w.target === target && w.at - this.time < best) best = w.at - this.time;
    return best;
  }

  /** The nearest opposing blade. Copy the result if you need to keep it. */
  nearestThreat(target) {
    const t = this._threat;
    t.live = false;
    t.dist = Infinity;
    t.closing = 0;
    t.eta = Infinity;
    t.weapon = null;
    t.vel.set(0, 0, 0);
    for (const w of this.weapons) {
      if (w.owner === target) continue;
      w.watch = 12;
      if (!w.seen) continue;
      const live = !!w.armed;
      if (t.weapon && !(live && !t.live) && !(live === t.live && w.dist < t.dist)) continue;
      t.live = live;
      t.dist = w.dist;
      t.closing = w.closing;
      t.weapon = w;
      t.vel.copy(w.vel);
    }
    if (t.weapon && t.closing > 0.5) t.eta = Math.max(0, t.dist - 0.45) / t.closing;
    return t;
  }

  _extraHurtBones(f) {
    let e = this._extra.get(f);
    if (e === undefined) {
      const B = f.char && f.char.bones,
        big = f.char && f.char.scale > 1.5;
      e =
        big && B && B.Hips && B.LeftFoot && B.RightFoot
          ? { hips: B.Hips, lf: B.LeftFoot, rf: B.RightFoot, lt: B.LeftToeBase || null, rt: B.RightToeBase || null }
          : null;
      this._extra.set(f, e);
    }
    return e;
  }
  _isArm(f, cap) {
    let m = this._arms.get(f);
    if (!m) this._arms.set(f, (m = new Map()));
    let v = m.get(cap);
    if (v === undefined) {
      v = /Arm|Hand|Shoulder/.test(boneName(cap));
      m.set(cap, v);
    }
    return v;
  }

  _isCrown(f, cap) {
    let m = this._crown.get(f);
    if (!m) this._crown.set(f, (m = new Map()));
    let v = m.get(cap);
    if (v === undefined) {
      v = /HeadTop/.test((cap.b && cap.b.name) || '');
      m.set(cap, v);
    }
    return v;
  }

  _bladeTouches(w, target, reachBlade) {
    const scale = target.char.scale,
      generous = w.owner === this.ctx.player,
      hurt = target.char.hurt || [];
    for (let i = 0; i < hurt.length; i++) {
      const cap = hurt[i];
      if (!generous && this._isArm(target, cap)) continue;
      capsuleEnds(cap, _c, _d);
      if (!generous && this._isCrown(target, cap)) {
        _w.subVectors(_c, _d);
        const l = _w.length();
        if (l > 1e-4) _d.addScaledVector(_w, Math.min(l, HEAD_TRIM * scale) / l);
      }
      const reach = reachBlade + cap.r * scale;
      if (closestSegmentPoints(_a0, _b0, _c, _d, _p, _q) <= reach * reach) {
        this._snapHitToSurface(cap.r * scale);
        return true;
      }
    }
    if (generous) {
      const e = this._extraHurtBones(target);
      if (e) {
        e.hips.getWorldPosition(_c);
        e.lf.getWorldPosition(_d);
        e.rf.getWorldPosition(_v);
        _d.add(_v).multiplyScalar(0.5);
        let r = 0.17 * scale,
          reach = reachBlade + r;
        if (closestSegmentPoints(_a0, _b0, _c, _d, _p, _q) <= reach * reach) {
          this._snapHitToSurface(r);
          return true;
        }
        r = 0.085 * scale;
        reach = reachBlade + r;
        if (e.lt) {
          e.lf.getWorldPosition(_c);
          e.lt.getWorldPosition(_d);
          if (closestSegmentPoints(_a0, _b0, _c, _d, _p, _q) <= reach * reach) {
            this._snapHitToSurface(r);
            return true;
          }
        }
        if (e.rt) {
          e.rf.getWorldPosition(_c);
          e.rt.getWorldPosition(_d);
          if (closestSegmentPoints(_a0, _b0, _c, _d, _p, _q) <= reach * reach) {
            this._snapHitToSurface(r);
            return true;
          }
        }
      }
    }
    return false;
  }
  _snapHitToSurface(r) {
    _w.subVectors(_p, _q);
    const l = _w.length();
    if (l > 1e-5) _q.addScaledVector(_w, Math.min(r, l) / l);
  }

  _hitsStone(a, b) {
    const arena = this.ctx.arena,
      cs = arena.colliders,
      piers = arena.piers;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z,
      l2 = dx * dx + dz * dz;
    for (let pass = 0; pass < 2; pass++) {
      const list = pass ? piers : cs;
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i],
          r = pass ? PIER_R : Math.max(0.2, c.r - STONE_IN),
          h = pass ? 99 : stoneHeight(c);
        const t = segmentEntersCylinder(a, dx, dy, dz, l2, c.x, c.z, r, h);
        if (t < 0) continue;
        _p.set(a.x + dx * t, a.y + dy * t, a.z + dz * t);
        _r.set(_p.x - c.x, 0, _p.z - c.z);
        if (_r.lengthSq() < 1e-8) _r.set(a.x - c.x, 0, a.z - c.z);
        if (_r.lengthSq() < 1e-8) _r.set(0, 0, 1);
        _r.normalize();
        return true;
      }
    }
    return false;
  }

  update(dt) {
    this.time += dt;
    this.stepNo++;
    if (this.warnings.length) {
      for (let i = this.warnings.length - 1; i >= 0; i--)
        if (this.warnings[i].at < this.time - 0.15) this.warnings.splice(i, 1);
    }
    for (const w of this.weapons) {
      if (w.doneStep === this.stepNo) continue;
      this._sweepWeapon(w, dt);
    }
  }

  /** Check a blade during its owner's update so the hit pose can be shown this step. */
  sweepNow(w, dt) {
    w.doneStep = this.stepNo + 1;
    return this._sweepWeapon(w, dt);
  }
  resync(w) {
    w.base.getWorldPosition(w.prevBase);
    w.tip.getWorldPosition(w.prevTip);
  }

  _sweepWeapon(w, dt) {
    const ctx = this.ctx;
    {
      const armed = w.armed,
        watched = w.watch > 0;
      if (!armed && !watched) {
        w.fresh = true;
        w.seen = false;
        return 0;
      }
      const owner = w.owner,
        target = owner === ctx.player ? ctx.boss : ctx.player;
      w.base.getWorldPosition(_a);
      w.tip.getWorldPosition(_b);
      if (w.fresh) {
        w.prevBase.copy(_a);
        w.prevTip.copy(_b);
      }
      w.vel.subVectors(_b, w.prevTip).divideScalar(dt);
      if (target && target.char) {
        const s = target.char.scale;
        _c.set(target.pos.x, 0.25 * s, target.pos.z);
        _d.set(target.pos.x, 1.6 * s, target.pos.z);
        const d = Math.sqrt(closestSegmentPoints(_a, _b, _c, _d, _p, _q));
        w.closing = w.seen ? w.closing + ((w.dist - d) / dt - w.closing) * 0.5 : 0;
        w.dist = d;
      }
      w.seen = true;
      if (watched) w.watch--;
      let struck = 0,
        slices = 1;
      if (armed && target && target.alive && target.char && !target.puppet && !owner.puppet && !armed.hit.has(target)) {
        const generous = owner === ctx.player;
        const reachBlade =
          (w.radius || 0.05) * (owner.char ? owner.char.scale : 1) + (generous ? GRACE : 0) + armed.reach;
        const travel = Math.max(_b.distanceTo(w.prevTip), _a.distanceTo(w.prevBase));
        const n = (slices = w.fresh
          ? 1
          : Math.min(12, Math.max(1, Math.ceil(travel / (generous ? SLICE_PLAYER : SLICE_BOSS)))));
        for (let k = 1; k <= n; k++) {
          const u = k / n;
          _a0.lerpVectors(w.prevBase, _a, u);
          _b0.lerpVectors(w.prevTip, _b, u);
          if (!this._bladeTouches(w, target, reachBlade)) continue;
          armed.hit.add(target);
          struck = k;
          const dir = new THREE.Vector3().copy(w.vel);
          if (dir.lengthSq() < 0.04) dir.subVectors(target.pos, owner.pos).setY(0);
          dir.normalize();
          this.strike({
            attacker: owner,
            target,
            point: _q.clone(),
            dir,
            damage: armed.damage,
            poise: armed.poise,
            heavy: armed.heavy,
            knockdown: armed.knockdown,
            weight: armed.weight,
            weapon: w,
          });
          w.base.getWorldPosition(_a);
          w.tip.getWorldPosition(_b);
          break;
        }
      }
      if (w.armed && owner === ctx.player && ctx.arena && !owner.puppet) {
        const travel = Math.max(_b.distanceTo(w.prevTip), _a.distanceTo(w.prevBase)),
          n = w.fresh ? 1 : Math.min(12, Math.max(1, Math.ceil(travel / SLICE_PLAYER)));
        const last = struck || n;
        for (let k = 1; k <= last; k++) {
          const u = k / n;
          _a0.lerpVectors(w.prevBase, _a, u);
          _b0.lerpVectors(w.prevTip, _b, u);
          if (!this._hitsStone(_a0, _b0)) continue;
          if (w.inStone) break;
          w.inStone = true;
          const st = this._stop;
          st.point.copy(_p);
          st.normal.copy(_r);
          st.dir.copy(w.vel).normalize();
          st.u = (k - 1) / n;
          st.floor = false;
          st.weapon = w;
          ctx.bus.emit('clash', {
            point: _p.clone(),
            stone: true,
            dir: st.dir.clone(),
            normal: _r.clone(),
            heavy: !!w.armed.heavy,
            weight: w.armed.weight || (w.armed.heavy ? 'heavy' : 'light'),
            who: 'player',
          });
          if (typeof owner.bladeStopped === 'function') owner.bladeStopped(st);
          break;
        }
        if (w.armed && !w.onFloor) {
          const fy = ctx.arena.ground ? ctx.arena.ground(_b.x, _b.z) : 0,
            wet = fy < 0.02 ? (typeof ctx.arena.waterY === 'number' ? ctx.arena.waterY : 0.07) : fy;
          if (_b.y < wet + 0.01 && w.vel.y < -0.5) {
            w.onFloor = true;
            const st = this._stop;
            st.point.set(_b.x, wet, _b.z);
            st.normal.set(0, 1, 0);
            st.dir.copy(w.vel).normalize();
            st.u = 1;
            st.floor = true;
            st.weapon = w;
            ctx.bus.emit('clash', {
              point: st.point.clone(),
              stone: true,
              floor: true,
              dir: st.dir.clone(),
              normal: st.normal.clone(),
              heavy: !!(w.armed && w.armed.heavy),
              weight: (w.armed && w.armed.weight) || (w.armed && w.armed.heavy ? 'heavy' : 'light'),
              who: 'player',
            });
            if (typeof owner.bladeStopped === 'function') owner.bladeStopped(st);
          }
        }
      }
      w.prevBase.copy(_a);
      w.prevTip.copy(_b);
      w.fresh = false;
      return struck ? struck / slices : 0;
    }
  }

  dispose() {
    this.weapons.length = 0;
    this.warnings.length = 0;
    this._extra.clear();
    this._arms.clear();
    this._crown.clear();
  }
}
