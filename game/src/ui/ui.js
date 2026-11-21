import { installStyle, removeStyle } from './style.js';
import { Hud } from './hud.js';
import { Menus, CONTROLS, TEXT, setLanguage } from './menus.js';
import { guessLanguage, fillPlaceholders } from './language.js';
import { TouchControls } from './touch-controls.js';
import { mountLogo } from './logo.js';
import { ICON, glyphsFor, escapeHtml } from './glyphs.js';
import { HEADLESS, keepHeadlessFramesRunning } from './headless-keepalive.js';
import { CHOSEN, DEFAULT as FIGURES, isAllowedFor, reloadFor } from '../characters/roster.js';
import { clamp, smooth } from '../core/math.js';

export const ASSETS = {};

const STORE = 'foundry.settings';
const CARD = ['move', 'look', 'attack', 'heavy', 'block', 'roll', 'jump', 'lock', 'heal', 'pause'];
const CARD_FROM = 0.5,
  CARD_FOR = 10;
const CARD_AFTER = 2.5,
  CARD_MOVED = 0.4;
const CARD_IN = 0.6,
  CARD_OUT = 1.2;
const DEFAULTS = {
  music: 0.8,
  sfx: 0.9,
  voice: 1,
  sensitivity: 1,
  invertY: false,
  quality: 'high',
  reducedMotion: false,
  lang: 'en',
  difficulty: 'normal',
  lava: 'normal',
  rumble: true,
  gesture: 'normal',
  heartShow: true,
  heartBoss: true,
  ghosts: true,
  ash: true,
  subtitles: true,
  playerModel: FIGURES.player,
  bossModel: FIGURES.boss,
};
const CHOICES = {
  lang: ['de', 'en'],
  difficulty: ['easy', 'normal', 'hard'],
  lava: ['off', 'soft', 'normal'],
  gesture: ['calm', 'normal', 'keen'],
};
const SWITCHES = ['rumble', 'heartShow', 'heartBoss', 'ghosts', 'ash', 'subtitles'];
const QUALITIES = ['low', 'medium', 'high', 'ultra'];
const SCREENS = { title: 1, hud: 1, pause: 1, options: 1, ctrl: 1, end: 1, none: 1 };
const MENUS = { title: 1, pause: 1, options: 1, ctrl: 1, end: 1 };

function readSavedSettings() {
  let o;
  try {
    const t = window.localStorage.getItem(STORE);
    o = t ? JSON.parse(t) : null;
  } catch (e) {
    o = null;
  }
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of ['music', 'sfx', 'voice'])
    if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = clamp(o[k], 0, 1);
  if (typeof o.sensitivity === 'number' && Number.isFinite(o.sensitivity))
    out.sensitivity = clamp(o.sensitivity, 0.2, 2);
  if (typeof o.invertY === 'boolean') out.invertY = o.invertY;
  if (QUALITIES.includes(o.quality)) out.quality = o.quality;
  if (typeof o.reducedMotion === 'boolean') out.reducedMotion = o.reducedMotion;
  for (const k in CHOICES) if (CHOICES[k].includes(o[k])) out[k] = o[k];
  for (const k of SWITCHES) if (typeof o[k] === 'boolean') out[k] = o[k];
  for (const role of ['player', 'boss'])
    if (isAllowedFor(role, o[role + 'Model'])) out[role + 'Model'] = o[role + 'Model'];
  return out;
}

export class UI {
  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.screen = 'none';
    this.listeners = [];
    this.offs = [];
    this.saved = readSavedSettings();
    const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.settings = Object.assign({}, DEFAULTS, { reducedMotion: calm, lang: guessLanguage() }, this.saved, {
      playerModel: CHOSEN.player,
      bossModel: CHOSEN.boss,
    });
    setLanguage(this.settings.lang);

    installStyle();
    root.classList.add('tbf');
    root.innerHTML = '';
    this.device = this.inputDevice();
    root.dataset.input = this.device;
    this.cineOn = false;
    const add = (html) => root.insertAdjacentHTML('beforeend', html);
    add('<div class="tbf-lbx t"></div><div class="tbf-lbx b"></div>');
    this.hud = new Hud(this, root);
    this.touch = new TouchControls(this, root);
    add(`<div class="tbf-fade"></div>
      <div class="tbf-banner"><i class="band"></i><i class="ru"></i><span class="tx"></span><i class="ru"></i></div>
      <div class="tbf-name"><span class="tx"></span><i class="ru"></i></div>
      <div class="tbf-sub"></div>
      <div class="tbf-skip">${ICON.ring}<span class="lb"></span></div>
      <div class="tbf-load"><div class="tbf-spot"><div class="logo"></div><div class="line"><i></i></div></div></div>`);
    this.menus = new Menus(this, root);
    add('<div class="tbf-live" role="status" aria-live="polite"></div>');
    root.appendChild(this.touch.turn);
    const q = (s) => root.querySelector(s);
    this.n = {
      lbt: q('.tbf-lbx.t'),
      lbb: q('.tbf-lbx.b'),
      fade: q('.tbf-fade'),
      banner: q('.tbf-banner'),
      band: q('.tbf-banner .band'),
      bannerText: q('.tbf-banner .tx'),
      ru1: root.querySelectorAll('.tbf-banner .ru')[0],
      ru2: root.querySelectorAll('.tbf-banner .ru')[1],
      name: q('.tbf-name'),
      nameText: q('.tbf-name .tx'),
      nameRule: q('.tbf-name .ru'),
      sub: q('.tbf-sub'),
      skip: q('.tbf-skip'),
      skipRing: q('.tbf-skip .v'),
      skipLabel: q('.tbf-skip .lb'),
      load: q('.tbf-load'),
      line: q('.tbf-load .line i'),
      live: q('.tbf-live'),
    };
    mountLogo(q('.tbf-load .logo'));

    this.bn = { on: false, kind: 'death', t: 0, a: 0 };
    this.sb = { on: false, text: null, left: 0, a: 0 };
    this.nc = { on: false, text: null, t: 0, len: 0 };
    this.lb = { cur: 0, want: 0 };
    this.skipK = 0;
    this.skipLinger = 0;
    this.card = { done: !this._wantsControlsCard(), t: 0, a: 0, moved: 0, movedAt: Infinity };
    this.w = {
      banner: -1,
      bannerTx: -1,
      bannerSc: -1,
      bannerRu: -1,
      sub: -1,
      name: -1,
      nameRu: -1,
      lb: -1,
      fade: -1,
      load: -1,
      skipOn: null,
      skipV: -1,
      card: -1,
    };
    this.isLoaded = false;
    this.revealed = false;
    this.firstT = 0;
    this.hud.setDevice(this.device);
    this._renderSkipLabel();
    this._renderControlsCard();
    this._applyReducedMotion();

    const p = ctx.params;
    this.freezeAt = ctx.dev && p && p.has('uifreeze') && p.get('uifreeze') !== '' ? +p.get('uifreeze') : -1;
    if (HEADLESS && !(p && p.get('motion') === '1')) root.classList.add('still');
    this._walk = keepHeadlessFramesRunning(ctx);

    this._onKey = (e) => {
      if (this.cineOn && !e.repeat) this.skipLinger = Math.max(this.skipLinger, 2.4);
    };
    window.addEventListener('keydown', this._onKey);
    const bus = ctx.bus;
    if (bus && bus.on) {
      this.offs.push(
        bus.on('cine', (e) => {
          this.cineOn = !!(e && e.on);
          if (!this.cineOn) this.skipLinger = 0;
          else if (this.device === 'touch') this.skipLinger = Math.max(this.skipLinger, 6);
          this.touch.sync();
        }),
      );
      this.offs.push(
        bus.on('subtitle', (e) => {
          if (e) this.subtitle(e.text, e.seconds);
        }),
      );
    }
    if (document.fonts && document.fonts.load)
      for (const f of [
        '400 1em "Bell Foundry Caslon"',
        'italic 400 1em "Bell Foundry Caslon"',
        '500 1em "Bell Foundry Ysabeau"',
      ])
        document.fonts.load(f).catch(() => {});
  }

  on(fn) {
    this.listeners.push(fn);
  }
  emit(e) {
    for (let i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](e);
      } catch (err) {
        console.error('a listener of the interface failed on "' + (e && e.type) + '"', err);
      }
    }
  }

  setLoading(f) {
    f = Math.round(clamp(+f || 0, 0, 1) * 500) / 500;
    if (f !== this.w.load) {
      this.w.load = f;
      this.n.line.style.transform = 'scaleX(' + f + ')';
    }
  }
  loaded() {
    if (this.isLoaded) return;
    this.isLoaded = true;
    this.setLoading(1);
    if (this._walk) {
      this._walk();
      this._walk = null;
    }
    for (const key of ['music', 'sfx', 'voice', 'sensitivity', 'invertY', 'reducedMotion'])
      this.emit({ type: 'setting', key, value: this.settings[key] });
  }
  _reveal() {
    if (!this.isLoaded || this.revealed) return;
    this.revealed = true;
    const slow = this.screen === 'title';
    this.n.load.classList.add(slow ? 'slow' : 'quick');
    this.n.load.classList.add('gone');
    this.root.classList.toggle('first', slow);
    this.firstT = slow ? 7 : 0;
  }

  showScreen(name) {
    if (!SCREENS[name]) name = 'none';
    const was = this.screen;
    this.screen = name;
    this.root.dataset.screen = name;
    if (name === 'hud' && was !== 'hud' && was !== 'pause' && was !== 'options') this.hud.snap();
    if (name !== 'title') this.root.classList.remove('first');
    this.menus.open(MENUS[name] ? name : null);
    this._reveal();
    this.touch.sync();
    if (name !== was && name === 'pause') this._announce(TEXT.paused);
  }

  setPlayer(p) {
    this.hud.setPlayer(p);
  }
  setBoss(b) {
    this.hud.setBoss(b);
  }
  setLock(x, y, visible) {
    this.hud.setLock(x, y, visible);
  }
  prompt(text) {
    this.hud.prompt(text);
  }

  banner(kind, text) {
    const b = this.bn;
    if (!kind || !text) {
      b.on = false;
      return;
    }
    b.on = true;
    b.t = 0;
    b.kind = kind === 'victory' ? 'victory' : 'death';
    this.n.banner.className = 'tbf-banner live ' + b.kind;
    if (this.n.bannerText.textContent !== text) this.n.bannerText.textContent = text;
    this._announce(text);
  }

  subtitle(text, seconds = 3) {
    const s = this.sb;
    if (!text || this.settings.subtitles === false) {
      s.left = 0;
      return;
    }
    if (text !== s.text) {
      s.text = text;
      this.n.sub.textContent = text;
    }
    s.left = Math.max(0.4, +seconds || 3);
    s.on = true;
  }

  nameCard(text, seconds = 5) {
    const c = this.nc;
    if (!text) {
      c.on = false;
      c.text = null;
      this._op('name', this.n.name, 0);
      return;
    }
    if (text !== c.text) {
      c.text = text;
      this.n.nameText.textContent = text;
    }
    c.t = 0;
    c.len = Math.max(1.2, +seconds || 5);
    c.on = true;
  }

  letterbox(k) {
    this.lb.want = clamp(+k || 0, 0, 1);
  }

  fade(k) {
    k = Math.round(clamp(+k || 0, 0, 1) * 200) / 200;
    if (k !== this.w.fade) {
      this.w.fade = k;
      this.n.fade.style.opacity = k;
    }
  }

  skip(k) {
    this.skipK = clamp(+k || 0, 0, 1);
    if (this.skipK > 0) this.skipLinger = Math.max(this.skipLinger, 1.6);
  }

  update(dt) {
    if (this.freezeAt >= 0 && this.ctx.game && this.ctx.game.time >= this.freezeAt) return;
    const n = this.n,
      w = this.w;
    this._reveal();
    if (this.firstT > 0) {
      this.firstT -= dt;
      if (this.firstT <= 0) this.root.classList.remove('first');
    }
    this.syncDevice();
    this.hud.update(dt);
    this.touch.update(dt);

    const k = this.card;
    if (!k.done) {
      const g = this.ctx.game,
        fighting = this.screen === 'hud' && !this.cineOn && (!g || g.state === 'fight');
      if (fighting) {
        k.t += dt;
        const mv = this.ctx.input && this.ctx.input.move;
        if (k.movedAt === Infinity && mv && Math.hypot(mv.x, mv.y) > 0.2) {
          k.moved += dt;
          if (k.moved >= CARD_MOVED) k.movedAt = k.t;
        }
        const end = Math.max(CARD_FOR, k.movedAt + CARD_AFTER),
          want = k.t >= CARD_FROM && k.t < end;
        k.a = want ? Math.min(1, k.a + dt / CARD_IN) : Math.max(0, k.a - dt / CARD_OUT);
        if (k.t >= end && k.a === 0) k.done = true;
        const touch = this.device === 'touch';
        this._op('card', this.hud.n.ctl, touch ? 0 : smooth(k.a));
        this.touch.labels(touch && want);
      } else if (k.t > 0) {
        k.done = true;
        k.a = 0;
      }
      if (k.done) {
        this._op('card', this.hud.n.ctl, 0);
        this.touch.labels(false);
      }
    }

    const b = this.bn;
    if (b.on || b.a > 0) {
      if (b.on) {
        b.t += dt;
        b.a = Math.min(1, b.a + dt / (b.kind === 'death' ? 1.5 : 2.1));
      } else {
        b.a = Math.max(0, b.a - dt / 0.8);
        if (b.a === 0) n.banner.classList.remove('live');
      }
      const e = smooth(b.a);
      this._op('banner', n.band, e);
      this._op('bannerTx', n.bannerText, smooth((b.a - 0.18) / 0.82));
      const sc = this.settings.reducedMotion ? 1 : Math.round((1 + 0.05 * (1 - Math.exp(-b.t / 3.2))) * 2000) / 2000;
      if (sc !== w.bannerSc) {
        w.bannerSc = sc;
        n.bannerText.style.transform = 'scale(' + sc + ')';
      }
      const ru = Math.round((0.5 + 0.5 * e) * 200) / 200;
      if (ru !== w.bannerRu) {
        w.bannerRu = ru;
        const t = 'scaleX(' + ru + ')';
        n.ru1.style.transform = t;
        n.ru2.style.transform = t;
        n.ru1.style.opacity = n.ru2.style.opacity = (e * 0.55).toFixed(2);
      }
    }

    const s = this.sb;
    if (s.on) {
      s.left -= dt;
      s.a = s.left > 0 ? Math.min(1, s.a + dt / 0.22) : Math.max(0, s.a - dt / 0.4);
      this._op('sub', n.sub, s.a);
      if (s.left <= 0 && s.a === 0) {
        s.on = false;
        s.text = null;
      }
    }

    const c = this.nc;
    if (c.on) {
      c.t += dt;
      const fin = Math.min(1.5, c.len * 0.3),
        fout = Math.min(1.6, c.len * 0.3);
      const a =
        c.t >= c.len ? 0 : c.t < fin ? smooth(c.t / fin) : c.t > c.len - fout ? smooth((c.len - c.t) / fout) : 1;
      this._op('name', n.name, a);
      const ru = Math.round((0.25 + 0.75 * smooth(c.t / (fin * 1.6))) * 200) / 200;
      if (ru !== w.nameRu) {
        w.nameRu = ru;
        n.nameRule.style.transform = 'scaleX(' + ru + ')';
      }
      if (c.t >= c.len) {
        c.on = false;
        c.text = null;
      }
    }

    const l = this.lb;
    if (l.cur !== l.want) {
      const d = l.want - l.cur;
      l.cur = Math.abs(d) < 0.05 ? l.want : l.cur + d * Math.min(1, dt * 7);
      const pc = Math.round((1 - l.cur) * 1010) / 10;
      if (pc !== w.lb) {
        w.lb = pc;
        n.lbt.style.transform = 'translateY(' + -pc + '%)';
        n.lbb.style.transform = 'translateY(' + pc + '%)';
      }
    }

    if (this.skipK <= 0 && this.skipLinger > 0) this.skipLinger -= dt;
    const on = this.skipK > 0 || this.skipLinger > 0;
    if (on !== w.skipOn) {
      w.skipOn = on;
      n.skip.classList.toggle('on', on);
    }
    const v = Math.round(this.skipK * 200) / 2;
    if (v !== w.skipV) {
      w.skipV = v;
      n.skipRing.style.strokeDashoffset = String(100 - v);
    }
  }

  _op(k, node, v) {
    const q = Math.round(v * 100) / 100;
    if (this.w[k] !== q) {
      this.w[k] = q;
      node.style.opacity = q;
    }
  }

  inputDevice() {
    const i = this.ctx.input,
      d = i && i.device;
    return d === 'pad' || d === 'touch' ? d : 'keys';
  }
  syncDevice() {
    const dev = this.inputDevice();
    if (dev === this.device) return;
    this.device = dev;
    this.root.dataset.input = dev;
    this.hud.setDevice(dev);
    this._renderSkipLabel();
    this._renderControlsCard();
    this.touch.sync();
    if (this.menus.panel) this.menus._setDevice(dev);
  }
  _renderSkipLabel() {
    this.n.skipLabel.innerHTML =
      this.device === 'touch'
        ? escapeHtml(TEXT.holdSkipTouch)
        : fillPlaceholders(escapeHtml(TEXT.holdSkip), { k: glyphsFor('skip', this.device) });
  }
  _renderControlsCard() {
    const d = this.device === 'pad' ? 'pad' : 'keys',
      label = (a) => {
        const row = CONTROLS.find((r) => r[1] === a);
        return row ? TEXT[row[0]] : a;
      };
    this.hud.n.ctl.innerHTML =
      `<h3>${escapeHtml(TEXT.controls)}</h3>` +
      CARD.map(
        (a) => `<div class="r"><span class="k">${glyphsFor(a, d)}</span><span>${escapeHtml(label(a))}</span></div>`,
      ).join('');
  }
  _wantsControlsCard() {
    const p = this.ctx.params,
      get = (name) => (p && p.get ? p.get(name) : null),
      g = this.ctx.game;
    if (p && p.has && p.has('capture')) return false;
    if (get('card') === '1') return true;
    if (get('card') === '0') return false;
    return !(HEADLESS || (g && g.auto));
  }
  _applyReducedMotion() {
    this.root.classList.toggle('rm', !!this.settings.reducedMotion);
  }
  _announce(text) {
    this.n.live.textContent = text || '';
  }

  _changeSetting(key, value) {
    this.settings[key] = value;
    this.saved[key] = value;
    try {
      window.localStorage.setItem(STORE, JSON.stringify(this.saved));
    } catch (e) {}
    if (key === 'reducedMotion') this._applyReducedMotion();
    if (key === 'lang') {
      setLanguage(value);
      this.menus.relabel();
      this._renderSkipLabel();
      this._renderControlsCard();
    }
    this.emit({ type: 'setting', key, value });
  }
  confirmFigures(changes) {
    const ROLE = { playerModel: 'player', bossModel: 'boss' },
      put = {};
    for (const key in changes)
      if (ROLE[key]) {
        this.settings[key] = this.saved[key] = changes[key];
        put[ROLE[key]] = changes[key];
      }
    if (!Object.keys(put).length) return;
    let kept = true;
    try {
      window.localStorage.setItem(STORE, JSON.stringify(this.saved));
    } catch (e) {
      kept = false;
    }
    reloadFor(Object.keys(put), kept ? null : put);
  }

  _playUiSound(kind) {
    const a = this.ctx.audio,
      name = kind === 'move' ? 'ui_move' : kind === 'back' ? 'ui_back' : kind === 'confirm' ? 'ui_select' : null;
    if (name && a && typeof a.play === 'function') {
      try {
        a.play(name);
      } catch (e) {}
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    for (const off of this.offs) if (typeof off === 'function') off();
    if (this._walk) {
      this._walk();
      this._walk = null;
    }
    this.menus.dispose();
    this.touch.dispose();
    this.hud.dispose();
    this.root.innerHTML = '';
    this.root.classList.remove('tbf', 'rm', 'first', 'still', 'upright');
    delete this.root.dataset.screen;
    delete this.root.dataset.input;
    for (const v of ['--sl', '--st', '--sr', '--sb']) this.root.style.removeProperty(v);
    this.listeners.length = 0;
    removeStyle();
  }
}
