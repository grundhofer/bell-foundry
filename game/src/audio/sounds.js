// Credits for the sounds are in docs/CREDITS.md. trim is relative to the normalized file.

import { CHOSEN } from '../characters/roster.js';
import { clamp } from '../core/math.js';

/** The boss carries the forge hammer (roster.js): her heavy blows on stone ring out as iron. */
const HAMMER = !!(CHOSEN && CHOSEN.weapon === 'hammer');

export const MUTED = new Set([]);

export const SOUNDS = {
  step_walk: { wet: 0.3, gap: 0.12, jitter: 0.07, pri: 0.5 },
  step_slow: { wet: 0.5, gap: 0.3, jitter: 0.03, pri: 0.5 },
  step_run: { wet: 0.3, gap: 0.1, jitter: 0.07, pri: 0.6 },
  roll: { wet: 0.32, gap: 0.3, pri: 0.9 },
  swing_light: { wet: 0.22, gap: 0.12, jitter: 0.06 },
  swing_heavy: { wet: 0.25, gap: 0.2, jitter: 0.05 },
  hit_armor: { wet: 0.4, gap: 0.06, jitter: 0.04, pri: 1.4 },
  hit_armor_heavy: { wet: 0.42, gap: 0.08, jitter: 0.03, pri: 1.6, duck: [0.25, 0.4] },
  hurt: { wet: 0.35, gap: 0.12, jitter: 0.03, pri: 2, duck: [0.45, 0.7] },
  block: { wet: 0.4, gap: 0.08, jitter: 0.04, pri: 1.8, duck: [0.3, 0.4] },
  guard_break: { wet: 0.42, gap: 0.3, jitter: 0.02, pri: 2, duck: [0.45, 0.8] },
  clash: { wet: 0.45, gap: 0.08, jitter: 0.05, pri: 1.3 },
  flask: { wet: 0.25, gap: 0.5, jitter: 0.01 },
  sword_draw: { wet: 0.35, gap: 0.5, jitter: 0.02, pri: 1.5 },
  boss_step: { wet: 0.4, ref: 16, gap: 0.2, jitter: 0.05, pri: 1.2 },
  boss_swing: { wet: 0.35, ref: 16, gap: 0.25, jitter: 0.04, pri: 1.3 },
  slam: { wet: 0.5, ref: 22, gap: 0.25, jitter: 0.03, pri: 2.5, duck: [0.5, 0.9] },
  stagger: { wet: 0.45, ref: 16, gap: 0.5, jitter: 0.02, pri: 2 },
  pipes: { wet: 0.45, ref: 30, gap: 1, jitter: 0, pri: 2.2 },
  pipes_ring: { wet: 0.5, ref: 30, gap: 0.3, jitter: 0, pri: 1.8 },
  hymn_cast: { wet: 0.5, ref: 20, gap: 0.4, jitter: 0.01, pri: 1.6 },
  hymn_fly: { wet: 0.4, ref: 14, gap: 0.08, jitter: 0.05, pri: 1.2 },
  tide: { wet: 0.4, ref: 30, gap: 1, jitter: 0.02, pri: 2 },
  hammer: { wet: 0.5, ref: 22, gap: 0.2, jitter: 0.04, pri: 2.3 },
  candle_hiss: { wet: 0.35, gap: 0.05, jitter: 0.12, pri: 0.4 },
  candles_out: { wet: 0.4, gap: 1.5, jitter: 0.02, pri: 2, duck: [0.3, 1.5] },
  candles_snuff: { wet: 0.4, gap: 0.6, jitter: 0.05, pri: 1 },
  candles_relight: { wet: 0.45, gap: 1.2, jitter: 0.03, pri: 0.9 },
  bell: { wet: 0.5, gap: 2, jitter: 0, pri: 3, duck: [0.35, 3] },
  drip: { wet: 0.75, ref: 12, gap: 0.2, jitter: 0.12, pri: 0.3 },
  bed_nave: { wet: 0, jitter: 0 },
  furnace: { wet: 0.3, ref: 14, jitter: 0 },
  ui_move: { ui: true, gap: 0.04, jitter: 0.02 },
  ui_select: { ui: true, gap: 0.08, jitter: 0.01 },
  ui_back: { ui: true, gap: 0.08, jitter: 0.01 },
};

export const SOUND_DEFAULTS = { trim: 1, wet: 0.3, ref: 9, gap: 0.05, jitter: 0.05, pri: 1, ui: false, duck: null };

export function wireSoundEvents(audio, ctx) {
  const bus = ctx.bus,
    offs = [];
  if (!bus) return offs;
  const on = (name, fn) => {
    const off = bus.on(name, fn);
    offs.push(typeof off === 'function' ? off : () => bus.off(name, fn));
  };
  const P = { x: 0, y: 0, z: 0 },
    O = { pos: P, volume: 1, rate: 1, take: undefined };
  const at = (pos, up, volume = 1, rate = 1) => {
    P.x = pos.x;
    P.y = (pos.y || 0) + up;
    P.z = pos.z;
    O.volume = volume;
    O.rate = rate;
    return O;
  };
  const time = () => (ctx.game ? ctx.game.time : 0);
  const inFrame = (x, y, z) => {
    const cam = ctx.camera,
      v = cam.matrixWorldInverse.elements,
      q = cam.projectionMatrix.elements;
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12],
      vy = v[1] * x + v[5] * y + v[9] * z + v[13],
      vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    if (vz > -0.05) return false;
    const w = q[3] * vx + q[7] * vy + q[11] * vz + q[15];
    if (!(w > 0)) return false;
    return (
      Math.abs((q[0] * vx + q[4] * vy + q[8] * vz + q[12]) / w) < 1.15 &&
      Math.abs((q[1] * vx + q[5] * vy + q[9] * vz + q[13]) / w) < 1.25
    );
  };
  const seen = (pos) => {
    const cam = ctx.camera;
    if (!cam || !cam.projectionMatrix || !cam.matrixWorldInverse) return true;
    const y = pos.y || 0;
    return inFrame(pos.x, y + 0.1, pos.z) || inFrame(pos.x, y + 1.0, pos.z);
  };
  let blockT = -9,
    spentT = -9,
    brokeT = -9,
    lit = 1,
    candles = null,
    candlesT = -9,
    candlesLit = 1,
    resetT = -9;

  on('step', (e) => {
    if (!e || !e.pos) return;
    if (e.who === 'boss') audio.play('boss_step', at(e.pos, 0.1, e.run ? 1.1 : 0.9));
    else if (ctx.cine && ctx.cine.playing) {
      if (seen(e.pos)) {
        const cam = ctx.camera,
          d = cam ? Math.hypot(e.pos.x - cam.position.x, e.pos.z - cam.position.z) : 3;
        audio.play('step_slow', at(e.pos, 0.1, 0.5 * Math.min(1, Math.max(0.5, 2.5 / Math.max(0.5, d)))));
      }
    } else audio.play(e.run ? 'step_run' : 'step_walk', at(e.pos, 0.1));
  });
  on('roll', (e) => {
    if (e && e.pos) audio.play('roll', at(e.pos, 0.3));
  });
  on('land', (e) => {
    if (!e || !e.pos) return;
    if (e.who === 'boss') audio.play('boss_step', at(e.pos, 0.1, e.hard ? 1.5 : 1.2, 0.9));
    else audio.play('step_run', at(e.pos, 0.1, e.hard ? 1.5 : 1.2, 0.92));
  });
  on('whoosh', (e) => {
    if (e && ctx.player && ctx.player.pos) audio.play(e.heavy ? 'swing_heavy' : 'swing_light', at(ctx.player.pos, 1.2));
  });
  on('swing', (e) => {
    if (e && e.who === 'boss' && ctx.boss && ctx.boss.pos) audio.play('boss_swing', at(ctx.boss.pos, 3.4));
  });
  on('hit', (e) => {
    if (!e) return;
    const t = e.target,
      where = e.point || (t && t.pos);
    if (!where) return;
    const up = e.point ? 0 : t === ctx.boss ? 3 : 1.1;
    if (t === ctx.player) {
      if (e.blocked) {
        blockT = time();
        if (blockT - spentT < 0.12 && blockT - brokeT > 0.3) {
          brokeT = blockT;
          audio.play('guard_break', at(where, up));
        } else audio.play('block', at(where, up, e.heavy ? 1 : 0.8));
      } else if (e.kind === 'chorale' || e.kind === 'hymn') {
        audio.play('hurt', at(where, up, 0.7, 1.12));
        audio.play('clash', at(where, up, 0.7, 1.1));
      } else if (e.kind === 'tide' || e.kind === 'leap') {
        audio.play('hurt', at(where, up, 0.75, 1.05));
        audio.play('roll', at(where, up, 1.1));
      } else audio.play('hurt', at(where, up, e.fatal ? 1.15 : clamp(0.75 + (e.damage || 0) / 120, 0.75, 1.1)));
    } else if (e.heavy) audio.play('hit_armor_heavy', at(where, up, e.fatal ? 1.15 : 1));
    else audio.play('hit_armor', at(where, up, e.fatal ? 1.2 : 1));
  });
  on('stamina-out', () => {
    spentT = time();
    if (spentT - blockT < 0.12 && spentT - brokeT > 0.3 && ctx.player) {
      brokeT = spentT;
      audio.play('guard_break', at(ctx.player.pos, 1.1));
    }
  });
  on('clash', (e) => {
    if (!e || !e.point) return;
    const big = e.heavy || e.weight === 'heavy' || e.weight === 'colossal';
    if (e.who === 'boss' && e.stone) {
      audio.play('clash', at(e.point, 0, 1.15, 0.72));
      audio.play('slam', at(e.point, 0, 0.5, 1.12));
      if (HAMMER) audio.play('hammer', at(e.point, 0, 0.9));
    } else if (e.stone && e.floor) audio.play('clash', at(e.point, 0, big ? 0.7 : 0.45, big ? 0.85 : 1));
    else if (e.stone) {
      audio.play('clash', at(e.point, 0, big ? 1.1 : 0.8, big ? 0.86 : 1));
      if (big) audio.play('block', at(e.point, 0, 0.6, 0.8));
    } else audio.play('clash', at(e.point, 0));
  });
  on('heal', () => {
    if (ctx.player) audio.play('flask', at(ctx.player.pos, 1.3));
  });
  on('boss-slam', (e) => {
    if (!e || !e.pos) return;
    const p = e.power === undefined ? 1 : e.power;
    if (p < 0.6) {
      audio.play('roll', at(e.pos, 0.1, 0.5 + 0.6 * p, 0.82));
      audio.play('clash', at(e.pos, 0.05, 0.3 + 0.5 * p, 0.8));
      return;
    }
    audio.play('slam', at(e.pos, 0.2, clamp(0.3 + 0.7 * p, 0.4, 1.1), clamp(1.15 - 0.15 * p, 0.9, 1.12)));
    if (HAMMER && p >= 1) audio.play('hammer', at(e.pos, 0.2, 0.85, clamp(1.05 - 0.1 * p, 0.9, 1))); // her weapon's blows (cleave 1, leap 1.3), not her heel
  });
  on('boss-stagger', () => {
    if (ctx.boss) audio.play('stagger', at(ctx.boss.pos, 2.5));
  });
  on('boss-died', () => {
    if (ctx.boss) audio.play('stagger', at(ctx.boss.pos, 2, 0.8, 0.92));
  });
  on('boss-move', (e) => {
    if (!e || !e.name || !ctx.boss) return;
    const n = String(e.name).toLowerCase(),
      b = ctx.boss.pos;
    if (n === 'chorale') {
      if (e.stage === 'windup') audio.play('pipes', at(b, 5));
      else if (e.stage === 'active') {
        at(b, 4);
        O.take = (e.n || 1) - 1;
        audio.play('pipes_ring', O);
        O.take = undefined;
      }
    } else if (n === 'hymn') {
      if (e.stage === 'windup') audio.play('hymn_cast', at(b, 6));
      else if (e.stage === 'active') audio.play('hymn_fly', at(b, 6));
    } else if (n === 'tide') {
      if (e.stage === 'active' && (e.n || 1) === 1) audio.play('tide', at(b, 0.3));
    }
  });
  on('candles', (e) => {
    if (e) {
      candles = e.how;
      candlesT = time();
      candlesLit = typeof e.lit === 'number' ? e.lit : lit;
    }
  });
  on('player-respawn', () => {
    resetT = time();
  });
  on('state', () => {
    resetT = time();
    audio.keepNeededBuffers();
  });
  audio.afterStep = () => {
    if (!candles) return;
    if (Math.abs(candlesT - resetT) > 0.05) {
      if (candles === 'relight') audio.play('candles_relight');
      else if (candlesLit < 0.05) audio.play('candles_out');
      else audio.play('candles_snuff', ctx.boss ? at(ctx.boss.pos, 0.3) : undefined);
    }
    lit = candlesLit;
    candles = null;
  };
  on('cine', (e) => {
    if (e && !e.on && e.skipped) audio.hush(0.15);
  });
  on('setting', (e) => {
    if (e && (e.key === 'music' || e.key === 'sfx' || e.key === 'voice') && ctx.ui && ctx.ui.settings)
      audio.setVolumes(ctx.ui.settings);
  });
  if (ctx.ui && typeof ctx.ui.on === 'function') {
    try {
      ctx.ui.on((e) => {
        if (!e || time() < 0.25) return;
        if (e.type === 'play' || e.type === 'resume' || e.type === 'restart' || e.type === 'title')
          audio.play('ui_select');
        else if (e.type === 'setting') audio.play('ui_move');
      });
    } catch (err) {}
  }
  return offs;
}
