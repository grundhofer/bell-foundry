import { encodeImu, encodeFrame, DEVICE } from './protocol.js';
import { axisAngle, multiply, normalize, rotateInverse } from './quaternion.js';
import { DEG } from '../core/math.js';

const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const SWORD_REST = multiply(axisAngle(Y, -30 * DEG), axisAngle(Z, -90 * DEG));
const shieldAt = (deg) => axisAngle(X, deg * DEG);
const SHIELD_LOW = -30,
  SHIELD_UP = 90;

const ease = (t, T, from, to) => {
  const u = Math.min(1, Math.max(0, t / T));
  return {
    a: from + (to - from) * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI)),
    w: u > 0 && u < 1 ? ((to - from) / T) * (1 - Math.cos(2 * Math.PI * u)) : 0,
  };
};

export class SimulatedRig {
  constructor() {
    this.t = 0;
    this.seq = 0;
    this.sword = { q: SWORD_REST.slice(), w: [0, 0, 0], lin: [0, 0, 0], buttons: 0, move: null };
    this.shield = {
      q: shieldAt(SHIELD_LOW),
      w: [0, 0, 0],
      lin: [0, 0, 0],
      buttons: 0,
      up: false,
      ang: SHIELD_LOW,
      move: null,
      joy: [0, 0],
    };
  }
  swing(kind) {
    if (!this.sword.move) this.sword.move = { kind, t: 0 };
  }
  guard(on) {
    const s = this.shield;
    if (s.up !== on) {
      s.up = on;
      s.move = { kind: 'raise', t: 0, from: s.ang, to: on ? SHIELD_UP : SHIELD_LOW };
    }
  }
  flick() {
    const s = this.shield;
    if (!s.move) s.move = { kind: 'flick', t: 0, from: s.ang };
  }
  buttons(device, bits) {
    (device === DEVICE.SWORD ? this.sword : this.shield).buttons = bits;
  }
  joy(x, y) {
    this.shield.joy[0] = x;
    this.shield.joy[1] = y;
  }

  step(dt) {
    this.t += dt;
    this.seq++;
    this._animateSword(dt);
    this._animateShield(dt);
    const tUs = Math.round(this.t * 1e6);
    return [
      this._encodeImuPayload(DEVICE.SWORD, this.sword, tUs, [0, 0]),
      this._encodeImuPayload(DEVICE.SHIELD, this.shield, tUs, this.shield.joy, 1),
    ];
  }

  _animateSword(dt) {
    const s = this.sword,
      m = s.move;
    s.w = [0, 0, 0];
    s.lin = [0, 0, 0];
    if (!m) {
      s.q = SWORD_REST.slice();
      return;
    }
    m.t += dt;
    if (m.kind === 'slash') {
      const e = ease(m.t, 0.22, 65, -65);
      s.q = multiply(axisAngle(Z, e.a * DEG), SWORD_REST);
      s.w = [0, 0, e.w];
      if (m.t > 0.32) s.move = null;
    } else if (m.kind === 'overhead') {
      const up = ease(m.t, 0.35, 0, -55),
        down = ease(m.t - 0.4, 0.2, -55, 55);
      const ph = m.t < 0.4 ? up : down;
      s.q = multiply(axisAngle(Y, ph.a * DEG), SWORD_REST);
      s.w = [0, ph.w, 0];
      if (m.t > 0.7) s.move = null;
    } else if (m.kind === 'thrust') {
      s.q = SWORD_REST.slice();
      const u = Math.min(1, m.t / 0.12),
        push = Math.sin(Math.PI * u) * 3;
      s.lin = [Math.cos(30 * DEG) * push, 0, Math.sin(30 * DEG) * push];
      if (m.t > 0.25) s.move = null;
    }
  }

  _animateShield(dt) {
    const s = this.shield,
      m = s.move;
    s.w = [0, 0, 0];
    s.lin = [0, 0, 0];
    if (m) {
      m.t += dt;
      if (m.kind === 'raise') {
        const e = ease(m.t, 0.3, m.from, m.to);
        s.ang = e.a;
        s.w = [e.w, 0, 0];
        if (m.t >= 0.3) {
          s.ang = m.to;
          s.move = null;
        }
      } else if (m.kind === 'flick') {
        const u = Math.min(1, m.t / 0.1);
        s.lin = [0, Math.sin(Math.PI * u) * 2.6, 0];
        if (m.t > 0.15) s.move = null;
      }
    }
    s.q = shieldAt(s.ang);
  }

  _encodeImuPayload(device, s, tUs, joy, hasJoy = 0) {
    const q = normalize(s.q.slice());
    const gyro = rotateInverse(q, s.w);
    const g = rotateInverse(q, Z);
    const lin = rotateInverse(q, s.lin);
    return encodeImu({
      device,
      flags: 2 | hasJoy,
      seq: this.seq,
      tUs,
      quat: q,
      gyro,
      accel: [g[0] + lin[0], g[1] + lin[1], g[2] + lin[2]],
      buttons: s.buttons,
      joy,
      battery: 87,
      rssi: -42,
    });
  }
}

const KEYS = {
  Digit1: (r) => r.swing('slash'),
  Digit2: (r) => r.swing('overhead'),
  Digit3: (r) => r.swing('thrust'),
  Digit4: (r) => r.guard(!r.shield.up),
  Digit5: (r) => r.flick(),
};
const HOLD = {
  Digit7: [DEVICE.SWORD, 1],
  Digit8: [DEVICE.SWORD, 2],
  Digit9: [DEVICE.SHIELD, 1],
  Digit0: [DEVICE.SHIELD, 2],
  KeyU: [DEVICE.SHIELD, 4],
};
const STICK = { KeyI: [0, 1], KeyK: [0, -1], KeyJ: [-1, 0], KeyL: [1, 0] };

export class SimulatorSource {
  constructor(onBytes) {
    this.onBytes = onBytes;
    this.rig = new SimulatedRig();
    this.down = new Set();
    this.timer = 0;
    this.name = 'Simulator';
  }
  start() {
    if (this.timer) return;
    this._kd = (e) => {
      if (e.repeat || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (KEYS[e.code]) KEYS[e.code](this.rig);
      if (HOLD[e.code] || STICK[e.code]) this.down.add(e.code);
    };
    this._ku = (e) => this.down.delete(e.code);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    let last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now(),
        dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const bits = { [DEVICE.SWORD]: 0, [DEVICE.SHIELD]: 0 };
      let jx = 0,
        jy = 0;
      for (const c of this.down) {
        if (HOLD[c]) bits[HOLD[c][0]] |= HOLD[c][1];
        if (STICK[c]) {
          jx += STICK[c][0];
          jy += STICK[c][1];
        }
      }
      this.rig.buttons(DEVICE.SWORD, bits[DEVICE.SWORD]);
      this.rig.buttons(DEVICE.SHIELD, bits[DEVICE.SHIELD]);
      const l = Math.hypot(jx, jy) || 1;
      this.rig.joy(jx / l, jy / l);
      for (const p of this.rig.step(dt)) this.onBytes(encodeFrame(p));
    }, 10);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }
  write() {}
}
