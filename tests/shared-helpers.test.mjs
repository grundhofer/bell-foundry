// Helpers that replaced several copies: they must give exactly what the copies gave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, seededRandom, xorshift32 } from '../game/src/core/math.js';
import { closestSegmentPoints, segmentEntersCylinder } from '../game/src/core/geometry.js';
import { Rng } from '../game/src/graphics/effects/common.js';
import { Vector3 } from 'three';

// The former copies, kept here only as references.
function lavaMulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function oldRngNext(state) {
  let t = (state.s += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function candlesRand(state) {
  let x = state.rs;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rs = x >>> 0;
  return state.rs / 4294967296;
}
function mouldsRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

test('xorshift32 gives what the copies in world/candles.js and look/moulds.js gave', () => {
  const a = xorshift32(0x2f6e2b1),
    old = { rs: 0x2f6e2b1 };
  for (let i = 0; i < 5000; i++) assert.equal(a(), candlesRand(old), `candles, draw ${i}`);
  for (const seed of [0, 23, 99, 4711]) {
    const b = xorshift32(seed),
      c = mouldsRng(seed);
    for (let i = 0; i < 2000; i++) assert.equal(b(), c(), `seed ${seed}, draw ${i}`);
  }
});

test('mulberry32 gives the same sequence as the signed copy that look/lava.js had', () => {
  for (const seed of [0, 1, 77, 0x5eed1e, 0x9e3779b9, -5]) {
    const a = mulberry32(seed),
      b = lavaMulberry(seed);
    for (let i = 0; i < 2000; i++) assert.equal(a(), b(), `seed ${seed}, draw ${i}`);
  }
});

test('Rng gives what the old unwrapped Rng gave (while its state was an exact integer)', () => {
  for (const seed of [1, 20261107, 20261120]) {
    const r = new Rng(seed),
      old = { s: seed >>> 0 };
    for (let i = 0; i < 20000; i++) assert.equal(r.next(), oldRngNext(old), `seed ${seed}, draw ${i}`);
  }
});

test('seededRandom keeps seed 0 apart from mulberry32(0) (it counts as 1)', () => {
  const a = seededRandom(0),
    b = mulberry32(1),
    c = mulberry32(0);
  const first = a();
  assert.equal(first, b());
  assert.notEqual(first, c());
});

test('xorshift32: deterministic, in [0, 1), never stuck at 0', () => {
  const a = xorshift32(0),
    b = xorshift32(1);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('closestSegmentPoints: crossing, parallel and point segments', () => {
  const c1 = new Vector3(),
    c2 = new Vector3(),
    params = { s: 0, t: 0 };
  // two segments crossing one unit apart
  let d2 = closestSegmentPoints(
    new Vector3(-1, 0, 0),
    new Vector3(1, 0, 0),
    new Vector3(0, 1, -1),
    new Vector3(0, 1, 1),
    c1,
    c2,
    params,
  );
  assert.ok(Math.abs(d2 - 1) < 1e-12);
  assert.deepEqual([params.s, params.t], [0.5, 0.5]);
  // a point against a segment: the projection, not the segment start
  d2 = closestSegmentPoints(
    new Vector3(0, 0, 0),
    new Vector3(2, 0, 0),
    new Vector3(1.5, 1, 0),
    new Vector3(1.5, 1, 0),
    c1,
    c2,
    params,
  );
  assert.ok(Math.abs(d2 - 1) < 1e-12);
  assert.ok(Math.abs(c1.x - 1.5) < 1e-12);
  // two points
  d2 = closestSegmentPoints(
    new Vector3(0, 0, 0),
    new Vector3(0, 0, 0),
    new Vector3(3, 4, 0),
    new Vector3(3, 4, 0),
    c1,
    c2,
  );
  assert.equal(d2, 25);
});

test('segmentEntersCylinder: enters from the side, passes over the top, misses', () => {
  const a = { x: -2, y: 1, z: 0 },
    dx = 4,
    dy = 0,
    dz = 0,
    l2 = dx * dx + dz * dz;
  assert.ok(Math.abs(segmentEntersCylinder(a, dx, dy, dz, l2, 0, 0, 1, 2) - 0.25) < 1e-12);
  assert.equal(segmentEntersCylinder(a, dx, dy, dz, l2, 0, 0, 1, 0.5), -1, 'above the top');
  assert.equal(segmentEntersCylinder(a, dx, dy, dz, l2, 0, 3, 1, 2), -1, 'beside it');
});
