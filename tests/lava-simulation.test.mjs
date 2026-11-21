import test from 'node:test';
import assert from 'node:assert/strict';
import { LavaSim } from '../game/src/look/lava-simulation.js';

const DAIS = { z: -17.6, step: 0.9, rise: 0.5 / 3, top: 0.5 };
const ground = (x, z) => (z > DAIS.z ? 0 : Math.min(DAIS.top, (Math.floor((DAIS.z - z) / DAIS.step) + 1) * DAIS.rise));
const hall = (o = {}) => new LavaSim({ x0: -12, z0: -21, nx: 96, nz: 156, cell: 0.25, bed: ground, ...o });
const run = (s, seconds, dt = 1 / 120) => {
  for (let t = 0; t < seconds; t += dt) s.step(dt);
};
const finite = (a) => a.every(Number.isFinite);

test('volume is kept while nothing cools', () => {
  const s = hall({ coolAir: 0, coolWater: 0, breakUp: 0 });
  s.pour(0, -5, 1, 1, 1);
  run(s, 1);
  const v1 = s.volume;
  run(s, 4);
  assert.ok(Math.abs(s.volume - v1) / v1 < 5e-3, `${v1} -> ${s.volume}`);
  assert.ok(finite(s.d) && finite(s.T));
});

test('it runs down the dais into the nave', () => {
  const s = hall();
  s.pour(0, -20.4, 0.6, 0.15);
  run(s, 12);
  let front = -99,
    hot = 0;
  for (let j = 0; j < s.nz; j++)
    for (let i = 0; i < s.nx; i++) {
      const k = j * s.nx + i;
      if (s.d[k] > 0.005) front = Math.max(front, s.z0 + (j + 0.5) * s.cell);
      if (s.T[k] > 0.35 && s.d[k] > 0.01) hot++;
    }
  console.log(
    `front z ${front.toFixed(2)}, hot area ${(hot * s.cell * s.cell).toFixed(1)} m2, volume ${s.volume.toFixed(2)} m3`,
  );
  assert.ok(front > DAIS.z, 'reached the water');
  assert.ok(finite(s.d) && finite(s.T));
});

test('a pool on the wet floor goes cold and clears', () => {
  const s = hall();
  s.pour(0, 0, 1.2, 1.2, 1);
  run(s, 2);
  const hot = s.at(0, 0).temp;
  run(s, 40);
  console.log(
    `after 2 s temp ${hot.toFixed(2)}, after 42 s volume ${s.volume.toFixed(3)} m3, temp ${s.at(0, 0).temp.toFixed(2)}`,
  );
  assert.ok(hot > 0.6);
  assert.ok(s.volume < 0.05);
});
