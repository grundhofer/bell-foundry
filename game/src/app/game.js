// @ts-check
// Composition root: builds the shared context and every system, runs the fixed-step loop and draws the frames.
// What happens when (title, fight, phase two, ending) lives in flow.js; the systems talk through ctx.bus.
import * as THREE from 'three';
import { EventBus } from '../core/event-bus.js';
import { Assets } from '../core/assets.js';
import { Loop } from '../core/loop.js';
import * as inputMod from '../core/input.js';
import * as gfxMod from '../graphics/renderer.js';
import * as arenaMod from '../world/arena.js';
import * as waterMod from '../graphics/water/water.js';
import * as candlesMod from '../world/candles.js';
import * as vfxMod from '../graphics/effects/visual-effects.js';
import { Impacts } from '../graphics/effects/impacts.js';
import * as audioMod from '../audio/game-audio.js';
import * as combatMod from '../characters/combat.js';
import * as playerMod from '../characters/player.js';
import * as bossMod from '../characters/boss.js';
import * as camMod from '../camera/play-camera.js';
import * as cineMod from '../cinematics/director.js';
import * as uiMod from '../ui/ui.js';
import { Hardware } from '../hardware/controller-input.js';
import { Flow } from './flow.js';

/**
 * Modules whose ASSETS are loaded before the systems are built.
 * @type {Record<string, any>[]}
 */
const MODULES = [
  inputMod,
  gfxMod,
  arenaMod,
  waterMod,
  candlesMod,
  vfxMod,
  audioMod,
  combatMod,
  playerMod,
  bossMod,
  camMod,
  cineMod,
  uiMod,
];
/** Address options that run the game unattended (screenshots, measurements, bot fights). */
const AUTO = ['shot', 'perf', 'fight', 'pilot', 'capture'];
const _v = new THREE.Vector3();

/**
 * The context every system receives. Systems are added by Game in this order; later ones may use earlier ones.
 * @typedef {object} GameContext
 * @property {number} DT fixed step in seconds
 * @property {import('../config/options.js').Options} params options from the page address
 * @property {EventBus} bus events between systems
 * @property {Assets} assets loaded files
 * @property {Game} game
 * @property {boolean} dev developer mode (?dev or an unattended run)
 * @property {any} input
 * @property {any} ui
 * @property {any} hw
 * @property {any} [gfx]
 * @property {THREE.Scene} [scene]
 * @property {THREE.PerspectiveCamera} [camera]
 * @property {any} [arena]
 * @property {any} [water]
 * @property {any} [candles]
 * @property {any} [vfx]
 * @property {any} [impacts]
 * @property {any} [audio]
 * @property {any} [combat]
 * @property {any} [player]
 * @property {any} [boss]
 * @property {any} [cam]
 * @property {any} [cine]
 * @property {Record<string, any>} [look] what the foundry look added (look/install.js)
 */

/**
 * A system takes part in the fixed step. The order of the list is the order of the step.
 * @typedef {{ update(dt: number): void }} System
 */

export class Game {
  /** @param {{ canvas: HTMLCanvasElement, uiRoot: HTMLElement, params: import('../config/options.js').Options }} o */
  constructor({ canvas, uiRoot, params }) {
    const auto = AUTO.some((k) => params.has(k));
    this.seed = +(params.get('seed') || 1) || 1;
    this.canvas = canvas;
    this.params = params;
    this.auto = auto;
    this.dev = params.has('dev') || auto;
    this.time = 0;
    this.paused = false;
    this.slowT = 0;
    this.drawFrames = true;
    /** The exhibition mode, when the address asks for it (?expo). */
    this.expo = null;
    /**
     * Extension points for modes and tools (dev, expo). Each list runs in order:
     * stepStart before anything else in a step, afterInput once the input is read, camera after the camera is placed.
     * @type {{ stepStart: ((dt: number) => void)[], afterInput: ((dt: number) => void)[], camera: ((camera: THREE.Camera) => void)[] }}
     */
    this.hooks = { stepStart: [], afterInput: [], camera: [] };
    /** @type {{ name: string, system: System }[]} */
    this.systems = [];
    const base = {
      DT: 1 / 60,
      params,
      bus: new EventBus(),
      assets: new Assets(),
      game: /** @type {Game} */ (this),
      dev: this.dev,
    };
    const ctx = (this.ctx = /** @type {GameContext} */ (base)); // input, ui and hw follow right below
    ctx.input = new inputMod.Input(ctx, canvas);
    ctx.ui = new uiMod.UI(ctx, uiRoot);
    ctx.hw = new Hardware(ctx);
    this.flow = new Flow(this);
    this.loop = new Loop({
      step: (dt) => this.step(dt),
      frame: (dt, a) => this.frame(dt, a),
      onError: (e) => this.reportFatalError(e),
    });
  }

  async load() {
    const ctx = this.ctx,
      p = this.params,
      manifest = {};
    for (const m of MODULES) Object.assign(manifest, m.ASSETS || {});
    await ctx.assets.load(manifest, (f) => ctx.ui.setLoading(f * 0.9));
    const size = this.auto ? [+(p.get('shotw') || 1600), +(p.get('shoth') || 900)] : null;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const phone = p.has('phone')
      ? p.get('phone') !== '0'
      : coarse && Math.min(window.innerWidth, window.innerHeight) < 560;
    if (!p.get('q') && !(ctx.ui.saved && ctx.ui.saved.quality) && (coarse || phone))
      ctx.ui.settings.quality = phone ? 'low' : 'medium';
    ctx.gfx = new gfxMod.Graphics(ctx, this.canvas, {
      quality: p.get('q') || ctx.ui.settings.quality || 'high',
      size,
      phone,
      preserve: this.auto,
    });
    ctx.scene = ctx.gfx.scene;
    ctx.camera = ctx.gfx.camera;
    ctx.arena = new arenaMod.Arena(ctx);
    ctx.water = new waterMod.Water(ctx);
    ctx.candles = new candlesMod.Candles(ctx);
    ctx.vfx = new vfxMod.VisualEffects(ctx);
    ctx.impacts = new Impacts(ctx);
    ctx.audio = new audioMod.GameAudio(ctx);
    ctx.combat = new combatMod.Combat(ctx);
    ctx.player = new playerMod.Player(ctx);
    ctx.boss = new bossMod.Boss(ctx);
    ctx.cam = new camMod.PlayCamera(ctx);
    ctx.cine = new cineMod.Director(ctx);
    const order = [
      'player',
      'boss',
      'combat',
      'arena',
      'water',
      'candles',
      'vfx',
      'impacts',
      'cine',
      'cam',
      'ui',
      'audio',
    ];
    for (const name of order) this.addSystem(name, ctx[name]);
    ctx.ui.on((e) => this.onUi(e));
    this.flow.wire();
    if (ctx.gfx.warm) await ctx.gfx.warm();
    ctx.ui.setLoading(1);
    if (ctx.ui.loaded) ctx.ui.loaded();
  }

  /**
   * Adds a system to the fixed step, at the end or right after another one.
   * @param {string} name
   * @param {System} system
   * @param {{ after?: string }} [o]
   */
  addSystem(name, system, { after } = {}) {
    const entry = { name, system };
    const i = after ? this.systems.findIndex((s) => s.name === after) : -1;
    if (after && i < 0) throw new Error(`addSystem: no system "${after}"`);
    if (i < 0) this.systems.push(entry);
    else this.systems.splice(i + 1, 0, entry);
  }

  /** The state of the duel (see flow.js). */
  get state() {
    return this.flow.state;
  }

  /** @param {string} [at] see Flow.begin */
  begin(at = 'title') {
    this.flow.begin(at);
  }

  start(at = 'title') {
    this.begin(at);
    this.loop.start();
  }

  reportFatalError(e) {
    console.error(e);
    document.title = 'error: ' + e.message;
  }

  pause(on) {
    if (this.paused === on) return;
    this.paused = on;
    this.loop.scale = on ? 0 : 1;
    if (on) {
      this.ctx.ui.showScreen('pause');
      if (document.exitPointerLock) document.exitPointerLock();
    } else if (this.state === 'fight') this.ctx.ui.showScreen('hud');
    if (!on && this.ctx.input.settle) this.ctx.input.settle();
    if (this.ctx.audio.pause) this.ctx.audio.pause(on);
  }

  /** Freezes the simulation for a moment (the hit stop of a heavy blow). @param {number} seconds */
  hitStop(seconds) {
    this.loop.freeze = Math.max(this.loop.freeze, seconds);
  }

  /** Slow motion for a while, in real seconds. @param {number} scale @param {number} seconds */
  slow(scale, seconds) {
    this.loop.scale = scale;
    this.slowT = seconds;
  }

  onUi(e) {
    const c = this.ctx;
    if (e.type === 'play') {
      c.audio.unlock();
      if (this.state === 'title') this.begin(e.skipIntro ? 'fight' : 'intro');
    } else if (e.type === 'resume') this.pause(false);
    else if (e.type === 'restart') this.begin('fight');
    else if (e.type === 'title') this.begin('title');
    else if (e.type === 'skip') c.cine.skip();
    else if (e.type === 'setting') {
      if (e.key === 'quality') c.gfx.setQuality(e.value);
      else if (e.key === 'sensitivity') c.input.sensitivity = e.value;
      else if (e.key === 'invertY') c.input.invertY = e.value;
      else if (e.key === 'music' || e.key === 'sfx' || e.key === 'voice') c.audio.setVolumes(c.ui.settings);
      c.bus.emit('setting', { key: e.key, value: e.value });
    }
  }

  /** One fixed simulation step. @param {number} dt */
  step(dt) {
    const c = this.ctx,
      hooks = this.hooks;
    for (const h of hooks.stepStart) h(dt);
    c.hw.update(dt);
    c.input.update();
    for (const h of hooks.afterInput) h(dt);
    this.time += dt;
    this.flow.update(dt);
    for (const s of this.systems) s.system.update(dt);
  }

  /** Draws one frame between two steps (alpha: how far towards the next step). */
  frame(dt, alpha) {
    const c = this.ctx;
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0 && !this.paused) this.loop.scale = 1;
    }
    if (this.paused) c.hw.update(dt);
    if (!this.drawFrames) return;
    if (c.cam.frame) c.cam.frame(dt, alpha);
    for (const h of this.hooks.camera) h(c.camera);
    c.audio.setListener(c.camera);
    const p = c.player,
      b = c.boss,
      hud = this.state === 'fight' || this.state === 'rescue';
    c.ui.setPlayer({
      hp: p.hp,
      hpMax: p.hpMax,
      stamina: p.stamina,
      staminaMax: p.staminaMax,
      flasks: p.flasks,
      flasksMax: p.flasksMax,
    });
    c.ui.setBoss({ name: b.name, hp: b.hp, hpMax: b.hpMax, visible: hud && b.alive });
    if (c.cam.mode === 'lock' && b.alive) {
      if (c.cam.lockPoint) _v.copy(c.cam.lockPoint);
      else _v.set(b.pos.x, 0.55 * 6.6, b.pos.z);
      _v.project(c.camera);
      const r = this.canvas.getBoundingClientRect();
      c.ui.setLock((_v.x * 0.5 + 0.5) * r.width, (-_v.y * 0.5 + 0.5) * r.height, _v.z < 1);
    } else c.ui.setLock(0, 0, false);
    if (c.water.frame) c.water.frame(dt, alpha);
    if (c.vfx.frame) c.vfx.frame(dt, alpha);
    c.impacts.frame(dt, alpha);
    c.gfx.render(dt);
  }
}
