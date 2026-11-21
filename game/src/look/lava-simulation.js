// Track depth, heat, and flow to four neighbors on a grid.

const G = 9.81;

export const LAVA_DEFAULTS = {
  flow: 1.0,
  visc: [3, 40],
  yield: [0.002, 0.03],
  coolAir: 0.004,
  coolWater: 0.014,
  wetBelow: 0.06,
  crust: 0.12,
  breakUp: 0.012,
};

export class LavaSim {
  constructor({ x0, z0, nx, nz, cell, bed, ...o }) {
    Object.assign(this, LAVA_DEFAULTS, o);
    this.x0 = x0;
    this.z0 = z0;
    this.nx = nx;
    this.nz = nz;
    this.cell = cell;
    const N = nx * nz;
    this.bed = new Float32Array(N);
    this.d = new Float32Array(N);
    this.T = new Float32Array(N);
    this.f = new Float32Array(N * 4);
    this.vx = new Float32Array(N);
    this.vz = new Float32Array(N);
    this.heat = new Float32Array(N);
    this.nd = new Float32Array(N);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) this.bed[j * nx + i] = bed(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
    this.sources = [];
    this.active = false;
    this.volume = 0;
  }
  index(x, z) {
    const i = Math.floor((x - this.x0) / this.cell),
      j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }
  at(x, z, out = { depth: 0, temp: 0 }) {
    const k = this.index(x, z);
    out.depth = k < 0 ? 0 : this.d[k];
    out.temp = k < 0 ? 0 : this.T[k];
    return out;
  }
  pour(x, z, radius, rate, seconds = Infinity) {
    const s = { x, z, radius, rate, left: seconds };
    this.sources.push(s);
    return s;
  }
  clear() {
    this.d.fill(0);
    this.T.fill(0);
    this.f.fill(0);
    this.vx.fill(0);
    this.vz.fill(0);
    this.sources = this.sources.filter((s) => s.left === Infinity);
    this.active = false;
  }

  step(dt) {
    const { nx, nz, cell, d, T, f, bed, heat, nd } = this,
      N = nx * nz,
      A = cell * cell;
    for (let s = this.sources.length - 1; s >= 0; s--) {
      const src = this.sources[s],
        r = Math.max(src.radius, cell * 0.75);
      const i0 = Math.max(0, Math.floor((src.x - r - this.x0) / cell)),
        i1 = Math.min(nx - 1, Math.floor((src.x + r - this.x0) / cell));
      const j0 = Math.max(0, Math.floor((src.z - r - this.z0) / cell)),
        j1 = Math.min(nz - 1, Math.floor((src.z + r - this.z0) / cell));
      let n = 0;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const dx = this.x0 + (i + 0.5) * cell - src.x,
            dz = this.z0 + (j + 0.5) * cell - src.z;
          if (dx * dx + dz * dz <= r * r) n++;
        }
      if (n) {
        const add = (src.rate * dt) / (n * A);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const dx = this.x0 + (i + 0.5) * cell - src.x,
              dz = this.z0 + (j + 0.5) * cell - src.z;
            if (dx * dx + dz * dz > r * r) continue;
            const k = j * nx + i,
              was = d[k];
            d[k] += add;
            T[k] = (T[k] * was + add) / d[k];
          }
        this.active = true;
      }
      if ((src.left -= dt) <= 0) this.sources.splice(s, 1);
    }
    if (!this.active) return;
    const k0 = (G * this.flow) / cell;
    let any = false;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i,
          dk = d[k],
          o = k * 4;
        if (dk <= 1e-5) {
          f[o] = f[o + 1] = f[o + 2] = f[o + 3] = 0;
          continue;
        }
        any = true;
        const t = T[k],
          cold = 1 - Math.min(1, t),
          damp = Math.exp(-(this.visc[0] + (this.visc[1] - this.visc[0]) * cold * cold) * dt);
        const yld = t < this.crust ? 1e9 : this.yield[0] + (this.yield[1] - this.yield[0]) * cold;
        const h = bed[k] + dk;
        const flow = (n, q) => {
          if (n < 0) return 0;
          const dh = h - (bed[n] + d[n]) - yld;
          return Math.max(0, f[o + q] * damp + (dh > 0 ? dt * k0 * dh : -f[o + q] * 0.5));
        };
        f[o] = flow(i < nx - 1 ? k + 1 : -1, 0);
        f[o + 1] = flow(i > 0 ? k - 1 : -1, 1);
        f[o + 2] = flow(j < nz - 1 ? k + nx : -1, 2);
        f[o + 3] = flow(j > 0 ? k - nx : -1, 3);
        const out = (f[o] + f[o + 1] + f[o + 2] + f[o + 3]) * dt;
        if (out > dk) {
          const s = dk / out;
          f[o] *= s;
          f[o + 1] *= s;
          f[o + 2] *= s;
          f[o + 3] *= s;
        }
      }
    if (!any && !this.sources.length) {
      this.active = false;
      return;
    }
    for (let k = 0; k < N; k++) {
      const o = k * 4,
        out = (f[o] + f[o + 1] + f[o + 2] + f[o + 3]) * dt;
      nd[k] = d[k] - out;
      heat[k] = (d[k] - out) * T[k];
    }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i,
          o = k * 4,
          t = T[k];
        if (f[o]) {
          const v = f[o] * dt;
          nd[k + 1] += v;
          heat[k + 1] += v * t;
        }
        if (f[o + 1]) {
          const v = f[o + 1] * dt;
          nd[k - 1] += v;
          heat[k - 1] += v * t;
        }
        if (f[o + 2]) {
          const v = f[o + 2] * dt;
          nd[k + nx] += v;
          heat[k + nx] += v * t;
        }
        if (f[o + 3]) {
          const v = f[o + 3] * dt;
          nd[k - nx] += v;
          heat[k - nx] += v * t;
        }
      }
    let vol = 0;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i,
          o = k * 4;
        let dk = nd[k],
          t = dk > 1e-6 ? heat[k] / dk : 0;
        const wet = bed[k] < this.wetBelow ? 1 : 0;
        t = Math.max(0, t - (dt * (this.coolAir + this.coolWater * wet)) / (dk + 0.03));
        if (t < this.crust) dk = Math.max(0, dk - this.breakUp * dt);
        if (dk < 1e-5) {
          dk = 0;
          t = 0;
        }
        d[k] = dk;
        T[k] = t;
        vol += dk;
        const inx = i > 0 ? f[(k - 1) * 4] : 0,
          inxB = i < nx - 1 ? f[(k + 1) * 4 + 1] : 0;
        const inz = j > 0 ? f[(k - nx) * 4 + 2] : 0,
          inzB = j < nz - 1 ? f[(k + nx) * 4 + 3] : 0;
        const depth = Math.max(dk, 0.02);
        this.vx[k] = ((f[o] - f[o + 1] + inx - inxB) * 0.5 * cell) / depth;
        this.vz[k] = ((f[o + 2] - f[o + 3] + inz - inzB) * 0.5 * cell) / depth;
      }
    this.volume = vol * A;
  }
}
