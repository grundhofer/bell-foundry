export const TAU = Math.PI * 2;
/** Radians per degree: `30 * DEG` is 30° in radians. */
export const DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const smoother = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const angleDiff = (b, a) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dampAngle = (a, b, rate, dt) => a + angleDiff(b, a) * (1 - Math.exp(-rate * dt));
export const turnToward = (a, b, maxStep) => {
  const d = angleDiff(b, a);
  return a + clamp(d, -maxStep, maxStep);
};
export const approach = (a, b, step) => (a < b ? Math.min(b, a + step) : Math.max(b, a - step));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export function spring(s, target, rate, dt) {
  const k = rate * rate,
    d = 2 * rate;
  s.v += ((target - s.x) * k - s.v * d) * dt;
  s.x += s.v * dt;
  return s.x;
}
/**
 * mulberry32: a seeded generator of numbers in [0, 1). The same seed always gives the same sequence, which is what
 * replays, recordings and the regression run rely on.
 * @param {number} seed taken as an unsigned 32-bit integer (0 is a valid seed here)
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Use this seeded generator for fight logic (mulberry32; seed 0 counts as 1). */
export function seededRandom(seed = 1) {
  return mulberry32(seed >>> 0 || 1);
}
/**
 * xorshift32: a small seeded generator of numbers in [0, 1), used for procedural shapes and textures of the look.
 * @param {number} seed (0 counts as 1, since xorshift never leaves 0)
 * @returns {() => number}
 */
export function xorshift32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
