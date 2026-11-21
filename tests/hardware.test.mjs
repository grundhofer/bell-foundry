import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crc8,
  cobsEncode,
  cobsDecode,
  encodeFrame,
  FrameReader,
  decodePayload,
  encodeImu,
  COMMANDS,
  MESSAGE_TYPE,
} from '../game/src/hardware/protocol.js';
import { SimulatedRig } from '../game/src/hardware/simulator.js';
import { SwordGestures, ShieldGestures } from '../game/src/hardware/gestures.js';

test('crc8 matches the CRC-8 (poly 0x07) check value', () => {
  assert.equal(crc8(new TextEncoder().encode('123456789')), 0xf4);
});

test('COBS round trip, zeros and long runs included', () => {
  for (const len of [0, 1, 5, 253, 254, 255, 600]) {
    const src = new Uint8Array(len).map((_, i) => (i % 7 === 0 ? 0 : (i * 31) & 0xff));
    const enc = cobsEncode(src);
    assert.ok(!enc.includes(0), 'no zero inside a frame');
    assert.deepEqual(cobsDecode(enc), src);
  }
});

test('IMU payload survives frame -> reader -> parse, split across chunks', () => {
  const p = {
    device: 2,
    flags: 3,
    seq: 65535,
    tUs: 123456789,
    quat: [0.7071, 0, 0.7071, 0],
    gyro: [-1999.5, 0, 250],
    accel: [0, -1, 1.5],
    buttons: 5,
    joy: [1, -0.5],
    battery: 87,
    rssi: -60,
  };
  const bytes = encodeFrame(encodeImu(p)),
    got = [];
  const r = new FrameReader((pl) => got.push(decodePayload(pl)));
  r.push(bytes.subarray(0, 7));
  r.push(bytes.subarray(7));
  r.push(new Uint8Array([9, 9, 0]));
  assert.equal(got.length, 1);
  assert.equal(r.errors, 1);
  const g = got[0];
  assert.equal(g.type, 'imu');
  assert.equal(g.device, 2);
  assert.equal(g.seq, 65535);
  assert.equal(g.tUs, 123456789);
  assert.ok(
    Math.abs(g.quat[0] - 0.7071) < 1e-3 && Math.abs(g.gyro[0] + 1999.5) < 0.1 && Math.abs(g.accel[2] - 1.5) < 1e-3,
  );
  assert.equal(g.buttons, 5);
  assert.ok(Math.abs(g.joy[1] + 0.5) < 0.01);
  assert.equal(g.battery, 87);
  assert.equal(g.rssi, -60);
});

test('commands are well-formed frames', () => {
  const got = [];
  const r = new FrameReader((pl) => got.push(pl));
  r.push(COMMANDS.vibrate(1, 200, 120));
  r.push(COMMANDS.ping(0xdeadbeef));
  assert.equal(got[0][0], MESSAGE_TYPE.VIBRATE);
  assert.deepEqual([...got[0]], [MESSAGE_TYPE.VIBRATE, 1, 200, 120, 0]);
  assert.equal(new DataView(got[1].buffer, got[1].byteOffset).getUint32(1, true), 0xdeadbeef);
});

function run(setup, seconds) {
  const rig = new SimulatedRig(),
    sword = new SwordGestures(),
    shield = new ShieldGestures(),
    ev = [],
    dt = 0.01;
  const r = new FrameReader((pl) => {
    const p = decodePayload(pl);
    for (const e of (p.device === 1 ? sword : shield).update(p, dt)) ev.push({ ...e, at: rig.t, dev: p.device });
  });
  setup(rig);
  let guardTime = 0;
  for (let t = 0; t < seconds; t += dt) {
    for (const pl of rig.step(dt)) r.push(encodeFrame(pl));
    if (shield.guard) guardTime += dt;
  }
  return { ev, shield, guardTime };
}

test('a horizontal swing is a slash, decided early', () => {
  const { ev } = run((r) => r.swing('slash'), 0.6);
  assert.deepEqual(
    ev.map((e) => e.kind),
    ['slash'],
  );
  assert.ok(ev[0].at < 0.12, `decided at ${ev[0].at.toFixed(3)} s`);
});

test('an overhead blow is told apart from a slash (the slow wind-up does not count)', () => {
  const { ev } = run((r) => r.swing('overhead'), 0.9);
  assert.deepEqual(
    ev.map((e) => e.kind),
    ['overhead'],
  );
});

test('a thrust is a thrust', () => {
  const { ev } = run((r) => r.swing('thrust'), 0.4);
  assert.deepEqual(
    ev.map((e) => e.kind),
    ['thrust'],
  );
});

test('standing still: no events, no guard', () => {
  const { ev, shield } = run(() => {}, 1);
  assert.equal(ev.length, 0);
  assert.equal(shield.guard, false);
});

test('raising the shield is a guard, not a shove; a shove is a flick', () => {
  const a = run((r) => r.guard(true), 0.8);
  assert.equal(a.shield.guard, true);
  assert.equal(a.ev.filter((e) => e.kind === 'flick').length, 0);
  const b = run((r) => r.flick(), 0.4);
  assert.deepEqual(
    b.ev.map((e) => e.kind),
    ['flick'],
  );
});
