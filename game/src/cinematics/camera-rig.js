import * as THREE from 'three';
import { Curve, toCurve, wobble, Spring3, DEG, clamp } from './curves.js';
import { OPTIONS } from '../config/options.js';

export const LENS = { k: 0.022, max: 0.08, maxBlur: 0.02, crisp: 0.55 };

const _p = new THREE.Vector3(),
  _l = new THREE.Vector3(),
  _f = new THREE.Vector3(),
  _d = new THREE.Vector3();

const vecTrack = (v) =>
  typeof v === 'function' ? null : v instanceof Curve ? v : Array.isArray(v[0]) ? new Curve(v) : new Curve([[0, v]]);

export function cameraShot(c) {
  const out = {
    pos: vecTrack(c.pos),
    posFn: typeof c.pos === 'function' ? c.pos : null,
    look: vecTrack(c.look),
    lookFn: typeof c.look === 'function' ? c.look : null,
    lag: c.lag || 0,
    fov: toCurve(c.fov === undefined ? 40 : c.fov),
    roll: toCurve(c.roll || 0),
    focus: c.focus === undefined || typeof c.focus === 'function' ? null : toCurve(c.focus),
    focusFn: typeof c.focus === 'function' ? c.focus : null,
    aperture: toCurve(c.aperture || 0),
    depth: c.depth || 0,
    breathe: c.breathe === undefined ? 0.1 : c.breathe,
    sway: c.sway === undefined ? 0.008 : c.sway,
    pace: c.pace || 1,
  };
  return out;
}

export function rackFocus(a, b, k) {
  const curve = toCurve(k),
    pa = new THREE.Vector3(),
    pb = new THREE.Vector3();
  const fn = (out, t, T) => {
    a(pa, t, T);
    b(pb, t, T);
    fn.k = clamp(curve.at(t));
    fn.a = pa;
    fn.b = pb;
  };
  fn.rack = true;
  return fn;
}

export function orbit({ center, az, r, y }) {
  const A = toCurve(az),
    R = toCurve(r),
    Y = toCurve(y),
    c = new THREE.Vector3(),
    fixed = Array.isArray(center);
  if (fixed) c.fromArray(center);
  return (out, t, T) => {
    if (!fixed) center(c, t, T);
    const a = A.at(t) * DEG,
      rad = R.at(t);
    out.set(c.x + Math.sin(a) * rad, Y.at(t), c.z + Math.cos(a) * rad);
  };
}

export class CameraRig {
  constructor(ctx) {
    this.ctx = ctx;
    this.aim = new Spring3();
    this.fresh = true;
    this.trauma = 0;
    this.shakeT = 0;
    this.shakeLen = 1;
    this.shakeHz = 9;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = 40;
    this.focus = 10;
    this.aperture = 0;
  }
  cut() {
    this.fresh = true;
  }
  shake(amount, seconds = 0.5, hz = 9) {
    if (amount >= this.trauma * (this.shakeT / this.shakeLen || 0)) {
      this.trauma = amount;
      this.shakeT = this.shakeLen = seconds;
      this.shakeHz = hz;
    }
  }

  apply(s, t, dt, T) {
    const ctx = this.ctx,
      cam = ctx.camera,
      set = ctx.ui && ctx.ui.settings,
      calm = set && set.reducedMotion ? 0.25 : 1;
    if (s.posFn) s.posFn(_p, t, T);
    else s.pos.into(t, _p);
    if (s.lookFn) {
      s.lookFn(_l, t, T);
      if (s.lag > 0) {
        if (this.fresh) this.aim.reset(_l);
        else this.aim.step(_l, s.lag, dt);
        _l.set(this.aim.x, this.aim.y, this.aim.z);
      }
    } else s.look.into(t, _l);
    this.pos.copy(_p);
    this.look.copy(_l);
    const w = T * s.pace,
      b = s.breathe * DEG * calm,
      sw = s.sway * calm;
    cam.position.set(
      _p.x + wobble(w * 0.43, 1) * sw,
      _p.y + wobble(w * 0.51, 2) * sw * 0.7,
      _p.z + wobble(w * 0.39, 3) * sw,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(_l);
    let rx = wobble(w * 0.47, 4) * b,
      ry = wobble(w * 0.37, 5) * b,
      rz = s.roll.at(t) * DEG + wobble(w * 0.29, 6) * b * 0.35;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT / this.shakeLen),
        a = this.trauma * k * k * calm,
        q = T * this.shakeHz * 6.2832;
      rx += Math.sin(q * 1.0 + 1.3) * a * 0.012;
      ry += Math.sin(q * 1.31 + 4.1) * a * 0.009;
      rz += Math.sin(q * 0.83 + 2.2) * a * 0.006;
      cam.position.y += Math.sin(q * 1.17) * a * 0.035;
      cam.position.x += Math.sin(q * 0.91 + 0.7) * a * 0.02;
    }
    cam.rotateX(rx);
    cam.rotateY(ry);
    cam.rotateZ(rz);
    const fov = s.fov.at(t);
    if (Math.abs(cam.fov - fov) > 1e-4) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    cam.getWorldDirection(_d);
    let focus;
    if (s.focusFn) {
      const fn = s.focusFn;
      fn(_f, t, T);
      if (fn.rack) {
        const da = Math.max(0.05, _f.copy(fn.a).sub(cam.position).dot(_d)),
          db = Math.max(0.05, _f.copy(fn.b).sub(cam.position).dot(_d));
        focus = 1 / (1 / da + (1 / db - 1 / da) * fn.k);
      } else focus = _f.sub(cam.position).dot(_d);
    } else if (s.focus) focus = s.focus.at(t);
    else focus = _f.copy(_l).sub(cam.position).dot(_d);
    const ap = clamp(s.aperture.at(t)),
      dof = ctx.gfx.post.dof;
    this.fov = fov;
    this.aperture = ap;
    this.focus = Math.max(0.05, focus - s.depth * 0.5);
    let a = (ap * LENS.k) / (this.focus * Math.tan((fov * DEG) / 2));
    if (s.depth > 0) {
      const res = ctx.gfx.resolution,
        hh = (res && res.y ? res.y : 900) * 0.5;
      a = Math.min(a, (LENS.crisp * this.focus) / (hh * s.depth));
    }
    dof.on = ap > 0.001;
    dof.focus = this.focus;
    dof.maxBlur = LENS.maxBlur;
    dof.aperture = Math.min(LENS.max, a);
    if (CameraRig.debug && T >= CameraRig.debug[0] - 0.004 && T <= CameraRig.debug[1] + 0.004)
      console.log(
        `RIG T=${T.toFixed(3)} pos=${cam.position.toArray().map((v) => v.toFixed(2))} look=${_l.toArray().map((v) => v.toFixed(2))} fov=${fov.toFixed(1)} focus=${this.focus.toFixed(2)} dof.aperture=${dof.aperture.toFixed(5)}`,
      );
    this.fresh = false;
  }
}
// Use &rigdebug=41.5-41.7 to log camera values in that time range.
CameraRig.debug = (() => {
  const v = OPTIONS.get('rigdebug');
  if (!v) return null;
  const n = v.split('-').map(Number);
  return [n[0], n.length > 1 ? n[1] : n[0]];
})();
