// The figures to choose from (roster-data.js): each is retargeted onto the pilgrim's or the boss's clips and rules.
import { ROSTER_DATA } from './roster-data.js';
import { OPTIONS } from '../config/options.js';

const STORE = 'foundry.settings';
// The pilgrim is the stone knight, the foundry's own opponent the blacksmith with his forge hammer.
export const DEFAULT = {
  player: 'sculpture',
  boss: 'blacksmith',
};
const ROLES = { player: 1, boss: 1, both: 1 };

function normalizeEntry(d) {
  if (!d || typeof d.id !== 'string' || !d.id || !ROLES[d.role]) {
    console.warn('roster: an entry the game cannot use was left out: ' + JSON.stringify(d && d.id));
    return null;
  }
  const file = typeof d.file === 'string' && d.file ? d.file : d.id + '.glb';
  const url = /\//.test(file) ? file.replace(/^\/+/, '').replace(/^game\//, '') : 'assets/models/alt/' + file;
  const name =
    d.name && typeof d.name === 'object' ? d.name : { de: String(d.name || d.id), en: String(d.name || d.id) };
  return Object.assign({}, d, {
    name,
    asset: 'alt.' + d.id,
    url,
    credit: typeof d.credit === 'string' ? d.credit : '',
  });
}
export const ROSTER = (Array.isArray(ROSTER_DATA) ? ROSTER_DATA : []).map(normalizeEntry).filter(Boolean);
const BY_ID = new Map(ROSTER.map((f) => [f.id, f]));

export function choicesFor(role) {
  return ROSTER.filter((f) => f.role === role || f.role === 'both').map((f) => f.id);
}
export function isAllowedFor(role, id) {
  const f = BY_ID.get(id);
  return !!f && (f.role === role || f.role === 'both');
}

function resolveChosenFigures() {
  const out = Object.assign({}, DEFAULT);
  if (typeof window === 'undefined') return out;
  let saved;
  try {
    const t = window.localStorage.getItem(STORE);
    saved = t ? JSON.parse(t) : null;
  } catch (e) {
    saved = null;
  }
  for (const role of ['player', 'boss']) {
    const asked = OPTIONS.get(role),
      kept = saved && typeof saved === 'object' ? saved[role + 'Model'] : undefined;
    if (asked) {
      if (isAllowedFor(role, asked)) {
        out[role] = asked;
        continue;
      }
      console.warn(`roster: no ${role} figure "${asked}" (the address): ${DEFAULT[role]} instead`);
    }
    if (kept !== undefined && kept !== null) {
      if (isAllowedFor(role, kept)) out[role] = kept;
      else console.warn(`roster: no ${role} figure "${kept}" (the saved settings): ${DEFAULT[role]} instead`);
    }
  }
  return out;
}
export const CHOSEN = resolveChosenFigures();

export function chosenFigure(role) {
  return BY_ID.get(CHOSEN[role]);
}
export function entryOf(id) {
  return BY_ID.get(id);
}

export function rosterWords(lang) {
  const out = {};
  for (const f of ROSTER) out['fig_' + f.id] = f.name[lang] || f.name.en || f.id;
  return out;
}

export function reloadFor(roles, put) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  let cut = false;
  for (const role of [].concat(roles)) {
    if (put && put[role] !== undefined) {
      u.searchParams.set(role, put[role]);
      cut = true;
    } else if (u.searchParams.has(role)) {
      u.searchParams.delete(role);
      cut = true;
    }
  }
  if (cut) window.location.replace(u.toString());
  else window.location.reload();
}
