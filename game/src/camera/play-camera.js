import * as THREE from 'three';
import { clamp, lerp, smooth, damp, angleDiff, DEG } from '../core/math.js';
import { WATER_Y } from '../core/constants.js';

export const CAMERA_TUNING = {
  fov: 50,
  fovClose: 8,
  fovSprint: 4,
  dist: 5.2,
  pitch: 0.2,
  pitchMin: -0.3,
  pitchMax: 1.05,
  shoulder: 1.45,
  lookUp: 0.4,
  follow: 16,
  drift: 0.9,
  driftWait: 1.0,
  regard: -0.14,
  regardWait: 0.6,
  lockMin: 5.2,
  lockMax: 9.5,
  lockHigh: 2.3,
  lockLow: 1.55,
  marginTop: 3.5,
  marginBottom: 2.5,
  peek: 0.5,
  peekUp: 0.2,
  peekBack: 1.0,
  aim: 0.42,
  swing: 0.9,
  swingPerM: 0.5,
  swingMax: 6.5,
  wall: 0.8,
  wallWest: 1.48,
  wallEast: 1.2,
  bay: { deep: 1.5, xl: -2.9, xr: 1.8, slant: 1.0 },
  radius: 0.28,
  squeezeIn: 22,
  squeezeOut: 2.5,
  squeezeLift: 0.5,
  slip: 2.2,
  slipStep: 0.26,
  slipMax: 4,
  shakeAngle: 0.036,
  shakeMove: 0.11,
  stop: { light: [0.05, 0.06], heavy: [0.09, 0.1], colossal: [0.18, 0.17] },
  kick: { light: 0.004, heavy: 0.014, colossal: 0.03 },
  kickBack: 11,
  slow: [0.45, 0.5],
  her: 0.25,
  ghost: 1.0,
  ghostOver: 0.45,
  autoLock: 0.3,
};

const _c = new THREE.Vector3(),
  _lf = new THREE.Vector3(),
  _ll = new THREE.Vector3(),
  _t = new THREE.Vector3(),
  _b = new THREE.Vector3();
const turnStep = (from, to, ease, cap, dt) => {
  const d = angleDiff(to, from);
  return from + clamp(d * (1 - Math.exp(-ease * dt)), -cap * dt, cap * dt);
};

export class PlayCamera {
  constructor(ctx) {
    this.ctx = ctx;
    this._mode = 'free';
    this.follow = ctx.player;
    this.target = ctx.boss;
    this._locked = false;
    this.yaw = Math.PI;
    this.orbit = Math.PI;
    this.pitch = CAMERA_TUNING.pitch;
    this.dist = CAMERA_TUNING.dist;
    this.fov = CAMERA_TUNING.fov;
    this.pivot = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.lockPoint = new THREE.Vector3();
    this.lockK = 0;
    this.lockAge = 9;
    this.squeeze = 1;
    this.slip = 0;
    this.top = 6.6;
    this.idle = 9;
    this.aimEl = 0;
    this.aimAz = Math.PI;
    this.trauma = 0;
    this.decay = 2;
    this.punchV = 0;
    this.punchT = 0;
    this.punchT0 = 1;
    this.time = 0;
    this.flash = 0;
    this.sprintK = 0;
    this.wasCine = false;
    this.fresh = true;
    this.autoT = 0;
    this.peekX = 0;
    this.peekY = 0;
    this.kickX = 0;
    this.kickY = 0;
    this.ghost = 0;
    this.ghostSet = 0;
    this.jolt = null;
    this.joltT = 0;
    this.joltAmp = 0;
    this.joltX = 0;
    this.joltZ = 0;
    this.joltClock = 0;
    const bus = ctx.bus;
    if (ctx.params.has('oldlens')) {
      CAMERA_TUNING.wallWest = 3.0;
      CAMERA_TUNING.bay = null;
    }
    this.offs = [
      bus.on('hit', (h) => this.onHit(h)),
      bus.on('boss-slam', (e) => this.onSlam(e)),
      bus.on('land', (e) => {
        if (e.who === 'boss') this.near(e.pos, e.hard ? 0.5 : 0.28, 0.4, 16);
        else if (e.hard) this.shake(0.16, 0.2);
      }),
      bus.on('step', (e) => {
        if (e.who === 'boss') this.near(e.pos, 0.12, 0.22, 9);
      }),
      bus.on('clash', (e) => this.onClash(e)),
      bus.on('charge', () => this.punch(-1.5, 0.3)),
      bus.on('roll', () => {
        if (this._mode !== 'cine') this.punch(1.6, 0.35);
      }),
      bus.on('state', (e) => {
        this.autoT =
          e.to === 'fight' && CAMERA_TUNING.autoLock > 0 && !ctx.params.has('nolock') ? CAMERA_TUNING.autoLock : 0;
      }),
    ];
    this.snapBehind();
  }

  get mode() {
    return this._mode;
  }
  set mode(v) {
    if (v === this._mode) return;
    const was = this._mode;
    this._mode = v;
    if (v === 'cine') return;
    if (was === 'cine') this.fresh = true;
    if (was === 'lock') {
      this.orbit += this.slip + this.peekX;
      this.pitch = clamp(this.pitch + this.peekY, CAMERA_TUNING.pitchMin, CAMERA_TUNING.pitchMax);
      this.slip = 0;
      this.peekX = this.peekY = 0;
    }
    this.setLocked(v === 'lock');
  }
  setLocked(on) {
    if (this.follow) this.follow.locked = on;
    if (on !== this._locked) {
      this._locked = on;
      if (on) this.lockAge = 0;
      this.ctx.bus.emit('lock', { on });
    }
  }
  setLock(on) {
    if (this._mode === 'cine') return;
    if (on && !(this.target && this.target.alive)) on = false;
    this.mode = on ? 'lock' : 'free';
  }

  snapBehind() {
    const f = this.follow;
    if (!f) return;
    this.orbit = this.yaw = f.yaw;
    this.pitch = CAMERA_TUNING.pitch;
    this.dist = CAMERA_TUNING.dist;
    this.squeeze = 1;
    this.slip = 0;
    this.idle = 9;
    this.sprintK = 0;
    this.peekX = this.peekY = 0;
    this.pivot.set(f.pos.x, f.pos.y + CAMERA_TUNING.shoulder, f.pos.z);
    this.lockK = this._mode === 'lock' ? 1 : 0;
    this.fresh = true;
    if (this._mode !== 'cine') this.place(0, true);
  }
  shake(amount = 0.5, seconds = 0.3) {
    const s = this.ctx.ui && this.ctx.ui.settings;
    if (s && s.reducedMotion) amount *= 0.3;
    if (amount > this.trauma) {
      this.trauma = Math.min(1, amount);
      this.decay = this.trauma / Math.max(0.05, seconds);
    }
  }
  punch(fovDelta = -3, seconds = 0.2) {
    const s = this.ctx.ui && this.ctx.ui.settings;
    if (s && s.reducedMotion) fovDelta *= 0.3;
    this.punchV = fovDelta;
    this.punchT = this.punchT0 = Math.max(0.03, seconds);
  }
  near(pos, amount, seconds, reach) {
    const d = pos ? Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) : 0,
      k = clamp(1 - d / reach);
    if (k > 0) this.shake(amount * (0.35 + 0.65 * k), seconds);
  }

  onHit(h) {
    const ctx = this.ctx,
      p = this.follow,
      game = ctx.game,
      input = ctx.input;
    if (this._mode === 'cine') return;
    const w = h.weight === 'colossal' || h.weight === 'heavy' ? h.weight : 'light',
      big = w !== 'light',
      huge = w === 'colossal';
    const mine = h.attacker === p,
      his = h.target === p;
    if (!mine && !his) return;
    let stop = CAMERA_TUNING.stop[w][his ? 1 : 0];
    if (his) {
      if (h.blocked && !h.guardBreak) {
        stop = big ? 0.07 : 0.05;
        this.shake(big ? 0.42 : 0.3, 0.25);
        this.flash = Math.max(this.flash, h.damage > 0 ? 0.18 : 0);
        input.rumble(0.5, 0.3, big ? 0.16 : 0.1);
      } else {
        this.shake(huge ? 0.95 : big ? 0.72 : 0.45, huge ? 0.6 : big ? 0.42 : 0.28);
        this.flash = Math.max(this.flash, h.fatal ? 1 : clamp(0.3 + h.damage / 80));
        this.punch(huge ? 4.5 : big ? 3 : 1.2, huge ? 0.5 : 0.35);
        input.rumble(1, huge ? 1 : 0.8, huge ? 0.5 : big ? 0.3 : 0.16);
      }
    } else {
      this.shake(huge ? 0.6 : big ? 0.36 : 0.2, huge ? 0.4 : big ? 0.26 : 0.16);
      this.punch(huge ? -4 : big ? -2.6 : -1.2, huge ? 0.45 : big ? 0.3 : 0.18);
      input.rumble(huge ? 1 : big ? 0.7 : 0.35, huge ? 0.9 : big ? 0.6 : 0.4, huge ? 0.35 : big ? 0.16 : 0.08);
    }
    if (game.hitStop) game.hitStop(stop);
    if (huge && game.slow && !game.auto && !(h.fatal && mine)) game.slow(CAMERA_TUNING.slow[0], CAMERA_TUNING.slow[1]);
    if (h.dir && !(h.blocked && !big)) {
      const cam = ctx.camera,
        e = cam.matrixWorld.elements,
        s = ctx.ui && ctx.ui.settings,
        calm = s && s.reducedMotion ? 0.3 : 1;
      const d = h.point ? Math.hypot(h.point.x - this.pos.x, h.point.y - this.pos.y, h.point.z - this.pos.z) : 6,
        near = clamp(1.25 - d / 22, 0.35, 1);
      const k = CAMERA_TUNING.kick[w] * near * calm * (h.blocked ? 0.5 : 1) * (his ? 1.3 : 1);
      const rx = h.dir.x * e[0] + h.dir.y * e[1] + h.dir.z * e[2],
        uy = h.dir.x * e[4] + h.dir.y * e[5] + h.dir.z * e[6],
        l = Math.hypot(rx, uy);
      if (l > 0.05) {
        this.kickX += (rx / l) * k;
        this.kickY += (uy / l) * k;
      } else this.kickY += k * 0.7;
    }
    if (this.jolt && this.jolt.char && this.jolt.char.model) {
      this.jolt.char.model.position.x = this.joltX;
      this.jolt.char.model.position.z = this.joltZ;
    }
    this.jolt = h.target && h.target.char && h.target.char.model ? h.target : null;
    this.joltT = stop;
    if (this.jolt) {
      this.joltX = this.jolt.char.model.position.x;
      this.joltZ = this.jolt.char.model.position.z;
    }
    this.joltAmp =
      (huge ? 0.05 : big ? 0.035 : 0.02) * (his ? 1 : h.target.char ? Math.min(2.2, h.target.char.scale) : 1);
  }
  onClash(e) {
    if (this._mode === 'cine' || !e || !e.stone) return;
    const big = e.heavy || e.weight === 'heavy' || e.weight === 'colossal',
      input = this.ctx.input;
    if (e.who === 'boss') {
      this.near(e.point, e.weight === 'colossal' ? 0.7 : 0.55, 0.4, 20);
      this.punch(1.5, 0.3);
      if (input.rumble) input.rumble(0.8, 0.6, 0.3);
    } else if (e.floor) this.shake(big ? 0.2 : 0.1, big ? 0.2 : 0.12);
    else {
      this.shake(big ? 0.3 : 0.14, big ? 0.25 : 0.15);
      if (big) this.punch(-1.2, 0.2);
    }
    if (e.dir && (big || e.who === 'boss') && !e.floor) {
      const m = this.ctx.camera.matrixWorld.elements,
        k =
          (e.who === 'boss' ? 0.012 : 0.008) *
          (this.ctx.ui && this.ctx.ui.settings && this.ctx.ui.settings.reducedMotion ? 0.3 : 1);
      const rx = e.dir.x * m[0] + e.dir.y * m[1] + e.dir.z * m[2],
        uy = e.dir.x * m[4] + e.dir.y * m[5] + e.dir.z * m[6],
        l = Math.hypot(rx, uy);
      if (l > 0.05) {
        this.kickX += (rx / l) * k;
        this.kickY += (uy / l) * k;
      }
    }
  }
  onSlam(e) {
    if (this._mode === 'cine') return;
    const power = e.power === undefined ? 1 : e.power,
      reach = 10 + (e.radius || 2) * 2.5;
    this.near(e.pos, clamp(0.3 + 0.35 * power, 0.2, 0.9), 0.3 + 0.15 * power, reach);
    if (this.ctx.input.rumble) this.ctx.input.rumble(0.6 * power, 0.4, 0.2);
  }

  allowed(x, z, B) {
    const ix = B.hx - B.r,
      iz = B.hz - B.r,
      zw = iz + CAMERA_TUNING.wallWest - CAMERA_TUNING.wall,
      ze = -iz - CAMERA_TUNING.wallEast + CAMERA_TUNING.wall,
      lim = B.r + CAMERA_TUNING.wall - CAMERA_TUNING.radius;
    const dx = x - clamp(x, -ix, ix),
      dz = z - clamp(z, ze, zw);
    if (dx * dx + dz * dz <= lim * lim) return true;
    const bay = CAMERA_TUNING.bay,
      z0 = zw + lim;
    if (!bay || z < z0 - 1 || z > z0 + bay.deep) return false;
    const u = clamp((z - z0) / bay.deep) * bay.slant;
    return x >= bay.xl + u && x <= bay.xr - u;
  }
  clearance(o, c) {
    const a = this.ctx.arena;
    this.kWall = 1;
    if (!a) return 1;
    const vx = c.x - o.x,
      vz = c.z - o.z,
      L2 = vx * vx + vz * vz;
    if (L2 < 1e-6) return 1;
    let k = 1;
    const B = a.bounds;
    if (B) {
      let lo = 0,
        hi = -1;
      for (let i = 1; i <= 12; i++) {
        const m = i / 12;
        if (this.allowed(o.x + vx * m, o.z + vz * m, B)) lo = m;
        else {
          hi = m;
          break;
        }
      }
      if (hi >= 0) {
        for (let i = 0; i < 7; i++) {
          const m = (lo + hi) / 2;
          if (this.allowed(o.x + vx * m, o.z + vz * m, B)) lo = m;
          else hi = m;
        }
        k = this.kWall = lo;
      }
    }
    const cols = a.colliders,
      her = this.target && this.target.alive && !this.target.puppet ? this.target : null;
    for (let i = cols ? cols.length - 1 : -1; i >= -1; i--) {
      if (i < 0 && !her) break;
      const cx = i < 0 ? her.pos.x : cols[i].x,
        cz = i < 0 ? her.pos.z : cols[i].z,
        R = (i < 0 ? (her.radius || 1.5) + CAMERA_TUNING.her : cols[i].r) + CAMERA_TUNING.radius,
        fx = o.x - cx,
        fz = o.z - cz;
      const bq = fx * vx + fz * vz,
        cq = fx * fx + fz * fz - R * R;
      if (cq <= 0) continue;
      const disc = bq * bq - L2 * cq;
      if (disc <= 0 || bq >= 0) continue;
      const t = (-bq - Math.sqrt(disc)) / L2;
      if (t >= 0 && t < k) k = t;
    }
    return Math.max(0.06, k);
  }
  roomAt(pv, a, reach) {
    _c.set(pv.x - Math.sin(this.orbit + a) * reach, 0, pv.z - Math.cos(this.orbit + a) * reach);
    return this.clearance(pv, _c);
  }

  findSlip(pv) {
    const reach = Math.cos(this.pitch) * this.dist,
      k0 = this.roomAt(pv, 0, reach);
    if (k0 >= 0.92) return 0;
    let best = 0,
      score = k0;
    const side = Math.sign(this.slip);
    for (let i = 1; i <= CAMERA_TUNING.slipMax; i++)
      for (let s = -1; s <= 1; s += 2) {
        const sc =
          Math.min(1, this.roomAt(pv, s * i * CAMERA_TUNING.slipStep, reach)) - i * 0.045 + (side === s ? 0.08 : 0);
        if (sc > score + 1e-3) {
          score = sc;
          best = s * i * CAMERA_TUNING.slipStep;
        }
      }
    return best;
  }

  place(dt, snap) {
    const ctx = this.ctx,
      f = this.follow,
      b = this.target,
      cam = ctx.camera,
      pv = this.pivot;
    const lock = this._mode === 'lock' && b && b.alive;
    _t.set(f.pos.x, f.pos.y + CAMERA_TUNING.shoulder, f.pos.z);
    if (snap || pv.distanceToSquared(_t) > 36) pv.copy(_t);
    else {
      const k = 1 - Math.exp(-CAMERA_TUNING.follow * dt);
      pv.lerp(_t, k);
    }
    this.lockK = snap ? (lock ? 1 : 0) : damp(this.lockK, lock ? 1 : 0, 6, dt);

    let fov = CAMERA_TUNING.fov,
      wantDist,
      wantPitch;
    if (b && b.char) {
      const B = b.char.bones,
        s = b.char.scale;
      if (B && B.Spine2) B.Spine2.getWorldPosition(this.lockPoint);
      else this.lockPoint.set(b.pos.x, 0.6 * 1.8 * s, b.pos.z);
      let top = 1.84 * s;
      if (B && B.Head) {
        B.Head.getWorldPosition(_b);
        top = _b.y + 0.3 * s;
      }
      this.top = snap ? top : damp(this.top, top, 3, dt);
    }
    if (lock) {
      const dx = b.pos.x - pv.x,
        dz = b.pos.z - pv.z,
        d = Math.hypot(dx, dz),
        close = 1 - smooth((d - 3) / 6.5);
      fov = CAMERA_TUNING.fov + CAMERA_TUNING.fovClose * close;
      const h = lerp(CAMERA_TUNING.lockHigh, CAMERA_TUNING.lockLow, close),
        span = (fov - CAMERA_TUNING.marginTop - CAMERA_TUNING.marginBottom) * DEG,
        H = this.top;
      let c = CAMERA_TUNING.lockMin;
      for (let i = 0; i < 26 && c < CAMERA_TUNING.lockMax; i++) {
        if (Math.atan2(H - h, c + d) + Math.atan2(h, c) <= span) break;
        c += 0.2;
      }
      wantDist = Math.hypot(c, h - CAMERA_TUNING.shoulder);
      wantPitch = Math.atan2(h - CAMERA_TUNING.shoulder, c);
      const want = Math.atan2(dx, dz),
        cap =
          Math.min(CAMERA_TUNING.swingMax, CAMERA_TUNING.swing + CAMERA_TUNING.swingPerM * d) *
          (this.lockAge < 0.5 ? 2.5 : 1);
      if (snap) this.orbit = want;
      else if (d > 0.3) this.orbit = turnStep(this.orbit, want, 6, cap, dt);
      if (snap) {
        this.pitch = wantPitch;
        this.dist = wantDist;
      } else {
        this.pitch = damp(this.pitch, wantPitch, 3.2, dt);
        this.dist = damp(this.dist, wantDist, 3.2, dt);
      }
      const slip = this.findSlip(pv);
      this.slip = snap ? slip : this.slip + clamp(slip - this.slip, -CAMERA_TUNING.slip * dt, CAMERA_TUNING.slip * dt);
    } else {
      if (!snap) this.dist = damp(this.dist, CAMERA_TUNING.dist + (f.alive ? 0 : 1.4), f.alive ? 3 : 0.5, dt);
      if (this.slip) {
        this.orbit += this.slip;
        this.slip = 0;
      }
      this.peekX = this.peekY = 0;
    }

    this.fovBase = snap || this.fovBase === undefined ? fov : damp(this.fovBase, fov, 5, dt);
    fov = this.fovBase;

    const pt = clamp(this.pitch + this.peekY, CAMERA_TUNING.pitchMin, CAMERA_TUNING.pitchMax),
      oa = this.orbit + this.slip + this.peekX;
    const cp = Math.cos(pt),
      sp = Math.sin(pt),
      so = Math.sin(oa),
      co = Math.cos(oa);
    _c.set(pv.x - so * cp * this.dist, pv.y + sp * this.dist, pv.z - co * cp * this.dist);
    const k = this.clearance(pv, _c),
      kWall = Math.max(0.06, this.kWall);
    this.squeeze = snap
      ? k
      : damp(this.squeeze, k, k < this.squeeze ? CAMERA_TUNING.squeezeIn : CAMERA_TUNING.squeezeOut, dt);
    if (kWall < this.squeeze) this.squeeze = kWall;
    const q = Math.min(1, this.squeeze);
    this.pos.set(
      pv.x + (_c.x - pv.x) * q,
      pv.y + (_c.y - pv.y) * q + (1 - q) * CAMERA_TUNING.squeezeLift,
      pv.z + (_c.z - pv.z) * q,
    );
    let floor = (ctx.arena && typeof ctx.arena.waterY === 'number' ? ctx.arena.waterY : WATER_Y) + 0.35;
    if (ctx.arena && ctx.arena.ground) floor = Math.max(floor, ctx.arena.ground(this.pos.x, this.pos.z) + 0.45);
    if (this.pos.y < floor) this.pos.y = floor;

    const ahead = (1 - q) * 3;
    _lf
      .set(pv.x + so * ahead - this.pos.x, pv.y + CAMERA_TUNING.lookUp - this.pos.y, pv.z + co * ahead - this.pos.z)
      .normalize();
    this.fovNow = fov;
    if (this.lockK > 0.001 && b) {
      const P = this.pos,
        hd = Math.max(0.3, Math.hypot(pv.x - P.x, pv.z - P.z));
      const half = (fov * DEG) / 2,
        mB = CAMERA_TUNING.marginBottom * DEG;
      const elFeet = -Math.atan2(P.y - f.pos.y, hd) - mB + half;
      const elHead = -Math.atan2(P.y - f.pos.y - 1.9, hd) - mB + half;
      const bd = Math.max(0.5, Math.hypot(b.pos.x - P.x, b.pos.z - P.z)),
        elHer = Math.atan2(this.top - P.y, bd) + CAMERA_TUNING.marginTop * DEG - half;
      let el = elFeet;
      if (elHer > el) el = Math.min(elHer, elHead);
      el = clamp(el, -0.6, 0.85);
      const azP = Math.atan2(pv.x - P.x, pv.z - P.z),
        azB = Math.atan2(b.pos.x - P.x, b.pos.z - P.z);
      const hHalf = Math.atan(Math.tan(half) * (cam.aspect || 1.78));
      let az = azP + clamp(angleDiff(azB, azP) * CAMERA_TUNING.aim, -hHalf * 0.72, hHalf * 0.72);
      if (snap || this.fresh) {
        this.aimEl = el;
        this.aimAz = az;
      } else {
        this.aimEl = damp(this.aimEl, el, 9, dt);
        this.aimAz += angleDiff(az, this.aimAz) * (1 - Math.exp(-9 * dt));
      }
      const ce = Math.cos(this.aimEl);
      _ll.set(Math.sin(this.aimAz) * ce, Math.sin(this.aimEl), Math.cos(this.aimAz) * ce);
      const kk = smooth(this.lockK);
      this.dir.copy(_lf).lerp(_ll, kk).normalize();
    } else {
      this.dir.copy(_lf);
      this.aimEl = Math.asin(clamp(_lf.y, -1, 1));
      this.aimAz = Math.atan2(_lf.x, _lf.z);
    }
    this.yaw = Math.atan2(this.dir.x, this.dir.z);
    this.fresh = false;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    _t.copy(this.pos).add(this.dir);
    cam.lookAt(_t);
  }

  update(dt) {
    const ctx = this.ctx,
      input = ctx.input,
      f = this.follow,
      b = this.target,
      cam = ctx.camera;
    this.time += dt;
    this.lockAge += dt;
    this.feel(dt);
    if (this._mode === 'cine') {
      this.wasCine = true;
      this.trauma = 0;
      this.punchT = 0;
      this.kickX = this.kickY = 0;
      if (this.ghostSet) {
        this.ghost = 0;
        this.ghostSet = 0;
        if (f && f.look && 'ghost' in f.look) f.look.ghost = 0;
        else {
          if (f && f.look) f.look.fade = 0;
          if (f && f.kit) f.kit.fade = 0;
        }
      }
      return;
    }
    if (this.wasCine) {
      this.wasCine = false;
      this.fresh = true;
    }
    if (!f) return;
    if (input.pressed('lock') && f.alive && !f.puppet) {
      if (this._mode === 'lock') this.setLock(false);
      else if (b && b.alive) this.setLock(true);
      else {
        this.orbit = f.yaw;
        this.idle = 0;
      }
    }
    if (this._mode === 'lock' && !(b && b.alive)) this.setLock(false);
    if (this.autoT > 0) {
      this.autoT -= dt;
      if (this.autoT <= 0 && this._mode === 'free' && b && b.alive && f.alive && !f.puppet) this.setLock(true);
    }
    if (this._mode === 'lock') {
      const lx = input.look.x,
        ly = input.look.y;
      if (lx || ly) {
        this.peekX = clamp(this.peekX + lx, -CAMERA_TUNING.peek, CAMERA_TUNING.peek);
        this.peekY = clamp(this.peekY - ly, -CAMERA_TUNING.peekUp, CAMERA_TUNING.peekUp);
        this.idle = 0;
      } else {
        this.idle += dt;
        if (this.idle > CAMERA_TUNING.peekBack) {
          this.peekX = damp(this.peekX, 0, 2.5, dt);
          this.peekY = damp(this.peekY, 0, 2.5, dt);
        }
      }
    }
    if (this._mode === 'free') {
      const lx = input.look.x,
        ly = input.look.y;
      if (lx || ly) {
        this.orbit += lx;
        this.pitch = clamp(this.pitch - ly, CAMERA_TUNING.pitchMin, CAMERA_TUNING.pitchMax);
        this.idle = 0;
      } else {
        this.idle += dt;
        const sp = f.speed || 0;
        if (this.idle > CAMERA_TUNING.driftWait && sp > 1 && f.alive) {
          const head = Math.atan2(f.vel.x, f.vel.z),
            off = angleDiff(head, this.orbit),
            a = Math.abs(off);
          if (a > 0.05 && a < 2.5)
            this.orbit += clamp(off * 0.9, -CAMERA_TUNING.drift, CAMERA_TUNING.drift) * Math.min(1, sp / 4.6) * dt;
          this.pitch = damp(this.pitch, CAMERA_TUNING.pitch, 0.5, dt);
        }
        if (this.idle > CAMERA_TUNING.regardWait && b && b.alive && f.alive) {
          const dx = b.pos.x - f.pos.x,
            dz = b.pos.z - f.pos.z,
            d = Math.hypot(dx, dz),
            near = 1 - smooth((d - 3) / 7);
          if (near > 0.02 && Math.abs(angleDiff(Math.atan2(dx, dz), this.orbit)) < 1.0)
            this.pitch = damp(this.pitch, lerp(CAMERA_TUNING.pitch, CAMERA_TUNING.regard, near), 1.4, dt);
        }
      }
    }
    this.place(dt, this.fresh);
    const sprint = f.state === 'sprint' ? 1 : 0;
    this.sprintK = damp(this.sprintK, sprint, 4, dt);
    let fov = this.fovNow + CAMERA_TUNING.fovSprint * this.sprintK;
    if (this.punchT > 0) {
      this.punchT -= dt;
      const k = Math.max(0, this.punchT / this.punchT0);
      fov += this.punchV * k * k;
    }
    this.fov = fov;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (this.kickX || this.kickY) {
      cam.rotateY(-this.kickX);
      cam.rotateX(this.kickY);
      const k = Math.exp(-CAMERA_TUNING.kickBack * dt);
      this.kickX *= k;
      this.kickY *= k;
      if (Math.abs(this.kickX) + Math.abs(this.kickY) < 1e-4) this.kickX = this.kickY = 0;
    }
    this.fadeNear(dt);
    if (this.trauma > 0) {
      const a = this.trauma * this.trauma,
        t = this.time;
      const nx = Math.sin(t * 43.1) * 0.6 + Math.sin(t * 71.7 + 1.3) * 0.4,
        ny = Math.sin(t * 37.3 + 2.1) * 0.6 + Math.sin(t * 83.9 + 0.4) * 0.4,
        nz = Math.sin(t * 51.9 + 4.2) * 0.6 + Math.sin(t * 67.3 + 2.9) * 0.4;
      cam.rotateX(nx * a * CAMERA_TUNING.shakeAngle);
      cam.rotateY(ny * a * CAMERA_TUNING.shakeAngle);
      cam.rotateZ(nz * a * CAMERA_TUNING.shakeAngle * 0.7);
      cam.position.x += ny * a * CAMERA_TUNING.shakeMove;
      cam.position.y += nx * a * CAMERA_TUNING.shakeMove * 0.6;
      this.trauma = Math.max(0, this.trauma - this.decay * dt);
    }
    cam.updateMatrixWorld();
  }

  fadeNear(dt) {
    const f = this.follow,
      cam = this.ctx.camera;
    if (!f || !f.char) return;
    const y = clamp(cam.position.y, f.pos.y + 0.2, f.pos.y + 1.7),
      d = Math.hypot(cam.position.x - f.pos.x, cam.position.y - y, cam.position.z - f.pos.z);
    const want = f.alive && !f.puppet ? clamp((CAMERA_TUNING.ghost - d) / CAMERA_TUNING.ghostOver) : 0;
    this.ghost += clamp(want - this.ghost, -5 * dt, 9 * dt);
    if (this.ghost < 0.004 && this.ghostSet === 0) return;
    const g = this.ghost < 0.004 ? 0 : this.ghost;
    if (f.look && 'ghost' in f.look) f.look.ghost = g;
    else {
      if (f.look) f.look.fade = g;
      if (f.kit) f.kit.fade = g;
    }
    this.ghostSet = g;
  }

  feel(dt) {
    const ctx = this.ctx,
      f = this.follow,
      post = ctx.gfx && ctx.gfx.post;
    if (!post || !f) return;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this._mode === 'cine' || !ctx.game || (ctx.game.state !== 'fight' && ctx.game.state !== 'rescue')) {
      this.flash = 0;
      return;
    }
    const s = ctx.ui && ctx.ui.settings,
      calm = s && s.reducedMotion;
    let pulse = 0;
    if (f.alive && f.hp < f.hpMax * 0.3) pulse = calm ? 0.16 : 0.15 + 0.09 * Math.sin(this.time * Math.PI * 2 * 0.9);
    else if (!f.alive) pulse = 0.5;
    post.hurt = Math.max(this.flash, pulse);
  }

  frame(dt) {
    const i = this.ctx.input;
    if (i && i.pollGamepad) i.pollGamepad();
    const j = this.jolt;
    if (!j) return;
    const m = j.char && j.char.model,
      loop = this.ctx.game && this.ctx.game.loop,
      held = loop && loop.freeze > 0 && this.joltT > 0;
    if (m) {
      if (held) {
        this.joltT -= dt || 0;
        this.joltClock += dt || 0;
        const a = this.joltAmp / (j.char.scale || 1),
          t = this.joltClock;
        m.position.x = this.joltX + Math.sin(t * 190) * a;
        m.position.z = this.joltZ + Math.cos(t * 163) * a;
      } else {
        m.position.x = this.joltX;
        m.position.z = this.joltZ;
        this.jolt = null;
      }
    }
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }
}
