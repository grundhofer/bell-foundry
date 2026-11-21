import * as THREE from 'three';
import { DEG } from '../core/math.js';
import { closestSegmentPoints } from '../core/geometry.js';
import { patchShader, insertAfterInclude } from '../graphics/shader-patch.js';

const P = 'assets/models/props/';
const tex = (file, srgb, dir = P) => ({ url: dir + file, type: 'texture', srgb, repeat: true });
// The shield and the flask share the trim textures of the foundry's props (look/props.js loads the same files).
const TRIM = 'assets/models/look/props/';
const trim = (name) => ({
  ['prop.tex.trim_' + name.toLowerCase()]: tex(`T_Trim_${name}_BaseColor.png`, true, TRIM),
  ['prop.tex.trim_' + name.toLowerCase() + '_orm']: tex(`T_Trim_${name}_ORM.png`, false, TRIM),
  ['prop.tex.trim_' + name.toLowerCase() + '_n']: tex(`T_Trim_${name}_Normal.png`, false, TRIM),
});
export const ASSETS = {
  'prop.shield': P + 'shield.glb',
  'prop.flask': P + 'flask.glb',
  ...trim('Furniture'),
  ...trim('Metal'),
  ...trim('Props'),
};
export const HAMMER_ASSETS = {
  'prop.hammer': P + 'hammer.glb',
  'prop.tex.hammer': tex('tex_hammer.webp', true),
  'prop.tex.hammer_orm': tex('tex_hammer_orm.webp', false),
  'prop.tex.hammer_n': tex('tex_hammer_n.webp', false),
};

const _m = new THREE.Matrix4(),
  _m2 = new THREE.Matrix4(),
  _v = new THREE.Vector3(),
  _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3();
const rgb = (r, g, b) => new THREE.Color().setRGB(r, g, b);

export function restMatrix(char, boneName, out = new THREE.Matrix4()) {
  const bone = char.bones[boneName];
  if (!bone) throw new Error(`${char.name}: no bone "${boneName}"`);
  const mesh = char.meshes && char.meshes.find((m) => m.isSkinnedMesh && m.skeleton && m.skeleton.bones.includes(bone));
  if (mesh) return out.copy(mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone)]).invert();
  char.model.updateWorldMatrix(true, true);
  return out.copy(char.model.matrixWorld).invert().multiply(bone.matrixWorld);
}
const restPoint = (char, boneName, out) => out.setFromMatrixPosition(restMatrix(char, boneName, _m2));

export function attachToBone(char, boneName, at, name) {
  const s = new THREE.Object3D();
  s.name = name || 'kit:' + boneName;
  const want = at.isMatrix4 ? at : _m.makeTranslation(at[0], at[1], at[2]);
  new THREE.Matrix4()
    .copy(restMatrix(char, boneName, _m2))
    .invert()
    .multiply(want)
    .decompose(s.position, s.quaternion, s.scale);
  char.bones[boneName].add(s);
  return s;
}

export function placeLocal(char, boneName, position, quaternion, name) {
  const bone = char.bones[boneName];
  if (!bone) throw new Error(`${char.name}: no bone "${boneName}"`);
  const s = new THREE.Object3D();
  s.name = name || 'kit:' + boneName;
  s.position.set(position[0], position[1], position[2]);
  if (quaternion) s.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]).normalize();
  bone.add(s);
  return s;
}

const HOLDS = {
  pilgrim: {
    sword: {
      bone: 'RightHand',
      position: [0.017, 0.084, 0.0294],
      x_edge: [-0.1606, 0.9566, 0.2432],
      y_blade: [0.8533, 0.2584, -0.4529],
      z_flat: [-0.496, 0.1348, -0.8577],
    },
    shield: {
      bone: 'LeftForeArm',
      position: [0.014, 0.1467, -0.035],
      x_side: [0.0488, -0.9962, -0.0719],
      y_top: [-0.998, -0.0515, 0.0368],
      z_face: [-0.0404, 0.07, -0.9968],
    },
  },
  boss: {
    sword: {
      bone: 'RightHand',
      position: [-0.0057, 0.0921, 0.0157],
      x_edge: [0.2921, -0.7494, 0.5942],
      y_blade: [0.8396, 0.4986, 0.2159],
      z_flat: [-0.458, 0.4358, 0.7748],
    },
  },
};
export const HOLLOW = [0, 0.05, 0.031];
const holdsOf = (char) => HOLDS[char.name in HOLDS ? char.name : 'pilgrim'];
function socketOf(char, h, x, y, z, name) {
  const local = new THREE.Matrix4()
    .makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z))
    .setPosition(h.position[0], h.position[1], h.position[2]);
  const D = char.retarget ? char.retarget.delta(h.bone, new THREE.Quaternion()) : null;
  if (D) local.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(D.invert()));
  const s = new THREE.Object3D();
  s.name = name;
  s.applyMatrix4(local);
  char.bones[h.bone].add(s);
  s.userData.rest = restMatrix(char, h.bone, new THREE.Matrix4()).multiply(local);
  s.userData.hold = h;
  return s;
}
// Some rigs put a weightless thumb on top of the index; their palm then takes the reference's thumb, carried through the retarget.
export function palmThumb(char, side) {
  const R = char.retarget,
    S = R && R.S,
    s = S && S.index[side + 'HandThumb1'];
  if (s === undefined || !char.bones[side + 'HandThumb1']) return null;
  restPoint(char, side + 'Hand', _a);
  restPoint(char, side + 'HandIndex1', _b).sub(_a);
  restPoint(char, side + 'HandThumb1', _c).sub(_a);
  const li = _b.length(),
    lt = _c.length();
  if (li < 1e-9) return null;
  if (lt > 1e-9 && _c.addScaledVector(_b, -_c.dot(_b) / (li * li)).length() > 0.15 * lt) return null;
  const D = R.delta(side + 'Hand', new THREE.Quaternion());
  if (!D) return null;
  const v = new THREE.Vector3().fromArray(S.restPos, s * 3).applyQuaternion(D.invert());
  return v.lengthSq() > 1e-18 ? v.normalize() : null;
}
export function handFrame(char, side, o) {
  const palm = palmThumb(char, side);
  restPoint(char, side + 'Hand', _a);
  const hx = _a.x,
    hy = _a.y,
    hz = _a.z;
  restPoint(char, side + 'HandIndex1', _b);
  restPoint(char, side + 'HandThumb1', _c);
  if (palm)
    _c.copy(palm)
      .transformDirection(restMatrix(char, side + 'Hand', _m2))
      .multiplyScalar(_b.distanceTo(_a))
      .add(_a);
  const f = new THREE.Vector3().subVectors(_b, _a).normalize();
  const b = new THREE.Vector3().subVectors(_c, _a);
  b.addScaledVector(f, -b.dot(f)).normalize();
  const n = new THREE.Vector3().crossVectors(b, f);
  if (side !== 'Right') n.negate();
  o.f = f;
  o.b = b;
  o.n = n;
  o.hand = new THREE.Vector3(hx, hy, hz);
  return o;
}
export function gripSocket(char, side = 'Right', fit) {
  if (side !== 'Right') throw new Error('wardrobe: only the right hand has a measured grip');
  const h = fit || holdsOf(char).sword;
  return socketOf(char, h, h.x_edge, h.y_blade, h.z_flat, 'grip:' + side);
}
export function shieldSocket(char, fit) {
  const h = fit || holdsOf(char).shield;
  return socketOf(char, h, h.x_side, h.y_top, h.z_face, 'kit:shield');
}
export const mirrored = (v) => new THREE.Vector3(-v.x, v.y, v.z);

export function makeHand(char, side, o = {}) {
  const H = handFrame(char, side, {}),
    B = char.bones,
    bones = [],
    shut = [],
    soft = [],
    unkeyed = [];
  const sign = side === 'Right' ? 1 : -1;
  const acrossPalm = H.b.clone().multiplyScalar(sign);
  const J = [1, 2, 3, 4].map((k) => restPoint(char, side + 'HandIndex' + k, new THREE.Vector3())),
    T = [1, 2, 3, 4].map((k) => restPoint(char, side + 'HandThumb' + k, new THREE.Vector3()));
  const grip = o.round || {
    point: H.hand
      .clone()
      .addScaledVector(H.f, J[0].clone().sub(H.hand).dot(H.f) + 0.012)
      .addScaledVector(H.n, 0.02),
    axis: H.b.clone(),
    radius: 0.016,
  };
  const A = grip.axis.clone().normalize(),
    R = grip.radius;

  const fu = J[1].clone().sub(J[0]).normalize(),
    fAcross = new THREE.Vector3().crossVectors(fu, H.n).normalize();
  const fv = new THREE.Vector3().crossVectors(fAcross, fu).normalize();
  if (fv.dot(H.n) < 0) fv.negate();
  const curlRound = () => {
    const den = A.dot(fAcross),
      hit =
        Math.abs(den) > 0.2
          ? grip.point.clone().addScaledVector(A, J[0].clone().sub(grip.point).dot(fAcross) / den)
          : grip.point.clone();
    const cu = hit.clone().sub(J[0]).dot(fu),
      cv = hit.clone().sub(J[0]).dot(fv);
    let ju = 0,
      jv = 0,
      dir = 0;
    const out = [];
    for (let k = 0; k < 3; k++) {
      const L = J[k + 1].distanceTo(J[k]),
        du = cu - ju,
        dv = cv - jv,
        dist = Math.hypot(du, dv),
        to = Math.atan2(dv, du);
      let bend;
      if (dist > R * 1.02) {
        bend = to - Math.asin(R / dist) - dir;
        while (bend > Math.PI) bend -= 2 * Math.PI;
        while (bend < -Math.PI) bend += 2 * Math.PI;
      } else bend = 1.4;
      bend = Math.max(0, Math.min(1.83, bend));
      const a = dir + bend;
      out.push(bend / DEG);
      ju += Math.cos(a) * L;
      jv += Math.sin(a) * L;
      dir = a;
    }
    return out;
  };
  const curl = o.curl || curlRound();
  const fingerAt = (bends) => {
    const out = [],
      at = J[0].clone();
    let a = 0;
    for (let k = 0; k < 3; k++) {
      a += bends[k] * DEG;
      at.addScaledVector(fu, Math.cos(a) * J[k + 1].distanceTo(J[k])).addScaledVector(
        fv,
        Math.sin(a) * J[k + 1].distanceTo(J[k]),
      );
      out.push(at.clone());
    }
    return out;
  };

  const eF = H.f.clone().addScaledVector(A, -H.f.dot(A)).normalize(),
    eN = new THREE.Vector3().crossVectors(A, eF);
  if (eN.dot(H.n) < 0) eN.negate();
  const toFingers = A.clone().multiplyScalar(J[0].clone().sub(T[0]).dot(A) > 0 ? 1 : -1);
  const TL = [0, 1, 2].map((k) => T[k + 1].distanceTo(T[k])),
    reach = TL[0] + TL[1] + TL[2];
  const rest0 = T[1].clone().sub(T[0]),
    phiRest = Math.atan2(rest0.dot(eF), rest0.dot(eN));
  const in2 = (p) => [p.clone().sub(T[0]).dot(eF), p.clone().sub(T[0]).dot(eN)];
  const thumbClosed = () => {
    const c = in2(grip.point),
      fj = fingerAt(curl),
      clearOf = R * 0.8;
    let best = null;
    for (const p of fj) {
      const q = in2(p),
        out = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1;
      const tf = q[0] + ((q[0] - c[0]) / out) * 0.014,
        tn = q[1] + ((q[1] - c[1]) / out) * 0.014,
        D = Math.hypot(tf, tn);
      if (D > reach * 0.96 || D < reach * 0.3) continue;
      const u = Math.max(0, Math.min(1, (c[0] * tf + c[1] * tn) / (D * D))),
        gap = Math.hypot(c[0] - tf * u, c[1] - tn * u);
      if (gap < clearOf) continue;
      if (!best || tn > best.tn) best = { tf, tn, D };
    }
    if (!best) {
      const phi1 = phiRest - 55 * DEG;
      return [phi1, phi1 + 50 * DEG, phi1 + 95 * DEG];
    }
    const end = (b) => [
      TL[0] + TL[1] * Math.cos(b) + TL[2] * Math.cos(2 * b),
      TL[1] * Math.sin(b) + TL[2] * Math.sin(2 * b),
    ];
    let lo = 0.05,
      hi = 1.6;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2,
        e = end(mid);
      if (Math.hypot(e[0], e[1]) > best.D) lo = mid;
      else hi = mid;
    }
    const bnd = (lo + hi) / 2,
      e = end(bnd),
      lead = Math.atan2(e[1], e[0]),
      to = Math.atan2(best.tf, best.tn);
    const phi1 = Math.max(to - lead, phiRest - 75 * DEG);
    return [phi1, phi1 + bnd, phi1 + 2 * bnd];
  };
  const thumbDirs = (phis, lean, splay = 0) =>
    phis.map((phi, k) =>
      new THREE.Vector3()
        .addScaledVector(eN, Math.cos(phi))
        .addScaledVector(eF, Math.sin(phi))
        .addScaledVector(toFingers, lean * k - splay)
        .normalize(),
    );

  const restQ = (name) => new THREE.Quaternion().setFromRotationMatrix(restMatrix(char, name, new THREE.Matrix4()));
  const localOf = (name, parentTurn, turn) => {
    const bone = B[name],
      qp =
        bone.parent && bone.parent.isBone
          ? restQ(bone.parent.name.replace(/^mixamorig\d*:?/, ''))
          : new THREE.Quaternion();
    return qp.invert().multiply(parentTurn.clone().invert()).multiply(turn).multiply(restQ(name));
  };
  const fingerPose = (bends) => {
    let turn = new THREE.Quaternion();
    const out = [];
    for (let k = 0; k < 3; k++) {
      const parent = turn;
      turn = parent.clone().multiply(new THREE.Quaternion().setFromAxisAngle(acrossPalm, bends[k] * DEG));
      out.push(localOf(side + 'HandIndex' + (k + 1), parent, turn));
    }
    return out;
  };
  const thumbPose = (dirs) => {
    let turn = new THREE.Quaternion();
    const out = [];
    for (let k = 0; k < 3; k++) {
      const parent = turn,
        was = T[k + 1].clone().sub(T[k]).normalize().applyQuaternion(parent);
      turn = new THREE.Quaternion().setFromUnitVectors(was, dirs[k]).multiply(parent);
      out.push(localOf(side + 'HandThumb' + (k + 1), parent, turn));
    }
    return out;
  };
  const names = [1, 2, 3].map((k) => side + 'HandIndex' + k).concat([1, 2, 3].map((k) => side + 'HandThumb' + k));
  const closed = fingerPose(curl).concat(thumbPose(thumbDirs(thumbClosed(), 0.1)));
  const easy = fingerPose([24, 32, 22]).concat(
    thumbPose(thumbDirs([phiRest - 24 * DEG, phiRest - 12 * DEG, phiRest + 4 * DEG], 0, 0.42)),
  );
  const _tp = new THREE.Quaternion(),
    _tb = new THREE.Quaternion();
  names.forEach((name, i) => {
    const bone = B[name];
    if (!bone) return;
    bones.push(bone);
    shut.push(closed[i]);
    soft.push(easy[i]);
    let still = bone.quaternion.clone();
    if (typeof char.tposeWorld === 'function' && bone.parent && bone.parent.isBone) {
      try {
        char.tposeWorld(bone.parent.name.replace(/^mixamorig\d*:?/, ''), _tp);
        char.tposeWorld(name, _tb);
        still = _tp.clone().invert().multiply(_tb);
      } catch (e) {}
    }
    unkeyed.push(still);
  });
  const follow = [];
  for (const f of ['Middle', 'Ring', 'Pinky'])
    for (let k = 1; k <= 3; k++) {
      const bone = B[side + 'Hand' + f + k],
        i = names.indexOf(side + 'HandIndex' + k);
      if (!bone || i < 0 || bones.indexOf(B[names[i]]) < 0) continue;
      let still = bone.quaternion.clone();
      if (typeof char.tposeWorld === 'function' && bone.parent && bone.parent.isBone) {
        try {
          char.tposeWorld(bone.parent.name.replace(/^mixamorig\d*:?/, ''), _tp);
          char.tposeWorld(side + 'Hand' + f + k, _tb);
          still = _tp.clone().invert().multiply(_tb);
        } catch (e) {}
      }
      follow.push({ bone, lead: bones.indexOf(B[names[i]]), still });
    }
  const _fl = new THREE.Quaternion();
  const followers = () => {
    for (const f of follow)
      f.bone.quaternion.copy(f.still).multiply(_fl.copy(unkeyed[f.lead]).invert().multiply(bones[f.lead].quaternion));
  };
  return {
    side,
    bones,
    k: 0,
    curl,
    set(k) {
      this.k = k;
      if (k <= 0.001) return;
      for (let i = 0; i < bones.length; i++) {
        if (k >= 0.999) bones[i].quaternion.copy(shut[i]);
        else bones[i].quaternion.slerp(shut[i], k);
      }
      if (follow.length) followers();
    },
    relax(w = 1) {
      if (w <= 0.001) return;
      for (let i = 0; i < bones.length; i++) {
        const q = bones[i].quaternion,
          off = q.angleTo(unkeyed[i]);
        if (off > 0.26) continue;
        const m = off < 0.035 ? w : w * (1 - (off - 0.035) / 0.225);
        if (m >= 0.999) q.copy(soft[i]);
        else q.slerp(soft[i], m);
      }
      if (follow.length) followers();
    },
    open() {
      for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(unkeyed[i]);
      if (follow.length) followers();
    },
  };
}

const _pa = new THREE.Vector3(),
  _pb = new THREE.Vector3(),
  _pc = new THREE.Vector3(),
  _pt = new THREE.Vector3(),
  _ax0 = new THREE.Vector3(),
  _ax1 = new THREE.Vector3(),
  _u = new THREE.Vector3(),
  _w = new THREE.Vector3();
const _qb = new THREE.Quaternion(),
  _qc = new THREE.Quaternion(),
  _qp = new THREE.Quaternion(),
  _d0 = new THREE.Quaternion(),
  _d1 = new THREE.Quaternion(),
  _d2 = new THREE.Quaternion(),
  _qs = new THREE.Quaternion();
const _s3 = new THREE.Vector3();
const clamp1 = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
function turnInWorld(bone, dq) {
  bone.parent.matrixWorld.decompose(_s3, _qp, _s3);
  bone.quaternion.premultiply(_qs.copy(_qp).invert().multiply(dq).multiply(_qp));
}

export function makeArm(char, side, o = {}) {
  const B = char.bones,
    upper = B[side + 'Arm'],
    fore = B[side + 'ForeArm'],
    hand = B[side + 'Hand'],
    H = handFrame(char, side, {});
  const inv = restMatrix(char, side + 'Hand', new THREE.Matrix4()).invert();
  const hollowLocal = (
    o.point
      ? o.point.clone()
      : H.hand.clone().addScaledVector(H.b, HOLLOW[0]).addScaledVector(H.f, HOLLOW[1]).addScaledVector(H.n, HOLLOW[2])
  ).applyMatrix4(inv);
  const acrossLocal = (o.line ? o.line.clone() : H.b.clone()).normalize().transformDirection(inv);
  return {
    side,
    upper,
    fore,
    hand,
    hollow(out) {
      return out.copy(hollowLocal).applyMatrix4(hand.matrixWorld);
    },
    across(out) {
      return out.copy(acrossLocal).transformDirection(hand.matrixWorld);
    },
    reach(target, weight) {
      if (weight <= 0.001) return;
      _pa.setFromMatrixPosition(upper.matrixWorld);
      _pb.setFromMatrixPosition(fore.matrixWorld);
      _pc.setFromMatrixPosition(hand.matrixWorld);
      this.hollow(_pt);
      _pt.subVectors(target, _pt).multiplyScalar(weight).add(_pc);
      const l1 = _pa.distanceTo(_pb),
        l2 = _pb.distanceTo(_pc),
        eps = 0.002 * l1;
      let lat = _pa.distanceTo(_pt);
      lat = Math.min(Math.max(lat, Math.abs(l1 - l2) + eps), l1 + l2 - eps);
      _u.subVectors(_pc, _pa).normalize();
      _w.subVectors(_pb, _pa).normalize();
      const acab0 = Math.acos(clamp1(_u.dot(_w)));
      _ax0.crossVectors(_u, _w);
      if (_ax0.lengthSq() < 1e-10) _ax0.set(0, 0, 1);
      _ax0.normalize();
      const babc0 = Math.acos(clamp1(-_w.dot(_s3.subVectors(_pc, _pb).normalize())));
      const acab1 = Math.acos(clamp1((l2 * l2 - l1 * l1 - lat * lat) / (-2 * l1 * lat))),
        babc1 = Math.acos(clamp1((lat * lat - l1 * l1 - l2 * l2) / (-2 * l1 * l2)));
      _w.subVectors(_pt, _pa).normalize();
      const acat = Math.acos(clamp1(_u.dot(_w)));
      _ax1.crossVectors(_u, _w);
      if (_ax1.lengthSq() < 1e-10) _ax1.copy(_ax0);
      _ax1.normalize();
      _d0.setFromAxisAngle(_ax0, acab1 - acab0);
      _d2.setFromAxisAngle(_ax1, acat);
      _d2.multiply(_d0);
      _d1.setFromAxisAngle(_ax0, babc1 - babc0);
      hand.matrixWorld.decompose(_s3, _qc, _s3);
      turnInWorld(fore, _d1);
      turnInWorld(upper, _d2);
      upper.updateMatrixWorld(true);
      fore.matrixWorld.decompose(_s3, _qb, _s3);
      hand.quaternion.copy(_qb.invert().multiply(_qc));
      hand.updateMatrixWorld(true);
    },
    align(axis, weight) {
      if (weight <= 0.001) return;
      this.across(_u);
      if (_u.dot(axis) < 0) _u.negate();
      _d0.setFromUnitVectors(_u, axis);
      if (weight < 0.999) _d0.slerp(_qs.identity(), 1 - weight);
      this.hollow(_pt);
      turnInWorld(hand, _d0);
      hand.updateMatrixWorld(true);
    },
  };
}

const _gc1 = new THREE.Vector3(),
  _gc2 = new THREE.Vector3(),
  _q0 = new THREE.Vector3();
/** Move the arm to avoid collisions while keeping the grip fixed. */
export function makeCarry(char, o) {
  const S = char.scale,
    J = o.joints.length,
    body = o.body,
    margin = (o.margin !== undefined ? o.margin : 0.008) * S,
    back = o.back || 5,
    disc = o.disc || null,
    floor = o.floor;
  const segs = o.segs.map((g) => ({ a: new THREE.Vector3(...g.a), b: new THREE.Vector3(...g.b), r: g.r * S }));
  const n = segs.length,
    a0 = segs.map(() => new THREE.Vector3()),
    b0 = segs.map(() => new THREE.Vector3()),
    a1 = segs.map(() => new THREE.Vector3()),
    b1 = segs.map(() => new THREE.Vector3());
  const Q = o.joints.map(() => new THREE.Quaternion()),
    Qwas = o.joints.map(() => new THREE.Quaternion()),
    P = o.joints.map(() => new THREE.Vector3()),
    Pj = new THREE.Vector3(),
    Qin = new THREE.Quaternion();
  const quick = o.quick !== undefined ? o.quick : 0.16;
  const tq = new THREE.Vector3(),
    lev = new THREE.Vector3(),
    nrm = new THREE.Vector3(),
    tmp = new THREE.Vector3(),
    dq = new THREE.Quaternion(),
    ca = new THREE.Vector3(),
    cb = new THREE.Vector3(),
    dc = new THREE.Vector3(),
    dn = new THREE.Vector3(),
    x = new THREE.Vector3(),
    e = new THREE.Vector3(),
    t2 = new THREE.Vector3(),
    ident = new THREE.Quaternion();
  let ids = null,
    wait = 0,
    gain = 1,
    hits = 0,
    floorY;
  const order = o.order || o.joints.map((_, i) => i);
  const angle = (q) => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  const carryPoint = (p, out) => {
    out.copy(p);
    for (let j = 0; j < J; j++) out.sub(P[j]).applyQuaternion(Q[j]).add(P[j]);
    return out;
  };
  const push = (at, dir, depth) => {
    lev.subVectors(at, Pj);
    const l2 = lev.lengthSq();
    if (l2 < 1e-8 * S * S) return;
    tq.addScaledVector(tmp.crossVectors(lev, dir), depth / l2);
    hits++;
  };
  const look = (j) => {
    tq.set(0, 0, 0);
    hits = 0;
    Pj.copy(P[j]);
    for (let k = j + 1; k < J; k++) Pj.sub(P[k]).applyQuaternion(Q[k]).add(P[k]);
    const C = body.cur,
      RAD = body.rad;
    for (let i = 0; i < n; i++) {
      carryPoint(a0[i], a1[i]);
      carryPoint(b0[i], b1[i]);
      const A = a1[i],
        B2 = b1[i],
        r = segs[i].r;
      for (let c = 0; c < ids.length; c++) {
        const k = ids[c] * 6;
        ca.set(C[k], C[k + 1], C[k + 2]);
        cb.set(C[k + 3], C[k + 4], C[k + 5]);
        const d = Math.sqrt(closestSegmentPoints(A, B2, ca, cb, _gc1, _gc2)),
          RR = RAD[ids[c]] + r + margin;
        if (d >= RR) continue;
        nrm.subVectors(_gc1, _gc2);
        if (d < 1e-5 * S) nrm.set(0, 1, 0);
        else nrm.multiplyScalar(1 / d);
        push(_gc1, nrm, RR - d);
      }
      if (floorY !== undefined) {
        const fy = floorY + r;
        if (A.y < fy) push(A, nrm.set(0, 1, 0), fy - A.y);
        if (B2.y < fy) push(B2, nrm.set(0, 1, 0), fy - B2.y);
      }
      if (disc && A.distanceToSquared(B2) > 1e-10) {
        const da = x.subVectors(A, dc).dot(dn),
          db = x.subVectors(B2, dc).dot(dn);
        if (da * db < 0) {
          const u = da / (da - db);
          x.copy(A).lerp(B2, u);
          e.subVectors(x, dc);
          e.addScaledVector(dn, -e.dot(dn));
          const rr = e.length(),
            R = disc.radius * S;
          if (rr < R) {
            const far = Pj.distanceToSquared(B2) > Pj.distanceToSquared(A) ? B2 : A,
              df = far === B2 ? db : da,
              depth = Math.abs(df) + margin + r;
            const turnSide = depth / Math.max(far.distanceTo(Pj), 0.15 * S),
              turnRim = (R - rr + margin + r) / Math.max(x.distanceTo(Pj), 0.15 * S);
            if (turnSide <= turnRim) push(far, nrm.copy(dn).multiplyScalar(df > 0 ? -1 : 1), depth);
            else {
              if (rr > 1e-5 * S) e.multiplyScalar(1 / rr);
              else e.set(dn.y, -dn.x, 0).normalize();
              push(t2.copy(x), e, R - rr + margin + r);
            }
          }
        }
      }
    }
    return hits;
  };
  const carry = {
    amount: 0,
    amounts: o.joints.map(() => 0),
    reset() {
      for (const q of Q) q.identity();
      for (const q of Qwas) q.identity();
      this.amount = 0;
      this.amounts.fill(0);
    },
    rest(seconds) {
      wait = seconds;
      gain = 0;
      this.reset();
    },
    update(dt) {
      if (!ids) ids = body.ids(o.names);
      if (wait > 0) {
        wait -= dt;
        return;
      }
      if (gain < 1) gain = Math.min(1, gain + dt * 3);
      const m = o.object.matrixWorld;
      floorY = typeof floor === 'function' ? floor() : floor;
      for (let i = 0; i < n; i++) {
        a0[i].copy(segs[i].a).applyMatrix4(m);
        b0[i].copy(segs[i].b).applyMatrix4(m);
      }
      for (let j = 0; j < J; j++) P[j].setFromMatrixPosition(o.joints[j].bone.matrixWorld);
      if (disc) {
        const d = disc.object.matrixWorld.elements;
        dn.set(d[8], d[9], d[10]).normalize();
        dc.set(d[12], d[13], d[14]).addScaledVector(dn, (disc.offset || 0) * S);
      }
      const ease = Math.exp(-back * dt);
      let any = false;
      for (let j = 0; j < J; j++) Qwas[j].copy(Q[j]);
      for (let j = 0; j < J; j++) {
        if (Q[j].w < 0.9999995) {
          Q[j].slerp(ident, 1 - ease);
          any = true;
        }
      }
      for (let oi = 0; oi < J; oi++) {
        const j = order[oi];
        let left = 0;
        for (let it = 0; it < 4; it++) {
          left = look(j);
          if (!left) break;
          any = true;
          Qin.identity();
          for (let k = j + 1; k < J; k++) Qin.premultiply(Q[k]);
          tq.multiplyScalar(0.9 / Math.sqrt(left)).applyQuaternion(Qin.invert());
          const ang = tq.length();
          if (ang < 1e-6) break;
          Q[j].premultiply(dq.setFromAxisAngle(tq.multiplyScalar(1 / ang), Math.min(ang, 0.5)));
          const lim = o.joints[j].max * gain,
            now = angle(Q[j]);
          if (now > lim) Q[j].slerp(ident, 1 - lim / now);
        }
        if (!left) break;
      }
      for (let j = 0; j < J; j++) {
        const step = Q[j].angleTo(Qwas[j]);
        if (step > quick) {
          dq.copy(Q[j]);
          Q[j].copy(Qwas[j]).slerp(dq, quick / step);
        }
        this.amounts[j] = angle(Q[j]);
      }
      this.amount = this.amounts[0];
      if (!any) return;
      for (let j = 0; j < J; j++) if (Q[j].w < 0.9999995) turnInWorld(o.joints[j].bone, Q[j]);
      o.joints[J - 1].bone.updateMatrixWorld(true);
    },
  };
  return carry;
}

const LOOK_PARS = /* glsl */ `
uniform vec4 uKit; uniform vec3 uKitLight; uniform vec4 uKitRim; uniform vec3 uKitSelf; uniform vec4 uKitGold; uniform vec3 uKitRimMul; uniform vec4 uKitCut;
float kitEdge = 0.0;
vec3 kitP;
float kitHash( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float kitNoise( vec3 p ) {
	vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( kitHash( i ), kitHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( kitHash( i + vec3( 0, 1, 0 ) ), kitHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( kitHash( i + vec3( 0, 0, 1 ) ), kitHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( kitHash( i + vec3( 0, 1, 1 ) ), kitHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}`;
const LOOK_DISCARD = /* glsl */ `
	kitP = ( - vViewPosition - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
	if ( dot( kitP, uKitCut.xyz ) > uKitCut.w ) discard;
	if ( uKit.x > 0.002 ) {
		float kitN = kitNoise( kitP * uKit.w ) * 0.7 + kitNoise( kitP * uKit.w * 3.4 ) * 0.3;
		float kitCut = uKit.x * 0.98 - 0.07 + 0.13 * uKit.x * clamp( ( kitP.y - uKit.y ) / max( uKit.z, 0.1 ), 0.0, 1.0 );
		if ( kitN < kitCut ) discard;
		kitEdge = 1.0 - smoothstep( 0.0, 0.09, kitN - kitCut );
	}`;
const LOOK_LIGHT = /* glsl */ `
	{
		float kitFres = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), uKitRim.w * uKitRimMul.y );
		float kitBack = saturate( dot( normal, vec3( 0.0, 0.675, - 0.737 ) ) * 0.5 + 0.62 );
		totalEmissiveRadiance += uKitRim.rgb * ( kitFres * kitBack * uKitRimMul.x );
		totalEmissiveRadiance += diffuseColor.rgb * uKitSelf;
		float kitH = clamp( ( kitP.y - uKit.y ) / max( uKit.z, 0.1 ), 0.0, 1.0 );
		float kitRise = uKitGold.w * smoothstep( 0.0, 0.3, uKitGold.w * 1.3 - kitH );
		totalEmissiveRadiance += uKitGold.rgb * ( kitRise * uKitRimMul.z ) * ( 0.1 + 0.9 * metalnessFactor ) * ( 0.55 + 0.45 * kitFres );
		totalEmissiveRadiance += uKitLight * ( kitEdge * 5.0 + smoothstep( 0.0, 0.55, uKit.x ) * 0.8 );
	}`;

const LOOKS_WHO = {
  player: { rim: [0.5, 0.66, 1.0], rimStrength: 0.42, rimPower: 3.0, self: 0, gold: 0 },
  boss: { rim: [0.78, 0.86, 1.0], rimStrength: 0.26, rimPower: 3.4, self: 0.11, gold: 2.4 },
};
export function makeFadeUniforms(height = 1.8, who = 'player') {
  const L = LOOKS_WHO[who] || LOOKS_WHO.player;
  const u = {
    uKit: { value: new THREE.Vector4(0, 0, height, 9 / Math.max(1, height / 1.8)) },
    uKitLight: { value: rgb(1.0, 0.8, 0.45).multiplyScalar(2.2) },
    uKitRim: {
      value: new THREE.Vector4(
        L.rim[0] * L.rimStrength,
        L.rim[1] * L.rimStrength,
        L.rim[2] * L.rimStrength,
        L.rimPower,
      ),
    },
    uKitSelf: { value: rgb(1.0, 0.94, 0.84).multiplyScalar(L.self) },
    uKitGold: { value: new THREE.Vector4(1.0 * L.gold, 0.74 * L.gold, 0.34 * L.gold, 0) },
  };
  u.who = L;
  u.rim = (k) => {
    const r = u.uKitRim.value;
    r.x = L.rim[0] * L.rimStrength * k;
    r.y = L.rim[1] * L.rimStrength * k;
    r.z = L.rim[2] * L.rimStrength * k;
  };
  u.gold = (g) => {
    u.uKitGold.value.w = L.gold > 0 ? Math.min(1, Math.max(0, g)) : 0;
  };
  return u;
}
export function addFadeToMaterial(material, fade, o = {}) {
  if (!material || !(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) || material.userData.kitFade)
    return material;
  material.userData.kitFade = true;
  const mul = {
    value: new THREE.Vector3(
      o.rim !== undefined ? o.rim : 1,
      o.rimPower !== undefined ? o.rimPower : 1,
      o.gold !== undefined ? o.gold : 1,
    ),
  };
  const cut = (material.userData.kitCut = { value: new THREE.Vector4(0, 1, 0, 1e9) });
  return patchShader(material, 'kitlook', (shader) => {
    shader.uniforms.uKitRimMul = mul;
    shader.uniforms.uKitCut = cut;
    shader.uniforms.uKit = fade.uKit;
    shader.uniforms.uKitLight = fade.uKitLight;
    shader.uniforms.uKitRim = fade.uKitRim;
    shader.uniforms.uKitSelf = fade.uKitSelf;
    shader.uniforms.uKitGold = fade.uKitGold;
    let f = shader.fragmentShader.replace('void main() {', LOOK_PARS + '\nvoid main() {');
    f = insertAfterInclude(f, 'clipping_planes_fragment', LOOK_DISCARD, 'wardrobe');
    f = insertAfterInclude(f, 'emissivemap_fragment', LOOK_LIGHT, 'wardrobe');
    shader.fragmentShader = f;
  });
}

export function standardMaterial(ctx, kind, o) {
  const lib = ctx.gfx && ctx.gfx.materials,
    make = lib && typeof lib[kind] === 'function' ? lib[kind] : null;
  let m = null;
  if (make) {
    try {
      m = make.call(lib, Object.assign(kind === 'metal' ? { detail: 0 } : {}, o));
    } catch (e) {
      console.warn('wardrobe: gfx.materials.' + kind + ' failed, using a plain material: ' + e.message);
    }
  }
  if (!m || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) m = new THREE.MeshStandardMaterial();
  for (const k in o) {
    const v = o[k];
    if (v === undefined || !(k in m)) continue;
    if (m[k] && m[k].isColor) m[k].set(v);
    else if (m[k] && m[k].isVector2 && v.isVector2) m[k].copy(v);
    else m[k] = v;
  }
  m.needsUpdate = true;
  return m;
}
const trimLook = (name) => ({
  kind: 'metal',
  color: rgb(1, 1, 1),
  roughness: 1,
  metalness: 1,
  map: `prop.tex.trim_${name}`,
  orm: `prop.tex.trim_${name}_orm`,
  normalMap: `prop.tex.trim_${name}_n`,
  normalScale: 1.0,
});
const LOOKS = {
  trim_furniture: trimLook('furniture'),
  trim_metal: trimLook('metal'),
  trim_props: trimLook('props'),
  hammer_head: {
    kind: 'metal',
    color: rgb(1, 1, 1),
    roughness: 1,
    metalness: 1,
    map: 'prop.tex.hammer',
    orm: 'prop.tex.hammer_orm',
    normalMap: 'prop.tex.hammer_n',
    normalScale: 1.0,
    emissive: rgb(3.0, 0.75, 0.12),
    emissiveIntensity: 0,
    emissiveMap: true,
    kitGold: 0.15,
  }, // (glows through its own texture; takes little of the boss's gold, or it bleaches to beige)
  hammer_haft: {
    kind: 'metal',
    color: rgb(1, 1, 1),
    roughness: 1,
    metalness: 1,
    map: 'prop.tex.hammer',
    orm: 'prop.tex.hammer_orm',
    normalMap: 'prop.tex.hammer_n',
    normalScale: 1.0,
    kitGold: 0.15,
  },
};

export function applyKitMaterials(ctx, object, o = {}) {
  const made = {},
    has = (n) => ctx.assets && ctx.assets.has && ctx.assets.has(n);
  const texture = (name) => (has(name) ? ctx.assets.texture(name) : null);
  object.traverse((n) => {
    if (!n.isMesh) return;
    const name = n.material && n.material.name;
    if (!made[name]) {
      const L = LOOKS[name];
      if (L) {
        const p = { color: L.color, roughness: L.roughness, metalness: L.metalness, vertexColors: true };
        if (L.emissive) {
          p.emissive = L.emissive;
          p.emissiveIntensity = L.emissiveIntensity;
        }
        if (L.map) {
          p.map = texture(L.map);
          const orm = texture(L.orm);
          if (orm) {
            p.roughnessMap = orm;
            p.metalnessMap = orm;
            p.aoMap = orm;
          }
          const nm = texture(L.normalMap);
          if (nm) {
            p.normalMap = nm;
            p.normalScale = new THREE.Vector2(L.normalScale, L.normalScale);
          }
        }
        made[name] = standardMaterial(ctx, L.kind, p);
        if (L.emissiveMap && made[name].map) {
          made[name].emissiveMap = made[name].map;
          made[name].needsUpdate = true;
        }
        if (o.fade) addFadeToMaterial(made[name], o.fade, L.kitGold !== undefined ? { gold: L.kitGold } : {});
      } else made[name] = n.material;
      made[name].name = 'kit.' + name;
    }
    n.material = made[name];
    n.castShadow = true;
    n.receiveShadow = n.castShadow;
    n.userData.kit = true;
  });
  return made;
}

const RADIUS = { hammer: 0.075 };
const GRIP = { hammer: 0.04 };
export function makeWeapon(ctx, kind, look = {}) {
  const name = 'prop.' + kind;
  if (!ctx.assets || !ctx.assets.has(name))
    throw new Error(
      `wardrobe: "${name}" was not loaded. The game's manifest must include wardrobe.ASSETS (boss.js and player.js re-export it).`,
    );
  const object = ctx.assets.gltf(name).scene.clone(true);
  object.name = kind;
  const materials = applyKitMaterials(ctx, object, look);
  const anchors = {};
  object.traverse((n) => {
    if (!n.isMesh && n !== object && n.name && !n.children.some((c) => c.isMesh)) anchors[n.name] = n;
  });
  const base = anchors.base || new THREE.Object3D(),
    tip = anchors.tip || new THREE.Object3D();
  if (!anchors.base) object.add(base);
  if (!anchors.tip) object.add(tip);
  const length = tip.position.distanceTo(base.position);
  return { object, base, tip, radius: RADIUS[kind] || 0.05, length, kind, anchors, materials, grip: GRIP[kind] || 0 };
}
// Mount points of the hero's sword and scabbard, as their models had them; the visible great sword and sheath hang on
// them (greatsword.js). The scabbard's "sword" point is turned half round, so a sheathed blade points down.
const FRAMES = {
  sword: { radius: 0.05, grip: 0.0135, at: { base: [0, 0.148, 0], tip: [0, 1.068, 0], guard: [0, 0.11, 0] } },
  scabbard: {
    radius: 0.05,
    grip: 0,
    at: { mouth: [0, 0, 0], sword: [0, 0.1175, 0, 1, 0, 0, 0], hang: [0, 0.07, -0.022], chape: [0, -0.83, 0] },
  },
};
/**
 * A weapon without a model: its object and named mount points, shaped like makeWeapon's result. `cut` is the plane
 * that hides a sheathed blade (the wardrobe moves it, the blade's materials share it).
 * @param {'sword' | 'scabbard'} kind
 */
export function makeFrame(kind) {
  const F = FRAMES[kind];
  if (!F) throw new Error(`wardrobe: no frame "${kind}"`);
  const object = new THREE.Object3D();
  object.name = kind;
  const anchors = {};
  for (const name in F.at) {
    const [x, y, z, qx, qy, qz, qw] = F.at[name],
      n = new THREE.Object3D();
    n.name = name;
    n.position.set(x, y, z);
    if (qw !== undefined) n.quaternion.set(qx, qy, qz, qw);
    object.add(n);
    anchors[name] = n;
  }
  const base = anchors.base || new THREE.Object3D(),
    tip = anchors.tip || new THREE.Object3D();
  if (!anchors.base) object.add(base);
  if (!anchors.tip) object.add(tip);
  const length = tip.position.distanceTo(base.position);
  return {
    object,
    base,
    tip,
    radius: F.radius,
    length,
    kind,
    anchors,
    materials: {},
    grip: F.grip,
    cut: new THREE.Vector4(0, 1, 0, 1e9),
  };
}
export function disposeWeapon(w) {
  if (!w) return;
  if (w.object.parent) w.object.parent.remove(w.object);
  for (const k in w.materials) {
    const m = w.materials[k];
    if (m && m.dispose) m.dispose();
  }
}

/** The scabbard hangs from a pivot on the hips. */
const SETTLE = 0.4;
export class Hanger {
  constructor(pivot, object, length, o = {}) {
    this.pivot = pivot;
    this.object = object;
    this.length = length;
    this.radius = o.radius || 0.03;
    this.capsules = o.capsules || null;
    this.use = this.capsules && o.use ? this.capsules.ids(o.use) : [];
    this.floor = o.floor || null;
    this.centre = o.centre || null;
    this.stiff = o.stiff || 420;
    this.damp = o.damp || 30;
    this.droop = o.droop !== undefined ? o.droop : -0.34;
    this.hang = o.hang !== undefined ? o.hang : 0.7;
    this.rest = o.rest !== undefined ? o.rest : 0.75;
    this.x = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.piv = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, -1, 0);
    this.fresh = true;
    this.aim = new THREE.Vector3();
    this.aimed = 0;
    this.scale = 1;
    this.settle = 0;
    object.matrixAutoUpdate = false;
  }
  teleport() {
    this.fresh = true;
    this.settle = SETTLE;
  }
  update(dt) {
    const P = this.piv,
      L0 = this.length,
      x = this.x,
      v = this.v,
      e = this.pivot.matrixWorld.elements;
    const S = (this.scale = Math.hypot(e[0], e[1], e[2]) || 1),
      L = L0 * S;
    P.set(e[12], e[13], e[14]);
    _a.set(-e[4] / S, -e[5] / S, -e[6] / S);
    {
      const hl = Math.hypot(_a.x, _a.z);
      if (hl > 0.15) {
        const k = this.hang * Math.min(1, (hl - 0.15) / 0.2),
          sn = Math.sqrt(1 - this.rest * this.rest);
        _b.set((_a.x / hl) * sn, -this.rest, (_a.z / hl) * sn);
        _a.lerp(_b, k).normalize();
      }
    }
    if (this.aimed > 0.001) {
      _b.subVectors(P, this.aim);
      if (_b.lengthSq() > 1e-8) {
        _b.normalize();
        _a.lerp(_b, this.aimed).normalize();
      }
    }
    const top = this.droop + (0.0 - this.droop) * this.aimed;
    if (_a.y > top) {
      let hx = _a.x,
        hz = _a.z,
        hl = Math.hypot(hx, hz);
      if (hl < 0.2 && this.centre) {
        const c = this.centre.matrixWorld.elements,
          bl = Math.hypot(c[8], c[10]) || 1,
          k = 1 - hl / 0.2;
        hx += (-c[8] / bl) * k;
        hz += (-c[10] / bl) * k;
        hl = Math.hypot(hx, hz);
      }
      if (hl < 1e-4) {
        hx = 0;
        hz = -1;
        hl = 1;
      }
      const flat = Math.sqrt(1 - top * top);
      _a.set((hx / hl) * flat, top, (hz / hl) * flat);
    }
    if (this.fresh || this.settle > 0) {
      x.copy(P).addScaledVector(_a, L);
      v.set(0, 0, 0);
      this.fresh = false;
      if (this.settle > 0) this.settle -= dt;
    } else {
      const k = this.stiff,
        c = this.damp,
        tx = P.x + _a.x * L,
        ty = P.y + _a.y * L,
        tz = P.z + _a.z * L;
      v.x += ((tx - x.x) * k - v.x * c) * dt;
      v.y += ((ty - x.y) * k - v.y * c) * dt;
      v.z += ((tz - x.z) * k - v.z * c) * dt;
      x.addScaledVector(v, dt);
      const ex = x.x - tx,
        ey = x.y - ty,
        ez = x.z - tz,
        e2 = ex * ex + ey * ey + ez * ez,
        lim = L * 0.2;
      if (e2 > lim * lim) {
        const f = lim / Math.sqrt(e2);
        x.set(tx + ex * f, ty + ey * f, tz + ez * f);
      }
    }
    const cur = this.capsules ? this.capsules.cur : null,
      rad = this.capsules ? this.capsules.rad : null,
      fy = this.floor ? this.floor() + this.radius * S : -Infinity;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.use.length; i++) {
        const c = this.use[i],
          k = c * 6,
          R = rad[c] + this.radius * S;
        _b.set(cur[k], cur[k + 1], cur[k + 2]);
        _c.set(cur[k + 3], cur[k + 4], cur[k + 5]);
        _q0.copy(P).lerp(x, 0.32);
        const d = Math.sqrt(closestSegmentPoints(_q0, x, _b, _c, _gc1, _gc2));
        if (d >= R) continue;
        const t = Math.max(0.32, _gc1.distanceTo(P) / (x.distanceTo(P) || 1));
        _v.subVectors(_gc1, _gc2);
        if (d < 1e-5) _v.set(e[8], e[9], e[10]).normalize();
        else _v.multiplyScalar(1 / d);
        x.addScaledVector(_v, (R - d) / t);
        const vn = v.dot(_v);
        if (vn < 0) v.addScaledVector(_v, -vn);
      }
      _v.subVectors(x, P);
      const len = _v.length() || 1;
      _v.multiplyScalar(1 / len);
      const low = (fy - P.y) / L;
      if (_v.y < low) {
        const up = Math.min(0.999, Math.max(-0.999, low)),
          flat = Math.sqrt(1 - up * up);
        let hx = _v.x,
          hz = _v.z,
          hl = Math.hypot(hx, hz);
        if (hl < 0.05 && this.centre) {
          const c = this.centre.matrixWorld.elements;
          hx = -c[8];
          hz = -c[10];
          hl = Math.hypot(hx, hz);
        }
        if (hl < 1e-4) {
          hx = 0;
          hz = -1;
          hl = 1;
        }
        _v.set((hx / hl) * flat, up, (hz / hl) * flat);
        if (v.y < 0) v.y = 0;
      }
      x.copy(P).addScaledVector(_v, L);
    }
    this.dir.copy(_v);
    _a.copy(_v).negate();
    _b.set(e[8], e[9], e[10]);
    _b.addScaledVector(_a, -_b.dot(_a));
    if (_b.lengthSq() < 1e-8) {
      _b.set(e[0], e[1], e[2]);
      _b.addScaledVector(_a, -_b.dot(_a));
    }
    _b.normalize();
    _c.crossVectors(_a, _b);
    _m.makeBasis(_c, _a, _b)
      .scale(_s3.set(S, S, S))
      .setPosition(P);
    const parent = this.object.parent;
    if (parent) this.object.matrix.copy(_m2.copy(parent.matrixWorld).invert()).multiply(_m);
    else this.object.matrix.copy(_m);
    this.object.matrixWorldNeedsUpdate = true;
  }
}
