import * as THREE from 'three';
import { Character } from './character.js';
import * as clipData from './clip-data.js';
import * as wardrobe from './wardrobe.js';
import { MOVES, ORDER, STOMP, DAMAGE, timeline } from './boss-moves.js';
import { rulesFor } from '../core/rules.js';
import { BossFx, COLORS } from './boss-effects.js';
import { angleDiff, clamp, damp, lerp, seededRandom, smooth } from '../core/math.js';
import { BOSS_HEIGHT, WATER_Y } from '../core/constants.js';
import { chosenFigure } from './roster.js';
import { HAMMER_ASSETS } from './weapons.js';
import { FOUNDRY_LOOK } from '../config/foundry-look.js';
import { segmentEntersCylinder } from '../core/geometry.js';

const FIGURE = chosenFigure('boss');
export const ASSETS = Object.assign(
  {},
  wardrobe.ASSETS || {},
  { 'boss.clips': 'assets/models/boss.clips.glb' },
  { [FIGURE.asset]: FIGURE.url },
  HAMMER_ASSETS,
);
export { MOVES, ORDER as MOVE_NAMES };

const POISE = 130;
const POISE_WAIT = 2,
  POISE_BACK = 8;
const STAGGER_TIME = 3.2;
const STAGGER_HURT = 1.3;
const STAGGER_REST = 12;
const PRESSED = 30,
  PRESS_EBB = 9;
const ARMOUR = 0.3;
const WALK = { f: 2.9, b: 2.2, s: 2.5 };
const GROUND = { walk_f: 4.08, walk_b: 3.17, walk_l: 3.7, walk_r: 4.46 };
const TURNS = { turn_180: -3.18, turn_l: 1.58, turn_r: -1.71 };
const RIDE = 0.06;
const WRIST = 0.26;
const STEP = 0.3;
const WALL = [2.2, 3.5];
const HIS = 0.38;
const PIER_R = 1.0;
const ARC_CLEAR = 0.35;
const BINS = 24,
  BIN = (Math.PI * 2) / BINS;
const WEST = 21.0,
  EAST = -20.8;
const LEAVES = [
  { x: 2.44, z: 19.9, r: 1.35 },
  { x: -3.1, z: 19.9, r: 1.35 },
];
const stoneHeight = (c) => (c.h !== undefined ? c.h : c.r >= 1.4 ? 1.6 : c.r <= 1.0 ? 0.95 : 0.7);
const HEM = { lat: [1.25, 1.1], back: [1.0, 2.75], r: 0.7 };
const TRAIN = { from: 1.3, to: 2.75, r: 0.95 };
const BLOCKED_REST = 0.55;
const PRESS_ON = 0.05;
const BOUNCE_FALL = 0.5,
  FALL_REST = 0.75;
const BOUNCE = 0.15;
const RECOIL = { back: 0.16, end: 1.05, stop: 0.1 };
const SOLID = [
  ['shinL', 'LeftLeg', 'LeftFoot', 0.105],
  ['shinR', 'RightLeg', 'RightFoot', 0.105],
  ['footL', 'LeftFoot', 'LeftToeBase', 0.085],
  ['footR', 'RightFoot', 'RightToeBase', 0.085],
  ['thighL', 'LeftUpLeg', 'LeftLeg', 0.13],
  ['thighR', 'RightUpLeg', 'RightLeg', 0.13],
  ['body', 'Hips', 'Spine2', 0.2],
  ['armL', 'LeftForeArm', 'LeftHand', 0.07],
  ['armR', 'RightForeArm', 'RightHand', 0.07],
];
const UP = new THREE.Vector3(0, 1, 0);

const _v = new THREE.Vector3(),
  _t = new THREE.Vector3(),
  _b = new THREE.Vector3();
const _ax = new THREE.Vector3(),
  _d = new THREE.Vector3();
const _q2 = new THREE.Quaternion(),
  _pw = new THREE.Quaternion(),
  _rot = new THREE.Quaternion();
const _a0 = new THREE.Vector3(),
  _b0 = new THREE.Vector3(),
  _sp = new THREE.Vector3(),
  _sn = new THREE.Vector3();

export class Boss {
  constructor(ctx) {
    this.ctx = ctx;
    this.name = FOUNDRY_LOOK.bossName.en;
    // Every boss figure is retargeted: the clips file carries the skeleton the clips were made on.
    const c = (this.char = new Character(ctx, {
      name: 'boss',
      model: FIGURE.asset,
      ref: 'boss.clips',
      clips: 'boss.clips',
      scale: BOSS_HEIGHT / 1.8,
      data: clipData.boss,
    }));
    this.root = c.root;
    this.pos = c.root.position;
    ctx.scene.add(c.root);
    const R = (this.rules = rulesFor(ctx.params));
    this.radius = 1.5;
    this.hpMax = R.herHealth;
    if (ctx.gfx && ctx.gfx.materials && ctx.gfx.materials.character)
      ctx.gfx.materials.character(c.model, { who: 'boss', goldScale: 0.2, goldTrim: 0 });
    const kit = (this.kit = wardrobe.dressBoss(ctx, c));
    this.weapon = ctx.combat.addWeapon({
      owner: this,
      base: kit.sword.base,
      tip: kit.sword.tip,
      radius: kit.sword.radius || 0.07,
      damage: 24,
      heavy: true,
    });
    this.trail = ctx.vfx && ctx.vfx.trail ? ctx.vfx.trail(kit.sword, { look: 'boss', who: 'boss' }) : null;
    this.light = ctx.gfx && ctx.gfx.lights && ctx.gfx.lights.add ? ctx.gfx.lights.add('boss') : null;
    if (this.light) {
      this.light.intensity = 0;
      if (this.light.color) this.light.color.setRGB(1, 0.8, 0.46);
    }
    this.lightPower = 70;
    this.lightLevel = null;
    this.fx = new BossFx(ctx, this);

    const B = c.bones;
    this.post = {
      on: false,
      stoop: 0,
      lower: 0,
      up: 0,
      spine: [B.Spine, B.Spine1, B.Spine2].filter(Boolean),
      hand: B.RightHand || null,
      armR: B.RightArm || null,
      armL: B.LeftArm || null,
      bones: [],
      saved: [],
    };
    this.post.bones = this.post.spine.concat([this.post.armR, this.post.armL, this.post.hand].filter(Boolean));
    for (let i = 0; i < this.post.bones.length; i++) this.post.saved.push(new THREE.Quaternion());
    this.solid = [];
    this.solidBones = [];
    for (const [name, a, b, r] of SOLID)
      if (B[a] && B[b]) {
        this.solid.push({ name, a: new THREE.Vector3(), b: new THREE.Vector3(), r: r * c.scale });
        this.solidBones.push(B[a], B[b]);
      }
    this.skirt =
      B.Hips && B.LeftFoot && B.RightFoot
        ? { name: 'skirt', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.17 * c.scale }
        : null;
    if (this.skirt) this.solid.push(this.skirt);
    this.blade = { name: 'blade', a: new THREE.Vector3(0, 50, 0), b: new THREE.Vector3(0, 50, 0), r: 0.14 };
    this.solid.push(this.blade);
    this.train = { name: 'train', a: new THREE.Vector3(), b: new THREE.Vector3(), r: TRAIN.r };
    this.solid.push(this.train);
    this.hems = [0, 1].map((i) => ({
      name: i ? 'hemR' : 'hemL',
      a: new THREE.Vector3(0, 50, 0),
      b: new THREE.Vector3(0, 50, 0),
      r: HEM.r,
    }));
    this.solid.push(this.hems[0], this.hems[1]);
    this.wall = WALL[0];
    this.riding = false;
    this.touch = null;
    this.armsOn = null;
    this.struck = new THREE.Vector3();

    const data = clipData.boss || {};
    this.ground = {};
    for (const k in GROUND) this.ground[k] = data[k] && data[k].groundSpeed ? data[k].groundSpeed * c.scale : GROUND[k];
    this.idleClip = 'idle';
    this.blend = false;
    if (typeof c.locomotion === 'function' && typeof c.move === 'function') {
      try {
        c.locomotion({ idle: 'idle', walk: { f: 'walk_f', b: 'walk_b', l: 'walk_l', r: 'walk_r' } });
        this.blend = true;
      } catch (e) {
        console.warn('boss: no blended walk (' + e.message + ')');
      }
    }
    this.eye = new THREE.Vector3();
    this.looking = 0;
    this.flinches = 0;
    this.puppet = false;
    this.ai = true;
    this.wasPuppet = false;
    this.parts = [];
    this.var = {};
    this.cool = {};
    this.s = { dist: 99, bearing: 0, face: 0 };
    this.vel = { x: 0, z: 0 };
    this.tipPrev = new THREE.Vector3();
    this.leapFrom = new THREE.Vector3();
    this.leapTo = new THREE.Vector3();
    this.slamAt = new THREE.Vector3();
    this.footAt = new THREE.Vector3();
    this.bPrev = new THREE.Vector3();
    this.tPrev = new THREE.Vector3();
    this.bladeV = 0;
    this.moveFrom = new THREE.Vector3();
    this.clashAt = new THREE.Vector3();
    this.clashDir = new THREE.Vector3();
    this.clashN = new THREE.Vector3();
    this.stones = null;
    this.offs = [
      c.on((e) => this.onClip(e)),
      ctx.bus.on('heal', () => {
        if (!(R.punish > 0)) return;
        this.punish = R.punish;
        if (this._state === 'idle' || this._state === 'walk') this.breath = Math.min(this.breath, 0.2);
      }),
      ctx.bus.on('hit', (e) => {
        if (e.attacker !== this || e.target !== ctx.player || !e.weapon) return;
        this.fx.spare();
        if (e.blocked && this.recoil <= 0) {
          this.bladeSpent = true;
          if (this.armedWith) this.bounced = true;
        } else if (!e.blocked && this.armedWith && this.armedWith.knockdown && this.recoil <= 0) {
          this.bladeHit = true;
          this.bladeOn = PRESS_ON;
        }
      }),
    ];
    this.reset();
  }

  get yaw() {
    return this.root.rotation.y;
  }
  set yaw(v) {
    this.root.rotation.y = v;
  }
  get phase() {
    return this._phase;
  }
  set phase(n) {
    this._phase = n;
  }
  get state() {
    return this._state;
  }
  get rand() {
    return this._rand;
  }

  reset(spawn = this.ctx.arena.spawn.boss) {
    const c = this.char,
      kit = this.kit,
      game = this.ctx.game;
    this.restorePosture();
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = spawn.yaw || 0;
    this.root.visible = true;
    this.hp = this.hpMax;
    this.alive = true;
    this.invulnerable = false;
    this._phase = 1;
    this.p2 = false;
    this.changing = false;
    this.changeT = 0;
    this.poise = POISE;
    this.poiseWait = 0;
    this.staggered = false;
    this.staggerRest = 0;
    this._state = 'idle';
    this.stage = 'idle';
    this.move = null;
    this.moveName = null;
    this.part = null;
    this.pi = -1;
    this.parts.length = 0;
    this.armedWith = null;
    this.holdT = -1;
    this.holdLen = 1;
    this.partFrom = 0;
    this.partClip = 0;
    this.hitN = 0;
    this.hits = 0;
    this.aim = 0;
    this.breath = 3;
    this.planT = 0;
    this.side = 1;
    this.still = false;
    this.blockedT = 0;
    this.hugged = 0;
    this.farT = 0;
    this.punish = 0;
    this.forced = null;
    this.last = null;
    this.last2 = null;
    for (const k of ORDER) this.cool[k] = 0;
    this.pivot = null;
    this.pivotK = 1;
    this.stT = 0;
    this.stStage = 0;
    this.glow = 0;
    this.flare = 0;
    this.shine = 0;
    this.sung = 0;
    this.tipLow = false;
    this.tick = 0;
    this.clock = 0;
    this.vel.x = this.vel.z = 0;
    this.post.stoop = this.post.lower = this.post.up = 0;
    this.riding = false;
    this.touch = null;
    this.slamDue = null;
    this.wall = WALL[0];
    this.flying = false;
    this.kneeDown = false;
    this.recoil = 0;
    this.bounce = 0;
    this.bounced = false;
    this.bouncedArm = null;
    this.bladeSpent = false;
    this.bladeHit = false;
    this.bladeOn = 0;
    this.inStone = false;
    this.bladeFresh = true;
    this.cramped = 0;
    this.denied = 0;
    this.handle = null;
    this.clipPrev = 0;
    this.pressed = 0;
    this.forcedMove = false;
    this.yawPrev = this.yaw;
    this.xPrev = this.pos.x;
    this.zPrev = this.pos.z;
    this.guardUp = 0;
    this.recoilUp = 0;
    this.trainYaw = this.yaw;
    if (this.armsOn) {
      this.armsOn = null;
      if (c.overlayOff) c.overlayOff(0);
    }
    if (this.looking) {
      this.looking = 0;
      c.look(null);
    }
    this._rand = seededRandom(((game && game.seed) || 1) + 17);
    this.ctx.combat.disarm(this.weapon);
    if (this.trail) this.trail.stop();
    this.fx.clear();
    c.speed = 1;
    c.play(this.idleClip, { fade: 0, force: true });
    this.rest(0);
    if (kit.swordPlanted && kit.takeSword) kit.takeSword();
    kit.glow = 0;
    if (kit.sword) kit.sword.glow = 0;
    kit.fade = 0;
    if (this.light) this.light.intensity = 0;
    if (kit.teleport) kit.teleport();
  }

  enterPhase(n) {
    if (n !== 2) {
      this._phase = 1;
      this.p2 = false;
      return;
    }
    this._phase = 2;
    this.p2 = true;
    this.changing = false;
    if (!this.alive) return;
    this.invulnerable = false;
    if (this.move) this.abortMove();
    this.staggered = false;
    this.poise = POISE;
    this.poiseWait = 0;
    this._state = 'idle';
    this.stage = 'idle';
    this.char.speed = 1;
    this.pivot = null;
    this.breath = 1.6;
    if (!this.forced) this.forced = 'chorale';
  }

  forceMove(name) {
    if (!MOVES[name]) {
      console.warn(`boss: no move "${name}" (${ORDER.join(', ')})`);
      return false;
    }
    this.forced = name;
    this.breath = 0;
    return true;
  }

  dispose() {
    for (const off of this.offs) off();
    this.restorePosture();
    this.ctx.combat.removeWeapon(this.weapon);
    if (this.trail && this.trail.dispose) this.trail.dispose();
    this.fx.dispose();
    this.kit.dispose();
    this.char.dispose();
    if (this.light) this.light.intensity = 0;
  }

  takeHit(hit) {
    if (!this.alive || this.invulnerable) return false;
    if (this.staggered) hit.damage *= STAGGER_HURT;
    this.hp = Math.max(0, this.hp - hit.damage);
    if (this.hp <= 0) {
      this.die(hit);
      return true;
    }
    if (this._phase === 1 && !this.changing && this.hp <= this.hpMax * 0.5) {
      this.beginChange();
      return true;
    }
    if (!this.staggered && this.staggerRest <= 0 && !(this.part && this.part.each)) {
      const armoured = this._state === 'attack' && (this.stage === 'windup' || this.stage === 'active') && !this.recoil;
      this.poise -= (hit.poise || (hit.heavy ? 30 : 12)) * (armoured ? ARMOUR : 1);
      this.poiseWait = POISE_WAIT;
      if (this.poise <= 0) {
        this.stagger();
        return true;
      }
    }
    if (this.ai && (this._state === 'idle' || this._state === 'walk'))
      this.breath = Math.min(this.breath, 0.15 + this.rand() * 0.35);
    if (this.s.dist < 4.4) this.pressed = Math.min(90, this.pressed + hit.damage);
    this.flinch(hit);
    if (hit.heavy && this.ctx.game && this.ctx.game.hitStop) this.ctx.game.hitStop(0.09);
    return true;
  }

  flinch(hit) {
    const c = this.char;
    if (typeof c.additive !== 'function') return;
    const big = hit.weight === 'colossal' ? 1.2 : hit.heavy || hit.weight === 'heavy' ? 0.9 : 0.55;
    const k = big * (this.stage === 'active' ? 0.45 : 1);
    let f = -1,
      l = 0;
    if (hit.dir) {
      const y = this.yaw,
        sn = Math.sin(y),
        cs = Math.cos(y);
      f = hit.dir.x * sn + hit.dir.z * cs;
      l = hit.dir.x * cs - hit.dir.z * sn;
    }
    let high = false;
    if (hit.point) {
      this.struck.copy(hit.point);
      const H = c.bones.Head;
      if (H) {
        H.getWorldPosition(_v);
        high = _v.distanceTo(hit.point) < 0.3 * BOSS_HEIGHT;
      }
    } else this.struck.set(this.pos.x, 1, this.pos.z);
    let clip, w;
    if (hit.last) {
      clip = 'hit2';
      w = 1.7 * k;
    } else if (high) {
      clip = 'hit_head';
      w = 0.7 * k;
    } else if (f > 0.35) {
      clip = 'hit';
      w = 0.6 * k;
    } else if (l < -0.55) {
      clip = 'hit_head';
      w = 0.5 * k;
    } else if (l > 0.55) {
      clip = 'hit';
      w = 0.45 * k;
    } else {
      clip = big > 0.6 ? 'hit2' : 'hit3';
      w = 1.7 * k;
    }
    if (c.has && !c.has(clip)) return;
    c.additive(clip, { weight: w, speed: 1.15, fadeIn: 0.03, fadeOut: 0.25 });
    this.flinches++;
    const B = c.bones;
    if (
      hit.point &&
      B.LeftFoot &&
      B.RightFoot &&
      B.Hips &&
      !this.flying &&
      this._state !== 'stagger' &&
      (!c.has || c.has('hit'))
    ) {
      B.Hips.getWorldPosition(_v);
      if (_v.y > 2.7 && hit.point.y < _v.y) {
        B.LeftFoot.getWorldPosition(_t);
        B.RightFoot.getWorldPosition(_b);
        const left =
          Math.hypot(hit.point.x - _t.x, hit.point.z - _t.z) <= Math.hypot(hit.point.x - _b.x, hit.point.z - _b.z);
        c.additive('hit', {
          mask: left ? 'left-leg' : 'right-leg',
          weight: 0.3 * k,
          speed: 1.3,
          fadeIn: 0.03,
          fadeOut: 0.22,
        });
      }
    }
  }

  stagger() {
    const c = this.char,
      ctx = this.ctx;
    this.abortMove();
    this.staggered = true;
    this._state = 'stagger';
    this.stT = 0;
    this.stStage = 0;
    this.poise = POISE;
    this.poiseWait = 0;
    this.kneeDown = false;
    this.pivot = null;
    c.speed = 1.9;
    this.pos.y = 0;
    c.play('kneel_down', { fade: 0.2, at: 0.45, speed: 1, force: true });
    if (typeof c.additive === 'function' && (!c.has || c.has('hit_head')))
      c.additive('hit_head', { weight: 0.5, speed: 1.3, fadeIn: 0.02, fadeOut: 0.3 });
    this.sing(1);
    if (ctx.game && ctx.game.hitStop) ctx.game.hitStop(0.2);
    ctx.bus.emit('boss-stagger', { point: this.struck, pos: this.pos, weight: 'colossal' });
  }

  beginChange() {
    this.abortMove();
    this.changing = true;
    this.changeT = 0;
    this.invulnerable = true;
    this._state = 'change';
    this.pivot = null;
    this.pos.y = 0;
    this.char.speed = 1;
    this.rest(0.4);
    this.ctx.bus.emit('boss-phase', { phase: 2 });
  }

  die(hit) {
    const c = this.char;
    this.abortMove();
    this.alive = false;
    this._state = 'dead';
    this.staggered = false;
    this.pivot = null;
    this.pos.y = 0;
    this.fx.clear();
    c.speed = 1;
    this.struckAt = 0.15;
    if (c.has && c.has('hit')) c.play('hit', { fade: 0.1, at: this.struckAt, force: true });
    else {
      this.struckAt = 0;
      c.play(c.has && c.has('death_knees2') ? 'death_knees2' : 'death_knees', { fade: 0.3, force: true });
    }
    if (hit) {
      this.stage = 'idle';
      hit.weight = 'colossal';
      hit.last = true;
      this.flinch(hit);
    }
    this.sing(1);
    this.ctx.bus.emit('boss-died', {});
  }

  update(dt) {
    const c = this.char;
    if (this.puppet) {
      if (!this.wasPuppet) this.enterPuppet();
      const m = c.update(dt);
      if (this.puppet === 'root') this.applyMotion(m);
      this.updateLight(dt, true);
      this.kit.update(dt);
      this.updateSolids();
      return;
    }
    if (this.wasPuppet) this.leavePuppet();
    if (this._phase === 2 && !this.p2) this.enterPhase(2);
    this.restorePosture();
    this.clock += dt;
    this.tick++;
    this.yawPrev = this.yaw;
    this.xPrev = this.pos.x;
    this.zPrev = this.pos.z;
    const s = this.look(),
      st = this._state;
    for (const k of ORDER) if (this.cool[k] > 0) this.cool[k] -= dt;
    if (this.poiseWait > 0) this.poiseWait -= dt;
    else if (this.poise < POISE) this.poise = Math.min(POISE, this.poise + POISE_BACK * dt);
    if (this.staggerRest > 0) this.staggerRest -= dt;
    if (this.punish > 0) this.punish -= dt;
    if (this.pressed > 0) this.pressed = Math.max(0, this.pressed - PRESS_EBB * dt);
    this.hugged = s.dist < 3.9 ? this.hugged + dt : Math.max(0, this.hugged - dt * 2);
    this.farT = s.dist > 9 ? this.farT + dt : 0;

    this.watch(st);
    if (st === 'attack') this.movePre(dt, s);
    else if (st === 'idle' || st === 'walk') this.foot(dt, s);
    else if (st === 'change') {
      this.changeT += dt;
      const g = this.ctx.game,
        cine = this.ctx.cine;
      if (this.changeT > 2 && g && g.state === 'fight' && !(cine && cine.playing)) this.enterPhase(2);
    }

    this.clipPrev = this.handle && typeof this.handle.time === 'number' ? this.handle.time : 0;
    const m = c.update(dt);

    const now = this._state;
    if (now === 'attack') this.movePost(dt, s, m);
    else if (now === 'turn') this.pivotPost(m);
    else if (now === 'stagger') this.staggerPost(dt);
    else if (now === 'dead') {
      this.shift(m.x * 0.3, m.z * 0.3, 0);
    }
    this.guardUp = now !== 'dead' && now !== 'stagger' && this.guardCrossed() ? 1 : 0;
    this.applyPosture(dt);
    if (this.touch && (this.armedWith || this.bladeSpent)) {
      this.kit.sword.tip.getWorldPosition(_t);
      if (_t.y <= this.floorAt(_t.x, _t.z) + 0.22) this.touchDown();
    }
    if (this.slamDue) {
      const o = this.slamDue;
      this.slamDue = null;
      this.slam(o);
    }
    this.updateBladeStoneContact(dt);
    if (this.ctx.combat.sweepNow) {
      const u = this.ctx.combat.sweepNow(this.weapon, dt);
      if (u > 0 && u < 0.999 && this._state === 'attack' && this.recoil <= 0) this.rewindPose(u);
    }
    this.dress(dt);
    if ((this.tick & 1) === 0) this.updateBladeSplash(dt * 2);
    this.kit.update(dt);
    this.fx.update(dt);
    this.updateSolids();
  }

  enterPuppet() {
    this.wasPuppet = true;
    this.restorePosture();
    if (this.looking) {
      this.looking = 0;
      this.char.look(null);
    }
    if (this.move) this.abortMove();
    this.pivot = null;
    this.char.speed = 1;
    this.fx.clear();
    this.post.stoop = this.post.lower = this.post.up = 0;
    this.touch = null;
    this.ctx.combat.disarm(this.weapon);
    if (this.trail) this.trail.stop();
  }
  leavePuppet() {
    this.wasPuppet = false;
    this.pos.y = 0;
    this.char.speed = 1;
    this.bladeFresh = true;
    this.recoil = 0;
    if (this.alive && !this.changing) {
      this._state = 'idle';
      this.stage = 'idle';
      this.breath = Math.max(this.breath, 1.2);
      this.vel.x = this.vel.z = 0;
    }
  }

  watch(st) {
    const c = this.char;
    if (typeof c.look !== 'function') return;
    const p = this.ctx.player,
      want = this.alive && p.alive && st !== 'stagger' && st !== 'dead' && st !== 'turn' && st !== 'change';
    const mode = !want ? 0 : st === 'attack' ? 2 : 1;
    if (want) this.eye.set(p.pos.x, 1.5, p.pos.z);
    if (mode === this.looking) return;
    this.looking = mode;
    if (mode === 0) c.look(null);
    else if (mode === 1) c.look(this.eye, { weight: 0.9, speed: 4, head: 0.65, chest: 0.35, always: false });
    else c.look(this.eye, { weight: 0.8, speed: 5, head: 0.9, chest: 0, always: true });
  }

  look() {
    const p = this.ctx.player,
      s = this.s;
    const dx = p.pos.x - this.pos.x,
      dz = p.pos.z - this.pos.z;
    s.dist = Math.hypot(dx, dz);
    s.face = Math.atan2(dx, dz);
    s.bearing = angleDiff(s.face, this.yaw);
    return s;
  }

  applyMotion(m) {
    this.shift(m.x, m.z, m.yaw);
  }
  shift(x, z, yaw) {
    const y = this.yaw,
      c = Math.cos(y),
      s = Math.sin(y),
      dx = x * c + z * s,
      dz = -x * s + z * c;
    if (yaw) this.yaw = y + yaw;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP));
    let hit = false;
    for (let i = 0; i < n; i++) {
      this.pos.x += dx / n;
      this.pos.z += dz / n;
      if (this.collide(false)) hit = true;
    }
    return hit;
  }
  collide(hard) {
    const a = this.ctx.arena,
      p = this.pos,
      pl = this.ctx.player;
    if (this.flying) return false;
    let hit = a.resolve(p, this.radius);
    if (this.puppet) return hit;
    if (pl && pl.alive && pl !== this) {
      const dx = p.x - pl.pos.x,
        dz = p.z - pl.pos.z,
        d = Math.hypot(dx, dz),
        min = this.radius + HIS;
      if (d < min && d > 1e-4) {
        p.x = pl.pos.x + (dx / d) * min;
        p.z = pl.pos.z + (dz / d) * min;
        if (a.resolve(p, this.radius)) hit = true;
      }
    }
    if (this.clampToArena(p, this.wall, hard ? 99 : 0.1)) hit = true;
    return hit;
  }
  clampToArena(p, radius, most) {
    const b = this.ctx.arena.bounds;
    if (!b) return false;
    const ix = b.hx - b.r,
      iz = b.hz - b.r,
      lim = Math.max(0, b.r - radius);
    const cx = clamp(p.x, -ix, ix),
      cz = clamp(p.z, -iz, iz),
      dx = p.x - cx,
      dz = p.z - cz,
      d = Math.hypot(dx, dz);
    if (d <= lim + 1e-4) return false;
    const k = Math.min(d - lim, most) / d;
    p.x -= dx * k;
    p.z -= dz * k;
    return true;
  }

  foot(dt, s) {
    const p = this.ctx.player;
    if (!p.alive) {
      this.walk(0, 0, dt);
      return;
    }
    if (!this.ai) {
      if (this.forced) this.startMove(this.take());
      else this.walk(0, 0, dt);
      return;
    }
    const ab = Math.abs(s.bearing);
    this.breath -= dt;
    this.planT -= dt;
    if (this.blockedT > 0) this.blockedT -= dt;

    if (this.breath <= 0) {
      const name = this.choose(s);
      if (name) {
        this.startMove(name);
        return;
      }
    }
    if (ab > 2.0) {
      this.startPivot(s.bearing);
      return;
    }
    const rate = Math.min(1.5 + (this._phase === 2 ? 0.25 : 0), ab * 3 + 0.15) * dt;
    this.yaw += clamp(s.bearing, -rate, rate);

    if (this.planT <= 0) {
      this.planT = 1.4 + this.rand() * 1.8;
      this.side = this.rand() < 0.5 ? 1 : -1;
      this.still = this.rand() < 0.3;
    }
    const keepFar = this._phase === 2 ? 9 : 8,
      keepNear = 4.2;
    let vx = 0,
      vz = 0;
    if (ab > 1.2) {
      /* facing too far away: turn in place, don't step */
    } else if (s.dist > keepFar) vz = WALK.f;
    else if (s.dist < keepNear && this.breath > 0.3 && this.blockedT <= 0) vz = -WALK.b;
    else if (!this.still) {
      vx = this.side * WALK.s;
      vz = clamp((s.dist - 6.2) * 0.7, -1, 1.2);
    }
    if (this.cramped > 0 && ab <= 1.2) {
      this.cramped -= dt;
      const tx = -this.pos.x,
        tz = clamp(this.pos.z, -7, 9) - this.pos.z,
        l = Math.hypot(tx, tz);
      if (l > 0.6) {
        const y = this.yaw,
          sn = Math.sin(y),
          cs = Math.cos(y),
          f = (tx * sn + tz * cs) / l,
          sd = (tx * cs - tz * sn) / l;
        vx = sd * WALK.s;
        vz = f * (f > 0 ? WALK.f : WALK.b);
      }
    }
    const touched = this.walk(vx, vz, dt);
    if (touched) {
      if (vz < 0) this.blockedT = 1.5;
      if (vx) this.side = -this.side;
    }
  }
  openFor() {
    let t = 0,
      clipT = this.char.time;
    for (let i = this.pi; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.hold !== undefined) {
        t += i === this.pi ? Math.max(0, this.holdT) : typeof p.hold === 'function' ? p.hold(this) : p.hold;
        continue;
      }
      if (p.clip && i !== this.pi) clipT = p.at || 0;
      t += Math.max(0, p.to - clipT) / (p.speed || 1);
      clipT = p.to;
    }
    return t;
  }

  rest(fade) {
    const c = this.char;
    if (this.blend) {
      c.play('@move', { fade });
      c.move(0, 0);
    } else c.play(this.idleClip, { fade });
  }

  walk(vx, vz, dt) {
    const c = this.char,
      v = this.vel;
    v.x = damp(v.x, vx, 5, dt);
    v.z = damp(v.z, vz, 5, dt);
    const sp = Math.hypot(v.x, v.z),
      moving = sp >= 0.25;
    c.speed = 1;
    if (this.blend) {
      if (c.clipName !== '@move') c.play('@move', { fade: 0.45 });
      this._state = moving ? 'walk' : 'idle';
      if (!moving) {
        c.move(0, 0);
        this.clampToArena(this.pos, this.wall, 0.02);
        return false;
      }
      const px = this.pos.x,
        pz = this.pos.z,
        touched = this.shift(v.x * dt, v.z * dt, 0);
      const ax = (this.pos.x - px) / dt,
        az = (this.pos.z - pz) / dt,
        y = this.yaw,
        sn = Math.sin(y),
        cs = Math.cos(y);
      let rl = ax * cs - az * sn,
        rf = ax * sn + az * cs;
      if (Math.hypot(rl, rf) < 0.3) {
        rl = rf = 0;
        if (touched) {
          v.x *= 0.6;
          v.z *= 0.6;
        }
      }
      c.move(rl, rf);
      return touched;
    }
    if (!moving) {
      if (this._state !== 'idle' || c.clipName !== this.idleClip) {
        this._state = 'idle';
        c.play(this.idleClip, { fade: 0.5 });
      }
      return false;
    }
    this._state = 'walk';
    const clip = Math.abs(v.z) >= Math.abs(v.x) ? (v.z > 0 ? 'walk_f' : 'walk_b') : v.x > 0 ? 'walk_l' : 'walk_r';
    const a = c.play(clip, { fade: 0.4, speed: 1 });
    if (a) a.timeScale = clamp(sp / this.ground[clip], 0.35, 1.1);
    return this.shift(v.x * dt, v.z * dt, 0);
  }

  startPivot(bearing) {
    const c = this.char,
      clip = Math.abs(bearing) > 2.5 ? 'turn_180' : bearing > 0 ? 'turn_l' : 'turn_r';
    let want = bearing;
    if (clip === 'turn_180' && bearing > 0) want = bearing - Math.PI * 2;
    this.pivot = clip;
    this.pivotK = want / TURNS[clip];
    this._state = 'turn';
    this.vel.x = this.vel.z = 0;
    const a = c.play(clip, { fade: 0.25, speed: 1, force: true });
    if (a) a.timeScale = 1;
    c.speed = 0.6;
  }
  pivotPost(m) {
    const c = this.char;
    this.shift(m.x * 0.4, m.z * 0.4, m.yaw * this.pivotK);
    if (c.done || c.time >= c.duration - 0.04) {
      this.pivot = null;
      c.speed = 1;
      this._state = 'idle';
      this.rest(0.35);
      this.breath = Math.min(this.breath, 0.35);
    }
  }

  take() {
    const n = this.forced;
    this.forced = null;
    this.forcedMove = true;
    return n;
  }
  choose(s) {
    if (this.forced) return this.take();
    let total = 0,
      pick = null;
    this.denied = 0;
    for (const name of ORDER) total += this.moveWeight(MOVES[name], s);
    if (this.denied) this.cramped = total <= 0 ? 1.4 : Math.max(this.cramped, 0.5);
    if (total <= 0) {
      if (this.denied) this.breath = 0.3;
      return null;
    }
    let r = this.rand() * total;
    for (const name of ORDER) {
      const w = this.moveWeight(MOVES[name], s);
      if (w <= 0) continue;
      pick = name;
      r -= w;
      if (r <= 0) break;
    }
    return pick;
  }
  moveWeight(mv, s) {
    if (mv.phase > this._phase || this.cool[mv.name] > 0) return 0;
    if (s.dist < mv.range[0] || s.dist > mv.range[1]) return 0;
    if (Math.abs(angleDiff(s.bearing, mv.aim || 0)) > mv.arc) return 0;
    if (mv.fits && !mv.fits(this, s)) return 0;
    if (!this.arcFree(mv, s)) {
      this.denied++;
      return 0;
    }
    let w = mv.weight;
    if (this._phase === 2 && mv.phase === 1) w *= 0.75;
    if (mv.name === this.last) w *= 0.12;
    else if (mv.name === this.last2) w *= 0.5;
    if (mv.w) w *= mv.w(this, s);
    return w;
  }
  breathe() {
    const close = this.s.dist < 4.8,
      r = this.rand();
    let t =
      this._phase === 2
        ? close
          ? lerp(0.25, 0.7, r)
          : lerp(0.6, 1.2, r)
        : close
          ? lerp(0.35, 0.9, r)
          : lerp(0.9, 1.7, r);
    if (this.hp < this.hpMax * 0.2) t *= 0.8;
    if (close && this.pressed > PRESSED) return t * 0.4;
    return t * this.rules.rest;
  }

  startMove(name) {
    const mv = MOVES[name];
    if (!mv) return;
    for (const k in this.var) delete this.var[k];
    this.move = mv;
    this.moveName = name;
    this._state = 'attack';
    this.stage = null;
    this.said = false;
    this.pi = -1;
    this.hitN = 0;
    this.aim = mv.aim || 0;
    this.pivot = null;
    this.moveFrom.copy(this.pos);
    this.recoil = 0;
    this.cramped = 0;
    this.vel.x = this.vel.z = 0;
    if (mv.begin) mv.begin(this);
    this.parts.length = 0;
    for (const p of mv.parts) if (!p.when || p.when(this)) this.parts.push(p);
    const tl = timeline(this.parts, this, this._phase === 2 ? this.rules.quick : 1);
    this.hits = tl.hits;
    this.eta = tl.eta;
    this.cool[name] = (mv.cool || 0) * (mv.coolPressed !== undefined && this.pressed > PRESSED ? mv.coolPressed : 1);
    this.last2 = this.last;
    this.last = name;
    this.nextPart();
  }

  nextPart() {
    const c = this.char,
      ctx = this.ctx;
    this.pi++;
    if (this.pi >= this.parts.length) {
      this.endMove();
      return;
    }
    const p = (this.part = this.parts[this.pi]);
    if (this.pi > 0 && p.stage === 'windup' && this.stage !== 'windup' && !ctx.player.alive) {
      this.endMove();
      return;
    }
    if (p.clip) {
      const a = c.play(p.clip, {
        at: p.at || 0,
        fade: p.fade === undefined ? 0.2 : p.fade,
        speed: 1,
        force: true,
        loop: false,
      });
      if (a) a.timeScale = 1;
      this.handle = a || null;
    }
    this.partFrom = c.time;
    this.partClip = c.time;
    if (p.aim !== undefined) this.aim = p.aim;
    this.holdT = p.hold !== undefined ? Math.max(0.02, typeof p.hold === 'function' ? p.hold(this) : p.hold) : -1;
    this.holdLen = Math.max(0.02, this.holdT);
    c.speed = this.partSpeed(p);
    if (p.arms && typeof c.overlay === 'function') {
      if (!this.armsOn || this.armsOn.clip !== p.arms.clip) {
        const h = c.overlay(p.arms.clip, {
          mask: 'arms',
          fade: p.fade === undefined ? 0.25 : p.fade,
          at: p.arms.t0,
          hold: true,
          loop: false,
          force: true,
        });
        if (h) {
          h.paused = true;
          this.armsOn = { clip: p.arms.clip, handle: h };
        }
      }
    } else if (this.armsOn) {
      this.armsOn = null;
      if (c.overlayOff) c.overlayOff(p.fade === undefined ? 0.15 : p.fade);
    }
    if (p.arm) {
      if (this.armedWith !== p.arm) {
        this.bladeSpent = false;
        this.bladeHit = false;
        this.bladeOn = 0;
        this.armedWith = p.arm;
        ctx.combat.arm(this.weapon, {
          damage: p.arm.damage,
          poise: p.arm.poise,
          heavy: p.arm.heavy,
          knockdown: !!p.arm.knockdown,
          weight: p.arm.weight,
          sweep: true,
        });
        ctx.bus.emit('swing', { who: 'boss', heavy: p.arm.heavy, weapon: this.weapon });
        if (this.trail) this.trail.start();
        this.touch = null;
      }
      if (p.touch) this.touch = p.touch;
    } else if (this.armedWith) this.disarm();
    if (p.stage && (p.stage !== this.stage || p.beat)) {
      this.stage = p.stage;
      if (p.stage === 'windup') {
        if (!this.said) {
          this.said = true;
          ctx.bus.emit('boss-move', { name: this.moveName, stage: 'windup', eta: this.eta, hits: this.hits });
        }
      } else if (p.stage === 'active') {
        ctx.bus.emit('boss-move', { name: this.moveName, stage: 'active', n: this.hitN, of: this.hits });
        this.hitN++;
      } else
        ctx.bus.emit('boss-move', {
          name: this.moveName,
          stage: p.stage,
          open: p.stage === 'recover' ? this.openFor() : undefined,
        });
    }
    if (p.slam) this.slamDue = p.slam;
    if (p.on) p.on(this);
  }
  disarm() {
    this.armedWith = null;
    this.touch = null;
    this.ctx.combat.disarm(this.weapon);
    if (this.trail) this.trail.stop();
  }

  movePre(dt, s) {
    const p = this.part,
      c = this.char;
    if (!p) return;
    if (this.recoil > 0) {
      c.speed = Math.max(0.6, this.partSpeed(p));
      return;
    }
    if (this.bounced) {
      this.bounced = false;
      if (this.armedWith) {
        const arm = this.armedWith;
        this.disarm();
        this.bouncedArm = arm;
        this.touch = null;
        this.slamDue = null;
        this.bounce = 1e-4;
        if (this.handle) this.handle.timeScale = arm.knockdown ? -1.35 : -0.7;
      }
    }
    if (this.bounce > 0) {
      c.speed = Math.max(0.8, this.partSpeed(p));
      return;
    }
    if (p.track) {
      const k = p.track * dt * (this._phase === 2 ? 1.15 : 1);
      if (
        this.forcedMove ||
        !this.move.reach ||
        this.move.reach.line ||
        this.move.name === 'leap' ||
        !this.arcBlocked(this.move, this.moveFrom.x, this.moveFrom.z, s.face - (this.move.aim || 0))
      )
        this.yaw += clamp(angleDiff(s.face - this.aim, this.yaw), -k, k);
    }
    c.speed = this.partSpeed(p);
    if (this.bladeOn > 0) {
      this.bladeOn -= dt;
      c.speed *= 0.18;
    }
    if (this.armsOn && p.arms) {
      const u = this.holdT >= 0 ? 1 : clamp((c.time - this.partFrom) / Math.max(1e-4, p.to - this.partFrom));
      this.armsOn.handle.time = lerp(p.arms.t0, p.arms.t1, u);
    }
  }
  partSpeed(p) {
    if (this.holdT >= 0) return p.speed || 0.03;
    return (p.speed || 1) * (this._phase === 2 && this.stage === 'windup' ? this.rules.quick : 1);
  }

  movePost(dt, s, m) {
    const c = this.char;
    if (this.recoil > 0) {
      this.recoil += dt;
      const h = this.handle;
      if (h && this.recoil >= RECOIL.back && h.timeScale < 0) h.timeScale = 0;
      if (this.recoil >= RECOIL.end) {
        if (h) h.timeScale = 1;
        this.recoil = 0;
        this.endMove();
      }
      return;
    }
    if (this.bounce > 0) {
      this.bounce += dt;
      const fall = !!(this.bouncedArm && this.bouncedArm.knockdown);
      if (fall && this.handle) {
        const u = 1 - Math.min(1, this.bounce / BOUNCE_FALL);
        this.handle.timeScale = -1.35 * u * Math.sqrt(u);
      }
      if (this.bounce >= (fall ? BOUNCE_FALL : BOUNCE)) {
        const arm = this.bouncedArm,
          h = this.handle;
        this.bounce = 0;
        this.bouncedArm = null;
        let j = this.pi + 1;
        while (j < this.parts.length && this.parts[j].arm === arm) j++;
        if (!fall && j < this.parts.length && this.parts[j].clip) {
          if (h) h.timeScale = 1;
          this.pi = j - 1;
          this.nextPart();
        } else {
          const rest = fall ? FALL_REST : BLOCKED_REST;
          if (h) h.timeScale = 0;
          this.recoil = RECOIL.end - rest;
          if (this.stage !== 'recover') {
            this.stage = 'recover';
            this.ctx.bus.emit('boss-move', { name: this.moveName, stage: 'recover', open: rest });
          }
        }
      }
      return;
    }
    for (let guard = 0; guard < 4 && this._state === 'attack'; guard++) {
      const p = this.part;
      if (guard === 0) {
        const tr = p.travel === undefined ? 1 : typeof p.travel === 'function' ? p.travel(this) : p.travel,
          bk = p.back === undefined ? tr : p.back;
        let mz = m.z * (m.z >= 0 ? tr : bk);
        if (mz > 0 && s.dist < this.radius + 2.1 && Math.abs(s.bearing) < 1.1) mz = 0;
        let turn = m.yaw;
        if (p.spin && this.holdT < 0) {
          const span = p.to - this.partFrom;
          if (span > 1e-4) turn += (p.spin * clamp(c.time - this.partClip, 0, span)) / span;
          this.partClip = c.time;
        }
        this.shift(m.x * (p.side === undefined ? Math.min(tr, 1) : p.side), mz, turn);
        if (p.each) p.each(this, dt);
      }
      if (this.holdT >= 0) {
        this.holdT -= dt;
        if (this.holdT > 0) return;
        this.holdT = -1;
        this.nextPart();
        continue;
      }
      if (c.time >= p.to - 1e-4 || c.done) {
        this.nextPart();
        continue;
      }
      return;
    }
  }

  endMove() {
    const c = this.char,
      name = this.moveName;
    if (this.armedWith) this.disarm();
    if (name && this.stage !== 'recover') this.ctx.bus.emit('boss-move', { name, stage: 'recover', open: 0 });
    if (this.move && this.move.end) this.move.end(this);
    if (this.armsOn) {
      this.armsOn = null;
      if (c.overlayOff) c.overlayOff(0.25);
    }
    this.move = null;
    this.moveName = null;
    this.part = null;
    this.parts.length = 0;
    this.stage = 'idle';
    this.holdT = -1;
    this.touch = null;
    this.flying = false;
    this.forcedMove = false;
    if (this.recoil > 0 || this.bounce > 0) {
      this.recoil = this.bounce = 0;
      if (this.handle) this.handle.timeScale = 1;
    }
    this.bounced = false;
    this.bladeSpent = false;
    this.bladeHit = false;
    this.bladeOn = 0;
    this.pos.y = 0;
    c.speed = 1;
    this._state = 'idle';
    this.rest(0.45);
    this.breath = this.breathe();
    this.planT = 0;
  }
  abortMove() {
    if (this.armedWith) this.disarm();
    else {
      this.ctx.combat.disarm(this.weapon);
      if (this.trail) this.trail.stop();
    }
    if (this.armsOn) {
      this.armsOn = null;
      if (this.char.overlayOff) this.char.overlayOff(0.2);
    }
    this.move = null;
    this.moveName = null;
    this.part = null;
    this.parts.length = 0;
    this.stage = 'idle';
    this.holdT = -1;
    this.char.speed = 1;
    this.pos.y = 0;
    this.touch = null;
    this.slamDue = null;
    this.flying = false;
    this.forcedMove = false;
    if (this.recoil > 0 || this.bounce > 0) {
      this.recoil = this.bounce = 0;
      if (this.handle) this.handle.timeScale = 1;
    }
    this.bounced = false;
    this.bladeSpent = false;
    this.bladeHit = false;
    this.bladeOn = 0;
  }

  slam(o) {
    const ctx = this.ctx,
      sw = this.kit.sword,
      at = this.slamAt;
    sw.tip.getWorldPosition(_t);
    sw.base.getWorldPosition(_b);
    if (o.at === 'feet') at.set(this.pos.x, WATER_Y, this.pos.z);
    else if (o.at === 'blade') {
      this.fx.burst(lerp(_b.x, _t.x, 0.25), lerp(_b.z, _t.z, 0.25), _t.x, _t.z, o.power);
      at.set(lerp(_b.x, _t.x, 0.6), WATER_Y, lerp(_b.z, _t.z, 0.6));
    } else at.set(_t.x, WATER_Y, _t.z);
    if (o.at !== 'blade' && ctx.water) ctx.water.ripple(at.x, at.z, 3 * o.power, 0.9);
    ctx.bus.emit('boss-slam', {
      pos: at,
      radius: o.r,
      power: o.power,
      weapon: o.at !== 'feet',
      line: o.at === 'blade',
    });
  }

  stoneColliders() {
    if (this.stones) return this.stones;
    const a = this.ctx.arena,
      L = (this.stones = []);
    if (!a) return L;
    for (const c of a.piers || []) L.push({ x: c.x, z: c.z, r: PIER_R, h: 99 });
    if (a.piers && a.piers.length) for (const c of LEAVES) L.push({ x: c.x, z: c.z, r: c.r, h: 99 });
    for (const c of a.colliders || []) L.push({ x: c.x, z: c.z, r: Math.max(0.2, c.r - 0.05), h: stoneHeight(c) });
    return L;
  }
  arcBlocked(mv, x, z, yaw, len = 0) {
    const R = mv.reach,
      L = this.stoneColliders();
    if (!R || !L.length) return false;
    if (R.line) {
      const h = yaw + (mv.aim || 0),
        fx = Math.sin(h),
        fz = Math.cos(h),
        far = len + R.line,
        ez = z + fz * far;
      if (ez > WEST || ez < EAST) return true;
      for (let i = 0; i < L.length; i++) {
        const c = L[i],
          along = (c.x - x) * fx + (c.z - z) * fz,
          t = clamp(along, 0, far),
          d = Math.hypot(c.x - x - fx * t, c.z - z - fz * t);
        if (d < c.r + R.width + ARC_CLEAR) return true;
        const side = (c.x - x) * fz - (c.z - z) * fx;
        if (along > far - R.back && along < far + c.r && side < 0 && -side < R.right + c.r + ARC_CLEAR) return true;
      }
      return false;
    }
    for (let i = 0; i < L.length; i++) {
      const c = L[i],
        tab = c.h > 5 ? R.any : R.low,
        most = c.h > 5 ? R.anyMax : R.lowMax;
      const dx = c.x - x,
        dz = c.z - z,
        d = Math.hypot(dx, dz),
        need = d - c.r - ARC_CLEAR;
      if (need > most) continue;
      if (need <= 0) return true;
      const mid = angleDiff(Math.atan2(dx, dz), yaw),
        half = Math.asin(Math.min(1, (c.r + ARC_CLEAR) / d));
      for (let k = Math.round((mid - half) / BIN), k1 = Math.round((mid + half) / BIN); k <= k1; k++)
        if (tab[((k % BINS) + BINS) % BINS] > need) return true;
    }
    for (let k = 0; k < BINS; k++) {
      const r = R.any[k];
      if (r <= 0) continue;
      const zz = z + Math.cos(yaw + k * BIN) * (r + ARC_CLEAR);
      if (zz > WEST || zz < EAST) return true;
    }
    return false;
  }
  guardCrossed() {
    const L = this.stoneColliders();
    if (!L.length) return false;
    const y = this.yaw,
      fx = Math.sin(y),
      fz = Math.cos(y),
      x = this.pos.x,
      z = this.pos.z,
      far = 6.6,
      ez = z + fz * far;
    if (ez > WEST || ez < EAST) return true;
    for (let i = 0; i < L.length; i++) {
      const c = L[i];
      if (c.h < 5) continue;
      const t = clamp((c.x - x) * fx + (c.z - z) * fz, 0, far),
        d = Math.hypot(c.x - x - fx * t, c.z - z - fz * t);
      if (d < c.r + 1.5) return true;
    }
    return false;
  }
  leapSpot(out) {
    const p = this.ctx.player,
      REACH = 4.8;
    let dx = p.pos.x - this.pos.x,
      dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const go = Math.max(-4, d - REACH);
    out.set(this.pos.x + dx * go, 0, this.pos.z + dz * go);
    this.ctx.arena.resolve(out, this.radius);
    this.clampToArena(out, this.wall, 99);
    return out;
  }
  arcFree(mv, s) {
    if (!mv.reach) return true;
    if (mv.name === 'leap') {
      const to = this.leapSpot(_v),
        p = this.ctx.player,
        x = to.x,
        z = to.z;
      if (Math.abs(this.pos.x) > 6.4 || Math.abs(x) > 6.4) return false;
      return (
        !this.arcBlocked(mv, this.pos.x, this.pos.z, s.face - (mv.aim || 0)) &&
        !this.arcBlocked(mv, x, z, Math.atan2(p.pos.x - x, p.pos.z - z) - (mv.aim || 0))
      );
    }
    return !this.arcBlocked(mv, this.pos.x, this.pos.z, s.face - (mv.aim || 0), s.dist);
  }
  rewindPose(u) {
    const c = this.char,
      h = this.handle;
    this.yaw = this.yawPrev + angleDiff(this.yaw, this.yawPrev) * u;
    this.pos.x = lerp(this.xPrev, this.pos.x, u);
    this.pos.z = lerp(this.zPrev, this.pos.z, u);
    if (h && typeof h.time === 'number') h.time = this.clipPrev + (h.time - this.clipPrev) * u;
    c.update(0);
    this.post.on = false;
    this.applyPosture(0);
    if (this.ctx.combat.resync) this.ctx.combat.resync(this.weapon);
  }
  segmentHitsStone(a, b) {
    const L = this.stoneColliders(),
      dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z,
      l2 = dx * dx + dz * dz;
    for (let i = 0; i < L.length; i++) {
      const c = L[i],
        t = segmentEntersCylinder(a, dx, dy, dz, l2, c.x, c.z, c.r, c.h);
      if (t < 0) continue;
      _sp.set(a.x + dx * t, a.y + dy * t, a.z + dz * t);
      _sn.set(_sp.x - c.x, 0, _sp.z - c.z);
      if (_sn.lengthSq() < 1e-8) _sn.set(a.x - c.x, 0, a.z - c.z);
      if (_sn.lengthSq() < 1e-8) _sn.set(0, 0, 1);
      _sn.normalize();
      return true;
    }
    if (b.z > WEST + 0.3 || b.z < EAST - 0.3) {
      const w = b.z > 0 ? WEST + 0.3 : EAST - 0.3,
        t = Math.abs(dz) > 1e-6 ? clamp((w - a.z) / dz) : 1;
      _sp.set(a.x + dx * t, a.y + dy * t, w);
      _sn.set(0, 0, b.z > 0 ? -1 : 1);
      return true;
    }
    return false;
  }
  updateBladeStoneContact(_dt) {
    const sw = this.kit.sword,
      ctx = this.ctx;
    sw.base.getWorldPosition(_b);
    sw.tip.getWorldPosition(_t);
    if (this.bladeFresh) {
      this.bladeFresh = false;
      this.bPrev.copy(_b);
      this.tPrev.copy(_t);
      this.inStone = this.segmentHitsStone(_b, _t);
      return;
    }
    const travel = Math.max(_t.distanceTo(this.tPrev), _b.distanceTo(this.bPrev)),
      n = Math.min(10, Math.max(1, Math.ceil(travel / 0.25)));
    let hit = 0;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      _a0.lerpVectors(this.bPrev, _b, u);
      _b0.lerpVectors(this.tPrev, _t, u);
      if (this.segmentHitsStone(_a0, _b0)) {
        hit = k;
        break;
      }
    }
    if (!hit) {
      this.inStone = false;
      this.bPrev.copy(_b);
      this.tPrev.copy(_t);
      return;
    }
    if (this.inStone || this._state !== 'attack' || !this.move || this.recoil > 0 || this.flying) {
      this.bPrev.copy(_b);
      this.tPrev.copy(_t);
      return;
    }
    const live = !!this.armedWith,
      heavy = live && (this.armedWith.heavy || this.armedWith.weight === 'colossal'),
      name = this.moveName,
      h = this.handle;
    this.clashAt.copy(_sp);
    this.clashN.copy(_sn);
    this.clashDir.subVectors(_t, this.tPrev);
    if (this.clashDir.lengthSq() < 1e-8) this.clashDir.copy(_sn).negate();
    this.clashDir.normalize();
    this.rewindPose((hit - 1) / n);
    this.recoilUp = this.post.up;
    for (let i = 0; i < 3; i++) {
      sw.base.getWorldPosition(_b);
      sw.tip.getWorldPosition(_t);
      if (!this.segmentHitsStone(_b, _t)) break;
      this.recoilUp = this.post.up = Math.min(1, this.post.up + 0.36);
      this.restorePosture();
      this.applyPosture(0);
    }
    if (this.armedWith) this.disarm();
    else {
      ctx.combat.disarm(this.weapon);
      if (this.trail) this.trail.stop();
    }
    this.touch = null;
    this.slamDue = null;
    this.recoil = 1e-4;
    this.inStone = false;
    if (h) h.timeScale = -0.5;
    this.stage = 'recover';
    ctx.bus.emit('boss-move', { name, stage: 'recover', open: RECOIL.end, recoil: true });
    ctx.bus.emit('clash', {
      point: this.clashAt,
      stone: true,
      dir: this.clashDir,
      normal: this.clashN,
      weight: heavy ? 'colossal' : 'heavy',
      heavy: true,
      who: 'boss',
    });
    if (ctx.game && ctx.game.hitStop) ctx.game.hitStop(RECOIL.stop);
    sw.base.getWorldPosition(this.bPrev);
    sw.tip.getWorldPosition(this.tPrev);
  }

  lungeAim() {
    this.var.reach = clamp((this.s.dist - 4.7) / 1.35, 0.4, 6.5);
  }

  leapStart() {
    const p = this.ctx.player,
      ctx = this.ctx;
    this.leapFrom.copy(this.pos);
    this.leapSpot(this.leapTo);
    this.var.yaw = Math.atan2(p.pos.x - this.leapTo.x, p.pos.z - this.leapTo.z) - this.aim;
    this.flying = true;
    if (ctx.water) ctx.water.ripple(this.pos.x, this.pos.z, 2.5, 1.2);
  }
  leapFly() {
    const pl = this.ctx.player,
      to = this.leapTo,
      t = this.char.time,
      u = smooth((t - 0.56) / 0.9);
    if (pl.alive) {
      const dx = to.x - pl.pos.x,
        dz = to.z - pl.pos.z,
        d = Math.hypot(dx, dz),
        min = this.radius + HIS + 0.6;
      if (d < min) {
        if (d > 1e-3) {
          const k = Math.min(min - d, 0.2) / d;
          to.x += dx * k;
          to.z += dz * k;
        } else {
          to.x -= Math.sin(this.yaw) * 0.2;
          to.z -= Math.cos(this.yaw) * 0.2;
        }
        this.ctx.arena.resolve(to, this.radius);
      }
    }
    this.pos.x = lerp(this.leapFrom.x, to.x, u);
    this.pos.z = lerp(this.leapFrom.z, to.z, u);
    this.yaw += angleDiff(this.var.yaw, this.yaw) * Math.min(1, u * 1.5 + 0.02);
  }
  leapLand() {
    const ctx = this.ctx;
    this.pos.x = this.leapTo.x;
    this.pos.z = this.leapTo.z;
    this.flying = false;
    this.collide(true);
    if (ctx.water) ctx.water.ripple(this.pos.x, this.pos.z, 4, 1.6);
    ctx.bus.emit('land', { who: 'boss', pos: this.pos, hard: true });
  }
  leapRing() {
    const p = this.ctx.player,
      x = this.slamAt.x,
      z = this.slamAt.z;
    const g = this.fx.ring(x, z, {
      speed: 12,
      max: 11,
      damage: DAMAGE.leapRing,
      r0: 0.3,
      band: 0.4,
      quiet: 0.1,
      color: COLORS.PALE,
      power: 0.8,
      name: 'leap',
    });
    if (g && p.invulnerable && Math.hypot(p.pos.x - x, p.pos.z - z) < 3.2) g.done = true;
  }

  stompLand() {
    const ctx = this.ctx,
      p = ctx.player,
      B = this.char.bones,
      foot = B.LeftToeBase || B.LeftFoot,
      at = this.footAt;
    if (foot) foot.getWorldPosition(at);
    else at.copy(this.pos);
    at.y = WATER_Y;
    if (ctx.water) ctx.water.ripple(at.x, at.z, 3.5, 1.2);
    ctx.bus.emit('boss-slam', { pos: at, radius: STOMP.radius, power: 0.8 });
    if (p.alive && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < STOMP.radius) {
      _d.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
      if (_d.lengthSq() < 1e-6) _d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      _d.normalize();
      ctx.combat.strike({
        attacker: this,
        target: p,
        point: new THREE.Vector3(p.pos.x, 0.5, p.pos.z),
        dir: _d.clone(),
        damage: STOMP.damage,
        poise: STOMP.poise,
        heavy: STOMP.heavy,
        unblockable: true,
        kind: 'stomp',
      });
    }
  }

  sing(strength) {
    this.sung = Math.max(this.sung, strength);
  }
  choraleRing() {
    this.sing(1);
    this.fx.ring(this.pos.x, this.pos.z, {
      speed: 8,
      max: 22,
      damage: DAMAGE.chorale,
      r0: 1.6,
      band: 0.4,
      color: COLORS.GOLD,
      power: 1,
      name: 'chorale',
    });
  }
  hymnCast() {
    this.sing(0.6);
    this.fx.hymn(this.hp < this.hpMax * 0.25 ? 8 : 7, DAMAGE.hymn);
  }
  hymnLoose() {
    this.fx.hymnLoose(0.46, 0.3);
  }
  tideLoose() {
    if (this.var.tided) return;
    this.var.tided = true;
    const a = this.yaw + this.aim,
      fx = Math.sin(a),
      fz = Math.cos(a);
    this.sing(0.8);
    this.fx.tide(this.pos.x + fx * 6.2, this.pos.z + fz * 6.2, fx, fz, {
      speed: 11,
      width: 46,
      max: 40,
      damage: DAMAGE.wave,
    });
  }

  staggerPost(dt) {
    const c = this.char;
    this.stT += dt;
    if (!this.kneeDown && this.stStage === 0 && c.time >= 1.5) {
      const KL = c.bones.LeftLeg,
        KR = c.bones.RightLeg;
      let low = 0;
      if (KL && KR) {
        KL.getWorldPosition(_v);
        KR.getWorldPosition(_t);
        low = Math.min(_v.y, _t.y);
        if (_t.y < _v.y) _v.copy(_t);
      } else _v.copy(this.pos);
      if (low <= 0.3 || c.time >= 2.2) {
        this.kneeDown = true;
        this.footAt.copy(_v);
        this.footAt.y = WATER_Y;
        if (this.ctx.water) this.ctx.water.ripple(this.footAt.x, this.footAt.z, 3.5, 1.3);
        this.ctx.bus.emit('boss-slam', { pos: this.footAt, radius: 3.2, power: 0.9 });
      }
    }
    if (this.stStage === 0 && (c.done || c.time >= c.duration - 0.05)) {
      this.stStage = 1;
      c.speed = 1;
      c.play('kneel_idle', { fade: 0.25, loop: true });
    }
    if (this.stStage < 2 && this.stT >= STAGGER_TIME) {
      this.stStage = 2;
      this.staggered = false;
      this.staggerRest = STAGGER_REST;
      c.speed = 1.5;
      const a = c.play('kneel_up', { fade: 0.25, speed: 1, force: true });
      if (a) a.timeScale = 1;
    } else if (this.stStage === 2 && (c.done || c.time >= c.duration - 0.35)) {
      c.speed = 1;
      this._state = 'idle';
      this.rest(0.4);
      this.breath = 0.4;
    }
  }

  restorePosture() {
    const P = this.post;
    if (!P.on) return;
    for (let i = 0; i < P.bones.length; i++) P.bones[i].quaternion.copy(P.saved[i]);
    P.on = false;
  }

  applyPosture(dt) {
    const P = this.post,
      p = this.part,
      sw = this.kit.sword;
    const rate = p && p.snap ? 26 : 8;
    P.stoop = damp(P.stoop, p && p.stoop ? p.stoop : 0, rate, dt);
    P.lower = damp(P.lower, p && p.lower ? p.lower : 0, rate, dt);
    P.up = damp(
      P.up,
      this._state === 'dead'
        ? 1
        : this.recoil > 0
          ? Math.max(this.recoilUp, this.guardUp)
          : p
            ? p.up === 'near'
              ? this.guardUp
              : p.up || 0
            : this.guardUp,
      this._state === 'dead' ? 9 : 6,
      dt,
    );
    this.riding = false;
    const blade = !!P.hand && !!sw && !!sw.tip && !!sw.base && !this.kit.swordPlanted;
    if (!blade) return;
    const lean = P.stoop >= 0.004 || P.lower >= 0.004,
      up = P.up >= 0.004 && !!P.armR;
    if (!lean && !up && !this.isTipBelowFloor()) return;
    for (let i = 0; i < P.bones.length; i++) P.saved[i].copy(P.bones[i].quaternion);
    P.on = true;
    if (up) {
      sw.base.getWorldPosition(_b);
      sw.tip.getWorldPosition(_t);
      _d.subVectors(_t, _b);
      if (_d.lengthSq() > 1e-6) {
        _d.normalize();
        const ang = Math.acos(clamp(_d.y, -1, 1)) * P.up;
        if (ang > 1e-3) {
          _ax.crossVectors(_d, UP);
          if (_ax.lengthSq() > 1e-8) {
            _rot.setFromAxisAngle(_ax.normalize(), Math.min(ang, 1.2));
            this.rotateBoneInWorld(P.armR, _rot);
            if (P.armL && this.kit.leftOn > 0.5) this.rotateBoneInWorld(P.armL, _rot);
          }
        }
      }
    }
    if (lean) {
      sw.base.getWorldPosition(_b);
      sw.tip.getWorldPosition(_t);
      _d.subVectors(_t, _b);
      _d.y = 0;
      if (_d.lengthSq() > 1e-6) {
        _ax.crossVectors(UP, _d).normalize();
        if (P.stoop >= 0.004 && P.spine.length) {
          _rot.setFromAxisAngle(_ax, P.stoop / P.spine.length);
          for (const bone of P.spine) this.rotateBoneInWorld(bone, _rot);
        }
        if (P.lower >= 0.004 && P.armR) {
          _rot.setFromAxisAngle(_ax, P.lower);
          this.rotateBoneInWorld(P.armR, _rot);
        }
      }
    }
    this.keepTipAboveFloor();
  }
  floorAt(x, z) {
    const a = this.ctx.arena;
    return (a && a.ground ? a.ground(x, z) : 0) + RIDE;
  }
  isTipBelowFloor() {
    this.kit.sword.tip.getWorldPosition(_t);
    return _t.y < this.floorAt(_t.x, _t.z);
  }
  keepTipAboveFloor() {
    const P = this.post,
      sw = this.kit.sword;
    let wrist = 0;
    for (let i = 0; i < 4; i++) {
      sw.tip.getWorldPosition(_t);
      const fy = this.floorAt(_t.x, _t.z);
      if (_t.y >= fy - 0.003) break;
      const arms = wrist >= WRIST - 1e-3,
        pivot = arms ? P.armR : P.hand;
      if (!pivot) break;
      pivot.getWorldPosition(_v);
      _d.subVectors(_t, _v);
      const len = _d.length(),
        flat = Math.hypot(_d.x, _d.z);
      if (len < 1e-3 || flat < 0.2 * len) break;
      let ang = Math.asin(clamp((fy - _v.y) / len, -1, 1)) - Math.atan2(_d.y, flat);
      if (ang < 1e-4) break;
      _ax.set(_d.x, 0, _d.z).normalize();
      _ax.crossVectors(_ax, UP).normalize();
      if (arms) {
        ang = Math.min(ang, 0.7);
        _rot.setFromAxisAngle(_ax, ang);
        this.rotateBoneInWorld(P.armR, _rot);
        if (P.armL && this.kit.leftOn > 0.5) this.rotateBoneInWorld(P.armL, _rot);
      } else {
        ang = Math.min(ang, WRIST - wrist);
        wrist += ang;
        _rot.setFromAxisAngle(_ax, ang);
        this.rotateBoneInWorld(P.hand, _rot);
      }
      this.riding = true;
    }
    return this.riding;
  }
  rotateBoneInWorld(bone, worldRot) {
    bone.parent.getWorldQuaternion(_pw);
    _q2.copy(_pw).invert().multiply(worldRot).multiply(_pw).multiply(bone.quaternion);
    bone.quaternion.copy(_q2);
  }

  touchDown() {
    const o = this.touch,
      ctx = this.ctx,
      sw = this.kit.sword,
      at = this.slamAt;
    this.touch = null;
    sw.tip.getWorldPosition(_t);
    sw.base.getWorldPosition(_b);
    if (o.line) {
      this.fx.burst(lerp(_b.x, _t.x, 0.25), lerp(_b.z, _t.z, 0.25), _t.x, _t.z, o.power);
      at.set(lerp(_b.x, _t.x, 0.6), WATER_Y, lerp(_b.z, _t.z, 0.6));
    } else {
      at.set(_t.x, WATER_Y, _t.z);
      if (ctx.water) ctx.water.ripple(at.x, at.z, 3 * o.power, 0.9);
      if (ctx.vfx && ctx.vfx.spray) ctx.vfx.spray(at, UP, 10, 0.5 + o.power);
    }
    ctx.bus.emit('boss-slam', { pos: at, radius: o.r, power: o.power, weapon: true, line: !!o.line });
    if (o.on) o.on(this);
  }

  dress(dt) {
    const kit = this.kit,
      p = this.part,
      two = this._phase === 2 && this.alive;
    this.glow = damp(this.glow, this.alive && p && p.glow !== undefined ? p.glow : 0, 7, dt);
    this.flare = damp(this.flare, this.alive && p && p.flare !== undefined ? p.flare : 0, 5, dt);
    this.shine = damp(this.shine, two ? 1 : 0, two ? 1.5 : 0.7, dt);
    this.sung = Math.max(0, this.sung - dt * 1.6);
    if (kit.sword) kit.sword.glow = Math.max(this.shine * 0.45, this.glow);
    const open = this.alive ? (two ? 1 : 0.1 + 0.5 * this.flare) : 0;
    kit.glow = Math.max(this.shine * (0.6 + 0.4 * this.glow), 0.3 * this.flare);
    this.wall = damp(this.wall, lerp(WALL[0], WALL[1], open), 1.2, dt);
    this.updateLight(dt, false);
  }
  updateLight(dt, puppet) {
    const L = this.light;
    if (!L) return;
    const B = this.char.bones,
      kit = this.kit;
    let level =
      this.lightLevel !== null && this.lightLevel !== undefined
        ? this.lightLevel
        : puppet
          ? Math.max(this.shine, kit.glow || 0)
          : this.shine;
    if (kit.fade) level *= 1 - kit.fade;
    L.intensity = this.lightPower * level * (1 + 0.7 * this.sung + 0.35 * this.glow);
    if (B.Spine2) {
      B.Spine2.getWorldPosition(_v);
      const y = this.yaw;
      L.position.set(_v.x - Math.sin(y) * 1.7, _v.y + 2.2, _v.z - Math.cos(y) * 1.7);
    }
  }
  updateBladeSplash(dt) {
    const ctx = this.ctx,
      sw = this.kit.sword;
    if (!sw || !sw.tip) return;
    sw.tip.getWorldPosition(_t);
    const low = _t.y < WATER_Y + 0.15,
      pv = this.tipPrev;
    if (low && this.tipLow) {
      const d = Math.hypot(_t.x - pv.x, _t.z - pv.z);
      if (d > 0.12 && d < 6) {
        if (ctx.water) ctx.water.wake(pv.x, pv.z, _t.x, _t.z, clamp(d * 1.2, 0.4, 2.5));
        const v = d / dt;
        if (v > 9 && ctx.vfx && ctx.vfx.spray) {
          _v.set(_t.x, WATER_Y, _t.z);
          _d.set(((_t.x - pv.x) / d) * 0.6, 1, ((_t.z - pv.z) / d) * 0.6).normalize();
          ctx.vfx.spray(_v, _d, 7, clamp(v / 45, 0.35, 1));
        }
      }
    }
    pv.copy(_t);
    this.tipLow = low;
  }

  updateSolids() {
    const S = this.solid,
      Bn = this.solidBones;
    for (let i = 0, k = 0; k < Bn.length; i++, k += 2) {
      Bn[k].getWorldPosition(S[i].a);
      Bn[k + 1].getWorldPosition(S[i].b);
    }
    const sk = this.skirt;
    if (sk) {
      const B = this.char.bones;
      B.Hips.getWorldPosition(sk.a);
      B.LeftFoot.getWorldPosition(_v);
      B.RightFoot.getWorldPosition(sk.b);
      sk.b.add(_v).multiplyScalar(0.5);
      sk.b.y = Math.min(sk.b.y, 0.3);
    }
    {
      const tr = this.train,
        y = this.yaw,
        bx = -Math.sin(y),
        bz = -Math.cos(y),
        h0 = this.flying ? 50 : 0.3;
      this.trainYaw = this.trainYaw === undefined ? y : this.trainYaw + angleDiff(y, this.trainYaw) * 0.12;
      const ty = this.trainYaw,
        tx = -Math.sin(ty),
        tz = -Math.cos(ty);
      tr.a.set(this.pos.x + bx * TRAIN.from, h0, this.pos.z + bz * TRAIN.from);
      tr.b.set(this.pos.x + tx * TRAIN.to, h0, this.pos.z + tz * TRAIN.to);
    }
    {
      const y = this.yaw,
        fx = Math.sin(y),
        fz = Math.cos(y),
        lx = Math.cos(y),
        lz = -Math.sin(y),
        h0 = this.flying ? 50 : 0.3;
      for (let i = 0; i < 2; i++) {
        const sg = i ? -1 : 1,
          c = this.hems[i];
        c.a.set(
          this.pos.x + lx * HEM.lat[0] * sg - fx * HEM.back[0],
          h0,
          this.pos.z + lz * HEM.lat[0] * sg - fz * HEM.back[0],
        );
        c.b.set(
          this.pos.x + lx * HEM.lat[1] * sg - fx * HEM.back[1],
          h0,
          this.pos.z + lz * HEM.lat[1] * sg - fz * HEM.back[1],
        );
      }
    }
    const bl = this.blade,
      sw = this.kit.sword;
    if (sw && sw.tip && sw.base && !this.kit.swordPlanted && this.alive) {
      sw.tip.getWorldPosition(_t);
      sw.base.getWorldPosition(_b);
      this.bladeV = _t.distanceTo(bl.tipWas || (bl.tipWas = _t.clone())) / (this.ctx.DT || 1 / 60);
      bl.tipWas.copy(_t);
      const spent = this._state !== 'attack' || this.stage === 'recover' || this.bladeSpent;
      if (
        (!this.armedWith || this.bladeHit) &&
        this.bladeV < (this.bladeSpent || this.bladeHit ? 99 : spent ? 14 : 2.5)
      ) {
        bl.a.copy(_b);
        bl.b.copy(_t);
        if (this.bladeHit && this.armedWith) {
          bl.a.y = Math.min(bl.a.y, 1);
          bl.b.y = Math.min(bl.b.y, 1);
        }
      } else {
        bl.a.set(0, 50, 0);
        bl.b.set(0, 50, 0);
      }
    } else {
      bl.a.set(0, 50, 0);
      bl.b.set(0, 50, 0);
    }
  }

  onClip(e) {
    if (e.name !== 'foot-l' && e.name !== 'foot-r') return;
    const B = this.char.bones,
      foot = e.name === 'foot-l' ? B.LeftFoot : B.RightFoot;
    if (!foot) return;
    foot.getWorldPosition(this.footAt);
    this.footAt.y = 0;
    this.ctx.bus.emit('step', { who: 'boss', pos: this.footAt, foot: e.name === 'foot-l' ? 'l' : 'r', run: false });
  }
}
