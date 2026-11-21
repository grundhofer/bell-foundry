import { glyphsFor, escapeHtml } from './glyphs.js';
import { mountLogo } from './logo.js';
import { TRANSLATIONS, fillPlaceholders } from './language.js';
import { choicesFor, entryOf, rosterWords } from '../characters/roster.js';
import { FigurePreview } from './figure-preview.js';
import { clamp } from '../core/math.js';

export const TEXT = Object.assign({}, TRANSLATIONS.en, rosterWords('en'));
export function setLanguage(lang) {
  Object.assign(TEXT, TRANSLATIONS[lang] || TRANSLATIONS.en, rosterWords(TRANSLATIONS[lang] ? lang : 'en'));
}

export const TABS = ['game', 'figures', 'controls', 'hw', 'picture', 'sound'];
const pct = (v) => String(Math.round(v * 100));
const ONOFF = { kind: 'choice', values: [false, true], names: ['v_off', 'v_on'] };
const look = (ui, k) => !!(ui.ctx && ui.ctx.look && ui.ctx.look[k]);
export const SETTINGS_ROWS = [
  { key: 'lang', tab: 'game', label: 'o_lang', kind: 'choice', values: ['de', 'en'], names: ['v_de', 'v_en'] },
  {
    key: 'difficulty',
    tab: 'game',
    label: 'o_difficulty',
    kind: 'choice',
    values: ['easy', 'normal', 'hard'],
    names: ['v_easy', 'v_normal', 'v_hard'],
  },
  {
    key: 'lava',
    tab: 'game',
    label: 'o_lava',
    kind: 'choice',
    values: ['off', 'soft', 'normal'],
    names: ['v_off', 'v_soft', 'v_normal'],
    when: (ui) => look(ui, 'lava'),
  },
  {
    key: 'playerModel',
    tab: 'figures',
    label: 'o_playerModel',
    kind: 'choice',
    wrap: true,
    pending: true,
    values: choicesFor('player'),
    names: choicesFor('player').map((id) => 'fig_' + id),
  },
  {
    key: 'bossModel',
    tab: 'figures',
    label: 'o_bossModel',
    kind: 'choice',
    wrap: true,
    pending: true,
    values: choicesFor('boss'),
    names: choicesFor('boss').map((id) => 'fig_' + id),
  },
  {
    key: 'sensitivity',
    tab: 'controls',
    label: 'o_sensitivity',
    kind: 'slider',
    min: 0.2,
    max: 2,
    step: 0.1,
    show: (v) => v.toFixed(1),
  },
  { key: 'invertY', tab: 'controls', label: 'o_invertY', ...ONOFF },
  { key: 'rumble', tab: 'controls', label: 'o_rumble', ...ONOFF },
  {
    key: 'gesture',
    tab: 'hw',
    label: 'o_gesture',
    kind: 'choice',
    values: ['calm', 'normal', 'keen'],
    names: ['v_calm', 'v_normal', 'v_keen'],
  },
  { key: 'heartShow', tab: 'hw', label: 'o_heartShow', ...ONOFF },
  { key: 'heartBoss', tab: 'hw', label: 'o_heartBoss', ...ONOFF },
  {
    key: 'quality',
    tab: 'picture',
    label: 'o_quality',
    kind: 'choice',
    values: ['low', 'medium', 'high', 'ultra'],
    names: ['v_low', 'v_medium', 'v_high', 'v_ultra'],
  },
  { key: 'reducedMotion', tab: 'picture', label: 'o_reducedMotion', ...ONOFF },
  { key: 'ghosts', tab: 'picture', label: 'o_ghosts', ...ONOFF, when: (ui) => look(ui, 'ghosts') },
  {
    key: 'ash',
    tab: 'picture',
    label: 'o_ash',
    ...ONOFF,
    when: (ui) => !!(ui.ctx && ui.ctx.look && ui.ctx.look.cavern && ui.ctx.look.cavern.ash),
  },
  { key: 'music', tab: 'sound', label: 'o_music', kind: 'slider', min: 0, max: 1, step: 0.05, show: pct },
  { key: 'sfx', tab: 'sound', label: 'o_sfx', kind: 'slider', min: 0, max: 1, step: 0.05, show: pct },
  { key: 'voice', tab: 'sound', label: 'o_voice', kind: 'slider', min: 0, max: 1, step: 0.05, show: pct },
  { key: 'subtitles', tab: 'sound', label: 'o_subtitles', ...ONOFF },
];

export const CONTROLS = [
  ['c_move', 'move'],
  ['c_look', 'look'],
  ['c_lock', 'lock'],
  ['c_attack', 'attack'],
  ['c_heavy', 'heavy'],
  ['c_block', 'block'],
  ['c_roll', 'roll'],
  ['c_jump', 'jump'],
  ['c_heal', 'heal'],
  ['c_pause', 'pause'],
];
const TOUCH_HOW = { move: 'touchMove', look: 'touchLook' };
const LEGEND = [
  ['move', 'l_move'],
  ['look', 'l_look'],
  ['attack', 'l_attack'],
  ['block', 'l_block'],
  ['roll', 'l_roll'],
  ['jump', 'l_jump'],
  ['lock', 'l_lock'],
  ['heal', 'l_heal'],
];
const SUB = { options: 1, ctrl: 1 };

const PANELS = ['title', 'pause', 'ask', 'options', 'ctrl', 'end'];
const GUARD_MS = 280;
const LEAVE_MS = 400;
const RETURN_MS = 700;

export class Menus {
  constructor(ui, parent) {
    this.ui = ui;
    this.panel = null;
    this.from = 'title';
    this.device = 'keys';
    this.sel = 0;
    this.pauseSel = 0;
    this.items = [];
    this.closing = null;
    this.closeAt = 0;
    this.openedAt = 0;
    this.returnAt = 0;
    this.down = new Set();
    this.pa = this.pb = this.ps = false;
    this.pdir = '';
    this.prep = 0;
    this.raf = 0;
    this.drag = null;
    this._pad = { x: 0, y: 0, a: false, b: false, s: false, any: false };

    const el = (this.el = document.createElement('div'));
    el.className = 'tbf-menus';
    el.innerHTML = `
      <div class="tbf-veil vt"></div><div class="tbf-veil vp"></div><div class="tbf-veil ve"></div>
      <section class="tbf-panel tbf-title" data-p="title">
        <div class="tbf-spot"><div class="logo"></div></div>
        <nav class="tbf-list" role="menu"></nav>
        <p class="tbf-legend"></p>
      </section>
      <section class="tbf-panel tbf-pause" data-p="pause">
        <div class="col"><h2 data-t="paused"></h2><nav class="tbf-list" role="menu"></nav></div>
        <div class="tbf-card"></div>
        <p class="tbf-keys"></p>
      </section>
      <section class="tbf-panel tbf-ask" data-p="ask">
        <div class="col"><h2></h2><p class="note"></p><nav class="tbf-list" role="menu"></nav></div>
        <p class="tbf-keys"></p>
      </section>
      <section class="tbf-panel tbf-options" data-p="options">
        <div class="col"><h2 data-t="options"></h2><div class="tbf-rows" role="menu"></div><p class="tbf-msg"></p></div>
        <figure class="tbf-prev"><p class="cap"></p></figure>
        <p class="tbf-keys"></p>
      </section>
      <section class="tbf-panel tbf-options tbf-ctrl" data-p="ctrl">
        <div class="col"><h2 data-t="hwTitle"></h2><div class="tbf-rows" role="menu"></div><p class="tbf-msg"></p></div>
        <p class="tbf-keys"></p>
      </section>
      <section class="tbf-panel tbf-end" data-p="end">
        <div class="logo"></div><p class="thanks" data-t="thanks"></p><nav class="tbf-list" role="menu"></nav>
      </section>`;
    parent.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.n = {
      title: q('.tbf-title'),
      pause: q('.tbf-pause'),
      ask: q('.tbf-ask'),
      options: q('.tbf-options:not(.tbf-ctrl)'),
      ctrl: q('.tbf-ctrl'),
      end: q('.tbf-end'),
      legend: q('.tbf-legend'),
      card: q('.tbf-card'),
      askQ: q('.tbf-ask h2'),
      askNote: q('.tbf-ask .note'),
      optMsg: q('.tbf-options:not(.tbf-ctrl) .tbf-msg'),
      hwMsg: q('.tbf-ctrl .tbf-msg'),
      prev: q('.tbf-prev'),
      prevCap: q('.tbf-prev .cap'),
    };
    this.pending = {};
    this.prev = null;
    this.prevRole = 'player';
    this.tab = 'game';
    this.msg = '';
    this.msgAt = 0;
    this.calibAt = 0;
    this.bladeAt = 0;
    this.statAt = 0;
    mountLogo(q('.tbf-title .logo'));
    mountLogo(q('.tbf-end .logo'));

    const quiet = (fn) => {
      fn.quiet = true;
      return fn;
    };
    const go = (name) => () => this.ui.showScreen(name);
    const leave = (type, more) => quiet(() => this.leave(Object.assign({ type }, more)));
    const sub = () => this.ui.showScreen(this.from);
    this.spec = {
      title: {
        list: [
          ['fight', leave('play', { skipIntro: true })],
          ['withIntro', leave('play')],
          ['controllers', go('ctrl')],
          ['options', go('options')],
        ],
        start: leave('play', { skipIntro: true }),
      },
      pause: {
        list: [
          ['resume', leave('resume')],
          ['restart', () => this.ask('restart')],
          ['controllers', go('ctrl')],
          ['options', go('options')],
          ['toTitle', () => this.ask('title')],
        ],
        back: leave('resume'),
        start: leave('resume'),
      },
      ask: { list: [], back: () => this.open('pause') },
      options: { rows: () => this._optionRows(), list: [['back', quiet(() => this.back())]], back: sub },
      ctrl: { rows: () => this._hwRows(), list: [['back', quiet(() => this.back())]], back: sub },
      end: { list: [['toTitle', leave('title')]], start: leave('title') },
    };
    this.built = {};
    this.relabel();

    this._onKey = (e) => this._key(e);
    this._onKeyUp = (e) => this.down.delete(e.code);
    this._onBlur = () => {
      this.down.clear();
      this.drag = null;
    };
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    const itemAt = (e) => {
      const it = e.target.closest ? e.target.closest('.it') : null;
      return it && it.parentNode === this._host() ? it : null;
    };
    el.addEventListener('mousemove', (e) => {
      if (!this.panel || this.closing || this.returnAt || (!e.movementX && !e.movementY)) return;
      const it = itemAt(e);
      if (it) this._select(+it.dataset.i);
      this._setDevice('keys');
    });
    el.addEventListener('click', (e) => {
      if (!this.panel || this.closing || this.returnAt || this._justOpened()) return;
      const it = itemAt(e);
      if (!it) return;
      this._select(+it.dataset.i);
      const item = this.items[this.sel],
        word = e.target.closest('.ch b');
      if (item.row) {
        if (word) this._set(item.row, item.row.values[+word.dataset.v]);
        else if (item.row.kind === 'choice' && this._byFinger()) this._step(item.row, 1, true);
        else if (item.row.kind === 'button') this._confirm();
        return;
      }
      this._confirm();
    });
    el.addEventListener('pointerdown', (e) => {
      const tr = e.target.closest ? e.target.closest('.sl') : null;
      if (!tr || this.panel !== 'options' || this.closing) return;
      const it = tr.closest('.it');
      this._select(+it.dataset.i);
      this.drag = { tr, row: this.items[this.sel].row };
      if (tr.setPointerCapture) {
        try {
          tr.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
      this._dragTo(e.clientX);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (this.drag) this._dragTo(e.clientX);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    const drop = () => {
      this.drag = null;
    };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
    this._loop = () => this._frame();
  }

  _build(name) {
    const sp = this.spec[name],
      panel = this.n[name],
      items = [];
    const rows = typeof sp.rows === 'function' ? sp.rows() : sp.rows;
    const host = panel.querySelector(rows ? '.tbf-rows' : '.tbf-list');
    const word = (k) => escapeHtml(TEXT[k] !== undefined ? TEXT[k] : k);
    let html = '';
    if (rows) {
      for (const row of rows) {
        const i = items.length;
        items.push({ row });
        const ctl =
          row.kind === 'slider'
            ? `<span class="sl"><i class="fl"></i><i class="kw"><i class="kn"></i></i></span><span class="val"></span>`
            : row.kind === 'button'
              ? `<span class="inf"></span>`
              : `<span class="ch">${row.names.map((nm, v) => `<b data-v="${v}">${word(nm)}</b>`).join('')}</span>`;
        html += `<div class="it ${row.kind}${row.tabs ? ' tabs' : ''}${row.wrap ? ' wrap' : ''}" role="menuitem" data-i="${i}"><span class="lb">${word(row.label)}</span>${ctl}</div>`;
      }
    }
    for (const [label, act] of sp.list) {
      const i = items.length;
      items.push({ act });
      html += `<div class="it${rows ? ' act' : ''}" role="menuitem" data-i="${i}"><span class="lb">${word(label)}</span></div>`;
    }
    host.innerHTML = html;
    for (let i = 0; i < items.length; i++) items[i].el = host.children[i];
    this.built[name] = { items, host };
    if (rows) for (const it of items) if (it.row) this._paint(it);
  }

  _optionRows() {
    const tabs = {
      key: '_tab',
      tabs: true,
      label: 'tab',
      kind: 'choice',
      values: TABS,
      names: TABS.map((t) => 't_' + t),
      get: () => this.tab,
      set: (v) => {
        this.tab = v;
        this._rebuild('options', 0);
      },
    };
    const rows = [tabs, ...SETTINGS_ROWS.filter((r) => r.tab === this.tab && (!r.when || r.when(this.ui)))];
    if (this.tab === 'figures')
      rows.push({
        key: '_apply',
        kind: 'button',
        label: 'figApply',
        act: () => this._applyFigures(),
        info: () => (this._hasPendingChanges() ? TEXT.figApplyInfo : TEXT.figSame),
      });
    if (this.tab === 'hw') rows.push(...this._hwRows().filter((r) => r.label === 'hwHeart' || r.label === 'hwRest')); // the heart strap from the settings too (as on the sword-and-shield screen)
    return rows;
  }
  _figureNote() {
    const lines = [TEXT.figReload],
      hammer = entryOf('blacksmith');
    for (const role of ['player', 'boss']) {
      const f = entryOf(this._effectiveSetting(role + 'Model'));
      if (f && f.credit) lines.push(fillPlaceholders(TEXT.figCredit, { n: TEXT['fig_' + f.id] || f.id, c: f.credit }));
    }
    if (hammer && hammer.credit && this._effectiveSetting('bossModel') !== 'blacksmith')
      lines.push(fillPlaceholders(TEXT.figCredit, { n: TEXT.w_hammer, c: hammer.credit }));
    return lines.map((l) => `<span>${escapeHtml(l)}</span>`).join('');
  }
  _effectiveSetting(key) {
    return key in this.pending ? this.pending[key] : this.ui.settings[key];
  }
  _hasPendingChanges() {
    return Object.keys(this.pending).length > 0;
  }
  _stageSetting(key, value) {
    if (value === this.ui.settings[key]) delete this.pending[key];
    else this.pending[key] = value;
    this.prevRole = key === 'playerModel' ? 'player' : 'boss';
    if (this.panel === 'options' && this.tab === 'figures') this.n.optMsg.innerHTML = this._figureNote();
    this._updateFigurePreview();
  }
  _applyFigures() {
    if (this._hasPendingChanges()) this.ui.confirmFigures(Object.assign({}, this.pending));
  }
  _updateFigurePreview() {
    const on = this.panel === 'options' && this.tab === 'figures';
    this.n.options.classList.toggle('figs', on);
    if (!on) {
      if (this.prev) {
        this.prev.dispose();
        this.prev = null;
      }
      return;
    }
    const it = this.items[this.sel],
      key = it && it.row && it.row.key;
    if (key === 'playerModel') this.prevRole = 'player';
    else if (key === 'bossModel') this.prevRole = 'boss';
    if (!this.prev) this.prev = new FigurePreview(this.ui.ctx, this.n.prev, this.n.prevCap);
    const role = this.prevRole,
      id = this._effectiveSetting(role + 'Model'),
      weapon = role === 'boss' ? 'hammer' : null;
    this.prev.show({
      role,
      id,
      weapon,
      name: TEXT['fig_' + id] || id,
      weaponName: weapon ? TEXT['w_' + weapon] : '',
      loading: TEXT.figLoading,
      failed: TEXT.figFailed,
    });
  }
  _rebuild(name, sel) {
    this._build(name);
    if (this.panel === name) {
      this.items = this.built[name].items;
      this._select(sel === undefined ? this.sel : sel, true);
    }
    if (name === 'options')
      this.n.optMsg.textContent = this.tab === 'game' && this.from === 'pause' ? TEXT.nextFight : '';
    if (name === 'options' && this.tab === 'figures') this.n.optMsg.innerHTML = this._figureNote();
    if (name === 'options') this._updateFigurePreview();
  }

  relabel() {
    for (const e of this.el.querySelectorAll('[data-t]')) e.textContent = TEXT[e.dataset.t] || '';
    for (const name of ['title', 'pause', 'options', 'ctrl', 'end']) this._rebuild(name);
    if (this.panel === 'ask' && this._asked) this.ask(this._asked);
    this._renderControlsTable();
    this._renderLegends();
  }

  _hwRows() {
    const ui = this.ui,
      hw = () => ui.ctx && ui.ctx.hw,
      heart = () => hw() && hw().heart;
    const run = (fn) => async () => {
      const h = hw();
      if (!h) return;
      try {
        this._note(await fn(h));
      } catch (e) {
        const needs =
          e &&
          (e.name === 'SecurityError' || e.name === 'NotAllowedError' || /gesture|activation/i.test(e.message || ''));
        this._note(needs ? TEXT.hwNeedsClick : fillPlaceholders(TEXT.hwError, { m: (e && e.message) || e }));
      }
    };
    const dev = (h, id) => h && h.dev && Object.values(h.dev)[id];
    return [
      {
        kind: 'button',
        label: 'hwAtom',
        act: run(async (h) => {
          await h.useSerial();
          return '';
        }),
        info: () => {
          const h = hw();
          return h && h.source ? h.source.name : TEXT.hwNone;
        },
      },
      {
        kind: 'button',
        label: 'hwSim',
        act: run(async (h) => {
          await h.useSim();
          return '';
        }),
        info: () => '',
      },
      {
        kind: 'button',
        label: 'hwStop',
        act: run(async (h) => {
          await h.stop();
          return '';
        }),
        info: () => '',
      },
      {
        kind: 'button',
        label: 'hwBlade',
        act: () => {
          this.bladeAt = performance.now() + 3000;
        },
        info: () => {
          const h = hw();
          if (this.bladeAt)
            return fillPlaceholders(TEXT.hwBladeHold, {
              n: Math.max(1, Math.ceil((this.bladeAt - performance.now()) / 1000)),
            });
          return h && h.saved && h.saved.blade ? TEXT.hwBladeSet : TEXT.hwBladeDefault;
        },
      },
      {
        kind: 'button',
        label: 'hwCalib',
        act: () => {
          this.calibAt = performance.now() + 3000;
        },
        info: () => {
          const h = hw();
          if (this.calibAt)
            return fillPlaceholders(TEXT.hwHold, {
              n: Math.max(1, Math.ceil((this.calibAt - performance.now()) / 1000)),
            });
          return h && h.shield && dev(h, 1) && dev(h, 1).last
            ? h.shield.guard
              ? TEXT.hwGuardUp
              : TEXT.hwGuardDown
            : '';
        },
      },
      {
        kind: 'button',
        label: 'hwVib',
        act: run(async (h) => {
          if (!dev(h, 0) || !dev(h, 0).last) return TEXT.hwVibNo;
          h.rumble(0.8, 0.8, 0.3);
          return '';
        }),
        info: () => '',
      },
      {
        kind: 'button',
        label: 'hwHeart',
        act: run(async (h) => {
          await h.heart.connect();
          return '';
        }),
        info: () => {
          const r = heart();
          return r && r.live ? `♥ ${r.bpm}` : r && r.state !== 'aus' ? r.state : TEXT.hwNone;
        },
      },
      {
        kind: 'button',
        label: 'hwRest',
        act: run(async (h) => {
          if (!h.heart.smooth) return TEXT.hwNone;
          h.heart.setRest();
          return fillPlaceholders(TEXT.hwRestOk, { n: h.heart.rest });
        }),
        info: () => {
          const r = heart();
          return r && r.rest ? String(r.rest) : r && r.live ? TEXT.hwMeasuring : '';
        },
      },
    ];
  }
  _note(text) {
    this.msg = text || '';
    this.msgAt = performance.now();
  }
  _hwStatus(now) {
    if (this.bladeAt && now >= this.bladeAt) {
      this.bladeAt = 0;
      const h = this.ui.ctx && this.ui.ctx.hw;
      const r = h ? h.calibrateBlade() : 'none';
      this._note(r === 'ok' ? TEXT.hwBladeOk : r === 'flat' ? TEXT.hwBladeFlat : TEXT.hwVibNo);
    }
    if (this.calibAt && now >= this.calibAt) {
      this.calibAt = 0;
      const h = this.ui.ctx && this.ui.ctx.hw;
      this._note(h && h.calibrateGuard() ? TEXT.hwCalibOk : TEXT.hwCalibNo);
    }
    if (now - this.statAt < 250) return;
    this.statAt = now;
    const h = this.ui.ctx && this.ui.ctx.hw;
    if (!h) return;
    const line = (d, name) => {
      if (!d || !d.last) return `${name}: ${TEXT.hwNever}`;
      const on = now - d.at < 500,
        b = d.last.battery;
      return `${name}: ${on ? TEXT.hwOn : TEXT.hwGone}${b !== undefined && b !== 255 ? ` · ${TEXT.hwBattery} ${b} %` : ''}`;
    };
    const ds = Object.values(h.dev || {}),
      g = h.lastGesture,
      r = h.heart;
    const lines = [line(ds[0], TEXT.hwSword), line(ds[1], TEXT.hwShield)];
    if (g && now - g.at < 4000) lines.push(`${TEXT.hwLast}: ${TEXT['g_' + g.kind] || g.kind}`);
    if (r && r.live) lines.push(`${TEXT.hwPulse}: ${r.bpm}${r.rest ? ` (${TEXT.hwRestShort} ${r.rest})` : ''}`);
    if (this.msg && now - this.msgAt < 6000) lines.push(this.msg);
    this.n.hwMsg.innerHTML = lines.map((l) => `<span>${escapeHtml(l)}</span>`).join('');
    for (const it of this.built.ctrl.items) if (it.row) this._paint(it);
  }

  _renderControlsTable() {
    let rows = '';
    for (const [label, action] of CONTROLS) {
      const alt = glyphsFor(action, 'keys', 'alt'),
        how = TOUCH_HOW[action];
      rows +=
        `<tr><td>${escapeHtml(TEXT[label])}</td><td class="k">${glyphsFor(action, 'keys')}${alt ? `<em>${TEXT.or}</em>${alt}` : ''}</td><td class="p">${glyphsFor(action, 'pad')}</td>` +
        `<td class="t">${glyphsFor(action, 'touch')}${how ? `<span>${escapeHtml(TEXT[how])}</span>` : ''}</td><td class="h">${escapeHtml(TEXT['h_' + action] || '')}</td></tr>`;
    }
    this.n.card.innerHTML = `<table><thead><tr><th></th><th class="k">${TEXT.keys}</th><th class="p">${TEXT.pad}</th><th class="t">${TEXT.touch}</th><th class="h">${TEXT.hw}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  _renderLegends() {
    const d = this.device,
      e = (action, label) => `<span class="e">${glyphsFor(action, d)}${escapeHtml(label)}</span>`;
    this.n.legend.innerHTML = LEGEND.map(([a, l]) => e(a, TEXT[l])).join('');
    const line = (adjust) =>
      d === 'touch'
        ? ''
        : e('choose', TEXT.choose) +
          (adjust ? e('adjust', TEXT.adjust) : '') +
          e('confirm', TEXT.select) +
          e('back', TEXT.goBack);
    this.n.pause.querySelector('.tbf-keys').innerHTML = line(false);
    this.n.ask.querySelector('.tbf-keys').innerHTML = line(false);
    this.n.options.querySelector('.tbf-keys').innerHTML = line(true);
    this.n.ctrl.querySelector('.tbf-keys').innerHTML = line(false);
    this.el.dataset.device = d;
  }
  _setDevice(d) {
    if (d !== this.device) {
      this.device = d;
      this._renderLegends();
    }
  }

  open(name) {
    name = name || null;
    const was = this.panel;
    if (name === was && !this.closing && !this.returnAt) return;
    if (SUB[name] && !SUB[was]) this.from = was === 'pause' || was === 'ask' ? 'pause' : 'title';
    const hw = this.ui.ctx && this.ui.ctx.hw;
    this.el.dataset.hw = hw && hw.connected ? '1' : '';
    if (was === 'pause') this.pauseSel = this.sel;
    if (name !== 'options' || !SUB[was]) this.pending = {};
    this.closing = null;
    this.returnAt = 0;
    this.drag = null;
    this.el.classList.remove('leaving');
    this.panel = name;
    if (name !== 'options') this._updateFigurePreview();
    for (const k of PANELS) this.n[k].classList.toggle('cur', k === name);
    this.el.classList.toggle('open', !!name);
    if (name) this.el.dataset.panel = name;
    else delete this.el.dataset.panel;
    if (!name) {
      this.items = [];
      return;
    }
    if (name === 'options' || name === 'ctrl') {
      if (name === 'options' && !SUB[was]) this.tab = 'game';
      this._rebuild(name);
    }
    this.items = this.built[name].items;
    let sel = 0;
    if (name === 'ask') sel = 1;
    else if (name === 'pause' && (was === 'options' || was === 'ask')) sel = this.pauseSel;
    else if (name === 'title' && SUB[was])
      sel = this.spec.title.list.findIndex(([k]) => k === (was === 'ctrl' ? 'controllers' : was));
    this._select(sel, true);
    this.openedAt = performance.now();
    this._snapshotPadState();
    this._scheduleFrame();
    this._setDevice(this.ui.inputDevice());
  }

  ask(what) {
    const go = (type) => {
      const fn = () => this.leave({ type });
      fn.quiet = true;
      return fn;
    };
    const yes = what === 'restart' ? ['askRestartYes', go('restart')] : ['askTitleYes', go('title')];
    this._asked = what;
    this.n.askQ.textContent = what === 'restart' ? TEXT.askRestart : TEXT.askTitle;
    this.n.askNote.textContent = TEXT.askNote;
    this.spec.ask.list = [yes, ['askNo', () => this.open('pause')]];
    this._build('ask');
    this.open('ask');
  }

  leave(evt) {
    if (this.closing) return;
    if (this._byFinger() && evt && (evt.type === 'play' || evt.type === 'resume' || evt.type === 'restart'))
      this.ui.touch.gesture();
    this.closing = evt;
    this.closeAt = performance.now() + LEAVE_MS;
    this.el.classList.add('leaving');
    this._scheduleFrame();
  }

  back() {
    const sp = this.spec[this.panel];
    if (sp && sp.back) {
      if (!sp.back.quiet) this.ui._playUiSound('back');
      sp.back();
    }
  }

  _byFinger() {
    const t = this.ui.touch;
    return !!t && this.device === 'touch' && performance.now() - t.fingerAt < 1000;
  }
  _host() {
    const b = this.built[this.panel];
    return b ? b.host : null;
  }
  _justOpened() {
    return performance.now() - this.openedAt < GUARD_MS;
  }

  _select(i, quiet) {
    const n = this.items.length;
    if (!n) return;
    i = ((i % n) + n) % n;
    if (i === this.sel && !quiet) return;
    for (let k = 0; k < n; k++) {
      const on = k === i,
        e = this.items[k].el;
      e.classList.toggle('on', on);
      if (on) e.setAttribute('aria-current', 'true');
      else e.removeAttribute('aria-current');
    }
    this.sel = i;
    if (!quiet) this.ui._playUiSound('move');
    if (this.panel === 'options' && this.tab === 'figures') this._updateFigurePreview();
  }
  _move(d) {
    this._select(this.sel + d);
  }
  _confirm() {
    const it = this.items[this.sel];
    if (!it) return;
    if (it.row) {
      if (it.row.kind === 'choice') this._step(it.row, 1, true);
      else if (it.row.kind === 'button') {
        this.ui._playUiSound('confirm');
        it.row.act();
        this._paint(it);
      }
      return;
    }
    if (!it.act.quiet) this.ui._playUiSound('confirm');
    it.act();
  }
  _adjust(d) {
    const it = this.items[this.sel];
    if (it && it.row && it.row.kind !== 'button') this._step(it.row, d, false);
  }
  _get(row) {
    return row.get ? row.get() : row.pending ? this._effectiveSetting(row.key) : this.ui.settings[row.key];
  }

  _step(row, d, wrap) {
    const cur = this._get(row);
    if (row.kind === 'slider') {
      const n = Math.round((cur - row.min) / row.step) + d,
        max = Math.round((row.max - row.min) / row.step);
      this._set(row, row.min + Math.max(0, Math.min(max, n)) * row.step);
    } else {
      let i = row.values.indexOf(cur) + d;
      const n = row.values.length;
      i = wrap ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
      this._set(row, row.values[i]);
    }
  }
  _set(row, value) {
    if (row.kind === 'slider') value = +value.toFixed(3);
    if (this._get(row) === value) return;
    if (row.set) row.set(value);
    else if (row.pending) this._stageSetting(row.key, value);
    else this.ui._changeSetting(row.key, value);
    this.refresh();
    this.ui._playUiSound('adjust');
  }
  _dragTo(x) {
    const d = this.drag,
      r = d.tr.getBoundingClientRect(),
      row = d.row;
    const f = clamp((x - r.left) / Math.max(1, r.width)),
      steps = Math.round((row.max - row.min) / row.step);
    this._set(row, row.min + Math.round(f * steps) * row.step);
  }
  _paint(it) {
    const row = it.row,
      v = row.kind === 'button' ? null : this._get(row),
      e = it.el;
    if (row.kind === 'button') {
      const t = row.info ? row.info() : '';
      const inf = e.querySelector('.inf');
      if (inf.textContent !== t) inf.textContent = t;
    } else if (row.kind === 'slider') {
      e.querySelector('.sl').style.setProperty('--v', clamp((v - row.min) / (row.max - row.min)).toFixed(4));
      e.querySelector('.val').textContent = row.show(v);
    } else {
      const words = e.querySelectorAll('.ch b'),
        cur = row.values.indexOf(v);
      for (let i = 0; i < words.length; i++) words[i].classList.toggle('cur', i === cur);
    }
  }
  refresh() {
    for (const name of ['options', 'ctrl'])
      if (this.built[name]) for (const it of this.built[name].items) if (it.row) this._paint(it);
  }

  _key(e) {
    this.down.add(e.code);
    if (!this.panel || this.closing || this.returnAt || e.metaKey || e.ctrlKey || e.altKey) return;
    const c = e.code;
    let used = true;
    if (c === 'ArrowUp' || c === 'KeyW') this._move(-1);
    else if (c === 'ArrowDown' || c === 'KeyS') this._move(1);
    else if (c === 'Tab') this._move(e.shiftKey ? -1 : 1);
    else if (c === 'ArrowLeft' || c === 'KeyA') this._adjust(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') this._adjust(1);
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
      if (!e.repeat && !this._justOpened()) this._confirm();
    } else if (c === 'Escape' || c === 'Backspace') {
      if (!e.repeat && !this._justOpened()) this.back();
    } else used = false;
    if (used) {
      e.preventDefault();
      this._setDevice('keys');
    }
  }

  _readPad() {
    const out = this._pad;
    out.x = out.y = 0;
    out.a = out.b = out.s = out.any = false;
    let pads;
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : null;
    } catch (e) {
      pads = null;
    }
    if (!pads) return out;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const bt = p.buttons,
        ax = p.axes,
        on = (k) => !!(bt[k] && bt[k].pressed),
        sx = ax[0] || 0,
        sy = ax[1] || 0;
      if (on(12) || sy < -0.55) out.y = -1;
      else if (on(13) || sy > 0.55) out.y = 1;
      if (on(14) || sx < -0.55) out.x = -1;
      else if (on(15) || sx > 0.55) out.x = 1;
      out.a = on(0);
      out.b = on(1);
      out.s = on(9);
      out.any = out.a || out.b || out.s || !!out.x || !!out.y;
      break;
    }
    return out;
  }
  _snapshotPadState() {
    const p = this._readPad();
    this.pa = p.a;
    this.pb = p.b;
    this.ps = p.s;
    this.pdir = p.y ? (p.y < 0 ? 'u' : 'd') : p.x ? (p.x < 0 ? 'l' : 'r') : '';
    this.prep = Infinity;
  }

  _scheduleFrame() {
    if (!this.raf) this.raf = requestAnimationFrame(this._loop);
  }
  _frame() {
    this.raf = 0;
    if (this.ui.syncDevice) this.ui.syncDevice();
    const now = performance.now(),
      p = this._readPad();
    if (this.closing) {
      if (now >= this.closeAt || (!this.down.size && !p.a && !p.b && !p.s)) {
        const evt = this.closing;
        this.closing = null;
        this.returnAt = now + RETURN_MS;
        this.ui.emit(evt);
      }
    } else if (this.returnAt) {
      if (now >= this.returnAt) {
        this.returnAt = 0;
        this.el.classList.remove('leaving');
        this.openedAt = now;
        this._snapshotPadState();
      }
    } else if (this.panel) {
      if (this.panel === 'ctrl') this._hwStatus(now);
      if (p.any) this._setDevice('pad');
      const ok = !this._justOpened();
      if (p.a && !this.pa && ok) this._confirm();
      else if (p.b && !this.pb && ok) this.back();
      else if (p.s && !this.ps && ok) {
        const sp = this.spec[this.panel];
        if (sp && sp.start) sp.start();
      }
      const dir = p.y ? (p.y < 0 ? 'u' : 'd') : p.x ? (p.x < 0 ? 'l' : 'r') : '';
      if (dir !== this.pdir) {
        this.pdir = dir;
        this.prep = now + 380;
        if (dir) this._navigateByPad(dir);
      } else if (dir && now >= this.prep) {
        this.prep = now + (dir === 'l' || dir === 'r' ? 70 : 130);
        this._navigateByPad(dir);
      }
      this.pa = p.a;
      this.pb = p.b;
      this.ps = p.s;
    }
    if (this.panel || this.closing) this._scheduleFrame();
  }
  _navigateByPad(d) {
    if (d === 'u') this._move(-1);
    else if (d === 'd') this._move(1);
    else this._adjust(d === 'l' ? -1 : 1);
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.prev) {
      this.prev.dispose();
      this.prev = null;
    }
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.el.remove();
  }
}
