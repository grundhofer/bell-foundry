import { clamp, lerp, smooth, smoother, DEG } from '../core/math.js';
export { clamp, lerp, smooth, smoother, DEG };
export const ramp = (a, b, t) => smoother((t - a) / (b - a));

export class Curve {
  constructor(keys) {
    if (!keys.length) throw new Error('Curve: no keys');
    const n = (this.n = keys.length),
      dim = (this.dim = Array.isArray(keys[0][1]) ? keys[0][1].length : 1);
    const T = (this.t = new Float64Array(n)),
      V = (this.v = new Float64Array(n * dim)),
      M = (this.m = new Float64Array(n * dim));
    for (let i = 0; i < n; i++) {
      T[i] = keys[i][0];
      if (i && T[i] <= T[i - 1]) throw new Error(`Curve: key times must rise (${T[i - 1]} then ${T[i]})`);
      for (let d = 0; d < dim; d++) V[i * dim + d] = dim === 1 ? keys[i][1] : keys[i][1][d];
    }
    for (let d = 0; d < dim; d++) {
      const v = (i) => V[i * dim + d],
        slope = (i) => (v(i + 1) - v(i)) / (T[i + 1] - T[i]);
      for (let i = 0; i < n; i++) {
        const flag = keys[i][2] || '';
        let m = 0;
        if (n === 1 || flag === 's') m = 0;
        else if (i === 0 || i === n - 1) {
          const a = i === 0 ? 0 : n - 2,
            d0 = slope(a);
          if (n === 2) m = d0;
          else {
            const b = i === 0 ? 1 : n - 3,
              d1 = slope(b),
              h0 = T[a + 1] - T[a],
              h1 = T[b + 1] - T[b];
            m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
            if (m * d0 <= 0) m = 0;
            else if (d0 * d1 <= 0 && Math.abs(m) > 3 * Math.abs(d0)) m = 3 * d0;
          }
        } else if (flag === 'c') m = (v(i + 1) - v(i - 1)) / (T[i + 1] - T[i - 1]);
        else {
          const d0 = slope(i - 1),
            d1 = slope(i);
          if (d0 * d1 > 0) {
            const h0 = T[i] - T[i - 1],
              h1 = T[i + 1] - T[i],
              w1 = 2 * h1 + h0,
              w2 = h1 + 2 * h0;
            m = (w1 + w2) / (w1 / d0 + w2 / d1);
          }
        }
        M[i * dim + d] = m;
      }
    }
    this.t0 = T[0];
    this.t1 = T[n - 1];
    this.i = 0;
  }
  _span(t) {
    const T = this.t,
      n = this.n;
    let i = this.i;
    if (i > n - 2) i = n - 2;
    while (i > 0 && t < T[i]) i--;
    while (i < n - 2 && t >= T[i + 1]) i++;
    return (this.i = i);
  }
  _eval(t, d) {
    const n = this.n,
      dim = this.dim,
      V = this.v;
    if (n === 1 || t <= this.t0) return V[d];
    if (t >= this.t1) return V[(n - 1) * dim + d];
    const i = this._span(t),
      T = this.t,
      h = T[i + 1] - T[i],
      s = (t - T[i]) / h,
      s2 = s * s,
      s3 = s2 * s;
    const a = i * dim + d,
      b = a + dim;
    return (
      (2 * s3 - 3 * s2 + 1) * V[a] +
      (s3 - 2 * s2 + s) * h * this.m[a] +
      (-2 * s3 + 3 * s2) * V[b] +
      (s3 - s2) * h * this.m[b]
    );
  }
  at(t) {
    return this._eval(t, 0);
  }
  into(t, out) {
    out.x = this._eval(t, 0);
    out.y = this._eval(t, 1);
    out.z = this._eval(t, 2);
    return out;
  }
  speed(t, d = 0) {
    const e = 1 / 120;
    return (this._eval(t + e, d) - this._eval(t - e, d)) / (2 * e);
  }
}

export function toCurve(v) {
  if (v instanceof Curve || (v && !Array.isArray(v) && typeof v.at === 'function')) return v;
  if (Array.isArray(v) && Array.isArray(v[0])) return new Curve(v);
  if (Array.isArray(v)) return new Curve([[0, v]]);
  return new Curve([[0, v]]);
}

export function wobble(t, seed = 0) {
  const p = seed * 12.9898;
  return (
    0.5 * Math.sin(t * 1.0 + p) +
    0.3 * Math.sin(t * 1.618034 + p * 2.3 + 1.7) +
    0.2 * Math.sin(t * 2.718282 + p * 3.1 + 4.1)
  );
}

export class Spring {
  constructor(x = 0) {
    this.x = x;
    this.v = 0;
  }
  reset(x) {
    this.x = x;
    this.v = 0;
    return x;
  }
  step(target, rate, dt) {
    const k = rate * rate;
    this.v += ((target - this.x) * k - this.v * 2 * rate) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}
export class Spring3 {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
  }
  reset(p) {
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
    this.vx = this.vy = this.vz = 0;
  }
  step(p, rate, dt) {
    const k = rate * rate,
      d = 2 * rate;
    this.vx += ((p.x - this.x) * k - this.vx * d) * dt;
    this.vy += ((p.y - this.y) * k - this.vy * d) * dt;
    this.vz += ((p.z - this.z) * k - this.vz * d) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
  }
}
