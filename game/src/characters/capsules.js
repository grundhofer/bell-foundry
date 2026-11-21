// Capsules on the bones of a figure: the body its carried weapons stay clear of (weapons.js makeCarry, Hanger).
const ZERO = [0, 0, 0];

export class Capsules {
  constructor(scale = 1) {
    this.scale = scale;
    this.list = [];
    this.index = new Map();
    this.cur = null;
    this.prev = null;
    this.rad = null;
    this.fresh = true;
  }
  add(name, a, ao, b, bo, r) {
    this.index.set(name, this.list.length);
    this.list.push({ name, a, ao: ao || ZERO, b: b || a, bo: bo || ZERO, r });
    return this;
  }
  addFree(name, r) {
    this.index.set(name, this.list.length);
    this.list.push({ name, free: true, r });
    return this;
  }
  setFree(name, ax, ay, az, bx, by, bz) {
    const k = this.index.get(name) * 6,
      c = this.cur;
    c[k] = ax;
    c[k + 1] = ay;
    c[k + 2] = az;
    c[k + 3] = bx;
    c[k + 4] = by;
    c[k + 5] = bz;
    if (this.freeFresh) this.prev.set(c.subarray(k, k + 6), k);
  }
  build() {
    const n = this.list.length;
    this.cur = new Float32Array(n * 6);
    this.prev = new Float32Array(n * 6);
    this.rad = new Float32Array(n);
    for (let i = 0; i < n; i++) this.rad[i] = this.list[i].r * this.scale;
    this.freeFresh = true;
    return this;
  }
  ids(names) {
    return names.map((n) => {
      const i = this.index.get(n);
      if (i === undefined) throw new Error('no capsule "' + n + '"');
      return i;
    });
  }
  update(again = false) {
    const cur = this.cur,
      list = this.list;
    if (!again) {
      this.prev.set(cur);
      this.freeFresh = this.fresh;
    }
    for (let i = 0, k = 0; i < list.length; i++, k += 6) {
      const c = list[i];
      if (c.free) continue;
      let e = c.a.matrixWorld.elements,
        o = c.ao;
      cur[k] = e[0] * o[0] + e[4] * o[1] + e[8] * o[2] + e[12];
      cur[k + 1] = e[1] * o[0] + e[5] * o[1] + e[9] * o[2] + e[13];
      cur[k + 2] = e[2] * o[0] + e[6] * o[1] + e[10] * o[2] + e[14];
      e = c.b.matrixWorld.elements;
      o = c.bo;
      cur[k + 3] = e[0] * o[0] + e[4] * o[1] + e[8] * o[2] + e[12];
      cur[k + 4] = e[1] * o[0] + e[5] * o[1] + e[9] * o[2] + e[13];
      cur[k + 5] = e[2] * o[0] + e[6] * o[1] + e[10] * o[2] + e[14];
    }
    if (this.fresh) {
      this.prev.set(cur);
      this.fresh = false;
    }
  }
  teleport() {
    this.fresh = true;
  }
}
