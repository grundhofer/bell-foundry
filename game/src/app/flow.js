// @ts-check
// The course of one duel as a state machine:
//
//   title -> intro -> fight <-> rescue        (the player falls and is carried back)
//                       |
//                       +-> phase -> fight    (the boss turns at half health)
//                       +-> won               (the boss falls: ending, then the end screen)
//
// Flow decides when to switch and what each switch starts (screen, cutscene, music). The fighters, the camera and the
// effects react through the bus ('state', 'player-died', 'player-rescued', 'fight-reset').
import { damp } from '../core/math.js';
import { applyDifficulty } from '../core/rules.js';

const RESCUE_WAIT = 0.7;
const WON_FADE = 3.2;
const SKIP_HOLD = 0.7;

/** @typedef {'boot' | 'title' | 'intro' | 'fight' | 'phase' | 'rescue' | 'won'} FlowState */

export class Flow {
  /** @param {import('./game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
    /** @type {FlowState} */
    this.state = 'boot';
    this.stateTime = 0;
    this.skipHold = 0;
    this.killWait = null;
    this.pendingPhase = false;
    this.relit = 0;
    this.wonStage = 0;
    this.rescueWait = 0;
    this.rescues = 0;
  }

  /** Listens for what makes the flow move on its own. Call once the fighters exist. */
  wire() {
    this.ctx.bus.on('boss-phase', (e) => {
      if (e.phase === 2 && this.state === 'fight') this.pendingPhase = true;
    });
  }

  /** @param {FlowState} state */
  set(state) {
    const from = this.state;
    if (from === state) return;
    this.state = state;
    this.stateTime = 0;
    this.ctx.input.wantLock = state === 'fight';
    this.ctx.bus.emit('state', { from, to: state });
  }

  /** Puts fighters, light and screen back to the start of a fight. Emits 'fight-reset' when done. */
  reset() {
    const c = this.ctx;
    if (c.cine.playing) c.cine.skip();
    c.cine.title(false);
    c.player.puppet = false;
    c.boss.puppet = false;
    if (c.ui && c.ui.settings) applyDifficulty(c, c.ui.settings.difficulty);
    c.player.reset();
    c.boss.reset();
    c.candles.relight(1, 0);
    c.gfx.mood.candle = 1;
    c.gfx.mood.gold = 0;
    c.gfx.post.fade = 0;
    c.gfx.post.letterbox = 0;
    c.gfx.post.hurt = 0;
    c.ui.fade(0);
    c.ui.letterbox(0);
    c.ui.banner(null);
    c.ui.prompt(null);
    this.pendingPhase = false;
    this.relit = 0;
    this.wonStage = 0;
    this.killWait = null;
    this.rescueWait = 0;
    this.rescues = 0;
    if (c.cam.mode !== 'free') {
      c.cam.mode = 'free';
      c.player.locked = false;
    }
    c.cam.snapBehind();
    c.bus.emit('fight-reset', {});
  }

  /**
   * Starts the duel at a given point: 'title', 'intro', 'fight', 'phase2' (the turn), 'fight2' (second phase),
   * 'ending', 'rescue' or 'dead' (the player has just fallen).
   * @param {string} [at]
   */
  begin(at = 'title') {
    const c = this.ctx;
    this.reset();
    this.game.pause(false);
    if (at === 'title') {
      this.set('title');
      c.ui.showScreen('title');
      c.cine.title(true);
      c.audio.music('title');
    } else if (at === 'intro') {
      this.set('intro');
      c.ui.showScreen('none');
      c.cine.play('intro');
      c.audio.music('intro');
    } else if (at === 'phase2') {
      c.boss.hp = c.boss.hpMax * 0.5;
      c.boss.phase = 2;
      this.toFight(false);
      this.toPhase();
    } else if (at === 'fight2') {
      c.boss.hp = c.boss.hpMax * 0.5;
      this.applyPhase(2);
      this.toFight();
    } else if (at === 'ending') {
      c.boss.hp = 0;
      c.boss.alive = false;
      this.applyPhase(2);
      this.toFight(false);
      this.toWon();
    } else if (at === 'rescue' || at === 'dead') {
      this.toFight();
      c.player.hp = 1;
      if (c.params.get('death') === 'face')
        c.player.yaw = Math.atan2(c.player.pos.x - c.boss.pos.x, c.player.pos.z - c.boss.pos.z);
      c.combat.strike({ attacker: c.boss, target: c.player, damage: 999, heavy: true });
    } else this.toFight();
  }

  toFight(music = true) {
    const c = this.ctx;
    this.set('fight');
    c.ui.showScreen('hud');
    if (music) c.audio.music(c.boss.phase === 2 ? 'phase2' : 'phase1');
  }

  toPhase() {
    const c = this.ctx;
    this.set('phase');
    c.ui.showScreen('none');
    c.cine.play('phase2');
    c.audio.music('turn');
  }

  toWon() {
    const c = this.ctx;
    this.set('won');
    this.wonStage = 0;
    c.ui.showScreen('none');
    c.cine.play('ending');
    c.audio.music('ending');
  }

  /** @param {number} n */
  applyPhase(n) {
    const c = this.ctx;
    if (n === 2) {
      c.boss.enterPhase(2);
      if (c.candles.lit > 0.02) c.candles.snuffAll(0);
      c.gfx.mood.candle = 0;
      c.gfx.mood.gold = 1;
      this.relit = 0;
    }
  }

  /** Holding 'skip' during a cutscene skips it. @param {number} dt */
  updateCutsceneSkip(dt) {
    const c = this.ctx;
    if (!c.cine.playing) {
      if (this.skipHold) {
        this.skipHold = 0;
        if (c.ui.skip) c.ui.skip(0);
      }
      return;
    }
    if (c.input.held('skip')) {
      this.skipHold += dt;
      if (this.skipHold > SKIP_HOLD) {
        this.skipHold = 0;
        c.cine.skip();
      }
    } else this.skipHold = Math.max(0, this.skipHold - dt * 2);
    if (c.ui.skip) c.ui.skip(Math.min(1, this.skipHold / SKIP_HOLD));
  }

  /** One fixed step of the flow, before the fighters move. @param {number} dt */
  update(dt) {
    const c = this.ctx,
      st = this.state;
    this.stateTime += dt;
    const t = this.stateTime;
    this.updateCutsceneSkip(dt);
    if (st === 'intro') {
      if (!c.cine.playing) this.toFight();
    } else if (st === 'fight') {
      if (!c.player.alive) {
        this.set('rescue');
        this.rescueWait = RESCUE_WAIT;
        c.bus.emit('player-died', {});
      } else if (!c.boss.alive) {
        if (this.killWait === null) {
          this.killWait = 0.55;
          this.game.slow(0.3, 1.5);
        } else if ((this.killWait -= dt) <= 0) {
          this.killWait = null;
          this.toWon();
        }
      } else if (this.pendingPhase) {
        this.pendingPhase = false;
        this.toPhase();
      } else if (c.input.pressed('pause')) this.game.pause(true);
      else if (c.boss.phase === 2) {
        const want = Math.floor((1 - c.boss.hp / (c.boss.hpMax * 0.5)) * 6) / 10;
        if (want > this.relit) {
          this.relit = want;
          c.candles.relight(want, 2.5);
        }
      }
    } else if (st === 'phase') {
      if (!c.cine.playing) {
        this.applyPhase(2);
        this.toFight(true);
      }
    } else if (st === 'rescue') {
      if (this.rescueWait > 0) {
        this.rescueWait -= dt;
        if (this.rescueWait <= 0) {
          c.ui.showScreen('none');
          c.cine.play('rescue');
        }
      } else if (!c.cine.playing) {
        this.toFight(false);
        c.bus.emit('player-rescued', {});
      }
    } else if (st === 'won') {
      if (this.wonStage === 0 && !c.cine.playing) {
        this.wonStage = 1;
        this.stateTime = 0;
        c.candles.relight(1, 4);
        c.ui.showScreen('end');
      } else if (this.wonStage === 1) {
        const f = Math.min(1, t / WON_FADE),
          k = f * f * (3 - 2 * f);
        c.gfx.post.fade = k;
        c.ui.fade(k);
        if (f >= 1) this.wonStage = 2;
      }
    }
    if (!c.cine.playing && (st === 'fight' || st === 'rescue')) {
      const m = c.gfx.mood;
      m.candle = damp(m.candle, c.candles.lit, 2, dt);
      m.gold = damp(m.gold, c.boss.phase === 2 && c.boss.alive ? 1 : 0, 1.5, dt);
    }
  }
}
