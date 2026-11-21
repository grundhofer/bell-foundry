// @ts-check
export const FILM_RULES = Object.freeze({
  health: 100,
  heal: 45,
  flasks: 4,
  herHealth: 1000,
  rest: 1,
  quick: 1.12,
  punish: 1.6,
});
export const NORMAL_RULES = Object.freeze({
  health: 130,
  heal: 58,
  flasks: 4,
  herHealth: 800,
  rest: 1.3,
  quick: 1,
  punish: 0,
});

export function rulesFor(params) {
  const R = Object.assign({}, params.get('rules') === 'film' ? FILM_RULES : NORMAL_RULES);
  for (const part of (params.get('rule') || '').split(',')) {
    const m = part.trim().match(/^([a-zA-Z]+):(-?[\d.]+)$/);
    if (m && m[1] in R && !Number.isNaN(+m[2])) R[m[1]] = +m[2];
  }
  return R;
}

export const EASY_RULES = Object.freeze({
  health: 170,
  heal: 70,
  flasks: 5,
  herHealth: 650,
  rest: 1.5,
  quick: 1,
  punish: 0,
});
export const RULES_BY_DIFFICULTY = { easy: EASY_RULES, normal: NORMAL_RULES, hard: FILM_RULES };

export function applyDifficulty(ctx, level) {
  const p = ctx.params,
    P = ctx.player,
    B = ctx.boss;
  if (p.has('rules') || p.has('rule') || !P || !B || !P.rules || !B.rules) return false;
  const R = RULES_BY_DIFFICULTY[level] || NORMAL_RULES;
  Object.assign(P.rules, R);
  P.hpMax = R.health;
  P.flasksMax = R.flasks;
  Object.assign(B.rules, R);
  B.hpMax = R.herHealth;
  if (ctx.hw) ctx.hw._base = null;
  return true;
}
