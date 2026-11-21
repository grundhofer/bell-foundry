import * as THREE from 'three';
import { Character } from './character.js';
import * as clipData from './clip-data.js';
import * as motionData from './motion-data.js';
import { dressPilgrim } from './wardrobe.js';
import { chosenFigure } from './roster.js';
import { clamp, lerp, angleDiff, approach } from '../core/math.js';
import { rulesFor } from '../core/rules.js';

const FIGURE = chosenFigure('player');
export const ASSETS = {
  'pilgrim.clips': 'assets/models/pilgrim.clips.glb',
  'pilgrim.motion': 'assets/models/pilgrim.motion.glb',
  [FIGURE.asset]: FIGURE.url,
};

export const FEEL = {
  stamina: 100,
  walk: 1.7,
  run: 4.6,
  sprint: 6.6,
  strafe: 0.87,
  back: 0.74,
  blockWalk: 2.0,
  healWalk: 1.5,
  accel: 38,
  turn: 14,
  turnEase: 18,
  turnLock: 11,
  turnLockEase: 14,
  regen: 42,
  regenBlock: 14,
  regenDelay: 0.8,
  regenDelayEmpty: 1.25,
  sprintDrain: 11,
  buffer: 0.35,
  queue: 0.6,
  tap: 0.25,
  blockArc: 1.4,
  blockCost: 0.7,
  blockCostHeavy: 0.9,
  chip: 0.12,
  flinchHeavy: 26,
  knockdown: 46,
  lunge: 3.2,
  lungeMax: 1.3,
  bodyGap: 1.0,
  graceUp: 0.4,
  mercy: 0.45,
};

const SOLID = { head: 1.9, lie: 0.92, sub: 0.2, shove: 0.25, floor: 0.035 };
const ROLL = {
  clip: 'roll_quick',
  at: 0.02,
  speed: 1.35,
  slow: 0.45,
  cost: 22,
  iframes: 0.35,
  distance: 3.3,
  span: 0.84,
  cancel: 0.92,
  walk: 1.0,
  end: 1.12,
  fade: 0.07,
};
const BACKSTEP = {
  clip: 'backstep',
  at: 0.58,
  speed: 1.75,
  cost: 12,
  iframes: 0.24,
  scale: 1.05,
  cancel: 1.5,
  walk: 1.58,
  end: 1.75,
  fade: 0.07,
};
const HEAL = { clip: 'drink', at: 3.0, speed: 1.75, from: 0.5, to: 1.2, end: 5.3, fade: 0.2 };
const JUMP = {
  clip: 'jump',
  at: 0.02,
  gather: 1.5,
  speed: 1,
  off: 0.2,
  top: 0.45,
  splash: 0.73,
  land: 0.75,
  end: 0.95,
  wet: 0.08,
  touch: 0.03,
  stride: 0.6,
  strideFade: 0.2,
  fade: 0.08,
  cost: 12,
  steer: 3,
  carry: 3.6,
};
const GIVE = { clip: 'backstep', at: 0.25, end: 0.62, speed: 1.4, weight: 1, stride: 0.6, fadeIn: 0.03, fadeOut: 0.18 };
const FLOOR = { chorale: 0.3, leap: 0.3, stomp: 0.3, tide: 0.45 };
const FALL_G = 16,
  FALL_SKIP = 0.05,
  FALL_BLEND = 0.1;
const FLINCH = { clip: 'hit', at: 0.03, speed: 1.5, end: 0.78, travel: 1, push: 1.6, fade: 0.06 };
const FLINCH_SIDE = { clip: 'hit_small', at: 0.1, speed: 1.5, end: 0.66, travel: 1, push: 1.6, fade: 0.06 };
const FLINCH_HEAD = { clip: 'hit_head', at: 0.03, speed: 1.3, end: 0.6, travel: 1, push: 1.6, fade: 0.06 };
const RECOIL = { back: 0.1, free: 0.36, end: 0.5 };
const FLINCH_BIG = { clip: 'hit_big', at: 0.02, speed: 1.35, end: 0.92, travel: 0.4, push: 5.2, fade: 0.06 };
const BREAK = { clip: 'hit_big', at: 0.02, speed: 1.0, end: 1.05, travel: 0.3, push: 3.6, fade: 0.06 };
const FALL = { clip: 'stunned', at: 0.05, speed: 1.25, end: 1.5, lie: 0.3, travel: 1.5, push: 2.2, fade: 0.08 };
const DEATH = { travel: 1, push: 0.8, back: 0.95, fwd: 1.35, fly: 0.06 };
const STRONG_DAMAGE = 1.25;
const TURN_TO_BLOW = 0.26;
const GETUP = { clip: 'getup', at: 4.25, speed: 1.75, end: 5.85, fade: 0.25 };

const ATTACKS = {
  light1: {
    clip: 'atk_cross',
    at: 0.4,
    speed: 1.3,
    hit: [0.72, 0.9],
    swing: 0.68,
    chain: 1.03,
    recover: 1.15,
    walk: 1.25,
    end: 1.5,
    damage: 16,
    poise: 12,
    cost: 14,
    next: 'light2',
  },
  light2: {
    clip: 'atk_down',
    at: 0.2,
    speed: 1.25,
    hit: [0.53, 0.8],
    swing: 0.45,
    chain: 0.96,
    recover: 1.1,
    walk: 1.2,
    end: 1.38,
    damage: 16,
    poise: 12,
    cost: 14,
    next: 'light3',
  },
  light3: {
    clip: 'atk_thrust',
    at: 0.3,
    speed: 1.2,
    hit: [0.6, 0.9],
    swing: 0.53,
    chain: 1.02,
    recover: 1.06,
    walk: 1.1,
    end: 1.12,
    n: 0,
    own: true,
    damage: 22,
    poise: 18,
    cost: 16,
    next: 'light1',
  },
  heavy: {
    clip: 'atk_power',
    at: 0.45,
    speed: 1.3,
    hold: 0.62,
    hit: [1.3, 1.46],
    swing: 1.25,
    chain: 1.82,
    recover: 1.95,
    walk: 2.05,
    end: 2.3,
    damage: 34,
    poise: 30,
    cost: 28,
    heavy: true,
    charged: { damage: 52, poise: 48 },
    next: 'light1',
  },
  runLight: {
    clip: 'atk_high',
    at: 0.0,
    speed: 1.2,
    hit: [0.48, 0.68],
    swing: 0.42,
    chain: 0.86,
    recover: 0.95,
    walk: 1.0,
    end: 1.2,
    yaw: -0.52,
    damage: 20,
    poise: 16,
    cost: 16,
    next: 'light2',
    fade: 0.1,
  },
  rollLight: {
    clip: 'atk_high',
    at: 0.0,
    speed: 1.25,
    hit: [0.48, 0.68],
    swing: 0.42,
    chain: 0.86,
    recover: 0.95,
    walk: 1.0,
    end: 1.2,
    yaw: -0.52,
    x: 0.55,
    z: 0.55,
    damage: 18,
    poise: 14,
    cost: 16,
    next: 'light2',
    fade: 0.1,
  },
  runHeavy: {
    clip: 'atk_jump',
    at: 0.3,
    speed: 1.35,
    hit: [1.02, 1.33],
    swing: 0.93,
    chain: 1.8,
    recover: 1.95,
    walk: 2.0,
    end: 2.2,
    damage: 38,
    poise: 34,
    cost: 28,
    heavy: true,
    next: 'light1',
    fade: 0.1,
  },
  jumpCut: {
    clip: 'atk_jump',
    at: 0.86,
    speed: 1.15,
    hit: [1.02, 1.33],
    swing: 0.93,
    chain: 1.8,
    recover: 1.95,
    walk: 2.0,
    end: 2.2,
    damage: 34,
    poise: 30,
    cost: 28,
    heavy: true,
    next: 'light1',
    fade: 0.1,
  },
};
const CUT = { from: 0.26, to: 0.56, land: 1.2, hips: 0.92, first: 0.62, last: 1.0, ease: 0.08 };
export { ATTACKS, ROLL, BACKSTEP, JUMP, FLOOR };

function resolveAttackTimings(data) {
  for (const key in ATTACKS) {
    const a = ATTACKS[key],
      d = data && data[a.clip];
    a.x = a.x === undefined ? 1 : a.x;
    a.z = a.z === undefined ? 1 : a.z;
    a.fade = a.fade || 0.07;
    a.key = key;
    if (!d || !d.events) continue;
    const n = a.n || 0,
      at = (name) => {
        const e = d.events.find((v) => v.name === name && (!v.data || (v.data.n || 0) === n));
        return e ? e.t : undefined;
      };
    const on = at('hit-on'),
      off = at('hit-off'),
      sw = at('swing');
    if (on !== undefined && off !== undefined && off > on) a.hit = [on, off];
    if (sw !== undefined) a.swing = sw;
    if (!a.own && typeof d.recover === 'number') {
      const shift = d.recover - a.recover;
      a.recover += shift;
      a.chain += shift;
      a.walk += shift;
      a.end = Math.max(a.end, a.walk + 0.05);
    }
  }
}

const _v = new THREE.Vector3(),
  _sa = new THREE.Vector3(),
  _sb = new THREE.Vector3(),
  _tip = new THREE.Vector3(),
  _hand = new THREE.Vector3(),
  _ax = new THREE.Vector3(),
  _d3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _q3 = new THREE.Quaternion(),
  UP = new THREE.Vector3(0, 1, 0);
const HER = [
  ['LeftLeg', 'LeftFoot', 0.105],
  ['RightLeg', 'RightFoot', 0.105],
  ['LeftFoot', 'LeftToeBase', 0.085],
  ['RightFoot', 'RightToeBase', 0.085],
  ['LeftUpLeg', 'LeftLeg', 0.13],
  ['RightUpLeg', 'RightLeg', 0.13],
  ['Hips', 'Spine2', 0.2],
  ['LeftForeArm', 'LeftHand', 0.07],
  ['RightForeArm', 'RightHand', 0.07],
];
const REFUSED = { refused: true };
const MAY_ALL = { roll: true, attack: true, heal: true, jump: true },
  MAY_CUT = { attack: true },
  MAY_LEAVE = { roll: true, heal: true, jump: true },
  MAY_ROLL = { roll: true, jump: true };
const SOLES = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'];
const speedFor = (stick, top) =>
  Math.min(
    top,
    stick >= 0.9 ? top : stick > 0.5 ? lerp(FEEL.walk, top, (stick - 0.5) / 0.4) : FEEL.walk * (0.5 + stick),
  );
const turnStep = (from, to, ease, cap, dt) => {
  const d = angleDiff(to, from);
  return from + clamp(d * (1 - Math.exp(-ease * dt)), -cap * dt, cap * dt);
};

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.name = 'pilgrim';
    // Every pilgrim figure is retargeted: the clips file carries the skeleton the clips were made on.
    const c = (this.char = new Character(ctx, {
      name: 'pilgrim',
      model: FIGURE.asset,
      ref: 'pilgrim.clips',
      clips: 'pilgrim.clips',
      data: { ...clipData.pilgrim, ...motionData.pilgrim },
    }));
    if (ctx.assets.has && ctx.assets.has('pilgrim.motion'))
      for (const raw of ctx.assets.gltf('pilgrim.motion').animations) c.addClip(raw);
    this.root = c.root;
    this.pos = c.root.position;
    ctx.scene.add(c.root);
    this.look =
      ctx.gfx && ctx.gfx.materials && ctx.gfx.materials.character
        ? ctx.gfx.materials.character(c.model, { who: 'player' })
        : null;
    const R = (this.rules = rulesFor(ctx.params));
    this.radius = 0.38;
    this.hpMax = R.health;
    this.staminaMax = FEEL.stamina;
    this.flasksMax = R.flasks;
    const kit = (this.kit = dressPilgrim(ctx, c));
    this.weapon = ctx.combat.addWeapon({
      owner: this,
      base: kit.sword.base,
      tip: kit.sword.tip,
      radius: kit.sword.radius || 0.06,
    });
    this.trail = ctx.vfx && ctx.vfx.trail ? ctx.vfx.trail(kit.sword) : null;
    resolveAttackTimings(clipData.pilgrim);
    this.rollScale =
      ROLL.distance /
      (ROLL.span *
        ((clipData.pilgrim[ROLL.clip] && clipData.pilgrim[ROLL.clip].travel && clipData.pilgrim[ROLL.clip].travel[1]) ||
          5.98));
    this.vel = new THREE.Vector3();
    this.push = new THREE.Vector3();
    this.pushDir = new THREE.Vector3(0, 0, 1);
    this.aim = 0;
    this.speed = 0;
    this.puppet = false;
    this.locked = false;
    this.god = false;
    this._wasPuppet = false;
    this.afterPuppet = 0;
    this.wx = 0;
    this.wz = 0;
    this.wish = 0;
    this.wishYaw = 0;
    this._step = { who: 'player', pos: this.pos, foot: 'l', run: false };
    this._land = { who: 'player', pos: this.pos, hard: false };
    this._swing = { who: 'player', heavy: false, weapon: this.weapon };
    this._roll = { pos: this.pos, dir: new THREE.Vector3() };
    this.feet = 0;
    this.stride = 0;
    this.footSide = 0;
    this.solids = new Float32Array(5 * 24);
    this.solidN = 0;
    this.room = this.radius;
    this.shoveLeft = SOLID.shove;
    this.handle = null;
    this.clipPrev = 0;
    this.blowFrom = 0;
    this.turnT = 0;
    this.air = 0;
    this.hipY = 0;
    this.hipV = 0;
    this.jumpTop = 0;
    this.jt = 0;
    this.pushed = false;
    this.landed = false;
    this.striding = false;
    this.plantWas = true;
    this.falling = false;
    this.fallH = 0;
    this.fallV = 0;
    this.fallG = FALL_G;
    this.fallT = 0;
    this.cutting = false;
    this.cutT = 0;
    {
      const pts = c.retarget ? c.retarget.contact : clipData.pilgrim && clipData.pilgrim.$contact;
      this.soleSkin = [];
      if (pts) for (const n of SOLES) if (c.bones[n] && pts[n]) this.soleSkin.push({ bone: c.bones[n], pts: pts[n] });
    }
    this.gaze = new THREE.Vector3();
    this.gazing = false;
    this.offClip = c.on((e) => this.onClip(e));
    this.hasBlend = false;
    this.hasOverlay = typeof c.overlay === 'function' && typeof c.overlayOff === 'function';
    if (typeof c.locomotion === 'function' && typeof c.move === 'function') {
      try {
        c.locomotion({
          idle: 'idle',
          walk: { f: 'walk_f', b: 'walk_b', l: 'walk_l', r: 'walk_r' },
          run: { f: 'run_f', b: 'run_b', l: 'run_l', r: 'run_r' },
          sprint: 'sprint',
        });
        this.hasBlend = true;
      } catch (e) {
        console.warn('pilgrim: no blended walk (' + e.message + ')');
      }
    }
    this.reset();
  }

  get yaw() {
    return this.root.rotation.y;
  }
  set yaw(v) {
    this.root.rotation.y = v;
  }
  get blocking() {
    return this.state === 'block';
  }
  get invulnerable() {
    return this.iframes > 0 || this.safe;
  }
  set invulnerable(v) {
    this.safe = !!v;
  }
  get attacking() {
    return this.state === 'attack';
  }
  get busy() {
    const s = this.state;
    return !(s === 'idle' || s === 'move' || s === 'sprint' || s === 'block');
  }

  reset(spawn = this.ctx.arena.spawn.player) {
    const c = this.char;
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = spawn.yaw || 0;
    this.hp = this.hpMax;
    this.stamina = this.staminaMax;
    this.flasks = this.flasksMax;
    this.alive = true;
    this.iframes = 0;
    this.safe = false;
    this.regenWait = 0;
    this.sprintOut = false;
    this.state = 'idle';
    this.t = 0;
    this.def = null;
    this.chain = 'light1';
    this.chainT = 0;
    this.sinceSprint = 9;
    this.sinceRoll = 9;
    this.vel.set(0, 0, 0);
    this.push.set(0, 0, 0);
    this.charge = 0;
    this.healed = 0;
    this.dodged = false;
    this.decided = true;
    this.root.visible = true;
    c.speed = 1;
    this.ctx.combat.disarm(this.weapon);
    if (this.trail && this.trailOn) this.trail.stop();
    if (this.hasOverlay) c.overlayOff(0);
    if (this.kit.sheathe) this.kit.sheathe(false);
    if (typeof c.look === 'function') {
      c.look(null);
      this.gazing = false;
    }
    this.anim = '';
    this.fadeIn = 0;
    this.rdef = null;
    this.lieT = 0;
    this.trailOn = false;
    this.blockHit = 0;
    this.room = this.radius;
    this.solidN = 0;
    this.turnT = 0;
    this.handle = null;
    this.shoveLeft = 99;
    this.grounded();
    c.play('idle', { fade: 0, force: true });
    if (!this.hasBlend) this.anim = 'idle';
    this.legs(0, 0, true, 0);
    this.fadeIn = undefined;
    const input = this.ctx.input;
    for (const a of ['attack', 'heavy', 'roll', 'heal', 'block', 'jump']) input.consume(a);
    this.kit.teleport();
  }

  revive() {
    this.hp = this.hpMax;
    this.stamina = this.staminaMax;
    this.alive = true;
    this.regenWait = 0;
    this.sprintOut = false;
    this.lieT = 0;
    this.rdef = null;
    this.def = null;
    this.healed = 0;
    this.charge = 0;
    this.vel.set(0, 0, 0);
    this.push.set(0, 0, 0);
    this.state = 'getup';
    this.t = 0;
  }

  applyMotion(m, sx = 1, sz = 1) {
    const y = this.yaw,
      c = Math.cos(y),
      s = Math.sin(y),
      x = m.x * sx,
      z = m.z * sz;
    this.yaw = y + m.yaw;
    return this.moveBy(x * c + z * s, -x * s + z * c);
  }
  moveBy(dx, dz) {
    const l = Math.hypot(dx, dz),
      p = this.pos;
    if (l < 1e-7) return false;
    const n = Math.max(1, Math.ceil(l / SOLID.sub));
    let hit = false;
    for (let i = 0; i < n; i++) {
      p.x += dx / n;
      p.z += dz / n;
      if (this.collide()) hit = true;
    }
    return hit;
  }
  readSolids() {
    const b = this.ctx.boss;
    let n = 0;
    if (!b || !b.alive || !b.char || b === this) {
      this.solidN = 0;
      return;
    }
    const src = Array.isArray(b.solid) ? b.solid : null;
    if (src) {
      for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (!c || !c.a || !c.b) continue;
        const A = c.a.isObject3D ? c.a.getWorldPosition(_sa) : c.a,
          B = c.b.isObject3D ? c.b.getWorldPosition(_sb) : c.b;
        n = this.addSolid(n, A, B, c.r || 0.3);
      }
    } else {
      const B = b.char.bones,
        s = b.char.scale;
      for (let i = 0; i < HER.length; i++) {
        const h = HER[i],
          ba = B[h[0]],
          bb = B[h[1]];
        if (!ba || !bb) continue;
        n = this.addSolid(n, ba.getWorldPosition(_sa), bb.getWorldPosition(_sb), h[2] * s);
      }
    }
    this.solidN = n;
  }
  addSolid(n, A, B, r) {
    if (n >= 24) return n;
    const top = SOLID.head + r * 0.6;
    let ax = A.x,
      ay = A.y,
      az = A.z,
      bx = B.x,
      by = B.y,
      bz = B.z;
    if (ay > top && by > top) return n;
    if (ay > top) {
      const k = (top - by) / (ay - by);
      ax = bx + (ax - bx) * k;
      az = bz + (az - bz) * k;
    } else if (by > top) {
      const k = (top - ay) / (by - ay);
      bx = ax + (bx - ax) * k;
      bz = az + (bz - az) * k;
    }
    const S = this.solids,
      o = n * 5;
    S[o] = ax;
    S[o + 1] = az;
    S[o + 2] = bx;
    S[o + 3] = bz;
    S[o + 4] = r;
    return n + 1;
  }
  collide() {
    const b = this.ctx.boss,
      a = this.ctx.arena,
      p = this.pos,
      R = this.room,
      S = this.solids;
    let hit = false;
    for (let i = 0; i < 3; i++) {
      let again = false;
      if (b && b.alive && b !== this && !b.flying) {
        const dx = p.x - b.pos.x,
          dz = p.z - b.pos.z,
          d = Math.hypot(dx, dz),
          min = b.radius * FEEL.bodyGap + R;
        if (d < min && this.shoveLeft > 0) {
          const out = Math.min(min - d, this.shoveLeft);
          this.shoveLeft -= out;
          if (d > 1e-4) {
            p.x += (dx / d) * out;
            p.z += (dz / d) * out;
          } else {
            p.x -= Math.sin(this.yaw) * out;
            p.z -= Math.cos(this.yaw) * out;
          }
          hit = again = true;
        }
        for (let k = 0; k < this.solidN; k++) {
          const o = k * 5,
            ax = S[o],
            az = S[o + 1],
            sx = S[o + 2] - ax,
            sz = S[o + 3] - az,
            min2 = S[o + 4] + R,
            l2 = sx * sx + sz * sz;
          let t = l2 > 1e-8 ? ((p.x - ax) * sx + (p.z - az) * sz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + sx * t,
            qz = az + sz * t;
          let ex = p.x - qx,
            ez = p.z - qz,
            e = Math.hypot(ex, ez);
          if (e >= min2) continue;
          if (e < 0.02 && l2 > 0.25) {
            ex = -sz;
            ez = sx;
            e = Math.hypot(ex, ez);
          } else if (e < 1e-4) {
            ex = p.x - b.pos.x;
            ez = p.z - b.pos.z;
            e = Math.hypot(ex, ez);
            if (e < 1e-4) {
              ex = -Math.sin(this.yaw);
              ez = -Math.cos(this.yaw);
              e = 1;
            }
          }
          if (this.shoveLeft <= 0) continue;
          const out = Math.min(min2 - Math.hypot(p.x - qx, p.z - qz), this.shoveLeft);
          this.shoveLeft -= out;
          p.x += (ex / e) * out;
          p.z += (ez / e) * out;
          hit = again = true;
        }
      }
      if (a.resolve(p, R)) hit = true;
      else if (!again || i) break;
    }
    return hit;
  }
  gapTo(b) {
    return Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z) - b.radius * FEEL.bodyGap - this.radius;
  }
  yawTo(b) {
    return Math.atan2(b.pos.x - this.pos.x, b.pos.z - this.pos.z);
  }

  readStick() {
    const ctx = this.ctx,
      mv = ctx.input.move,
      cam = ctx.cam;
    let yaw;
    if (cam && cam.mode !== 'cine' && typeof cam.yaw === 'number') yaw = cam.yaw;
    else {
      ctx.camera.getWorldDirection(_v);
      yaw = Math.atan2(_v.x, _v.z);
    }
    const s = Math.sin(yaw),
      c = Math.cos(yaw),
      m = Math.min(1, Math.hypot(mv.x, mv.y));
    if (m > 0.12) {
      const wx = s * mv.y - c * mv.x,
        wz = c * mv.y + s * mv.x,
        l = Math.hypot(wx, wz);
      this.wx = wx / l;
      this.wz = wz / l;
      this.wish = m;
      this.wishYaw = Math.atan2(this.wx, this.wz);
    } else {
      this.wish = 0;
      this.wx = 0;
      this.wz = 0;
    }
  }

  locomote(dt, top, face) {
    const v = this.vel,
      p = this.pos,
      boss = this.ctx.boss;
    let tx = 0,
      tz = 0;
    if (this.wish > 0) {
      let sp = speedFor(this.wish, top);
      if (face === 'boss') {
        const f = Math.sin(this.yaw) * this.wx + Math.cos(this.yaw) * this.wz;
        sp *= f >= 0 ? lerp(FEEL.strafe, 1, f) : lerp(FEEL.strafe, FEEL.back, -f);
      }
      tx = this.wx * sp;
      tz = this.wz * sp;
    }
    const dx = tx - v.x,
      dz = tz - v.z,
      dl = Math.hypot(dx, dz),
      step = FEEL.accel * dt;
    if (dl <= step) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / dl) * step;
      v.z += (dz / dl) * step;
    }
    if (face === 'boss' && boss) this.yaw = turnStep(this.yaw, this.yawTo(boss), FEEL.turnLockEase, FEEL.turnLock, dt);
    else if (face === 'stick' && this.wish > 0)
      this.yaw = turnStep(this.yaw, this.wishYaw, FEEL.turnEase, FEEL.turn, dt);
    const px = p.x,
      pz = p.z,
      was = Math.hypot(v.x, v.z);
    if (this.moveBy(v.x * dt, v.z * dt) || this.collide()) {
      const ax = (p.x - px) / dt,
        az = (p.z - pz) / dt,
        al = Math.hypot(ax, az),
        k = al > was ? was / (al || 1) : 1;
      v.x = ax * k;
      v.z = az * k;
    }
    this.legs((p.x - px) / dt, (p.z - pz) / dt, face !== 'boss', dt);
  }

  legs(ax, az, forwardOnly, dt) {
    const c = this.char,
      y = this.yaw,
      sy = Math.sin(y),
      cy = Math.cos(y);
    const vz = ax * sy + az * cy,
      vx = ax * cy - az * sy,
      sp = Math.hypot(vx, vz);
    this.speed = sp;
    if (this.hasBlend) {
      if (this.anim !== '@move') {
        this.anim = '@move';
        c.play('@move', { fade: this.fadeIn !== undefined ? this.fadeIn : 0.18 });
        this.fadeIn = undefined;
      }
      if (forwardOnly) c.move(0, sp);
      else c.move(vx, vz);
    } else {
      let name = 'idle',
        ground = 0;
      if (sp > 0.25) {
        const run = sp > 2.7,
          ang = forwardOnly ? 0 : Math.atan2(vx, vz),
          a = Math.abs(ang);
        const d = a < 0.9 ? 'f' : a > 2.25 ? 'b' : ang > 0 ? 'l' : 'r';
        name = (run ? 'run_' : 'walk_') + d;
        ground = (clipData.pilgrim[name] && clipData.pilgrim[name].groundSpeed) || (run ? 4.2 : 1.5);
      }
      const e = c.clips && c.clips.get(name),
        base = (e && e.speed) || 1;
      if (this.anim !== name) {
        this.anim = name;
        c.play(name, {
          fade: this.fadeIn !== undefined ? this.fadeIn : name === 'idle' ? 0.22 : 0.16,
          speed: ground ? clamp(sp / ground, 0.5, 1.7) / base : 1,
        });
        this.fadeIn = undefined;
      } else if (ground) c.play(name, { speed: clamp(sp / ground, 0.5, 1.7) / base });
    }
    this.stride += sp * dt;
    if (this.feet > 0) this.feet -= dt;
    else if (sp > 0.6 && this.stride > (sp > 2.7 ? 1.25 : 0.72)) {
      this.stride = 0;
      this.footSide ^= 1;
      this.emitStep(this.footSide ? 'l' : 'r', true);
    }
  }
  emitStep(foot, counted) {
    const s = this._step;
    s.foot = foot;
    s.run = this.speed > 2.7 || this.state === 'roll' || this.state === 'attack';
    if (!counted) {
      this.feet = 1.5;
      this.stride = 0;
    }
    this.ctx.bus.emit('step', s);
  }
  onClip(e) {
    if (this.state === 'jump' && !this.puppet) return;
    if (e.name === 'foot-l' || e.name === 'foot-r') {
      if (!this.puppet && (this.state === 'idle' || this.state === 'down' || this.state === 'dead')) return;
      this.emitStep(e.name === 'foot-l' ? 'l' : 'r', false);
    } else if (e.name === 'land') {
      const l = this._land;
      l.hard = this.state === 'attack' || this.state === 'down';
      this.ctx.bus.emit('land', l);
    }
  }

  play(name, at, speed, fade) {
    const c = this.char,
      e = c.clips && c.clips.get(name),
      base = (e && e.speed) || 1;
    this.anim = name;
    return (this.handle = c.play(name, { at, speed: speed / base, fade, force: true, loop: false }));
  }
  enter(state) {
    const c = this.char;
    if (this.striding) this.unstride();
    if (this.cutting) {
      this.cutting = false;
      if (!(this.air > FALL_SKIP && (state === 'hit' || state === 'down' || state === 'dead'))) {
        c.model.position.y = 0;
        this.air = 0;
      }
    }
    if (this.state === 'attack') this.ctx.combat.disarm(this.weapon);
    if ((this.state === 'block' || this.state === 'heal') && this.hasOverlay && state !== this.state)
      c.overlayOff(0.15);
    if (this.trailOn && this.trail) {
      this.trail.stop();
      this.trailOn = false;
    }
    this.state = state;
    this.t = 0;
    c.speed = 1;
    this.armed = false;
    this.swung = false;
    this.whooshed = false;
    this.lieT = 0;
  }
  spendStamina(cost) {
    this.stamina = Math.max(0, this.stamina - cost);
    this.regenWait = Math.max(this.regenWait, this.stamina <= 0 ? FEEL.regenDelayEmpty : FEEL.regenDelay);
    if (this.stamina <= 0) this.ctx.bus.emit('stamina-out', {});
  }

  act(allow, B = FEEL.buffer) {
    const input = this.ctx.input,
      st = this.stamina > 0;
    let best = null,
      when = -Infinity,
      w;
    if (!st && (input.pressed('roll') || input.pressed('attack') || input.pressed('heavy') || input.pressed('jump')))
      this.ctx.bus.emit('stamina-out', REFUSED);
    if (allow.roll && st && input.buffered('roll', B) && (w = input.when('roll')) > when) {
      best = 'roll';
      when = w;
    }
    if (allow.attack && st && input.buffered('attack', B) && (w = input.when('attack')) > when) {
      best = 'attack';
      when = w;
    }
    if (allow.attack && st && input.buffered('heavy', B) && (w = input.when('heavy')) > when) {
      best = 'heavy';
      when = w;
    }
    if (
      allow.heal &&
      this.flasks > 0 &&
      this.hp < this.hpMax &&
      input.buffered('heal', B) &&
      (w = input.when('heal')) > when
    ) {
      best = 'heal';
      when = w;
    }
    if (allow.jump && st && input.buffered('jump', Math.min(B, FEEL.buffer)) && (w = input.when('jump')) > when) {
      best = 'jump';
      // eslint-disable-next-line no-useless-assignment -- kept for symmetry with the other candidates; dropping it would leave `w` above useless too
      when = w;
    }
    if (!best) return false;
    if (best === 'jump') return this.startJump();
    if (best === 'roll') return this.startDodge();
    if (best === 'heal') {
      input.consume('heal');
      this.startHeal();
      return true;
    }
    input.consume('attack');
    input.consume('heavy');
    this.startAttack(this.pickAttack(best === 'heavy'));
    return true;
  }

  pickAttack(heavy) {
    const sw = this.ctx.hw && this.ctx.hw.takeSwing ? this.ctx.hw.takeSwing() : null;
    this.strong = !!(sw && sw.strong);
    const fast = this.state === 'sprint' || this.sinceSprint < 0.25;
    if (fast) return heavy ? ATTACKS.runHeavy : ATTACKS.runLight;
    if (heavy) return ATTACKS.heavy;
    if (this.state === 'roll' || this.sinceRoll < 0.12) return ATTACKS.rollLight;
    if (sw && sw.kind === 'thrust') return ATTACKS.light3;
    if (sw && sw.kind === 'slash') return ATTACKS[this.chainT > 0 && this.chain === 'light2' ? 'light2' : 'light1'];
    return ATTACKS[this.chainT > 0 ? this.chain : 'light1'];
  }

  startAttack(def, at = def.at) {
    const boss = this.ctx.boss;
    this.enter('attack');
    this.def = def;
    this.spendStamina(def.cost);
    this.vel.set(0, 0, 0);
    this.chain = def.next;
    this.chainT = 0.45;
    this.charge = 0;
    this.charging = !!def.hold;
    this.lunged = 0;
    let aim = this.yaw,
      onHer = false;
    if (boss && boss.alive) {
      const to = this.yawTo(boss),
        near = this.gapTo(boss) < 4.5;
      if (this.locked) {
        aim = to;
        onHer = true;
      } else {
        if (this.wish > 0) aim = this.wishYaw;
        if (near && Math.abs(angleDiff(to, aim)) < 0.75) {
          aim = to;
          onHer = true;
        }
      }
    } else if (this.wish > 0) aim = this.wishYaw;
    this.aim = aim;
    this.onHer = onHer;
    this.aimOff = def.yaw || 0;
    this.play(def.clip, at, def.speed, def.fade);
  }

  startDodge() {
    const input = this.ctx.input,
      held = input.held('roll'),
      heldFor = input.heldFor('roll');
    if (held && heldFor >= FEEL.tap) {
      input.consume('roll');
      return false;
    }
    input.consume('roll');
    this.vel.set(0, 0, 0);
    this.dodged = false;
    if (this.wish <= 0) {
      this.enter('backstep');
      this.spendStamina(BACKSTEP.cost);
      this.iframes = BACKSTEP.iframes;
      this.play(BACKSTEP.clip, BACKSTEP.at, BACKSTEP.speed, BACKSTEP.fade);
      const r = this._roll;
      r.dir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.ctx.bus.emit('roll', r);
      return true;
    }
    this.yaw = this.wishYaw;
    this.enter('dodge');
    this.iframes = ROLL.iframes;
    this.pressT = heldFor;
    this.decided = !held;
    this.play(ROLL.clip, ROLL.at, ROLL.speed, ROLL.fade);
    if (this.decided) this.commitRoll();
    else this.char.speed = ROLL.slow;
    return true;
  }
  commitRoll() {
    this.state = 'roll';
    this.decided = true;
    this.char.speed = 1;
    this.spendStamina(ROLL.cost);
    const r = this._roll;
    r.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.ctx.bus.emit('roll', r);
  }

  startHeal() {
    this.enter('heal');
    this.flasks--;
    this.healed = 0;
    this.vel.multiplyScalar(0.4);
    const c = this.char,
      e = c.clips && c.clips.get(HEAL.clip),
      base = (e && e.speed) || 1;
    if (this.hasOverlay)
      c.overlay(HEAL.clip, { mask: 'upper', fade: HEAL.fade, loop: false, speed: HEAL.speed / base, at: HEAL.at });
    else this.play(HEAL.clip, HEAL.at, HEAL.speed, HEAL.fade);
    this.healLen = (HEAL.end - HEAL.at) / HEAL.speed;
    this.ctx.bus.emit('heal', { flasks: this.flasks });
  }

  startJump() {
    const was = this.state,
      v = this.vel;
    this.ctx.input.consume('jump');
    if (was === 'roll' && this.wish > 0) v.set(Math.sin(this.yaw) * JUMP.carry, 0, Math.cos(this.yaw) * JUMP.carry);
    if (this.falling) this.grounded();
    this.enter('jump');
    this.def = null;
    this.spendStamina(JUMP.cost);
    this.jumpTop = Math.max(Math.hypot(v.x, v.z), FEEL.walk);
    this.jt = JUMP.at;
    this.pushed = false;
    this.landed = false;
    this.striding = false;
    this.play(JUMP.clip, JUMP.at, JUMP.gather, JUMP.fade);
    this.jumping(this.ctx.DT);
    return true;
  }
  jumping(dt) {
    const ctx = this.ctx,
      c = this.char,
      J = JUMP,
      h = this.handle,
      t = this.jt,
      v = this.vel,
      boss = ctx.boss,
      lock = this.locked && boss && boss.alive;
    const coming = t > J.top,
      down = t >= J.land || (coming && this.air <= J.touch);
    if (!this.landed && (down || t >= J.splash || (coming && this.air <= J.wet))) {
      this.landed = true;
      const l = this._land;
      l.hard = false;
      ctx.bus.emit('land', l);
      if (typeof c.additive === 'function')
        c.additive(GIVE.clip, {
          at: GIVE.at,
          end: GIVE.end,
          speed: GIVE.speed,
          weight: this.striding ? GIVE.stride : GIVE.weight,
          mask: 'lower',
          fadeIn: GIVE.fadeIn,
          fadeOut: GIVE.fadeOut,
        });
    }
    if (down) {
      if (this.act(MAY_ALL, FEEL.queue)) return;
      if (t >= J.end || this.striding || this.wish > 0 || ctx.input.held('block')) {
        const striding = this.striding;
        this.enter('idle');
        if (!striding) {
          this.anim = '';
          this.fadeIn = 0.18;
        }
        this.free(dt);
        return;
      }
    }
    if (!this.pushed && t >= J.off) {
      this.pushed = true;
      if (h) h.timeScale = J.speed;
      const s = this._step;
      s.foot = this.footSide ? 'l' : 'r';
      s.run = true;
      this.feet = 1.5;
      this.stride = 0;
      ctx.bus.emit('step', s);
    }
    if (
      this.pushed &&
      !down &&
      t >= CUT.from &&
      t <= CUT.to &&
      this.stamina > 0 &&
      (ctx.input.buffered('attack', FEEL.buffer) || ctx.input.buffered('heavy', FEEL.buffer))
    ) {
      this.startJumpCut((J.land - t) / J.speed);
      return;
    }
    const rate = (down ? FEEL.accel : J.steer) * dt;
    let tx = v.x,
      tz = v.z;
    if (down) {
      tx = 0;
      tz = 0;
    } else if (this.wish > 0) {
      const sp = speedFor(this.wish, this.jumpTop);
      tx = this.wx * sp;
      tz = this.wz * sp;
    }
    const dx = tx - v.x,
      dz = tz - v.z,
      dl = Math.hypot(dx, dz);
    if (dl <= rate) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / dl) * rate;
      v.z += (dz / dl) * rate;
    }
    if (lock) this.yaw = turnStep(this.yaw, this.yawTo(boss), FEEL.turnLockEase, FEEL.turnLock, dt);
    const p = this.pos,
      px = p.x,
      pz = p.z,
      was = Math.hypot(v.x, v.z);
    if (was > 1e-6 && this.moveBy(v.x * dt, v.z * dt)) {
      const ax = (p.x - px) / dt,
        az = (p.z - pz) / dt,
        al = Math.hypot(ax, az),
        k = al > was ? was / (al || 1) : 1;
      v.x = ax * k;
      v.z = az * k;
    }
    if (!this.striding && !down && t >= J.stride && v.x * v.x + v.z * v.z > 0.25) {
      this.striding = true;
      this.plantWas = c.footPlant;
      c.footPlant = false;
      if (this.hasBlend) {
        const mv = c.play('@move', { fade: J.strideFade });
        this.anim = '@move';
        if (mv) mv.time = mv.duration - (J.land - t) / J.speed;
      } else {
        this.anim = '';
        this.fadeIn = J.strideFade;
      }
    }
    if (this.striding) {
      this.feet = 1.5;
      this.legs((p.x - px) / dt, (p.z - pz) / dt, !lock, dt);
    }
    this.jt = t + dt * (this.pushed ? J.speed : J.gather);
  }
  startJumpCut(rem) {
    this.strong = false;
    const d = ATTACKS.jumpCut,
      c = this.char,
      v = this.vel,
      vx = v.x,
      vz = v.z,
      input = this.ctx.input;
    input.consume('attack');
    input.consume('heavy');
    c.bones.Hips.getWorldPosition(_v);
    const H = _v.y;
    const at = clamp(CUT.land - rem * d.speed, CUT.first, CUT.last),
      T = (CUT.land - at) / d.speed;
    this.startAttack(d, at);
    v.set(vx, 0, vz);
    const g = clamp((2 * (H + this.hipV * T - CUT.hips)) / (T * T), 6, 40);
    this.cutting = true;
    this.cutT = T;
    this.fallH = H;
    this.fallG = g;
    this.fallV = (CUT.hips - H + 0.5 * g * T * T) / T;
  }
  jumpCutStep(dt) {
    const c = this.char,
      m = c.model;
    if (this.state !== 'attack') {
      this.cutting = false;
      this.falling = true;
      this.fallT = 0;
      this.fallStep(dt);
      return;
    }
    this.cutT -= dt;
    this.fallV -= this.fallG * dt;
    this.fallH += this.fallV * dt;
    if (this.cutT <= 0) {
      m.position.y = 0;
      this.cutting = false;
      this.air = 0;
      this.hipV = 0;
      this.vel.set(0, 0, 0);
      return;
    }
    c.bones.Hips.getWorldPosition(_v);
    m.position.y = (this.fallH - (_v.y - m.position.y)) * Math.min(1, this.cutT / CUT.ease);
    const low = this.lowestSoleY();
    if (low < 0) m.position.y -= low;
  }
  unstride() {
    if (this.striding) {
      this.striding = false;
      this.char.footPlant = this.plantWas;
    }
  }
  lowestSoleY() {
    let low = Infinity;
    const S = this.soleSkin;
    for (let i = 0; i < S.length; i++) {
      const b = S[i].bone,
        pts = S[i].pts;
      b.updateWorldMatrix(true, false);
      const e = b.matrixWorld.elements,
        e1 = e[1],
        e5 = e[5],
        e9 = e[9],
        e13 = e[13];
      for (let k = 0; k < pts.length; k += 3) {
        const y = e1 * pts[k] + e5 * pts[k + 1] + e9 * pts[k + 2] + e13;
        if (y < low) low = y;
      }
    }
    if (low === Infinity) return 0;
    const a = this.ctx.arena;
    return low - (a && a.ground ? a.ground(this.pos.x, this.pos.z) : 0);
  }
  grounded() {
    this.air = 0;
    this.hipV = 0;
    this.unstride();
    if (this.falling || this.cutting) {
      this.falling = false;
      this.cutting = false;
      this.char.model.position.y = 0;
    }
  }
  drop() {
    this.char.bones.Hips.getWorldPosition(_v);
    this.falling = true;
    this.cutting = false;
    this.fallT = 0;
    this.fallH = _v.y;
    this.fallV = Math.min(0, this.hipV);
  }
  fallStep(dt) {
    const c = this.char,
      m = c.model;
    this.fallT += dt;
    this.fallV -= FALL_G * dt;
    this.fallH += this.fallV * dt;
    c.bones.Hips.getWorldPosition(_v);
    const lift = this.fallH - (_v.y - m.position.y);
    if (lift > 0 || this.fallT < FALL_BLEND) {
      m.position.y = lift;
      const low = this.lowestSoleY();
      if (low < 0) m.position.y -= low;
      return;
    }
    if (m.position.y < -1e-3) {
      m.position.y = Math.min(0, m.position.y + 2.5 * dt);
      if (m.position.y < 0) return;
    }
    m.position.y = 0;
    this.falling = false;
    this.air = 0;
    this.hipV = 0;
    if (this.state === 'hit') {
      const l = this._land;
      l.hard = false;
      this.ctx.bus.emit('land', l);
    }
  }

  takeHit(hit) {
    if (!this.alive || this.god || this.puppet) return false;
    if (this.invulnerable) {
      if (this.state === 'dodge') this.dodged = true;
      return false;
    }
    if (this.air > 0 && hit.kind && FLOOR[hit.kind] !== undefined && this.air > FLOOR[hit.kind]) return false;
    const src = hit.attacker && hit.attacker.pos,
      bus = this.ctx.bus,
      up = this.air > FALL_SKIP;
    let from = this.yaw + Math.PI;
    if (hit.weapon && src) from = Math.atan2(src.x - this.pos.x, src.z - this.pos.z);
    else if (hit.dir && (hit.dir.x || hit.dir.z)) from = Math.atan2(-hit.dir.x, -hit.dir.z);
    else if (src) from = Math.atan2(src.x - this.pos.x, src.z - this.pos.z);
    const front = Math.abs(angleDiff(from, this.yaw)) < FEEL.blockArc;
    const push = this.push;
    push.set(0, 0, 0);
    if (hit.dir) push.set(hit.dir.x, 0, hit.dir.z);
    if (src) {
      _v.set(this.pos.x - src.x, 0, this.pos.z - src.z);
      if (_v.lengthSq() > 1e-6) push.addScaledVector(_v.normalize(), push.lengthSq() > 0.01 ? 0.8 : 1);
    }
    if (push.lengthSq() < 1e-6) push.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    push.normalize();
    this.pushDir.copy(push);

    if (this.blocking && this.stamina > 0 && front && !hit.unblockable) {
      hit.blocked = true;
      const cost = hit.damage * (hit.heavy ? FEEL.blockCostHeavy : FEEL.blockCost);
      hit.damage = hit.heavy ? Math.max(0, Math.min(this.hp - 1, hit.damage * FEEL.chip)) : 0;
      this.hp -= hit.damage;
      this.stamina = Math.max(0, this.stamina - cost);
      this.regenWait = Math.max(this.regenWait, FEEL.regenDelay + 0.2);
      if (this.stamina <= 0) {
        this.react(BREAK, 'stagger');
        this.regenWait = FEEL.regenDelayEmpty;
        bus.emit('stamina-out', {});
        hit.guardBreak = true;
        if (typeof this.char.additive === 'function') this.char.additive('block_hit', { weight: 0.8, speed: 1.2 });
        this.blowFrom = from;
        this.turnT = TURN_TO_BLOW;
      } else {
        push.multiplyScalar(hit.heavy ? 2.6 : 1.3);
        this.blockHit = 0.3;
        const c = this.char;
        if (typeof c.additive === 'function') c.additive('block_hit', { weight: 1, speed: 1.3 });
        else if (!this.hasOverlay) {
          this.play('block_hit', 0.02, 1.3, 0.05);
          this.anim = 'block_hit';
        }
      }
      return true;
    }
    this.hp = Math.max(0, this.hp - hit.damage);
    const behind = Math.abs(angleDiff(from, this.yaw)) > 2.2;
    if (this.hp <= 0) {
      this.alive = false;
      this.enter('dead');
      this.vel.set(0, 0, 0);
      push.multiplyScalar(DEATH.push);
      this.rdef = DEATH;
      if (this.hasOverlay) this.char.overlayOff(0.1);
      const flung = hit.knockdown || hit.weight === 'colossal' || hit.damage >= FEEL.knockdown;
      if (behind) this.play('death_fwd', DEATH.fwd, 1.3, 0.12);
      else {
        this.blowFrom = from;
        this.turnT = TURN_TO_BLOW;
        this.play(flung ? 'death_fly' : 'death_back', flung ? DEATH.fly : DEATH.back, 1, 0.1);
      }
      if (up) this.drop();
      return true;
    }
    if (hit.knockdown || hit.damage >= FEEL.knockdown) {
      this.react(FALL, 'down');
      this.safe = true;
      this.blowFrom = from;
      this.turnT = TURN_TO_BLOW;
    } else if (hit.heavy || hit.damage >= FEEL.flinchHeavy) {
      this.react(FLINCH_BIG, 'hit');
      if (!behind) {
        this.blowFrom = from;
        this.turnT = TURN_TO_BLOW;
      }
    } else {
      const sy = Math.sin(this.yaw),
        cy = Math.cos(this.yaw),
        d = hit.dir,
        side = d ? d.x * cy - d.z * sy : 0,
        along = d ? d.x * sy + d.z * cy : -1;
      const high = (hit.point && hit.point.y - this.pos.y > 1.3) || (d && d.y < -0.6);
      this.react(
        high ? FLINCH_HEAD : Math.abs(side) > Math.abs(along) * 0.7 ? (side > 0 ? FLINCH_SIDE : FLINCH_HEAD) : FLINCH,
        'hit',
      );
    }
    this.iframes = Math.max(this.iframes, FEEL.mercy);
    if (up) this.drop();
    return true;
  }
  testHit(damage = 30, heavy = true, knockdown = false, fromDeg, height = 1.1) {
    const boss = this.ctx.boss;
    if (typeof fromDeg !== 'number')
      return this.ctx.combat.strike({ attacker: boss, target: this, damage, heavy, knockdown });
    const a = this.yaw + (fromDeg * Math.PI) / 180,
      sx = Math.sin(a),
      sz = Math.cos(a);
    return this.ctx.combat.strike({
      attacker: { pos: new THREE.Vector3(this.pos.x + sx * 3, 0, this.pos.z + sz * 3), char: boss.char },
      target: this,
      damage,
      heavy,
      knockdown,
      weapon: {},
      dir: new THREE.Vector3(-sx, 0, -sz),
      point: new THREE.Vector3(this.pos.x + sx * 0.25, this.pos.y + height, this.pos.z + sz * 0.25),
    });
  }
  react(r, state) {
    this.enter(state);
    this.def = null;
    this.rdef = r;
    this.vel.set(0, 0, 0);
    this.push.multiplyScalar(r.push);
    if (this.hasOverlay) this.char.overlayOff(0.08);
    this.play(r.clip, r.at, r.speed, r.fade);
  }

  bladeStopped(info) {
    const ctx = this.ctx,
      c = this.char;
    if (info.floor) {
      if (ctx.vfx && ctx.vfx.spray)
        ctx.vfx.spray(info.point, UP, this.def && this.def.heavy ? 16 : 8, this.def && this.def.heavy ? 0.9 : 0.5);
      if (ctx.water && ctx.water.ripple)
        ctx.water.ripple(info.point.x, info.point.z, this.def && this.def.heavy ? 1.2 : 0.6, 0.4);
      return;
    }
    if (this.state !== 'attack' || !this.handle) return;
    if (this.cutting) {
      ctx.combat.disarm(this.weapon);
      this.armed = false;
      this.push.set(info.normal.x, 0, info.normal.z);
      this.pushDir.copy(this.push);
      this.react(FLINCH, 'hit');
      this.drop();
      if (ctx.game && ctx.game.hitStop) ctx.game.hitStop(0.06);
      if (ctx.input.rumble) ctx.input.rumble(0.5, 0.7, 0.12);
      return;
    }
    const h = this.handle,
      d = this.def;
    ctx.combat.disarm(this.weapon);
    this.armed = false;
    if (this.trailOn && this.trail) {
      this.trail.stop();
      this.trailOn = false;
    }
    h.time = this.clipPrev + (h.time - this.clipPrev) * Math.max(0, Math.min(1, info.u));
    h.timeScale = -Math.abs(h.timeScale) * 0.55;
    c.update(0);
    this.state = 'recoil';
    this.t = 0;
    this.charging = false;
    this.charge = 0;
    this.vel.set(0, 0, 0);
    this.push.set(info.normal.x, 0, info.normal.z).multiplyScalar(1.1);
    if (typeof c.additive === 'function') c.additive('block_hit', { weight: d && d.heavy ? 0.8 : 0.55, speed: 1.3 });
    if (ctx.game && ctx.game.hitStop) ctx.game.hitStop(d && d.heavy ? 0.08 : 0.05);
    if (ctx.input.rumble) ctx.input.rumble(0.5, 0.7, 0.12);
  }
  keepBladeUp() {
    const sw = this.kit.sword,
      hand = this.char.bones.RightHand;
    if (!sw || !hand || this.kit.sheathed) return;
    sw.tip.getWorldPosition(_tip);
    const a = this.ctx.arena,
      floor = (a && a.ground ? a.ground(_tip.x, _tip.z) : 0) + SOLID.floor,
      st = this.state;
    hand.getWorldPosition(_hand);
    const slack = st === 'down' || st === 'dead' || st === 'getup' ? clamp((0.5 - (_hand.y - floor)) / 0.25) : 0;
    if (_tip.y >= floor && slack <= 0) return;
    _d3.subVectors(_tip, _hand);
    const len = _d3.length();
    if (len < 1e-4) return;
    _d3.divideScalar(len);
    const flat = Math.hypot(_d3.x, _d3.z),
      w = clamp((flat - 0.1) / 0.25) * (1 - slack);
    let hx = flat > 1e-4 ? _d3.x / flat : 0,
      hz = flat > 1e-4 ? _d3.z / flat : 0;
    if (w < 1) {
      let fx = _hand.x - this.pos.x,
        fz = _hand.z - this.pos.z;
      const fl = Math.hypot(fx, fz);
      if (fl > 0.05) {
        fx /= fl;
        fz /= fl;
      } else {
        fx = Math.sin(this.yaw);
        fz = Math.cos(this.yaw);
      }
      hx = hx * w + fx * (1 - w);
      hz = hz * w + fz * (1 - w);
    }
    const hl = Math.hypot(hx, hz);
    if (hl < 1e-4) return;
    const e = Math.asin(clamp((floor - _hand.y) / len, -1, 1)),
      ce = Math.cos(e);
    _ax.set((hx / hl) * ce, Math.sin(e), (hz / hl) * ce);
    _q1.setFromUnitVectors(_d3, _ax);
    if (_tip.y >= floor && slack < 1) _q1.slerp(_q3.identity(), 1 - slack);
    hand.parent.getWorldQuaternion(_q2);
    _q3.copy(_q2).invert().multiply(_q1).multiply(_q2).multiply(hand.quaternion);
    hand.quaternion.copy(_q3);
    hand.updateMatrixWorld(true);
  }

  update(dt) {
    const ctx = this.ctx,
      c = this.char,
      input = ctx.input,
      boss = ctx.boss;
    if (this.puppet) {
      if (!this._wasPuppet) {
        this._wasPuppet = true;
        c.speed = 1;
        ctx.combat.disarm(this.weapon);
        if (this.trailOn && this.trail) {
          this.trail.stop();
          this.trailOn = false;
        }
        if (this.hasOverlay) c.overlayOff(0.1);
        if (this.gazing) {
          c.look(null);
          this.gazing = false;
        }
        this.grounded();
      }
      const m = c.update(dt);
      if (this.puppet === 'root') this.applyMotion(m);
      this.kit.update(dt);
      return;
    }
    if (this._wasPuppet) {
      this._wasPuppet = false;
      c.speed = 1;
      ctx.combat.disarm(this.weapon);
      this.vel.set(0, 0, 0);
      this.push.set(0, 0, 0);
      this.iframes = this.afterPuppet || 0;
      this.afterPuppet = 0;
      this.safe = false;
      if (this.alive) {
        this.state = 'idle';
        this.anim = '';
        this.fadeIn = 0.3;
        for (const a of ['attack', 'heavy', 'roll', 'heal', 'jump']) input.consume(a);
      }
    }
    this.t += dt;
    if (this.iframes > 0) this.iframes = Math.max(0, this.iframes - dt);
    this.readSolids();
    this.shoveLeft = SOLID.shove;
    {
      const lying =
          this.state === 'dead' || this.state === 'down'
            ? clamp((this.t - 0.25) / 0.5)
            : this.state === 'getup'
              ? 1 - clamp(this.t / 0.5)
              : 0,
        want = lerp(this.radius, SOLID.lie, lying);
      this.room += clamp(want - this.room, -1.6 * dt, 1.6 * dt);
    }
    if (this.turnT > 0) {
      this.turnT -= dt;
      this.yaw = turnStep(this.yaw, this.blowFrom, 16, 12, dt);
    }
    if (this.state !== 'attack') this.chainT -= dt;
    this.sinceSprint += dt;
    this.sinceRoll += dt;
    if (this.blockHit > 0) this.blockHit -= dt;
    this.readStick();
    const st = this.state,
      px = this.pos.x,
      pz = this.pos.z;

    if (st === 'idle' || st === 'move' || st === 'sprint' || st === 'block') this.free(dt);
    else if (st === 'dodge') {
      this.pressT += dt;
      if (!input.held('roll') || this.dodged) this.commitRoll();
      else if (this.pressT >= FEEL.tap) {
        if (this.wish > 0 && this.stamina > 0) {
          this.iframes = 0;
          this.enter('sprint');
          this.fadeIn = 0.16;
          this.anim = '';
          this.vel.set(Math.sin(this.yaw) * FEEL.run, 0, Math.cos(this.yaw) * FEEL.run);
          this.free(dt);
        } else this.commitRoll();
      }
    } else if (st === 'roll') {
      if (c.time >= ROLL.cancel && this.act(MAY_ALL, FEEL.queue)) this.sinceRoll = 0;
      else if (c.time >= ROLL.end || (c.time >= ROLL.walk && this.wish > 0)) {
        this.sinceRoll = 0;
        this.returnToIdle(dt, 3.6);
      }
    } else if (st === 'backstep') {
      if (c.time >= BACKSTEP.cancel && this.act(MAY_ALL, FEEL.queue)) {
        /* act() started the next move */
      } else if (c.time >= BACKSTEP.end || (c.time >= BACKSTEP.walk && this.wish > 0)) this.returnToIdle(dt, 0);
    } else if (st === 'jump') {
      this.jumping(dt);
    } else if (st === 'attack') {
      const d = this.def,
        t = c.time;
      if (t >= d.chain && this.act(MAY_CUT, FEEL.queue)) {
        /* act() started the next move */
      } else if (t >= d.recover && this.act(MAY_LEAVE, FEEL.queue)) {
        /* act() started the next move */
      } else if (t >= d.recover && input.held('block')) this.returnToIdle(dt, 0);
      else if (t >= d.end || (t >= d.walk && this.wish > 0)) this.returnToIdle(dt, 0);
      else {
        if (this.cutting) {
          const v = this.vel,
            p = this.pos,
            qx = p.x,
            qz = p.z,
            was = Math.hypot(v.x, v.z);
          if (was > 1e-6 && this.moveBy(v.x * dt, v.z * dt)) {
            const ax = (p.x - qx) / dt,
              az = (p.z - qz) / dt,
              al = Math.hypot(ax, az),
              k = al > was ? was / (al || 1) : 1;
            v.x = ax * k;
            v.z = az * k;
          }
        }
        this.swing(dt, d, t);
      }
    } else if (st === 'recoil') {
      const h = this.handle;
      if (h && this.t >= RECOIL.back && h.timeScale < 0) h.timeScale = 0;
      if (this.t >= RECOIL.free && this.act(MAY_LEAVE, FEEL.queue)) {
        /* act() started the next move */
      } else if (this.t >= RECOIL.end || (this.t >= RECOIL.free && (this.wish > 0 || input.held('block'))))
        this.returnToIdle(dt, 0);
    } else if (st === 'heal') {
      const due = this.rules.heal * clamp((this.t - HEAL.from) / (HEAL.to - HEAL.from));
      if (due > this.healed) {
        this.hp = Math.min(this.hpMax, this.hp + (due - this.healed));
        this.healed = due;
      }
      if (this.t >= this.healLen) this.returnToIdle(dt, FEEL.healWalk);
      else if (this.hasOverlay) this.locomote(dt, FEEL.healWalk, this.locked && boss && boss.alive ? 'boss' : 'stick');
    } else if (st === 'hit' || st === 'stagger') {
      if (c.time >= this.rdef.end && !this.act(MAY_ALL)) this.returnToIdle(dt, 0);
    } else if (st === 'down') {
      if (c.time >= FALL.end) {
        this.lieT += dt;
        if (this.lieT >= FALL.lie) {
          this.enter('getup');
          this.safe = true;
          this.play(GETUP.clip, GETUP.at, GETUP.speed, GETUP.fade);
        }
      }
    } else if (st === 'getup') {
      if (c.time >= GETUP.end) {
        this.safe = false;
        this.iframes = FEEL.graceUp;
        if (!this.act(MAY_ROLL)) this.returnToIdle(dt, 0);
      }
    }

    this.clipPrev = this.handle ? this.handle.time : 0;
    const m = c.update(dt),
      s2 = this.state;
    if (this.cutting) this.jumpCutStep(dt);
    else if (this.falling) this.fallStep(dt);
    if (s2 === 'jump' || this.falling || this.cutting) {
      this.air = Math.max(0, this.lowestSoleY());
      c.bones.Hips.getWorldPosition(_v);
      this.hipV = this.hipY > 0 ? (_v.y - this.hipY) / dt : 0;
      this.hipY = _v.y;
    } else if (this.air !== 0 || this.hipY !== 0) {
      this.air = 0;
      this.hipY = 0;
      this.hipV = 0;
    }
    this.keepBladeUp();
    if (s2 === 'dodge' || s2 === 'roll') this.applyMotion(m, 0, this.rollScale);
    else if (s2 === 'backstep') this.applyMotion(m, 0, BACKSTEP.scale);
    else if (this.cutting) {
      /* cutting: no root motion */
    } else if (s2 === 'attack' || s2 === 'recoil')
      this.applyMotion(m, this.def ? this.def.x : 1, this.def ? this.def.z : 1);
    else if (s2 === 'getup') this.applyMotion(m);
    else if (s2 === 'hit' || s2 === 'stagger' || s2 === 'down' || s2 === 'dead') {
      const d = Math.hypot(m.x, m.z) * (this.rdef ? this.rdef.travel : 1);
      if (d > 0) this.moveBy(this.pushDir.x * d, this.pushDir.z * d);
    }
    const pu = this.push;
    if (pu.x * pu.x + pu.z * pu.z > 1e-4) {
      const qx = this.pos.x,
        qz = this.pos.z,
        was = Math.hypot(pu.x, pu.z);
      if (this.moveBy(pu.x * dt, pu.z * dt)) {
        const ax = (this.pos.x - qx) / dt,
          az = (this.pos.z - qz) / dt,
          al = Math.hypot(ax, az),
          k = al > was ? was / (al || 1) : 1;
        pu.x = ax * k;
        pu.z = az * k;
      }
      const k = Math.exp(-7.5 * dt);
      pu.x *= k;
      pu.z *= k;
    }
    this.collide();
    this.speed = Math.hypot(this.pos.x - px, this.pos.z - pz) / dt;
    this.kit.update(dt);
    this.keepBladeUp();

    const sprinting = this.state === 'sprint';
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - FEEL.sprintDrain * dt);
      this.regenWait = Math.max(this.regenWait, 0.35);
      if (this.stamina <= 0) {
        this.sprintOut = true;
        ctx.bus.emit('stamina-out', {});
      }
      this.sinceSprint = 0;
    }
    if (this.regenWait > 0) this.regenWait -= dt;
    else if (
      this.alive &&
      this.stamina < this.staminaMax &&
      this.state !== 'attack' &&
      this.state !== 'roll' &&
      this.state !== 'dodge' &&
      this.state !== 'backstep' &&
      this.state !== 'jump'
    )
      this.stamina = approach(
        this.stamina,
        this.staminaMax,
        (this.state === 'block' ? FEEL.regenBlock : FEEL.regen) * dt,
      );
    if (typeof c.look === 'function') {
      const on = !!(boss && boss.alive && this.alive);
      if (on) {
        const hb = boss.char && boss.char.bones && boss.char.bones.Head;
        if (hb) hb.getWorldPosition(this.gaze);
        else this.gaze.set(boss.pos.x, 5.8, boss.pos.z);
      }
      if (on !== this.gazing) {
        this.gazing = on;
        c.look(on ? this.gaze : null, { weight: 0.8, speed: 5 });
      }
    }
  }

  free(dt) {
    const ctx = this.ctx,
      input = ctx.input,
      boss = ctx.boss,
      lock = this.locked && boss && boss.alive;
    if (this.act(MAY_ALL)) return;
    if (!input.held('roll')) this.sprintOut = false;
    const sprint =
      input.held('roll') && input.heldFor('roll') >= FEEL.tap && this.wish > 0.5 && this.stamina > 0 && !this.sprintOut;
    const block = input.held('block') && !sprint;
    const c = this.char;
    if (block) {
      if (this.state !== 'block') {
        this.state = 'block';
        this.t = 0;
        if (this.hasOverlay) c.overlay('block_idle', { mask: 'upper', fade: 0.1, loop: true });
        else {
          this.anim = 'block_idle';
          c.play('block_idle', { fade: 0.1 });
        }
      }
      if (this.hasOverlay) this.locomote(dt, FEEL.blockWalk, lock ? 'boss' : 'stick');
      else {
        this.vel.set(0, 0, 0);
        this.speed = 0;
        if (lock) this.yaw = turnStep(this.yaw, this.yawTo(boss), FEEL.turnLockEase, FEEL.turnLock, dt);
        else if (this.wish > 0) this.yaw = turnStep(this.yaw, this.wishYaw, FEEL.turnEase, FEEL.turn * 0.6, dt);
        if (this.anim !== 'block_idle' && !(this.blockHit > 0)) {
          this.anim = 'block_idle';
          c.play('block_idle', { fade: 0.15 });
        }
      }
      return;
    }
    if (this.state === 'block') {
      this.state = 'idle';
      if (this.hasOverlay) c.overlayOff(0.15);
      else {
        this.anim = '';
        this.fadeIn = 0.15;
      }
    }
    if (sprint) {
      this.state = 'sprint';
      this.locomote(dt, FEEL.sprint, 'stick');
      return;
    }
    this.locomote(dt, FEEL.run, lock ? 'boss' : 'stick');
    this.state = this.wish > 0 || this.speed > 0.3 ? 'move' : 'idle';
  }

  returnToIdle(dt, carry) {
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    this.enter('idle');
    this.def = null;
    this.safe = false;
    this.anim = '';
    this.fadeIn = 0.2;
    if (carry > 0 && this.wish > 0) this.vel.set(sy * carry, 0, cy * carry);
    else this.vel.set(0, 0, 0);
    this.free(dt);
  }

  swing(dt, d, t) {
    const ctx = this.ctx,
      c = this.char,
      boss = ctx.boss,
      input = ctx.input;
    if (this.onHer && boss && boss.alive) this.aim = this.yawTo(boss);
    const early = this.t < 0.2,
      before = t < d.hit[0] - 0.06;
    if (early) this.yaw = turnStep(this.yaw, this.aim + this.aimOff, 22, 12, dt);
    else if (before && this.onHer) this.yaw = turnStep(this.yaw, this.aim + this.aimOff, 10, 3.5, dt);
    if (d.hold && this.charging) {
      if (t >= d.hold) {
        if (input.held('heavy') && this.charge < 0.9) {
          c.speed = 0.05;
          this.charge += dt;
          if (this.charge >= 0.9) ctx.bus.emit('charge', { full: true });
        } else {
          c.speed = 1;
          this.charging = false;
        }
      }
    }
    if (this.onHer && boss && boss.alive && before && !(d.hold && c.speed < 1)) {
      const gap = this.gapTo(boss);
      if (
        gap > 0.12 &&
        gap < FEEL.lungeMax + 0.12 &&
        this.lunged < FEEL.lungeMax &&
        Math.abs(angleDiff(this.aim + this.aimOff, this.yaw)) < 0.5
      ) {
        const stepIn = Math.min(gap - 0.1, FEEL.lunge * dt, FEEL.lungeMax - this.lunged);
        this.moveBy(Math.sin(this.aim) * stepIn, Math.cos(this.aim) * stepIn);
        this.lunged += stepIn;
      }
    }
    if (!this.whooshed && t >= d.swing - (d.heavy ? 0.16 : 0.11) * (d.speed || 1)) {
      this.whooshed = true;
      const s = this._swing;
      s.heavy = !!d.heavy;
      ctx.bus.emit('whoosh', s);
    }
    if (!this.swung && t >= d.swing) {
      this.swung = true;
      const s = this._swing;
      s.heavy = !!d.heavy;
      ctx.bus.emit('swing', s);
      if (this.trail) {
        this.trail.start();
        this.trailOn = true;
      }
    }
    if (!this.armed && t >= d.hit[0] && t < d.hit[1]) {
      this.armed = true;
      const k = d.charged ? (this.strong ? 1 : clamp(this.charge / 0.9)) : 0,
        m = this.strong && !d.charged ? STRONG_DAMAGE : 1;
      ctx.combat.arm(this.weapon, {
        damage: m * (d.charged ? lerp(d.damage, d.charged.damage, k) : d.damage),
        poise: m * (d.charged ? lerp(d.poise, d.charged.poise, k) : d.poise),
        heavy: !!d.heavy,
        weight: this.strong && !d.heavy ? 'heavy' : undefined,
      });
    } else if (this.armed && t >= d.hit[1]) {
      this.armed = false;
      ctx.combat.disarm(this.weapon);
    }
    if (this.trailOn && t >= d.hit[1] + 0.06) {
      this.trail.stop();
      this.trailOn = false;
    }
  }

  dispose() {
    if (this.offClip) this.offClip();
    this.ctx.combat.removeWeapon(this.weapon);
    this.kit.dispose();
    this.char.dispose();
  }
}
