// Transfer poses from the reference rig. Each bone uses a fixed T-pose rotation offset.
import * as THREE from 'three';
import { Rig, stripMixamoPrefix } from './animation-graph.js';

const FOLLOW = /^(Left|Right)Hand(Middle|Ring|Pinky)(\d)$/;
const AWAY = (100 * Math.PI) / 180;
const _a = new THREE.Quaternion(),
  _b = new THREE.Quaternion(),
  _c = new THREE.Quaternion(),
  _m = new THREE.Matrix4();
const _u = new THREE.Vector3(),
  _w = new THREE.Vector3(),
  _x = new THREE.Vector3(),
  _p = new THREE.Vector3();

const rank = (name) =>
  /(Spine\d*|Neck|Head)$/.test(name) ? 0 : /HandMiddle1$/.test(name) ? 1 : /HandIndex1$/.test(name) ? 2 : 3;

export class Retarget {
  constructor(rig, model) {
    const S = (this.S = rig),
      T = (this.T = new Rig(model)),
      n = T.count;
    this.model = model;
    this.map = new Int16Array(n).fill(-1);
    this.follow = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
      const name = stripMixamoPrefix(T.bones[t].name);
      let s = S.index[name];
      if (s === undefined) {
        const f = name.match(FOLLOW);
        if (f && S.index[f[1] + 'HandIndex' + f[3]] !== undefined) {
          s = S.index[f[1] + 'HandIndex' + f[3]];
          this.follow[t] = 1;
        }
      }
      if (s !== undefined) this.map[t] = s;
    }
    const WS = S.tposeWorld(),
      WT = (this.WT = new Float32Array(n * 4)),
      D = (this.D = new Float32Array(n * 4));
    const kids = [];
    for (let t = 0; t < n; t++) kids.push([]);
    for (let t = 0; t < n; t++) if (T.parent[t] >= 0) kids[T.parent[t]].push(t);
    const at = (arr, i, q) => q.set(arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]);
    for (let t = 0; t < n; t++) {
      const p = T.parent[t],
        s = this.map[t];
      (p < 0 ? _a.set(T.baseQ[0], T.baseQ[1], T.baseQ[2], T.baseQ[3]) : at(WT, p, _a)).multiply(at(T.rest0, t, _b));
      if (s >= 0) {
        const pairs = [];
        for (const c of kids[t]) {
          const sc = this.map[c];
          if (sc < 0 || S.parent[sc] !== s || (this.follow[c] && !this.follow[t])) continue;
          const dT = new THREE.Vector3().fromArray(T.restPos, c * 3).applyQuaternion(_a),
            dS = new THREE.Vector3().fromArray(S.restPos, sc * 3).applyQuaternion(at(WS, s, _b));
          if (dT.lengthSq() < 1e-12 || dS.lengthSq() < 1e-12) continue;
          // Skip misaligned end bones so they cannot flip their parents.
          if (!kids[c].length && dT.angleTo(dS) > AWAY) {
            console.warn(
              `retarget: ${stripMixamoPrefix(T.bones[c].name)} lies ${Math.round((dT.angleTo(dS) / Math.PI) * 180)} degrees from where the reference's does: ${stripMixamoPrefix(T.bones[t].name)} is not turned by it`,
            );
            continue;
          }
          pairs.push({
            rank: rank(stripMixamoPrefix(T.bones[c].name)),
            len: dT.length(),
            dT: dT.normalize(),
            dS: dS.normalize(),
          });
        }
        if (pairs.length) {
          pairs.sort((x, y) => x.rank - y.rank || y.len - x.len);
          const main = pairs[0];
          _c.setFromUnitVectors(main.dT, main.dS);
          if (pairs.length > 1) {
            let sn = 0,
              cs = 0;
            for (let k = 1; k < pairs.length; k++) {
              _u.copy(pairs[k].dT).applyQuaternion(_c);
              _u.addScaledVector(main.dS, -_u.dot(main.dS));
              _w.copy(pairs[k].dS);
              _w.addScaledVector(main.dS, -_w.dot(main.dS));
              sn += _x.crossVectors(_u, _w).dot(main.dS);
              cs += _u.dot(_w);
            }
            if (sn * sn + cs * cs > 1e-12) _c.premultiply(_b.setFromAxisAngle(main.dS, Math.atan2(sn, cs)));
          }
          _a.premultiply(_c);
        }
      }
      _a.normalize().toArray(WT, t * 4);
      if (s >= 0)
        at(WS, s, _b)
          .invert()
          .multiply(_a)
          .normalize()
          .toArray(D, t * 4);
    }
    // Scale hip movement by the ratio of leg lengths.
    const root = model.parent || model;
    S.model.updateWorldMatrix(true, true);
    model.updateWorldMatrix(true, true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const height = (b) => _p.setFromMatrixPosition(_m.multiplyMatrices(toRoot, b.matrixWorld)).y;
    const ank = (r) => {
      const l = r.bones[r.index.LeftFoot],
        q = r.bones[r.index.RightFoot];
      return l && q ? (height(l) + height(q)) / 2 : 0;
    };
    const hipS = height(S.bones[S.hips]),
      hipT = height(T.bones[T.hips]),
      ankS = ank(S),
      ankT = ank(T);
    this.k = (hipT - ankT) / Math.max(1e-6, hipS - ankS);
    this.lift0 = ankT - this.k * ankS;
    this.s0 = T.baseS;
    this.contact = {};
    for (const sd of ['Left', 'Right']) {
      for (const k of [sd + 'Foot', sd + 'ToeBase']) {
        const b = T.bones[T.index[k]];
        if (!b) continue;
        const m = new THREE.Matrix4().multiplyMatrices(toRoot, b.matrixWorld),
          inv = m.clone().invert(),
          j = new THREE.Vector3().setFromMatrixPosition(m),
          pts = [];
        const add = (x, z) => {
          const v = new THREE.Vector3(x, 0, z).applyMatrix4(inv);
          pts.push(v.x, v.y, v.z);
        };
        add(j.x, j.z);
        if (k === sd + 'Foot') add(j.x, j.z - 0.055 * T.baseS);
        this.contact[k] = pts;
      }
    }
    this.RS = new Float32Array(S.count * 4);
    this.RT = new Float32Array(n * 4);
  }

  refresh() {
    this.T.refreshBase();
  }

  apply() {
    const S = this.S,
      T = this.T,
      RS = this.RS,
      RT = this.RT,
      D = this.D,
      map = this.map;
    for (let i = 0; i < S.count; i++) {
      const p = S.parent[i],
        q = S.bones[i].quaternion;
      (p < 0 ? _a.fromArray(S.baseQ) : _a.fromArray(RS, p * 4)).multiply(q).toArray(RS, i * 4);
    }
    for (let t = 0; t < T.count; t++) {
      const p = T.parent[t],
        s = map[t];
      if (s >= 0) _a.fromArray(RS, s * 4).multiply(_b.fromArray(D, t * 4));
      else (p < 0 ? _a.fromArray(T.baseQ) : _a.fromArray(RT, p * 4)).multiply(_b.fromArray(T.rest0, t * 4));
      _a.toArray(RT, t * 4);
      (p < 0 ? _b.fromArray(T.baseQ) : _b.fromArray(RT, p * 4)).invert().multiply(_a);
      T.bones[t].quaternion.copy(_b);
    }
    const h = S.bones[S.hips].position,
      bs = S.baseS,
      k = this.k;
    _p.copy(h).applyQuaternion(_a.fromArray(S.baseQ)).multiplyScalar(bs).add(_u.fromArray(S.baseP)).multiplyScalar(k);
    _p.y += this.lift0 * (T.baseS / this.s0);
    _p.sub(_u.fromArray(T.baseP))
      .applyQuaternion(_a.fromArray(T.baseQ).invert())
      .multiplyScalar(1 / T.baseS);
    T.bones[T.hips].position.copy(_p);
  }

  tposeWorld(bone, out = new THREE.Quaternion()) {
    const i = this.T.index[bone];
    if (i === undefined) throw new Error(`retarget: no bone "${bone}"`);
    return out.fromArray(this.WT, i * 4);
  }
  delta(bone, out = new THREE.Quaternion()) {
    const i = this.T.index[bone];
    if (i === undefined || this.map[i] < 0) return null;
    return out.fromArray(this.D, i * 4);
  }
}
