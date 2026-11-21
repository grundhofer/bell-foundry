import * as THREE from 'three';
import { WATER_Y } from '../../core/constants.js';
import { Rng, LightProbe, makeNoiseTexture } from './common.js';
import { ParticlePool, P, PARTICLE_KIND, makeParticleMaterial } from './particles.js';
import { SplashSheets } from './splash-sheets.js';
import { Shockwaves } from './shockwaves.js';
import { Trail, TRAIL_LOOKS } from './trails.js';
import { Mist, Dust } from './air.js';
import { BodyEffects } from './body.js';

export const ASSETS = {};

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3();
const _e = new THREE.Vector3(),
  _f = new THREE.Vector3(),
  _g = new THREE.Vector3();
const _col = new THREE.Color(),
  _gold = new THREE.Color(0xffd890),
  _pale = new THREE.Color(0xfff1d8);
const REBASE = 512;
const G = 9.8;
const _hn = new THREE.Vector3(),
  _ht = new THREE.Vector3(),
  _hr = new THREE.Vector3(),
  _hp = new THREE.Vector3(),
  _hx = new THREE.Vector3();

const WEIGHT = [
  {
    n: 10,
    sp: 1.0,
    long: 2,
    glint: 0.4,
    gl: 0.09,
    line: 0,
    ring: 1.1,
    rl: 0.16,
    rb: 0.75,
    light: 2.4,
    ls: 0.08,
    motes: 3,
    flash: 0.06,
    fp: 0.8,
    spray: 12,
    sprayP: 0.8,
    gust: 0,
  },
  {
    n: 34,
    sp: 1.9,
    long: 6,
    glint: 0.65,
    gl: 0.12,
    line: 1.8,
    ring: 2.0,
    rl: 0.22,
    rb: 1,
    light: 4.5,
    ls: 0.12,
    motes: 7,
    flash: 0.1,
    fp: 1.1,
    spray: 22,
    sprayP: 1.3,
    gust: 0.35,
  },
  {
    n: 90,
    sp: 3.2,
    long: 16,
    glint: 0.95,
    gl: 0.16,
    line: 3.4,
    ring: 3.4,
    rl: 0.3,
    rb: 1.1,
    light: 8,
    ls: 0.2,
    motes: 16,
    flash: 0.15,
    fp: 1.45,
    spray: 44,
    sprayP: 2.4,
    gust: 0.75,
  },
];
export const WEIGHT_LIGHT = 0,
  WEIGHT_HEAVY = 1,
  WEIGHT_COLOSSAL = 2;

export class VisualEffects {
  constructor(ctx) {
    this.ctx = ctx;
    this.calls = {};
    this.off = ctx.params.has('novfx');
    this.time = 0;
    this.clock = 0;
    this.lead = 0;
    this.DT = ctx.DT || 1 / 60;
    this.pt = 0;
    this.stepped = false;
    this.brokeAt = -10;
    this.rng = new Rng(20261107);
    this.tune = { hot: 1, soft: 1, sheets: 1, shock: 1, trails: 1, mist: 0.4, dust: 1, air: 1, live: 1 };
    ctx.params.tune('fx', this.tune);
    this.cpu = { update: 0, frame: 0 };
    if (this.off) return;
    const group = (this.group = new THREE.Group());
    group.name = 'vfx';
    ctx.scene.add(group);
    this.noise = makeNoiseTexture();
    this.probe = new LightProbe(ctx);
    this.hot = new ParticlePool(ctx, makeParticleMaterial(this.probe, this.noise), {
      capacity: 8192,
      layer: 0,
      renderOrder: 16,
      name: 'fx.hot',
    });
    this.soft = new ParticlePool(ctx, makeParticleMaterial(this.probe, this.noise), {
      capacity: 1536,
      layer: 2,
      renderOrder: 13,
      soft: true,
      name: 'fx.soft',
    });
    this.sheets = new SplashSheets(ctx, this.probe, this.noise, 24);
    this.shocks = new Shockwaves(ctx, this.probe, this.noise, 8);
    this.mist = new Mist(ctx, this.probe, this.noise, new Rng(11), 84);
    this.dustAir = new Dust(ctx, this.probe, new Rng(12), 1500);
    this.bodies = new BodyEffects(ctx, group, this.noise, (x, y, z, color) => {
      const r = this.rng,
        big = r.next() < 0.25;
      this._mote(
        x,
        y,
        z,
        r.signed() * 0.3,
        0.1 + 0.55 * r.next(),
        r.signed() * 0.3,
        color,
        big ? 1.6 : 2.4,
        2.6 + 3 * r.next(),
        big ? 2.4 : 1.2,
      );
    });
    group.add(this.mist.mesh, this.dustAir.mesh, this.sheets.mesh, this.soft.mesh, this.shocks.mesh, this.hot.mesh);
    const lights = ctx.gfx && ctx.gfx.lights;
    this.flashLight = lights && lights.add ? lights.add('flash') : null;
    if (this.flashLight) this.flashLight.intensity = 0;
    this.probe.skip = this.flashLight;
    this.flash = { t: 0, dur: 0.1, peak: 0, hold: false };
    this.trails = [];
    this.own = [null, null];
    const gh = (this.ghost = {
      pivot: new THREE.Object3D(),
      base: new THREE.Object3D(),
      tip: new THREE.Object3D(),
      t: 0,
      dur: 0,
      from: 0,
      to: 0,
      tilt: 0,
      trail: null,
      big: false,
    });
    gh.pivot.add(gh.base, gh.tip);
    group.add(gh.pivot);
    gh.small = this._newTrail(gh, TRAIL_LOOKS.pilgrim);
    gh.large = this._newTrail(gh, TRAIL_LOOKS.boss);
    this.jobs = [];
    for (let i = 0; i < 6; i++)
      this.jobs.push({ on: false, kind: '', t: 0, dur: 0, who: null, dx: 0, dz: 0, power: 1, acc: 0, n: 0 });
    this.last = { x: 0, z: 0, t: -10 };
    this.struck = { x: 0, y: 0, z: 0, t: -10 };
    this.wring = { x: 0, z: 0, t: -10 };
    this.slams = [];
    for (let i = 0; i < 4; i++) this.slams.push({ on: false, x: 0, z: 0, R: 3, power: 1 });
    this.acc = { embers: 0 };
    const ab = ctx.params.get('fxab');
    this.ab = ab
      ? {
          name: ab,
          n: 0,
          last: 0,
          on: true,
          tOn: [],
          tOff: [],
          sent: false,
          from: +(ctx.params.get('fxabt') || 1),
          frames: +(ctx.params.get('fxabn') || 228),
        }
      : null;
    this.log = ctx.params.has('fxlog') ? { every: +ctx.params.get('fxlog') || 0.5, next: 0, peak: [0, 0, 0, 0] } : null;
    this.prime = 3;
    this.hot.mesh.visible = this.soft.mesh.visible = this.sheets.mesh.visible = this.shocks.mesh.visible = true;
    for (const tr of this.trails) tr.mesh.visible = true;
    this.unsub = [];
    const bus = ctx.bus,
      on = (name, fn) => {
        if (bus) this.unsub.push(bus.on(name, fn));
      };
    on('hit', (h) => this._onHit(h));
    on('clash', (e) => this._onClash(e));
    on('boss-slam', (e) => this._onSlam(e));
    on('boss-stagger', () => {
      this.brokeAt = this.clock;
    });
    on('boss-phase', () => {
      this.brokeAt = this.clock;
    });
    on('roll', (e) => this._onRoll(e));
    on('step', (e) => this._onStep(e));
    on('land', (e) => this._onLand(e));
    on('state', (e) => {
      if (e && (e.to === 'fight' || e.to === 'title' || e.to === 'intro') && e.from !== 'phase' && e.from !== 'intro')
        this.reset();
    });
  }

  _n(k) {
    this.calls[k] = (this.calls[k] || 0) + 1;
  }

  _randomDirInCone(dir, spread) {
    const r = this.rng,
      z = r.signed(),
      a = r.next() * Math.PI * 2,
      s = Math.sqrt(1 - z * z);
    _d.set(s * Math.cos(a), z, s * Math.sin(a))
      .multiplyScalar(spread)
      .addScaledVector(dir, 1 - spread);
    if (_d.lengthSq() < 1e-6) _d.copy(dir);
    return _d.normalize();
  }
  _normalizedDir(dir) {
    if (dir && (dir.x || dir.y || dir.z)) _a.set(dir.x, dir.y, dir.z).normalize();
    else _a.set(0, 1, 0);
    return _a;
  }

  _flash(x, y, z, color, strength, seconds) {
    const l = this.flashLight,
      f = this.flash;
    if (!l) return;
    const peak = 6 * strength;
    if (f.t > 0 && l.intensity > peak) return;
    l.position.set(x, y, z);
    l.color.set(color);
    f.peak = peak;
    f.t = f.dur = seconds;
    l.intensity = peak;
    f.hold = true;
  }

  _newTrail(weapon, look, opts) {
    const t = new Trail(this.ctx, this.noise, weapon, Object.assign({}, look, opts));
    t.acc = 0;
    t.cut = 0;
    this.group.add(t.mesh);
    this.trails.push(t);
    return t;
  }

  sparks(point, dir, count = 12, power = 1) {
    this._n('sparks');
    if (this.off) return;
    const pw = Math.sqrt(power);
    this._sparks(point.x, point.y, point.z, this._normalizedDir(dir), count, power, 0.5, 0);
    this._glint(point.x, point.y, point.z, 0.34 * pw, 0.11, 13, 10, 6);
    this._flash(point.x, point.y, point.z, 0xffc890, 2.2 * pw, 0.09);
  }
  _sparks(x, y, z, D, count, power, spread = 0.5, long = 0) {
    const r = this.rng,
      pw = Math.sqrt(power);
    _c.copy(D);
    for (let i = 0; i < count; i++) {
      const fine = r.next() < 0.45,
        v = this._randomDirInCone(_c, fine ? spread + 0.1 : spread - 0.1),
        sp = (fine ? 6 + 10 * r.next() : 2.5 + 6.5 * r.next() * r.next()) * pw;
      P.kind = PARTICLE_KIND.SPARK;
      P.x = x;
      P.y = y;
      P.z = z;
      P.vx = v.x * sp;
      P.vy = v.y * sp + 1.2 * pw;
      P.vz = v.z * sp;
      P.life = fine ? 0.15 + 0.25 * r.next() : 0.5 + 0.8 * r.next();
      P.size = fine ? 0.005 + 0.004 * r.next() : 0.007 + 0.01 * r.next() * r.next();
      P.seed = r.next();
      P.stretch = 0.028 + 0.022 * r.next();
      const hot = fine ? 6 + 5 * r.next() : 8 + 9 * r.next();
      P.r = hot;
      P.g = hot;
      P.b = hot;
      P.a = 1;
      P.gravity = -G * 0.9;
      P.drag = fine ? 3.5 : 0.9 + 1.2 * r.next();
      P.growth = 0.6;
      P.extra = 0;
      this.hot.emit(P);
    }
    for (let i = 0; i < long; i++) {
      const v = this._randomDirInCone(_c, Math.min(0.9, spread + 0.2)),
        sp = (3 + 5 * r.next()) * pw;
      P.kind = PARTICLE_KIND.SPARK;
      P.x = x;
      P.y = y;
      P.z = z;
      P.vx = v.x * sp;
      P.vy = v.y * sp + 2.2 * pw;
      P.vz = v.z * sp;
      P.life = 1.0 + 0.9 * r.next();
      P.size = 0.011 + 0.009 * r.next();
      P.seed = r.next();
      P.stretch = 0.04 + 0.015 * r.next();
      const hot = 11 + 8 * r.next();
      P.r = hot;
      P.g = hot;
      P.b = hot;
      P.a = 1;
      P.gravity = -G * 0.9;
      P.drag = 0.45 + 0.4 * r.next();
      P.growth = 0.6;
      P.extra = 0;
      this.hot.emit(P);
    }
  }

  spray(point, dir, count = 20, power = 1) {
    this._n('spray');
    if (this.off) return;
    const r = this.rng,
      pw = Math.sqrt(power);
    const D = this._normalizedDir(dir),
      down = D.y < -0.3;
    if (down) _b.copy(D);
    else _b.copy(D).addScaledVector(UP, 0.9).normalize();
    const y0 = Math.max(point.y, WATER_Y + 0.02);
    for (let i = 0; i < count; i++) {
      const v = this._randomDirInCone(_b, down ? 0.25 : 0.42),
        sp = (down ? 0.3 + 1.2 * r.next() : 1.6 + 4.2 * r.next()) * pw;
      this._drop(
        point.x + r.signed() * 0.08,
        y0,
        point.z + r.signed() * 0.08,
        v.x * sp,
        down ? v.y * sp : Math.abs(v.y) * sp,
        v.z * sp,
        1,
      );
    }
    const puffs = down ? 0 : Math.max(1, Math.round(count / 7));
    for (let i = 0; i < puffs; i++) {
      const v = this._randomDirInCone(_b, 0.5),
        sp = (1.0 + 2.0 * r.next()) * pw;
      this._mistPuff(
        point.x + r.signed() * 0.15,
        y0 + 0.1,
        point.z + r.signed() * 0.15,
        v.x * sp,
        Math.abs(v.y) * sp * 0.8 + 0.4,
        v.z * sp,
        (0.28 + 0.3 * r.next()) * pw,
        0.75 + 0.7 * r.next(),
        0.2,
        0.75,
      );
    }
    if (power >= 1.6) {
      const yaw = Math.atan2(D.x, D.z),
        flat = Math.hypot(D.x, D.z),
        ring = flat <= 0.2;
      this.sheets.spawn(
        point.x - D.x * 0.25,
        point.z - D.z * 0.25,
        yaw,
        ring ? Math.PI : 1.35,
        0.3,
        (1.3 + 1.2 * pw) * Math.max(0.3, flat),
        2.2 + 1.3 * pw,
        0.5,
        0.3,
        0,
        r.next(),
      );
      this.sheets.spawn(
        point.x - D.x * 0.1,
        point.z - D.z * 0.1,
        yaw,
        ring ? Math.PI : 0.7,
        0.15,
        (2.2 + 1.8 * pw) * Math.max(0.3, flat),
        3.0 + 1.7 * pw,
        0.42,
        0.45,
        0.04,
        r.next(),
      );
    }
  }

  sheet(point, dir, width = 3, power = 1) {
    this._n('sheet');
    if (this.off) return;
    const D = this._normalizedDir(dir),
      flat = Math.hypot(D.x, D.z) || 1,
      fx = D.x / flat,
      fz = D.z / flat,
      R = 30,
      pw = Math.sqrt(power),
      r = this.rng;
    this.sheets.spawn(
      point.x - fx * R,
      point.z - fz * R,
      Math.atan2(fx, fz),
      (width * 0.5) / R,
      R,
      1.2 + 1.6 * pw,
      2.8 + 1.9 * pw,
      0.55,
      0.3,
      0,
      r.next(),
    );
    const n = Math.round(width * 9 * pw);
    for (let i = 0; i < n; i++) {
      const s = r.signed() * width * 0.5,
        sp = 1.5 + 3.5 * r.next() * pw;
      this._drop(
        point.x - fz * s,
        WATER_Y + 0.03,
        point.z + fx * s,
        fx * sp + r.signed(),
        (2.2 + 3.6 * r.next()) * pw,
        fz * sp + r.signed(),
        1,
      );
    }
    for (let i = 0; i < Math.round(width * 1.2); i++) {
      const s = r.signed() * width * 0.5;
      this._mistPuff(
        point.x - fz * s,
        WATER_Y + 0.2,
        point.z + fx * s,
        fx * 1.6,
        0.9 + r.next(),
        fz * 1.6,
        0.5 + 0.4 * r.next(),
        1.1 + r.next(),
        0.2,
        0.6,
      );
    }
  }

  splashRing(pos, radius = 2, power = 1) {
    this._n('splashRing');
    if (this.off) return;
    if (this._waterSlam(pos.x, pos.z, radius, power)) {
      const w = this.ctx.water;
      if (w && w.ripple) w.ripple(pos.x, pos.z, 1.5 + power, Math.max(0.3, radius * 0.35));
    }
  }

  dust(point, count = 6) {
    this._n('dust');
    if (this.off) return;
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      P.kind = PARTICLE_KIND.PUFF;
      P.x = point.x + r.signed() * 0.2;
      P.y = point.y + r.signed() * 0.1;
      P.z = point.z + r.signed() * 0.2;
      P.vx = r.signed() * 1.3;
      P.vy = 0.3 + 0.9 * r.next();
      P.vz = r.signed() * 1.3;
      P.life = 1.3 + 1.2 * r.next();
      P.size = 0.35 + 0.35 * r.next();
      P.seed = r.next();
      P.stretch = 0;
      P.r = 0.44;
      P.g = 0.45;
      P.b = 0.5;
      P.a = 0.26;
      P.gravity = 0.12;
      P.drag = 2.2;
      P.growth = 3.2;
      P.extra = 0;
      this.soft.emit(P);
    }
  }

  embers(point, count = 10) {
    this._n('embers');
    if (this.off) return;
    const r = this.rng;
    for (let i = 0; i < count; i++)
      this._ember(
        point.x + r.signed() * 0.12,
        point.y + r.signed() * 0.12,
        point.z + r.signed() * 0.12,
        r.signed() * 0.7,
        0.5 + 1.5 * r.next(),
        r.signed() * 0.7,
        3.2,
        1.7,
        0.55,
        1.2 + 1.6 * r.next(),
      );
  }

  motes(point, count = 10, color = 0xffe2a0) {
    this._n('motes');
    if (this.off) return;
    const r = this.rng;
    _col.set(color);
    for (let i = 0; i < count; i++)
      this._mote(
        point.x + r.signed() * 0.3,
        point.y + r.signed() * 0.3,
        point.z + r.signed() * 0.3,
        r.signed() * 0.35,
        0.1 + 0.4 * r.next(),
        r.signed() * 0.35,
        _col,
        1.6,
        2 + 2.2 * r.next(),
      );
  }

  shock(pos, radius = 14, color = 0xffe2a0, seconds = 2.2, from = 0.8, glint = 1) {
    this._n('shock');
    if (this.off) return { alive: false, radius, x: pos.x, z: pos.z, progress: 1, width: 0.35, height: 1 };
    _col.set(color);
    const h = this.shocks.spawn(pos.x, WATER_Y, pos.z, from, radius, seconds, _col, 1.15, this.rng.next());
    if (glint > 0)
      this._glint(
        pos.x,
        WATER_Y + 0.4,
        pos.z,
        1.6 * glint,
        0.16,
        _col.r * 3 * glint,
        _col.g * 3 * glint,
        _col.b * 3 * glint,
      );
    return h;
  }

  trail(weapon, opts = {}) {
    if (this.off || !weapon || !weapon.tip || !weapon.base) return { start() {}, stop() {}, set() {} };
    let t = null;
    for (const x of this.trails)
      if (x.weapon.tip === weapon.tip) {
        t = x;
        break;
      }
    const who = opts.look || opts.who,
      named = who === 'boss' ? TRAIL_LOOKS.boss : who === 'pilgrim' || who === 'player' ? TRAIL_LOOKS.pilgrim : null;
    if (!t) {
      const boss =
        this.ctx.boss && this.ctx.boss.kit && this.ctx.boss.kit.sword && this.ctx.boss.kit.sword.tip === weapon.tip;
      weapon.base.getWorldPosition(_f);
      weapon.tip.getWorldPosition(_g);
      t = this._newTrail(
        weapon,
        named || (boss || _f.distanceTo(_g) > 2.2 ? TRAIL_LOOKS.boss : TRAIL_LOOKS.pilgrim),
        opts,
      );
    } else {
      if (named) t.set(named);
      t.set(opts);
    }
    if (opts.auto !== true) {
      t.manual = true;
      t.on = false;
    }
    if (!t.handle.dispose) t.handle.dispose = () => this._dropTrail(t);
    return t.handle;
  }
  _dropTrail(t) {
    const i = this.trails.indexOf(t);
    if (i >= 0) this.trails.splice(i, 1);
    for (let k = 0; k < 2; k++) if (this.own[k] === t) this.own[k] = null;
    t.dispose();
  }

  hitFlash(character, seconds = 0.14, color = 0xffe9c4, power = 1.6) {
    this._n('hitFlash');
    if (this.off) return;
    this.bodies.flash(character, seconds, color, power);
  }

  dissolve(object3d, seconds = 4, opts = {}) {
    this._n('dissolve');
    if (this.off) return { progress: 1, done: true, cancel() {} };
    return this.bodies.dissolve(object3d, seconds, opts);
  }

  impact(point, dir, power = 1) {
    this._n('impact');
    if (this.off) return;
    _e.copy(this._normalizedDir(dir));
    _hn.set(-_e.x * 0.6, 0.8, -_e.z * 0.6).normalize();
    this._strike(point, _e, _hn, power >= 2.5 ? WEIGHT_COLOSSAL : power >= 1.4 ? WEIGHT_HEAVY : WEIGHT_LIGHT, 0);
  }

  _strike(p, d, n, w, what = 0) {
    const W = WEIGHT[w],
      r = this.rng,
      x = p.x,
      y = p.y,
      z = p.z,
      cam = this.ctx.camera;
    const into = Math.min(0, d.x * n.x + d.y * n.y + d.z * n.z);
    _ht.set(d.x - n.x * into, d.y - n.y * into, d.z - n.z * into);
    if (_ht.lengthSq() < 0.02) _ht.set(-n.z, 0.35, n.x);
    _ht.normalize();
    if (what === 0) {
      _hx.copy(_ht).multiplyScalar(0.85).addScaledVector(n, 0.5);
      _hx.y += 0.12;
      _hx.normalize();
      this._sparks(x, y, z, _hx, W.n, W.sp, w === 0 ? 0.36 : 0.45, W.long);
    } else if (what === 1) {
      for (let i = 0; i < 8 + W.motes * 2; i++) {
        const v = this._randomDirInCone(n, 0.8),
          s = 0.6 + 2.6 * r.next();
        this._mote(x, y, z, v.x * s + d.x, v.y * s + 0.5, v.z * s + d.z, _gold, 1.7, 0.5 + 0.8 * r.next());
      }
    }
    const warm = what === 1 ? 0.8 : 1;
    this._glint(x, y, z, W.glint, W.gl, 16, 13.5 * warm, 9.5 * warm * warm);
    if (W.line > 0 && what !== 2) {
      this._line(x, y, z, _ht, W.line, W.gl * 0.9, 0.05 + 0.03 * w, 15, 12.5, 9);
      if (w === WEIGHT_COLOSSAL) {
        _hx.crossVectors(n, _ht);
        if (_hx.lengthSq() > 0.01) this._line(x, y, z, _hx.normalize(), W.line * 0.55, W.gl * 0.75, 0.06, 13, 11.5, 9);
      }
    }
    _hr.copy(n).multiplyScalar(0.7);
    if (cam) {
      _hp.set(cam.position.x - x, cam.position.y - y, cam.position.z - z);
      const l = _hp.length();
      if (l > 1e-3) _hr.addScaledVector(_hp, 0.6 / l);
    }
    if (_hr.lengthSq() < 0.01) _hr.copy(n);
    _hr.normalize();
    this._ring(x, y, z, _hr, W.ring, W.rl, 1.5 * W.rb, 1.32 * W.rb, 1.05 * W.rb, 1);
    if (w === WEIGHT_COLOSSAL) this._waterRing(x, z, 11, 0.5);
    if (W.gust > 0) this.mist.blow(x, z, W.gust, this.clock);
    this._flash(x, y, z, what === 1 ? 0xffd890 : 0xffd9a8, W.light, W.ls);
  }
  _waterRing(x, z, size, life) {
    const L = this.wring;
    if (this.clock - L.t < 0.35 && Math.hypot(x - L.x, z - L.z) < 9) return;
    L.x = x;
    L.z = z;
    L.t = this.clock;
    this._ring(x, WATER_Y + 0.03, z, UP, size, life, 0.34, 0.42, 0.55, 1.7 / size);
  }
  _ring(x, y, z, f, size, life, cr, cg, cb, thick = 1) {
    P.kind = PARTICLE_KIND.RING;
    P.x = x;
    P.y = y;
    P.z = z;
    P.vx = f.x;
    P.vy = f.y;
    P.vz = f.z;
    P.life = life;
    P.size = size;
    P.seed = this.rng.next();
    P.stretch = 0;
    P.r = cr;
    P.g = cg;
    P.b = cb;
    P.a = 1;
    P.gravity = 0;
    P.drag = 0;
    P.growth = 1.25;
    P.extra = thick;
    this.hot.emit(P);
  }
  _line(x, y, z, t, len, life, width, cr, cg, cb) {
    const sp = 2.5,
      k = len * 0.5 - sp * life * 0.5;
    P.kind = PARTICLE_KIND.FLASH;
    P.x = x + t.x * k;
    P.y = y + t.y * k;
    P.z = z + t.z * k;
    P.vx = t.x * sp;
    P.vy = t.y * sp;
    P.vz = t.z * sp;
    P.life = life;
    P.size = width;
    P.seed = this.rng.next();
    P.stretch = len / sp;
    P.r = cr;
    P.g = cg;
    P.b = cb;
    P.a = 1;
    P.gravity = 0;
    P.drag = 0;
    P.growth = 0.35;
    P.extra = 0;
    this.hot.emit(P);
  }
  _chip(x, y, z, vx, vy, vz) {
    const r = this.rng,
      s = 0.3 + 0.25 * r.next();
    P.kind = PARTICLE_KIND.DROP;
    P.x = x;
    P.y = y;
    P.z = z;
    P.vx = vx;
    P.vy = vy;
    P.vz = vz;
    P.life = 1.8;
    P.size = 0.006 + 0.012 * r.next() * r.next();
    P.seed = r.next();
    P.stretch = 0.01;
    P.r = 1.15 * s;
    P.g = 1.0 * s;
    P.b = 0.82 * s;
    P.a = 1;
    P.gravity = -G;
    P.drag = 0.5 + 0.6 * r.next();
    P.growth = 1;
    P.extra = 0;
    this.hot.emit(P);
  }

  gust(pos, power = 0.8) {
    if (this.off) return;
    this.mist.blow(pos.x, pos.z, power, this.clock);
  }

  reset() {
    if (this.off) return;
    this.hot.clear();
    this.soft.clear();
    this.sheets.clear();
    this.shocks.clear();
    this.bodies.cancelAll();
    for (const t of this.trails) t.clear();
    for (const j of this.jobs) j.on = false;
    for (const q of this.slams) q.on = false;
    if (this.flashLight) this.flashLight.intensity = 0;
    this.flash.t = 0;
  }

  _drop(x, y, z, vx, vy, vz, bright) {
    const r = this.rng;
    P.kind = PARTICLE_KIND.DROP;
    P.x = x;
    P.y = y;
    P.z = z;
    P.vx = vx;
    P.vy = vy;
    P.vz = vz;
    P.life = 2.2;
    P.size = 0.003 + 0.007 * r.next() * r.next();
    P.seed = r.next();
    P.stretch = 0.018;
    P.r = 0.8 * bright;
    P.g = 0.9 * bright;
    P.b = 1.0 * bright;
    P.a = 1;
    P.gravity = -G;
    P.drag = 0.35 + 0.8 * r.next();
    P.growth = 1;
    P.extra = 0;
    this.hot.emit(P);
  }
  _mistPuff(x, y, z, vx, vy, vz, size, life, alpha, speck) {
    P.kind = PARTICLE_KIND.PUFF;
    P.x = x;
    P.y = y;
    P.z = z;
    P.vx = vx;
    P.vy = vy;
    P.vz = vz;
    P.life = life;
    P.size = size;
    P.seed = this.rng.next();
    P.stretch = 0;
    P.r = 0.6;
    P.g = 0.68;
    P.b = 0.78;
    P.a = alpha;
    P.gravity = -0.7;
    P.drag = 2.6;
    P.growth = 2.6;
    P.extra = speck;
    this.soft.emit(P);
  }
  _mote(x, y, z, vx, vy, vz, color, gain, life, scale = 1) {
    const r = this.rng;
    P.kind = PARTICLE_KIND.MOTE;
    P.x = x;
    P.y = y;
    P.z = z;
    P.vx = vx;
    P.vy = vy;
    P.vz = vz;
    P.life = life;
    P.size = (0.02 + 0.026 * r.next()) * scale;
    P.seed = r.next();
    P.stretch = 0;
    P.r = color.r * gain;
    P.g = color.g * gain;
    P.b = color.b * gain;
    P.a = 1;
    P.gravity = 0.16;
    P.drag = 1.3;
    P.growth = 0.7;
    P.extra = 0.15 + 0.2 * r.next();
    this.hot.emit(P);
  }
  _ember(x, y, z, vx, vy, vz, cr, cg, cb, life, scale = 1) {
    const r = this.rng;
    P.kind = PARTICLE_KIND.EMBER;
    P.x = x;
    P.y = y;
    P.z = z;
    P.vx = vx;
    P.vy = vy;
    P.vz = vz;
    P.life = life;
    P.size = (0.014 + 0.016 * r.next()) * scale;
    P.seed = r.next();
    P.stretch = 0;
    P.r = cr;
    P.g = cg;
    P.b = cb;
    P.a = 1;
    P.gravity = 0.9;
    P.drag = 1.1;
    P.growth = 0.5;
    P.extra = 0.1 + 0.12 * r.next();
    this.hot.emit(P);
  }
  _glint(x, y, z, size, life, cr, cg, cb) {
    P.kind = PARTICLE_KIND.FLASH;
    P.x = x;
    P.y = y;
    P.z = z;
    P.vx = P.vy = P.vz = 0;
    P.life = life;
    P.size = size;
    P.seed = this.rng.next();
    P.stretch = 0;
    P.r = cr;
    P.g = cg;
    P.b = cb;
    P.a = 1;
    P.gravity = 0;
    P.drag = 0;
    P.growth = 1.6;
    P.extra = 0;
    this.hot.emit(P);
  }

  _waterSlam(x, z, radius, power) {
    const L = this.last,
      r = this.rng;
    if (this.clock - L.t < 0.15 && Math.hypot(x - L.x, z - L.z) < 1) return false;
    L.x = x;
    L.z = z;
    L.t = this.clock;
    const pw = Math.sqrt(Math.max(0.05, power)),
      R = Math.max(0.3, radius);
    const up = Math.sqrt(2 * G * Math.min(3.4, 0.3 + 0.8 * Math.pow(power, 0.8)));
    this.sheets.spawn(x, z, r.next() * 6.28, Math.PI, R * 0.5, R * 0.75, up, 0.65, 0.2, 0, r.next());
    this.sheets.spawn(x, z, r.next() * 6.28, Math.PI, R * 0.2, R * 0.3, up * 1.25, 0.55, 0.4, 0.05, r.next());
    const drops = Math.min(220, Math.round(50 * pw * (0.6 + 0.4 * R)));
    for (let i = 0; i < drops; i++) {
      const a = r.next() * 6.283,
        rad = R * (0.2 + 0.4 * r.next()),
        out = (0.6 + 2.6 * r.next()) * (0.5 + 0.5 * R * 0.4),
        vy = up * (0.45 + 0.85 * r.next());
      this._drop(
        x + Math.sin(a) * rad,
        WATER_Y + 0.03,
        z + Math.cos(a) * rad,
        Math.sin(a) * out,
        vy,
        Math.cos(a) * out,
        1,
      );
    }
    const puffs = Math.min(22, Math.round(6 + 5 * pw * R * 0.6));
    for (let i = 0; i < puffs; i++) {
      const a = ((i + r.next()) / puffs) * 6.283,
        rad = R * (0.35 + 0.3 * r.next()),
        out = 1.5 + 2.4 * r.next() * pw;
      this._mistPuff(
        x + Math.sin(a) * rad,
        WATER_Y + 0.15 + 0.3 * r.next(),
        z + Math.cos(a) * rad,
        Math.sin(a) * out,
        0.5 + 1.4 * r.next() * pw,
        Math.cos(a) * out,
        (0.5 + 0.5 * r.next()) * (0.6 + 0.4 * pw),
        1.5 + 1.3 * r.next(),
        0.2,
        0.35,
      );
    }
    this.mist.blow(x, z, Math.min(0.92, 0.35 + 0.2 * power), this.clock);
    return true;
  }
  _footSplash(x, z, dx, dz, size) {
    const r = this.rng,
      n = Math.round(9 + 6 * size),
      s = Math.sqrt(size);
    for (let i = 0; i < n; i++) {
      const a = r.next() * 6.283,
        o = 0.5 + 1.5 * r.next();
      this._drop(
        x + r.signed() * 0.08 * size,
        WATER_Y + 0.02,
        z + r.signed() * 0.08 * size,
        Math.sin(a) * o + dx * 1.3,
        (1.1 + 2.2 * r.next()) * s,
        Math.cos(a) * o + dz * 1.3,
        1,
      );
    }
    this.sheets.spawn(x, z, r.next() * 6.28, Math.PI, 0.07 * size, 0.55 * s, 2.3 * s, 0.5, 0.55, 0, r.next());
    this._mistPuff(x, WATER_Y + 0.1, z, dx * 0.5, 0.5, dz * 0.5, 0.3 * size, 0.55 + 0.3 * r.next(), 0.2, 0.75);
  }

  _hitWeight(h) {
    const k = h.weight;
    if (k === 'light') return WEIGHT_LIGHT;
    if (k === 'heavy') return WEIGHT_HEAVY;
    if (k === 'colossal') return WEIGHT_COLOSSAL;
    if (h.target === this.ctx.boss && h.target)
      return h.fatal || this.clock - this.brokeAt < 0.01 ? WEIGHT_COLOSSAL : h.heavy ? WEIGHT_HEAVY : WEIGHT_LIGHT;
    if (h.fatal || h.knockdown || (!h.blocked && h.damage >= 46)) return WEIGHT_COLOSSAL;
    if (h.kind === 'hymn' && !h.heavy) return WEIGHT_LIGHT;
    return WEIGHT_HEAVY;
  }

  _onHit(h) {
    if (this.off || !h || !h.point) return;
    const ctx = this.ctx,
      p = h.point,
      t = h.target,
      a = h.attacker,
      w = this._hitWeight(h),
      W = WEIGHT[w];
    this.lastHit = w;
    if (h.dir && (h.dir.x || h.dir.y || h.dir.z)) _e.set(h.dir.x, h.dir.y, h.dir.z).normalize();
    else _e.set(0, 0, 0);
    _hn.set(0, 0, 0);
    if (a && a.pos) {
      _hp.set(a.pos.x - p.x, 0, a.pos.z - p.z);
      const l = _hp.length();
      if (l > 1e-3) _hn.addScaledVector(_hp, 0.7 / l);
    }
    if (t && t.pos) {
      _hp.set(p.x - t.pos.x, 0, p.z - t.pos.z);
      const l = _hp.length();
      if (l > 1e-3) _hn.addScaledVector(_hp, 0.3 / l);
    }
    if (_hn.lengthSq() < 1e-4) _hn.set(-_e.x, 0, -_e.z);
    if (_hn.lengthSq() < 1e-4) _hn.set(0, 0, 1);
    _hn.normalize();
    if (_e.lengthSq() < 0.5) _e.copy(_hn).negate();
    const light = h.kind === 'chorale' || h.kind === 'hymn' || h.kind === 'tide',
      water = h.kind === 'leap' || h.kind === 'stomp';
    if (h.blocked) {
      if (this._isRepeatStrike(p)) return;
      const sh = t && t.kit && t.kit.shield && t.kit.shield.object;
      let q = p;
      if (sh && sh.getWorldPosition) {
        sh.getWorldPosition(_g);
        if (_g.distanceTo(p) < 1.8) {
          _g.addScaledVector(_hn, 0.1);
          q = _g;
        }
      }
      if (h.guardBreak) {
        this._strike(q, _e, _hn, Math.min(WEIGHT_COLOSSAL, w + 1), light ? 1 : 0);
        this.bodies.flash(t, 0.1, 0xffd2b0, 0.8, 2.4);
      } else this._strike(q, _e, _hn, w, light ? 1 : 0);
    } else if (t === ctx.boss) {
      this._isRepeatStrike(p);
      this._strike(p, _e, _hn, w, 0);
      this.bodies.flash(t, W.flash, 0xfff0d0, W.fp * 0.9, W.fp * 1.1);
      const r = this.rng;
      for (let i = 0; i < W.motes; i++)
        this._mote(
          p.x,
          p.y,
          p.z,
          _ht.x * 1.6 + _hn.x + r.signed(),
          0.5 + 1.1 * r.next(),
          _ht.z * 1.6 + _hn.z + r.signed(),
          _pale,
          1.1,
          0.7 + 0.9 * r.next(),
        );
    } else {
      this._isRepeatStrike(p);
      this._strike(p, _e, _hn, w, light ? 1 : water ? 2 : 0);
      this.bodies.flash(t, W.flash, light ? 0xffe0a0 : 0xffd2b0, W.fp, W.fp * 3.2);
    }
    if (p.y < WATER_Y + 0.45 || water) {
      _f.set(p.x, WATER_Y, p.z);
      _g.set(_e.x, 0, _e.z);
      this.spray(_f, _g, W.spray, W.sprayP);
    }
  }

  _onClash(e) {
    if (this.off || !e || !e.point || this._isRepeatStrike(e.point)) return;
    const p = e.point,
      r = this.rng;
    if (!e.stone) {
      this.sparks(p, UP, 16, 1.2);
      return;
    }
    _hn.set(0, 0, 0);
    if (e.normal && (e.normal.x || e.normal.y || e.normal.z)) _hn.set(e.normal.x, e.normal.y, e.normal.z);
    else {
      const cols = this.ctx.arena && this.ctx.arena.colliders;
      let best = 1e9;
      if (cols)
        for (const c of cols) {
          const dx = p.x - c.x,
            dz = p.z - c.z,
            l = Math.hypot(dx, dz),
            d = l - (c.r || 0);
          if (d < best && l > 1e-3) {
            best = d;
            _hn.set(dx, 0, dz);
          }
        }
      if (_hn.lengthSq() < 1e-6) {
        const pl = this.ctx.player;
        if (pl) _hn.set(pl.pos.x - p.x, 0, pl.pos.z - p.z);
      }
    }
    if (_hn.lengthSq() < 1e-6) _hn.set(0, 0, 1);
    _hn.normalize();
    if (e.dir && (e.dir.x || e.dir.y || e.dir.z)) _e.set(e.dir.x, e.dir.y, e.dir.z).normalize();
    else _e.copy(_hn).negate();
    const into = Math.min(0, _e.dot(_hn));
    _ht.copy(_e).addScaledVector(_hn, -into);
    if (_ht.lengthSq() < 0.02) _ht.set(-_hn.z, 0.3, _hn.x);
    _ht.normalize();
    const heavy = !!e.heavy || e.weight === 'heavy' || e.weight === 'colossal',
      hers = e.who === 'boss';
    if (hers) {
      const w = e.weight === 'colossal' ? WEIGHT_COLOSSAL : WEIGHT_HEAVY,
        n = w === WEIGHT_COLOSSAL ? 46 : 30;
      this._strike(p, _e, _hn, w, 0);
      for (let i = 0; i < n; i++) {
        const o = 1.5 + 4.5 * r.next(),
          al = 3.5 * r.next();
        this._chip(
          p.x + _hn.x * 0.06,
          p.y + r.signed() * 0.25,
          p.z + _hn.z * 0.06,
          _hn.x * o + _ht.x * al + r.signed() * 1.8,
          0.6 + 3.4 * r.next(),
          _hn.z * o + _ht.z * al + r.signed() * 1.8,
        );
      }
      for (let i = 0; i < (w === WEIGHT_COLOSSAL ? 16 : 11); i++) {
        P.kind = PARTICLE_KIND.PUFF;
        P.x = p.x + _hn.x * 0.15 + r.signed() * 0.3;
        P.y = p.y + r.signed() * 0.4;
        P.z = p.z + _hn.z * 0.15 + r.signed() * 0.3;
        const o = 0.6 + 1.8 * r.next();
        P.vx = _hn.x * o + _ht.x * 0.9 + r.signed() * 0.6;
        P.vy = 0.1 + 0.6 * r.next();
        P.vz = _hn.z * o + _ht.z * 0.9 + r.signed() * 0.6;
        P.life = 1.3 + 1.2 * r.next();
        P.size = 0.25 + 0.3 * r.next();
        P.seed = r.next();
        P.stretch = 0;
        P.r = 0.5;
        P.g = 0.49;
        P.b = 0.5;
        P.a = 0.22;
        P.gravity = -0.25;
        P.drag = 2.2;
        P.growth = 3.2;
        P.extra = 0.3;
        this.soft.emit(P);
      }
      if (p.y < WATER_Y + 0.6) {
        _f.set(p.x, WATER_Y, p.z);
        _g.set(_ht.x, 0, _ht.z);
        this.spray(_f, _g, 24, 1.5);
      }
      return;
    }
    if ((e.floor || _hn.y > 0.7) && p.y < WATER_Y + 0.05) {
      _f.set(p.x, WATER_Y, p.z);
      _g.set(_ht.x, 0, _ht.z);
      this.spray(_f, _g, heavy ? 26 : 16, heavy ? 1.4 : 0.9);
      _hx.set(_ht.x * 0.6, 0.8, _ht.z * 0.6).normalize();
      this._sparks(p.x, WATER_Y + 0.04, p.z, _hx, heavy ? 12 : 7, 0.9, 0.5, heavy ? 2 : 1);
      this._glint(p.x, WATER_Y + 0.06, p.z, heavy ? 0.3 : 0.2, 0.07, 9, 8.6, 8);
      return;
    }
    _hx.copy(_ht).multiplyScalar(0.7).addScaledVector(_hn, 0.7);
    _hx.y += 0.2;
    _hx.normalize();
    this._sparks(p.x, p.y, p.z, _hx, heavy ? 34 : 16, heavy ? 1.9 : 1.0, 0.5, heavy ? 6 : 2);
    this._glint(p.x, p.y, p.z, heavy ? 0.6 : 0.32, heavy ? 0.12 : 0.09, 14, 10.5, 6.5);
    if (heavy) {
      this._line(p.x, p.y, p.z, _ht, 1.5, 0.1, 0.05, 14, 11, 7);
      this._ring(p.x, p.y, p.z, _hn, 1.7, 0.2, 1.3, 1.1, 0.85, 1);
    }
    this._flash(p.x, p.y, p.z, 0xffc890, heavy ? 4 : 2.2, heavy ? 0.12 : 0.08);
    for (let i = 0; i < (heavy ? 18 : 11); i++) {
      const o = 1.0 + 3.0 * r.next(),
        al = 2.2 * r.next();
      this._chip(
        p.x + _hn.x * 0.04,
        p.y + r.signed() * 0.05,
        p.z + _hn.z * 0.04,
        _hn.x * o + _ht.x * al + r.signed() * 1.2,
        0.4 + 2.4 * r.next() + _hn.y * o,
        _hn.z * o + _ht.z * al + r.signed() * 1.2,
      );
    }
    for (let i = 0; i < (heavy ? 9 : 6); i++) {
      P.kind = PARTICLE_KIND.PUFF;
      P.x = p.x + _hn.x * 0.1 + r.signed() * 0.08;
      P.y = p.y + r.signed() * 0.1;
      P.z = p.z + _hn.z * 0.1 + r.signed() * 0.08;
      const o = 0.5 + 1.3 * r.next();
      P.vx = _hn.x * o + _ht.x * 0.6 + r.signed() * 0.5;
      P.vy = 0.1 + 0.5 * r.next();
      P.vz = _hn.z * o + _ht.z * 0.6 + r.signed() * 0.5;
      P.life = 1.0 + 1.0 * r.next();
      P.size = 0.12 + 0.16 * r.next();
      P.seed = r.next();
      P.stretch = 0;
      P.r = 0.5;
      P.g = 0.49;
      P.b = 0.5;
      P.a = 0.2;
      P.gravity = -0.25;
      P.drag = 2.4;
      P.growth = 3.4;
      P.extra = 0.3;
      this.soft.emit(P);
    }
  }

  _onSlam(e) {
    if (this.off || !e || !e.pos) return;
    for (const q of this.slams)
      if (!q.on) {
        q.on = true;
        q.x = e.pos.x;
        q.z = e.pos.z;
        q.R = e.radius || 3;
        q.power = e.power || 1;
        return;
      }
  }
  _processSlams() {
    const boss = this.ctx.boss,
      sw = boss && boss.kit && boss.kit.sword;
    for (const q of this.slams) {
      if (!q.on) continue;
      q.on = false;
      const x = q.x,
        z = q.z,
        R = q.R,
        power = q.power;
      let lying = false;
      if (sw && sw.tip && sw.base && power >= 1) {
        sw.tip.getWorldPosition(_f);
        sw.base.getWorldPosition(_g);
        const dx = _f.x - _g.x,
          dz = _f.z - _g.z,
          l2 = dx * dx + dz * dz,
          u = l2 > 1e-6 ? Math.min(1, Math.max(0, ((x - _g.x) * dx + (z - _g.z) * dz) / l2)) : 0;
        lying = _f.y < 0.9 && _g.y < 3.2 && l2 > 4.8 && Math.hypot(x - _g.x - dx * u, z - _g.z - dz * u) < 0.9;
      }
      const small = power < 0.6;
      if (!this._waterSlam(x, z, small ? Math.min(R, 2.4) * 0.42 : R, small ? power * 0.6 : power)) continue;
      if (small) {
        this._ring(x, WATER_Y + 0.03, z, UP, 2.2, 0.3, 0.32, 0.4, 0.5, 0.5);
        continue;
      }
      if (power >= 1) {
        this._sparks(x, WATER_Y + 0.06, z, UP, 40, 2.6, 0.8, 12);
        this._glint(x, WATER_Y + 0.25, z, 0.9, 0.14, 12, 11.5, 10);
        this._waterRing(x, z, R * 3.2, 0.6);
        this._flash(x, 1.4, z, 0xe6ecff, 5, 0.18);
        if (lying) {
          const dx = _f.x - _g.x,
            dz = _f.z - _g.z,
            l = Math.hypot(dx, dz) || 1,
            px = -dz / l,
            pz = dx / l,
            r = this.rng;
          for (let i = 0; i < 3; i++) {
            const u = 0.38 + 0.23 * i,
              qx = _g.x + dx * u,
              qz = _g.z + dz * u,
              up = 3.6 + 1.2 * r.next();
            this.sheets.spawn(
              qx - px * 0.25,
              qz - pz * 0.25,
              Math.atan2(px, pz),
              1.0,
              0.3,
              2.4,
              up,
              0.5,
              0.35,
              0.03 * i,
              r.next(),
            );
            this.sheets.spawn(
              qx + px * 0.25,
              qz + pz * 0.25,
              Math.atan2(-px, -pz),
              1.0,
              0.3,
              2.4,
              up,
              0.5,
              0.35,
              0.03 * i,
              r.next(),
            );
            for (let k = 0; k < 14; k++) {
              const side = k & 1 ? 1 : -1,
                o = 1 + 3.5 * r.next();
              this._drop(
                qx + r.signed() * 0.5,
                WATER_Y + 0.03,
                qz + r.signed() * 0.5,
                px * side * o + r.signed(),
                2 + 4 * r.next(),
                pz * side * o + r.signed(),
                1,
              );
            }
          }
        }
      } else {
        this._ring(x, WATER_Y + 0.03, z, UP, R * 2.2, 0.42, 0.5, 0.6, 0.75, 0.35);
        this._flash(x, 1.2, z, 0xdfe8ff, 2.6, 0.12);
      }
    }
  }
  _onRoll(e) {
    if (this.off || !e || !e.pos) return;
    const j = this._claimJob();
    if (!j) return;
    const d = e.dir,
      l = d ? Math.hypot(d.x, d.z) || 1 : 1;
    j.kind = 'roll';
    j.who = this.ctx.player;
    j.t = 0;
    j.dur = 0.55;
    j.dx = d ? d.x / l : 0;
    j.dz = d ? d.z / l : 1;
    j.power = 1;
    j.acc = 0;
    j.n = 0;
  }
  _onStep(e) {
    if (this.off || !e || !e.pos) return;
    const f = e.who === 'boss' ? this.ctx.boss : this.ctx.player,
      yaw = f ? f.yaw : 0,
      dx = Math.sin(yaw),
      dz = Math.cos(yaw);
    if (e.who === 'boss') this._footSplash(e.pos.x, e.pos.z, dx * 0.5, dz * 0.5, e.run ? 4 : 3);
    else if (e.run) this._footSplash(e.pos.x, e.pos.z, dx, dz, 1);
  }
  _onLand(e) {
    if (this.off || !e || !e.pos) return;
    if (e.who === 'boss') this._waterSlam(e.pos.x, e.pos.z, e.hard ? 4 : 2.6, e.hard ? 3 : 1.6);
    else {
      this._footSplash(e.pos.x, e.pos.z, 0, 0, e.hard ? 2.2 : 1.4);
    }
  }
  _claimJob() {
    for (const j of this.jobs)
      if (!j.on) {
        j.on = true;
        return j;
      }
    return null;
  }
  _isRepeatStrike(p) {
    const s = this.struck,
      again = this.clock - s.t < 0.06 && Math.abs(p.x - s.x) + Math.abs(p.y - s.y) + Math.abs(p.z - s.z) < 0.6;
    s.t = this.clock;
    s.x = p.x;
    s.y = p.y;
    s.z = p.z;
    return again;
  }

  update(dt) {
    if (this.off) return;
    try {
      this._update(dt);
    } catch (e) {
      this._disableAfterError(e);
    }
  }
  frame(dt, alpha = 0) {
    if (this.off) return;
    try {
      this._frame(dt, alpha);
    } catch (e) {
      this._disableAfterError(e);
    }
  }
  _disableAfterError(e) {
    this.off = true;
    if (this.group) this.group.visible = false;
    if (this.flashLight) this.flashLight.intensity = 0;
    console.error('vfx: switched off after an error: ' + (e && e.stack ? e.stack : e));
  }

  _update(dt) {
    const t0 = performance.now(),
      ctx = this.ctx,
      r = this.rng;
    this.time += dt;
    this.clock += dt;
    this.pt += dt;
    this.stepped = true;
    if (this.time > REBASE) {
      this.time -= REBASE;
      this.shocks.rebase(REBASE);
      for (const tr of this.trails) tr.rebase(REBASE);
    }
    if (this.pt > REBASE) {
      this.pt -= REBASE;
      this.hot.rebase(REBASE);
      this.soft.rebase(REBASE);
      this.sheets.rebase(REBASE);
    }
    const t = this.time,
      pt = this.pt;
    this.hot.now = pt;
    this.soft.now = pt;
    this.sheets.now = pt;
    this.shocks.now = t;
    this.probe.update(this.clock);
    this._processSlams();
    const mood = ctx.gfx && ctx.gfx.mood ? ctx.gfx.mood : null,
      gold = mood ? mood.gold : 0,
      boss = ctx.boss,
      player = ctx.player;
    const f = this.flash;
    if (f.t > 0 && this.flashLight) {
      if (f.hold) f.hold = false;
      else f.t -= dt;
      const k = Math.max(0, f.t / f.dur);
      this.flashLight.intensity = f.peak * k * k;
    }
    this._ensureFighterTrail(0, player, TRAIL_LOOKS.pilgrim);
    this._ensureFighterTrail(1, boss, TRAIL_LOOKS.boss);
    this._updateGhostSwing(dt);
    for (const tr of this.trails) {
      if (tr === this.ghost.small || tr === this.ghost.large) {
        if (tr !== this.ghost.trail) continue;
      }
      tr.update(t, dt);
      if (tr === this.own[1] || tr === this.ghost.large) tr.boost = 1 + 0.5 * gold;
      if (tr.o.motes > 0 && tr.count > 3) {
        tr.acc += tr.o.motes * dt;
        while (tr.acc >= 1) {
          tr.acc -= 1;
          if (tr.pick(r.next() * 0.75, 0.25 + 0.75 * r.next(), _a))
            this._mote(
              _a.x,
              _a.y,
              _a.z,
              r.signed() * 0.3,
              -0.1 - 0.5 * r.next(),
              r.signed() * 0.3,
              _gold,
              1.3,
              0.7 + 0.9 * r.next(),
            );
        }
      }
      if (tr.dip.was) this._bladeWaterCut(tr);
    }
    for (const h of this.shocks.handles) {
      if (!h.alive) continue;
      const n = Math.min(5, 1 + Math.floor(h.radius * 0.35));
      for (let i = 0; i < n; i++) {
        const a = r.next() * 6.283;
        this._mote(
          h.x + Math.sin(a) * h.radius,
          WATER_Y + 0.05,
          h.z + Math.cos(a) * h.radius,
          Math.sin(a) * 0.6,
          0.5 + 0.9 * r.next(),
          Math.cos(a) * 0.6,
          _gold,
          1.2,
          0.5 + 0.7 * r.next(),
        );
      }
    }
    if (gold > 0.03 && boss && boss.alive !== false) {
      this.acc.embers += 46 * gold * dt;
      while (this.acc.embers >= 1) {
        this.acc.embers -= 1;
        const a = r.next() * 6.283,
          rad = 0.7 + 2.0 * r.next();
        this._ember(
          boss.pos.x + Math.sin(a) * rad,
          0.5 + 6.2 * r.next() * r.next(),
          boss.pos.z + Math.cos(a) * rad,
          Math.sin(a) * 0.3,
          0.3 + 0.8 * r.next(),
          Math.cos(a) * 0.3,
          7.5,
          5.2,
          1.9,
          2 + 2.4 * r.next(),
          2.2,
        );
      }
    }
    for (const j of this.jobs) {
      if (!j.on) continue;
      j.t += dt;
      if (j.t >= j.dur || !j.who) {
        j.on = false;
        continue;
      }
      if (j.kind === 'roll') {
        const p = j.who.pos,
          k = Math.sin(Math.PI * Math.min(1, j.t / j.dur));
        j.acc += (40 + 90 * k) * dt;
        while (j.acc >= 1) {
          j.acc -= 1;
          const side = r.next() < 0.5 ? -1 : 1,
            o = 1.2 + 2.2 * r.next();
          this._drop(
            p.x + r.signed() * 0.25,
            WATER_Y + 0.03,
            p.z + r.signed() * 0.25,
            -j.dz * side * o - j.dx * 0.8,
            1.2 + 2.4 * r.next() * k,
            j.dx * side * o - j.dz * 0.8,
            1,
          );
        }
        if (j.n < 4 && j.t > j.n * 0.12) {
          j.n++;
          const yaw = Math.atan2(j.dx, j.dz);
          this.sheets.spawn(p.x, p.z, yaw + 1.5708, 0.9, 0.2, 1.3, 2.5, 0.45, 0.5, 0, r.next());
          this.sheets.spawn(p.x, p.z, yaw - 1.5708, 0.9, 0.2, 1.3, 2.5, 0.45, 0.5, 0, r.next());
          this._mistPuff(p.x, WATER_Y + 0.15, p.z, -j.dx * 0.8, 0.7, -j.dz * 0.8, 0.5, 0.8 + 0.3 * r.next(), 0.24, 0.7);
        }
      }
    }
    this.sheets.update(pt);
    this.shocks.update(t, dt);
    this.hot.update(pt);
    this.soft.update(pt);
    this.hot.now = this.soft.now = this.sheets.now = pt + dt;
    this.mist.update(this.clock);
    this.dustAir.update(this.clock);
    this.bodies.update(dt);
    if (this.prime > 0) {
      this.hot.mesh.visible = this.soft.mesh.visible = this.sheets.mesh.visible = this.shocks.mesh.visible = true;
      for (const tr of this.trails) tr.mesh.visible = true;
    }
    this.cpu.update += (performance.now() - t0 - this.cpu.update) * 0.05;
    if (this.log) {
      const L = this.log;
      this.trails.forEach((tr, i) => {
        if (i < 4 && tr.speed > L.peak[i]) L.peak[i] = tr.speed;
      });
      if (this.clock >= L.next) {
        L.next = this.clock + L.every;
        console.error(
          'fx ' +
            this.clock.toFixed(2) +
            ' trails ' +
            this.trails
              .map(
                (tr, i) =>
                  `[len ${tr.length.toFixed(2)} manual ${tr.manual} on ${tr.on} peak ${(L.peak[i] || 0).toFixed(1)} m/s samples ${tr.count} dip ${tr.dip.was}]`,
              )
              .join(' ') +
            ' lights ' +
            this.probe.count +
            ' cpu ' +
            this.cpu.update.toFixed(3),
        );
        L.peak.fill(0);
      }
    }
  }

  _ensureFighterTrail(slot, fighter, look) {
    const sw = fighter && fighter.kit && fighter.kit.sword;
    if (!sw || !sw.tip || !sw.base) return;
    const cur = this.own[slot];
    if (cur && cur.weapon.tip === sw.tip) return;
    let t = null;
    for (const x of this.trails)
      if (x.weapon.tip === sw.tip) {
        t = x;
        break;
      }
    this.own[slot] = t || this._newTrail(sw, look);
  }

  _bladeWaterCut(tr) {
    const d = tr.dip,
      r = this.rng,
      big = tr.length > 2.2;
    if (d.enter) {
      if (d.speed > 2.5) {
        if (big) this._waterSlam(d.x, d.z, 1.1, Math.min(2.2, 0.4 + d.speed * 0.05));
        else {
          _f.set(d.x, WATER_Y, d.z);
          this.spray(_f, UP, 8, 0.6);
        }
      }
      tr.cut = this.clock;
      return;
    }
    if (d.speed < 1.5 || this.clock - tr.cut < (big ? 0.07 : 0.09)) return;
    tr.cut = this.clock;
    const dx = d.vx / d.speed,
      dz = d.vz / d.speed,
      s = Math.min(1, d.speed / (big ? 26 : 12));
    if (big) {
      this.sheets.spawn(
        d.x - dx * 0.4,
        d.z - dz * 0.4,
        Math.atan2(dx, dz),
        0.8,
        0.4,
        1.5 + 4.5 * s,
        3 + 3.6 * s,
        0.5,
        0.3,
        0,
        r.next(),
      );
      for (let i = 0; i < 12; i++) {
        const o = (2 + 7 * r.next()) * (0.4 + 0.6 * s);
        this._drop(
          d.x + r.signed() * 0.4,
          WATER_Y + 0.03,
          d.z + r.signed() * 0.4,
          dx * o + r.signed() * 1.4,
          (2 + 5 * r.next()) * (0.5 + 0.5 * s),
          dz * o + r.signed() * 1.4,
          1,
        );
      }
      this._mistPuff(d.x, WATER_Y + 0.3, d.z, dx * 2.5, 1.3, dz * 2.5, 0.8, 1.2 + 0.8 * r.next(), 0.2, 0.5);
      if (s > 0.2) {
        _hx.set(dx * 0.7, 0.7, dz * 0.7).normalize();
        this._sparks(d.x, WATER_Y + 0.05, d.z, _hx, 3 + Math.round(6 * s), 0.8 + s, 0.5, s > 0.6 ? 1 : 0);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const o = (1 + 3 * r.next()) * (0.4 + 0.6 * s);
        this._drop(
          d.x,
          WATER_Y + 0.02,
          d.z,
          dx * o + r.signed() * 0.6,
          0.8 + 2.2 * r.next(),
          dz * o + r.signed() * 0.6,
          1,
        );
      }
      if (r.next() < 0.5) this._mistPuff(d.x, WATER_Y + 0.08, d.z, dx, 0.5, dz, 0.2, 0.5, 0.15, 0.8);
    }
  }

  _updateGhostSwing(dt) {
    const g = this.ghost;
    if (!g.trail) return;
    g.t += dt;
    const k = Math.min(1, g.t / g.dur),
      e = k * k * (3 - 2 * k);
    g.pivot.rotation.set(g.tilt, g.from + (g.to - g.from) * e, 0);
    g.pivot.updateMatrixWorld(true);
    if (g.t > g.dur + 1.2) {
      g.trail.clear();
      g.trail = null;
    }
  }
  _swing(big) {
    const g = this.ghost,
      c = this._pointAheadOfPlayer(big ? 6 : 2.6);
    g.trail = big ? g.large : g.small;
    g.t = 0;
    g.dur = big ? 0.5 : 0.2;
    g.big = big;
    g.trail.clear();
    g.pivot.position.set(c.x, big ? 4.6 : 1.35, c.z);
    g.tilt = big ? 0.5 : -0.35;
    g.base.position.set(0, 0, big ? 1.6 : 0.55);
    g.tip.position.set(0, 0, big ? 6.2 : 1.5);
    g.from = big ? 2.3 : -2.0;
    g.to = big ? -0.9 : 1.9;
    g.pivot.rotation.set(g.tilt, g.from, 0);
    g.pivot.updateMatrixWorld(true);
  }

  _frame(dt, alpha) {
    const t0 = performance.now(),
      T = this.tune;
    this.lead = Math.min(1, Math.max(0, alpha)) * this.DT;
    if (!this.stepped && alpha >= 1 && dt > 0 && T.live > 0) {
      this.pt += Math.min(dt, 0.05) * T.live;
      this.hot.now = this.soft.now = this.sheets.now = this.pt + this.DT;
    }
    this.stepped = false;
    const t = this.time + this.lead,
      c = this.clock + this.lead,
      pt = this.pt + this.lead;
    this.hot.material.uniforms.uGain.value = T.hot;
    this.soft.material.uniforms.uGain.value = T.soft;
    this.sheets.material.uniforms.uGain.value = T.sheets;
    this.shocks.material.uniforms.uGain.value = T.shock;
    this.mist.uniforms.uOpacity.value = T.mist * T.air;
    this.dustAir.uniforms.uGain.value = T.dust * T.air;
    this.hot.frame(pt);
    this.soft.frame(pt);
    this.sheets.frame(pt);
    this.shocks.frame(t);
    for (const tr of this.trails) tr.frame(t, T.trails);
    this.mist.frame(c);
    this.dustAir.frame(c);
    if (this.prime > 0 && --this.prime === 0) {
      this.bodies.removePrimers();
      for (const tr of this.trails) tr.mesh.visible = tr.count >= 2;
    }
    this.cpu.frame += (performance.now() - t0 - this.cpu.frame) * 0.05;
    if (this.ab && !this.ab.sent && this.clock >= this.ab.from) this._abCostStep();
  }

  _abCostStep() {
    const a = this.ab,
      now = performance.now();
    if (a.last) (a.on ? a.tOn : a.tOff).push(now - a.last);
    a.last = now;
    a.n++;
    a.on = Math.floor(a.n / 12) % 2 === 0;
    this.group.visible = a.on;
    if (a.n < a.frames) return;
    a.sent = true;
    this.group.visible = true;
    const stat = (l) => {
      const s = l.slice().sort((x, y) => x - y),
        n = s.length;
      return n
        ? {
            n,
            median: +s[n >> 1].toFixed(2),
            mean: +(s.reduce((x, y) => x + y, 0) / n).toFixed(2),
            p90: +s[Math.floor(n * 0.9)].toFixed(2),
            min: +s[0].toFixed(2),
          }
        : { n: 0 };
    };
    const on = stat(a.tOn),
      off = stat(a.tOff);
    const out = {
      shown: on,
      hidden: off,
      costMedianMs: +(on.median - off.median).toFixed(2),
      costMeanMs: +(on.mean - off.mean).toFixed(2),
      costP90Ms: +(on.p90 - off.p90).toFixed(2),
      cpu: this.stats(),
    };
    console.warn('THREE fx ab: ' + JSON.stringify(out).slice(0, 150));
    fetch('/__shot/' + a.name, { method: 'POST', body: JSON.stringify(out) }).catch(() => {});
  }

  stats() {
    return { updateMs: +this.cpu.update.toFixed(3), frameMs: +this.cpu.frame.toFixed(3), calls: this.calls };
  }

  _pointAheadOfPlayer(ahead = 3.2) {
    const p = this.ctx.player,
      b = this.ctx.boss;
    if (!p) return _c.set(0, 0, 9);
    _c.set(b ? b.pos.x - p.pos.x : 0, 0, b ? b.pos.z - p.pos.z : -1);
    if (_c.lengthSq() < 1e-4) _c.set(0, 0, -1);
    _c.normalize().multiplyScalar(ahead).add(p.pos);
    _c.y = 0;
    return _c;
  }
  demo(name = 'sparks') {
    const fn = DEMOS[name];
    if (!fn) {
      console.warn('vfx.demo: no demo named "' + name + '". There are: ' + Object.keys(DEMOS).join(', '));
      return;
    }
    if (!this.off) fn(this);
  }

  dispose() {
    if (!this.group) return;
    this.off = true;
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    this.bodies.dispose();
    for (const t of this.trails) t.dispose();
    for (const x of [this.hot, this.soft, this.sheets, this.shocks, this.mist, this.dustAir]) x.dispose();
    this.noise.dispose();
    if (this.flashLight) this.flashLight.intensity = 0;
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

const _p = new THREE.Vector3(),
  _q = new THREE.Vector3();
const DEMOS = {
  sparks: (v) => {
    _p.copy(v._pointAheadOfPlayer()).setY(1.2);
    v.sparks(_p, _q.set(0.4, 0.5, 0.3), 16, 1);
  },
  sparksBig: (v) => {
    _p.copy(v._pointAheadOfPlayer()).setY(1.3);
    v.sparks(_p, _q.set(-0.4, 0.6, 0.2), 40, 2.5);
  },
  spray: (v) => {
    _p.copy(v._pointAheadOfPlayer()).setY(WATER_Y);
    v.spray(_p, _q.set(0.5, 0, 0.3), 24, 1);
  },
  sprayBig: (v) => {
    _p.copy(v._pointAheadOfPlayer(4)).setY(WATER_Y);
    v.spray(_p, _q.set(0.8, 0, 0.2), 60, 3);
  },
  sheet: (v) => {
    _p.copy(v._pointAheadOfPlayer(5)).setY(WATER_Y);
    v.sheet(_p, _q.set(0, 0, 1), 5, 2);
  },
  splashRing: (v) => {
    _p.copy(v._pointAheadOfPlayer(6));
    v.splashRing(_p, 3, 3);
  },
  splashSmall: (v) => {
    _p.copy(v._pointAheadOfPlayer(3));
    v.splashRing(_p, 0.8, 0.5);
  },
  dust: (v) => {
    _p.copy(v._pointAheadOfPlayer()).setY(0.5);
    v.dust(_p, 8);
  },
  embers: (v) => {
    _p.copy(v._pointAheadOfPlayer()).setY(0.9);
    v.embers(_p, 24);
  },
  motes: (v) => {
    _p.copy(v._pointAheadOfPlayer()).setY(1.2);
    v.motes(_p, 30, 0xffe2a0);
  },
  impact: (v) => {
    _p.copy(v._pointAheadOfPlayer()).setY(1.25);
    v.impact(_p, _q.set(0.7, 0, 0.3), 1.2);
  },
  shock: (v) => {
    const b = v.ctx.boss;
    _p.set(b ? b.pos.x : 0, 0, b ? b.pos.z : -9);
    v.shock(_p, 22, 0xffe2a0, 3);
  },
  shockNear: (v) => {
    _p.copy(v._pointAheadOfPlayer(5));
    v.shock(_p, 9, 0xffe2a0, 2.5);
  },
  hitFlash: (v) => {
    v.hitFlash(v.ctx.boss, 0.6, 0xfff0d0, 1.4);
  },
  hitFlashPlayer: (v) => {
    v.hitFlash(v.ctx.player, 0.6, 0xffd2b0, 1.7);
  },
  dissolve: (v) => {
    v.dissolve(v.ctx.boss.root, 4);
  },
  dissolvePlayer: (v) => {
    v.dissolve(v.ctx.player.root, 3);
  },
  trail: (v) => v._swing(false),
  trailBig: (v) => v._swing(true),
  gust: (v) => {
    _p.copy(v._pointAheadOfPlayer(6));
    v.gust(_p, 0.9);
  },
  step: (v) => {
    v._onStep({ who: 'player', pos: v._pointAheadOfPlayer(1.5), run: true });
  },
  stepBoss: (v) => {
    v._onStep({ who: 'boss', pos: v._pointAheadOfPlayer(5), run: false });
  },
  roll: (v) => {
    const p = v.ctx.player;
    v._onRoll({ pos: p.pos, dir: _q.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)) });
  },
  slam: (v) => {
    _p.copy(v._pointAheadOfPlayer(6));
    v._waterSlam(_p.x, _p.z, 3.5, 3);
  },
  hit: (v) => demoHit(v, true, { heavy: false, damage: 16 }),
  hitHeavy: (v) => demoHit(v, true, { heavy: true, damage: 34 }),
  hitColossal: (v) => demoHit(v, true, { heavy: true, damage: 34, fatal: true }),
  hitPlayer: (v) => demoHit(v, false, { heavy: true, damage: 24 }),
  hitPlayerColossal: (v) => demoHit(v, false, { heavy: true, damage: 48, knockdown: true }),
  hitLight: (v) => demoHit(v, false, { heavy: false, damage: 18, kind: 'chorale' }),
  block: (v) => demoHit(v, false, { heavy: true, damage: 3, blocked: true }),
  blockColossal: (v) => demoHit(v, false, { heavy: true, damage: 4, blocked: true, knockdown: true }),
  clashStone: (v) => {
    const p = v.ctx.player,
      fx = Math.sin(p.yaw),
      fz = Math.cos(p.yaw);
    _p.set(p.pos.x + fx * 1.1, 1.25, p.pos.z + fz * 1.1);
    v._onClash({
      point: _p,
      stone: true,
      normal: _q.set(-fx, 0, -fz),
      dir: _r3.set(fz * 0.9 + fx * 0.4, -0.1, -fx * 0.9 + fz * 0.4),
    });
  },
  clashFloor: (v) => {
    const p = v.ctx.player,
      fx = Math.sin(p.yaw),
      fz = Math.cos(p.yaw);
    _p.set(p.pos.x + fx * 1.2, WATER_Y, p.pos.z + fz * 1.2);
    v._onClash({
      point: _p,
      stone: true,
      floor: true,
      normal: _q.set(0, 1, 0),
      dir: _r3.set(fx * 0.5, -0.85, fz * 0.5),
    });
  },
  slamHeavy: (v) => {
    _p.copy(v._pointAheadOfPlayer(5));
    v._onSlam({ pos: _p, radius: 2.7, power: 0.8 });
  },
  slamColossal: (v) => {
    _p.copy(v._pointAheadOfPlayer(6));
    v._onSlam({ pos: _p, radius: 5, power: 1 });
  },
};
function demoHit(v, onHer, o) {
  const b = v.ctx.boss,
    p = v.ctx.player;
  if (!b || !p) return;
  _q.set(p.pos.x - b.pos.x, 0, p.pos.z - b.pos.z).normalize();
  const h = {
    attacker: onHer ? p : b,
    target: onHer ? b : p,
    point: _p,
    dir: _r3,
    heavy: false,
    damage: 16,
    blocked: false,
    fatal: false,
  };
  if (onHer) {
    _p.set(b.pos.x + _q.x * 0.9 - _q.z * 0.5, 1.5, b.pos.z + _q.z * 0.9 + _q.x * 0.5);
    _r3.set(_q.z, -0.25, -_q.x).normalize();
  } else {
    _p.set(p.pos.x - _q.x * 0.3 + _q.z * 0.1, 1.2, p.pos.z - _q.z * 0.3 - _q.x * 0.1);
    _r3.set(_q.z * 0.8 + _q.x * 0.5, -0.3, -_q.x * 0.8 + _q.z * 0.5).normalize();
  }
  v._onHit(Object.assign(h, o));
}
const _r3 = new THREE.Vector3();
