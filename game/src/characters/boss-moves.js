export const DAMAGE = {
  cut: 30,
  cut2: 24,
  cleave: 48,
  thrust: 42,
  spin: 34,
  stomp: 30,
  tide: 34,
  wave: 28,
  chorale: 21,
  leapRing: 20,
  hymn: 14,
};
const CUT = { damage: DAMAGE.cut, poise: 20, heavy: false };
const CUT2 = { damage: DAMAGE.cut2, poise: 20, heavy: false };
const CLEAVE = { damage: DAMAGE.cleave, poise: 60, heavy: true, knockdown: true, weight: 'colossal' };
const THRUST = { damage: DAMAGE.thrust, poise: 50, heavy: true };
const SPIN = { damage: DAMAGE.spin, poise: 40, heavy: true };
export const STOMP = { damage: DAMAGE.stomp, poise: 50, heavy: true, radius: 3.4 };
const GUARD = { clip: 'idle', t0: 0.2, t1: 0.2 };
const TIDE = { damage: DAMAGE.tide, poise: 40, heavy: true };

const SIDE = 0.87;
const REAP = 0.42;
const TOUCH_CUT = { r: 2.4, power: 0.4 };

const RAISE = (speed, track, more) =>
  Object.assign(
    { clip: 'cast', at: 0.3, fade: 0.35, to: 0.68, speed, stage: 'windup', track, glow: 0.7, flare: 0.5, travel: 0 },
    more,
  );
const HEAVE = [
  { clip: 'cast', at: 1.35, fade: 0.12, to: 1.85, speed: 2.3, track: 0.5, glow: 1, flare: 0.7, travel: 0 },
  { to: 2.25, speed: 2.0, track: 0, glow: 1, flare: 0.7, travel: 0 },
];
const FALL = (touch) => [
  { to: 2.47, speed: 1.05, stage: 'active', arm: CLEAVE, track: 0, glow: 1, flare: 0.7, travel: 0, touch },
  { to: 3.7, speed: 0.7, stage: 'recover', glow: 0.2, travel: 0 },
  { to: 4.35, speed: 1, travel: 0 },
];
const CLEAVE_TOUCH = { r: 5, power: 1, line: true };

const cutA = (arm, wind, cut, first) => [
  {
    clip: 'slash_combo',
    at: first ? 0.3 : 0.5,
    fade: first ? 0.3 : 0.25,
    to: 0.74,
    speed: wind,
    stage: 'windup',
    track: first ? 1.8 : 1.2,
    glow: 0.6,
    flare: 0.3,
    travel: 0.45,
    aim: SIDE,
  },
  { to: 1.08, speed: cut, stage: 'active', arm, glow: 1, travel: 0.45, touch: TOUCH_CUT },
];
const cutB = (arm, wind, cut) => [
  {
    clip: 'heavy_swing',
    at: 2.08,
    fade: 0.25,
    to: 2.47,
    speed: wind,
    stage: 'windup',
    track: 1.2,
    glow: 0.6,
    travel: 0,
    aim: SIDE,
  },
  { to: 2.93, speed: cut, stage: 'active', arm, glow: 1, travel: 0, touch: TOUCH_CUT },
];

export const MOVES = {
  sweep: {
    phase: 1,
    range: [2.6, 6.6],
    arc: 1.5,
    aim: SIDE,
    weight: 3,
    cool: 4,
    begin(b) {
      b.var.cuts = b.phase === 2 || b.rand() < 0.45 ? 3 : 2;
    },
    parts: [
      ...cutA(CUT, 0.5, 0.75, true),
      ...cutB(CUT, 0.58, 1.25),
      { when: (b) => b.var.cuts === 2, to: 3.0, speed: 0.1, stage: 'recover', travel: 0 },
      ...cutA(CUT, 0.26, 0.75, false).map((p) => Object.assign({ when: (b) => b.var.cuts === 3 }, p)),
      { when: (b) => b.var.cuts === 3, to: 1.3, speed: 0.4, stage: 'recover', travel: 0.2 },
    ],
  },

  cleave: {
    phase: 1,
    range: [3.0, 7.0],
    arc: 1.3,
    aim: 0,
    weight: 2.4,
    cool: 7,
    begin(b) {
      b.var.hold = b.rand() < 0.5 ? 0.45 : 0.95;
    },
    parts: [
      RAISE(0.36, 1.5),
      { hold: (b) => b.var.hold - 0.2, speed: 0.04, track: 0.7, glow: 1, flare: 0.7 },
      ...HEAVE,
      ...FALL(CLEAVE_TOUCH),
    ],
  },

  lunge: {
    phase: 1,
    range: [6.8, 15.5],
    arc: 1.1,
    aim: -0.08,
    weight: 2,
    cool: 7,
    w: (b, _s) => (b.punish > 0 ? 4 : 1),
    begin(b) {
      b.var.hold = 0.05 + b.rand() * 0.4;
    },
    parts: [
      {
        clip: 'upward_thrust',
        at: 0,
        fade: 0.4,
        to: 0.44,
        speed: 0.36,
        stage: 'windup',
        track: 2.2,
        travel: 0,
        glow: 0.7,
        flare: 0.4,
      },
      { to: 0.62, speed: 0.5, track: 1.6, travel: 0, glow: 1, flare: 0.5, stoop: 0.55, lower: 0.42 },
      { hold: (b) => b.var.hold, speed: 0.03, track: 1.3, glow: 1, flare: 0.5, stoop: 0.55, lower: 0.42 },
      { hold: 0.3, speed: 0.03, track: 0, glow: 1, flare: 0.5, stoop: 0.55, lower: 0.42, on: (b) => b.lungeAim() },
      {
        to: 0.92,
        speed: 0.7,
        stage: 'active',
        arm: THRUST,
        track: 0,
        travel: (b) => b.var.reach,
        side: 0,
        glow: 1,
        stoop: 0.55,
        lower: 0.42,
      },
      { to: 1.0, speed: 0.6, arm: THRUST, travel: 0, back: 0, glow: 1, stoop: 0.55, lower: 0.42 },
      { to: 1.3, speed: 0.4, stage: 'recover', travel: 0, back: 0, glow: 0.3, stoop: 0.55, lower: 0.42 },
      { to: 1.7, speed: 0.75, travel: 0, back: 0.15 },
      { to: 2.25, speed: 0.6, travel: 0, back: 0.15 },
    ],
  },

  spin: {
    phase: 1,
    range: [1.5, 5.6],
    arc: 1.9,
    aim: SIDE,
    weight: 1.5,
    cool: 8,
    coolPressed: 0.6,
    w: (b, s) => (Math.abs(s.bearing) > 1.4 ? 3.5 : 1) * (b.hugged > 1.5 ? 1.5 : 1) * (b.pressed > 30 ? 1.5 : 1),
    fits: (b, s) => !(Math.abs(s.bearing) > 2.5 && s.dist < 2.9),
    parts: [
      {
        clip: 'heavy_swing',
        at: 1.95,
        fade: 0.35,
        to: 2.47,
        speed: 0.46,
        stage: 'windup',
        track: 1,
        travel: 0,
        glow: 0.7,
        flare: 0.5,
      },
      {
        to: 2.93,
        speed: 1.15,
        stage: 'active',
        arm: SPIN,
        track: 0,
        travel: 0,
        glow: 1,
        flare: 0.6,
        touch: TOUCH_CUT,
        stoop: REAP,
      },
      { to: 3.95, speed: 1.3, arm: SPIN, travel: 0, glow: 1, flare: 0.6, stoop: REAP },
      { to: 4.4, speed: 0.6, stage: 'recover', travel: 0, glow: 0.3 },
      { to: 5.2, speed: 0.9, travel: 0 },
    ],
  },

  leap: {
    phase: 1,
    range: [0, 18],
    arc: 1.3,
    aim: 0,
    weight: 1.6,
    cool: 12,
    w: (b, s) => (b.punish > 0 ? 3 : 1) * (s.dist >= 9 ? 1 : b.hugged > 2.5 ? 1.8 : 0.7),
    end(b) {
      b.char.overlayOff(0.2);
    },
    parts: [
      {
        clip: 'jump_mutant',
        at: 0.05,
        fade: 0.35,
        to: 0.5,
        speed: 0.42,
        stage: 'windup',
        track: 2.2,
        travel: 0,
        glow: 0.8,
        flare: 0.8,
        arms: { clip: 'cast', t0: 0.3, t1: 0.7 },
        up: 'near',
      },
      {
        to: 1.47,
        speed: 0.72,
        track: 0,
        travel: 0,
        glow: 1,
        flare: 1,
        arms: { clip: 'cast', t0: 0.7, t1: 1.3 },
        on: (b) => b.leapStart(),
        each: (b) => b.leapFly(),
      },
      {
        clip: 'cast',
        at: 2.24,
        fade: 0.1,
        to: 2.47,
        speed: 1.05,
        stage: 'active',
        arm: CLEAVE,
        track: 0,
        travel: 0,
        glow: 1,
        flare: 0.8,
        on: (b) => b.leapLand(),
        touch: { r: 6, power: 1.3, line: true, on: (b) => b.leapRing() },
      },
      { to: 3.7, speed: 0.7, stage: 'recover', travel: 0, glow: 0.2 },
      { to: 4.35, speed: 1, travel: 0 },
    ],
  },

  stomp: {
    phase: 1,
    range: [0, 3.7],
    arc: Math.PI,
    aim: -0.25,
    weight: 1.8,
    cool: 5,
    coolPressed: 0.7,
    w: (b, _s) => (b.hugged > 1.2 ? 2 : 1),
    parts: [
      {
        clip: 'kick_side',
        at: 0.33,
        fade: 0.3,
        to: 0.58,
        speed: 0.5,
        stage: 'windup',
        track: 1.6,
        travel: 0.25,
        glow: 0.5,
        flare: 0.4,
        arms: GUARD,
        up: 1,
      },
      { to: 0.95, speed: 1.5, track: 0.6, travel: 0.25, glow: 0.8, flare: 0.5, arms: GUARD, up: 1 },
      { hold: 0.3, speed: 0.03, track: 0, glow: 1, flare: 0.5, arms: GUARD, up: 1 },
      { to: 1.1, speed: 1, track: 0, travel: 0.25, glow: 1, arms: GUARD, up: 1 },
      { to: 1.16, speed: 1, stage: 'active', track: 0, travel: 0.25, glow: 1, arms: GUARD, up: 1 },
      { to: 1.73, speed: 0.6, stage: 'recover', travel: 0.25, glow: 0.2, arms: GUARD, up: 1, on: (b) => b.stompLand() },
    ],
  },

  chorale: {
    phase: 2,
    range: [0, 40],
    arc: Math.PI,
    aim: 0,
    weight: 1.8,
    cool: 14,
    w: (b, s) => (s.dist > 9 ? 1.6 : 1),
    begin(b) {
      b.var.rings = b.hp < b.hpMax * 0.25 ? 4 : 3;
      b.var.n = 0;
    },
    parts: [
      {
        clip: 'roar',
        at: 0.35,
        fade: 0.4,
        to: 1.5,
        speed: 0.85,
        stage: 'windup',
        track: 1,
        glow: 0.8,
        flare: 1,
        arms: { clip: 'cast', t0: 0.3, t1: 0.68 },
        on: (b) => b.sing(0.35),
      },
      {
        to: 2.05,
        speed: 0.5,
        stage: 'active',
        beat: true,
        glow: 1,
        flare: 1,
        arms: { clip: 'cast', t0: 0.68, t1: 0.76 },
        on: (b) => b.choraleRing(),
      },
      {
        to: 2.6,
        speed: 0.5,
        stage: 'active',
        beat: true,
        glow: 1,
        flare: 1,
        arms: { clip: 'cast', t0: 0.76, t1: 0.84 },
        on: (b) => b.choraleRing(),
      },
      {
        to: 3.15,
        speed: 0.5,
        stage: 'active',
        beat: true,
        glow: 1,
        flare: 1,
        arms: { clip: 'cast', t0: 0.84, t1: 0.92 },
        on: (b) => b.choraleRing(),
      },
      {
        when: (b) => b.var.rings > 3,
        to: 3.7,
        speed: 0.5,
        stage: 'active',
        beat: true,
        glow: 1,
        flare: 1,
        arms: { clip: 'cast', t0: 0.92, t1: 1.0 },
        on: (b) => b.choraleRing(),
      },
      { to: 4.1, speed: 0.8, stage: 'recover', glow: 0.3, arms: { clip: 'cast', t0: 0.95, t1: 0.32 } },
    ],
  },

  hymn: {
    phase: 2,
    range: [0, 40],
    arc: Math.PI,
    aim: 0,
    weight: 1.8,
    cool: 14,
    w: (b, s) => (s.dist > 10 ? 1.8 : 1),
    parts: [
      {
        clip: 'cast_sustain',
        at: 0.05,
        fade: 0.4,
        to: 1.05,
        speed: 0.75,
        stage: 'windup',
        track: 1.2,
        glow: 0.8,
        flare: 1,
        up: 1,
        on: (b) => b.hymnCast(),
      },
      { to: 2.5, speed: 0.4, stage: 'active', track: 0.8, glow: 1, flare: 1, up: 1, on: (b) => b.hymnLoose() },
      { to: 3.3, speed: 0.9, stage: 'recover', glow: 0.3, up: 0.6 },
    ],
  },

  descant: {
    phase: 2,
    range: [2.6, 6.4],
    arc: 1.5,
    aim: SIDE,
    weight: 2.4,
    cool: 10,
    parts: [
      ...cutA(CUT2, 0.62, 0.9, true),
      ...cutB(CUT2, 0.7, 1.4),
      ...cutA(CUT2, 0.4, 0.9, false),
      ...cutB(CUT2, 0.7, 1.4),
      RAISE(0.9, 1.5, { aim: 0, fade: 0.3 }),
      { hold: 0.35, speed: 0.04, track: 0.7, glow: 1, flare: 0.7 },
      ...HEAVE,
      ...FALL(CLEAVE_TOUCH),
    ],
  },

  tide: {
    phase: 2,
    range: [2.4, 40],
    arc: 1.4,
    aim: 1.05,
    weight: 1.8,
    cool: 12,
    w: (b, s) => (s.dist > 9 ? 1.6 : 1),
    parts: [
      {
        clip: 'slash_low',
        at: 0.22,
        fade: 0.4,
        to: 0.72,
        speed: 0.4,
        stage: 'windup',
        track: 1.5,
        glow: 1,
        flare: 1,
        travel: 0,
      },
      {
        to: 0.97,
        speed: 0.9,
        stage: 'active',
        arm: TIDE,
        track: 0,
        travel: 0,
        glow: 1,
        stoop: 0.14,
        snap: true,
        touch: { r: 4, power: 0.8, on: (b) => b.tideLoose() },
      },
      { to: 1.12, speed: 0.9, travel: 0, glow: 1, on: (b) => b.tideLoose() },
      { to: 1.83, speed: 0.55, stage: 'recover', travel: 0, glow: 0.3 },
    ],
  },
};

const REACH = {
  sweep: {
    any: [
      7.8, 8.5, 8.3, 7.5, 7.1, 6.9, 5.9, 5.6, 5.8, 5.9, 5.9, 5.8, 5.5, 5.2, 5, 5, 5, 5.1, 5.5, 6.5, 6.8, 7.5, 7.4, 6.9,
    ],
    low: [6.2, 6.7, 8.1, 7.5, 7.1, 6.9, 5.2, 5.2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6.1, 7.1, 6.9],
  },
  cleave: {
    any: [
      7.5, 6.2, 2.7, 1.5, 0.9, 0.8, 0.8, 0.7, 0.7, 1, 1.2, 2.2, 4.4, 5.8, 1.5, 1.2, 1.1, 1.1, 1.1, 1.3, 1.7, 2.7, 4.3,
      5.2,
    ],
    low: [7.5, 3.9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  spin: {
    any: [
      7, 6.3, 5.7, 5.6, 5.6, 5.5, 5.2, 5.7, 6.2, 6.2, 6, 5.8, 5.6, 5.6, 5.5, 5.4, 5.4, 5.3, 5.3, 5.3, 5.3, 5.3, 6.1,
      6.8,
    ],
    low: [
      6.7, 6.3, 5.7, 5.6, 5.6, 5.5, 5.2, 5.2, 3.7, 5.9, 5.5, 5.5, 5.6, 5.6, 5.1, 5, 5.2, 5.2, 5.2, 5.2, 5.2, 5.1, 4.7,
      4.2,
    ],
  },
  stomp: {
    any: [1.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3.4, 3.3, 2.7, 1.9, 2.3, 2.5, 2.1, 1.8],
    low: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  chorale: {
    any: [6.5, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5.3, 5.6, 5.5, 5.2, 5.4, 5.8, 5.8, 6, 6.3, 6.5],
    low: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  hymn: {
    any: [5.9, 4.5, 5.9, 7.3, 6.9, 5.3, 4.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.7, 1.4, 1.1, 2.6, 4.3, 4.4, 5.8, 5.9],
    low: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  descant: {
    any: [
      8.2, 9, 8.9, 7.6, 8.4, 6.9, 5.9, 5.5, 5.8, 5.9, 5.9, 5.8, 5.6, 5.1, 5, 5, 5.2, 6.1, 5.6, 6.5, 6.7, 7.4, 7.3, 6.6,
    ],
    low: [6.2, 6.7, 8.5, 7.6, 8.4, 6.9, 5.2, 5.2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 7, 6.6],
  },
  tide: {
    any: [6.9, 7, 7, 6.9, 6.9, 6.8, 6.9, 7, 7, 6.9, 6.6, 6.3, 6, 5.5, 5.2, 5.6, 5.5, 5.2, 5.2, 5.3, 5.5, 5.9, 6.3, 6.6],
    low: [0, 7, 7, 6.9, 6.9, 6.8, 6.9, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};
for (const k in REACH) {
  const r = REACH[k];
  r.anyMax = Math.max(...r.any);
  r.lowMax = Math.max(...r.low);
}
REACH.lunge = { line: 3.2, width: 0.7, back: 8.5, right: 4.4 };
REACH.leap = REACH.cleave;

export const ORDER = ['sweep', 'cleave', 'lunge', 'spin', 'leap', 'stomp', 'chorale', 'hymn', 'descant', 'tide'];
for (const name of ORDER) {
  MOVES[name].name = name;
  MOVES[name].reach = REACH[name] || null;
}

export function timeline(parts, boss, quick = 1) {
  let t = 0,
    eta = -1,
    hits = 0,
    stage = null,
    clipT = 0;
  for (const p of parts) {
    if (p.stage === 'active' && (stage !== 'active' || p.beat)) {
      hits++;
      if (eta < 0) eta = t;
    }
    if (p.stage) stage = p.stage;
    if (p.hold !== undefined) t += typeof p.hold === 'function' ? p.hold(boss) : p.hold;
    else {
      if (p.clip) clipT = p.at || 0;
      t += Math.max(0, p.to - clipT) / ((p.speed || 1) * (stage === 'windup' ? quick : 1));
      clipT = p.to;
    }
  }
  return { eta: Math.max(0, eta), hits, total: t };
}
