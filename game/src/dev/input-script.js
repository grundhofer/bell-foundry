// The input vocabulary of the dev scripts (?play=, pilot and capture commands) and how a command turns into input,
// frame by frame. Pilot and capture must agree on this exactly, or a recorded command list replays differently.

/** Move words and their stick direction [x, y]. */
export const MOVES = { fwd: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] };
/** Actions in a fixed order: the bit of each one in a recorded step mask. */
export const ACTIONS = ['attack', 'heavy', 'block', 'roll', 'heal', 'lock', 'pause', 'confirm', 'skip'];

/**
 * How many 60 Hz frames a command lasts.
 * @param {{ ms?: number }} cmd
 */
export const commandFrames = (cmd) => Math.max(1, Math.round(((cmd.ms || 250) * 60) / 1000));

/**
 * The input of frame i of a command: the stick, which actions are down (in ACTIONS order) and this frame's share of the
 * look turn (eased, so the shares add up to cmd.look).
 * @param {{ hold?: string[], tap?: { a: string, at?: number, ms?: number }[], look?: [number, number] }} cmd
 * @param {number} i frame index
 * @param {number} frames commandFrames(cmd)
 */
export function commandInput(cmd, i, frames) {
  const held = new Set(cmd.hold || []),
    taps = cmd.tap || [],
    look = cmd.look || [0, 0];
  let mx = 0,
    my = 0;
  for (const k in MOVES)
    if (held.has(k)) {
      mx += MOVES[k][0];
      my += MOVES[k][1];
    }
  const now = (i * 1000) / 60;
  const on = ACTIONS.map(
    (a) => held.has(a) || taps.some((t) => t.a === a && now >= (t.at || 0) && now < (t.at || 0) + (t.ms || 90)),
  );
  const u0 = i / frames,
    u1 = (i + 1) / frames,
    e = (u) => u * u * (3 - 2 * u),
    w = e(u1) - e(u0);
  return { mx, my, on, lx: look[0] * w, ly: look[1] * w };
}
