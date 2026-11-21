import { rotate, rotateInverse, cross, vectorLength, angle } from './quaternion.js';

export const TUNING = {
  sword: {
    start: 220,
    end: 100,
    quiet: 0.04,
    decide: 35,
    minPeak: 350,
    down: 0.7,
    thrustG: 1.6,
    thrustGyro: 200,
    cooldown: 0.15,
    thrustCooldown: 0.4,
    maxLength: 0.9,
  },
  shield: {
    enter: 30,
    exit: 40, // guard enter/exit angles (degrees)
    flickG: 1.8,
    flickCooldown: 0.6,
    settle: 0.25,
    dead: 0.15,
    calibrateHold: 1.5,
  },
};

const DEGREES_PER_RADIAN = 180 / Math.PI;
const UP = [0, 0, 1];

export class SwordGestures {
  constructor(cfg = {}) {
    this.t = Object.assign({}, TUNING.sword, cfg.tuning);
    this.blade = cfg.blade || [0, 1, 0];
    this.active = false;
    this.cool = 0;
    this.decided = false;
    this._w = [0, 0, 0];
    this._d = [0, 0, 0];
    this._v = [0, 0, 0];
    this._acc = [0, 0, 0];
    this._g = [0, 0, 0];
    this.last = null;
  }
  update(p, dt) {
    const T = this.t,
      ev = [];
    this.cool = Math.max(0, this.cool - dt);
    const ws = p.gyro,
      speed = vectorLength(ws);
    rotate(p.quat, ws, this._w);
    rotate(p.quat, this.blade, this._d);
    cross(this._w, this._d, this._v);
    if (!this.active) {
      rotateInverse(p.quat, UP, this._g);
      const a = p.accel,
        g = this._g,
        b = this.blade;
      const along = (a[0] - g[0]) * b[0] + (a[1] - g[1]) * b[1] + (a[2] - g[2]) * b[2];
      if (this.cool === 0 && along > T.thrustG && speed < T.thrustGyro) {
        ev.push(this._emit('thrust', along));
        this.cool = T.thrustCooldown;
        return ev;
      }
      if (this.cool === 0 && speed > T.start) {
        this.active = true;
        this.decided = false;
        this.travel = 0;
        this.peak = 0;
        this.time = 0;
        this.calm = 0;
        this._acc[0] = this._acc[1] = this._acc[2] = 0;
      } else return ev;
    }
    this.time += dt;
    this.travel += speed * dt;
    this.peak = Math.max(this.peak, speed);
    for (let i = 0; i < 3; i++) this._acc[i] += this._v[i] * dt;
    if (!this.decided && this.travel >= T.decide && this.peak >= T.minPeak) {
      const l = vectorLength(this._acc) || 1,
        down = -this._acc[2] / l;
      ev.push(this._emit(down > T.down ? 'overhead' : 'slash', this.peak));
      this.decided = true;
    }
    this.calm = speed < T.end ? this.calm + dt : 0;
    if (this.calm >= T.quiet || this.time > T.maxLength) {
      this.active = false;
      this.cool = T.cooldown;
    }
    return ev;
  }
  _emit(kind, peak) {
    return (this.last = { kind, peak: Math.round(peak * 10) / 10 });
  }
  calibrate(p) {
    rotateInverse(p.quat, UP, this._g);
    if (Math.abs(this._g[1]) < 0.25) return null;
    this.blade = [0, this._g[1] > 0 ? 1 : -1, 0];
    return this.blade;
  }
}

export class ShieldGestures {
  constructor(cfg = {}) {
    this.t = Object.assign({}, TUNING.shield, cfg.tuning);
    this.ref = cfg.guard || [0, 1, 0];
    this.guard = false;
    this.cool = 0;
    this.since = 1;
    this.both = 0;
    this.tiltOff = 180;
    this.stick = { x: 0, y: 0 };
    this._g = [0, 0, 0];
    this.last = null;
  }
  calibrate(p) {
    rotateInverse(p.quat, UP, this._g);
    this.ref = this._g.slice();
    return this.ref;
  }
  update(p, dt) {
    const T = this.t,
      ev = [];
    this.cool = Math.max(0, this.cool - dt);
    this.since += dt;
    rotateInverse(p.quat, UP, this._g);
    this.tiltOff = angle(this._g, this.ref) * DEGREES_PER_RADIAN;
    const want = this.guard ? this.tiltOff < T.exit : this.tiltOff < T.enter;
    if (want !== this.guard) {
      this.guard = want;
      this.since = 0;
    }
    const a = p.accel,
      g = this._g,
      lin = Math.hypot(a[0] - g[0], a[1] - g[1], a[2] - g[2]);
    if (this.cool === 0 && this.since > T.settle && lin > T.flickG) {
      ev.push((this.last = { kind: 'flick', peak: Math.round(lin * 10) / 10 }));
      this.cool = T.flickCooldown;
    }
    if ((p.buttons & 3) === 3) {
      this.both += dt;
      if (this.both >= T.calibrateHold && this.both - dt < T.calibrateHold) {
        this.calibrate(p);
        ev.push((this.last = { kind: 'calibrated' }));
      }
    } else this.both = 0;
    const [x, y] = p.joy,
      l = Math.hypot(x, y);
    if (l < T.dead) {
      this.stick.x = this.stick.y = 0;
    } else {
      const m = Math.min(1, (l - T.dead) / (1 - T.dead));
      this.stick.x = (x / l) * m;
      this.stick.y = (y / l) * m;
    }
    return ev;
  }
}
