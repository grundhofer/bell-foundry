// Segment tests shared by the fight (blade against capsules and stones) and the weapons' arm carry.
import * as THREE from 'three';

const _d1 = new THREE.Vector3(),
  _d2 = new THREE.Vector3(),
  _r = new THREE.Vector3();

/**
 * Closest points between the segments p1–q1 and p2–q2, robust for segments of zero length.
 * Writes the points to c1 and c2 and returns their squared distance. If `params` is given, it receives where the points
 * lie along the segments (s on the first, t on the second, both 0…1).
 * @param {THREE.Vector3} p1
 * @param {THREE.Vector3} q1
 * @param {THREE.Vector3} p2
 * @param {THREE.Vector3} q2
 * @param {THREE.Vector3} c1
 * @param {THREE.Vector3} c2
 * @param {{ s: number, t: number }} [params]
 */
export function closestSegmentPoints(p1, q1, p2, q2, c1, c2, params) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1),
    e = _d2.dot(_d2),
    f = _d2.dot(_r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = _d1.dot(_r);
    if (e <= 1e-9) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = _d1.dot(_d2),
        den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  c1.copy(p1).addScaledVector(_d1, s);
  c2.copy(p2).addScaledVector(_d2, t);
  if (params) {
    params.s = s;
    params.t = t;
  }
  return c1.distanceToSquared(c2);
}

/**
 * Where the segment from `a` along (dx, dy, dz) first enters an upright cylinder standing on the floor
 * (axis at cx, cz; radius r; top at height h). Returns the segment parameter 0…1, or -1 if it misses.
 * @param {{ x: number, y: number, z: number }} a segment start
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @param {number} l2 dx² + dz², passed in because callers test one segment against many cylinders
 * @param {number} cx
 * @param {number} cz
 * @param {number} r
 * @param {number} h
 */
export function segmentEntersCylinder(a, dx, dy, dz, l2, cx, cz, r, h) {
  const fx = a.x - cx,
    fz = a.z - cz,
    cq = fx * fx + fz * fz - r * r;
  let t0 = 0,
    t1 = 1;
  if (l2 > 1e-9) {
    const bq = fx * dx + fz * dz,
      disc = bq * bq - l2 * cq;
    if (disc <= 0) return -1;
    const q = Math.sqrt(disc);
    t0 = (-bq - q) / l2;
    t1 = (-bq + q) / l2;
    if (t1 <= 0 || t0 >= 1) return -1;
    if (t0 < 0) t0 = 0;
    if (t1 > 1) t1 = 1;
  } else if (cq >= 0) return -1;
  const y0 = a.y + dy * t0,
    y1 = a.y + dy * t1;
  if (y0 > h && y1 > h) return -1;
  return y0 <= h ? t0 : t0 + ((t1 - t0) * (y0 - h)) / (y0 - y1);
}
