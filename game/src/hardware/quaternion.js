export function rotate(q, v, out = [0, 0, 0]) {
  const [w, x, y, z] = q,
    [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy),
    ty = 2 * (z * vx - x * vz),
    tz = 2 * (x * vy - y * vx);
  out[0] = vx + w * tx + (y * tz - z * ty);
  out[1] = vy + w * ty + (z * tx - x * tz);
  out[2] = vz + w * tz + (x * ty - y * tx);
  return out;
}
export function rotateInverse(q, v, out) {
  return rotate([q[0], -q[1], -q[2], -q[3]], v, out);
}

export function multiply(a, b, out = [1, 0, 0, 0]) {
  const [aw, ax, ay, az] = a,
    [bw, bx, by, bz] = b;
  out[0] = aw * bw - ax * bx - ay * by - az * bz;
  out[1] = aw * bx + ax * bw + ay * bz - az * by;
  out[2] = aw * by - ax * bz + ay * bw + az * bx;
  out[3] = aw * bz + ax * by - ay * bx + az * bw;
  return out;
}
export function normalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l;
  q[1] /= l;
  q[2] /= l;
  q[3] /= l;
  return q;
}
export function axisAngle(axis, rad) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1,
    s = Math.sin(rad / 2) / l;
  return [Math.cos(rad / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}
export const vectorLength = (v) => Math.hypot(v[0], v[1], v[2]);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b, out = [0, 0, 0]) => {
  const x = a[1] * b[2] - a[2] * b[1],
    y = a[2] * b[0] - a[0] * b[2],
    z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
};
export const angle = (a, b) =>
  Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (vectorLength(a) * vectorLength(b) || 1))));
