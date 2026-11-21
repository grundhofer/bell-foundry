// Read Atom, simulator, or recorded controller data and feed game inputs.
import { FrameReader, decodePayload, COMMANDS, DEVICE, BUTTON } from './protocol.js';
import { SwordGestures, ShieldGestures, TUNING } from './gestures.js';
import { SimulatorSource } from './simulator.js';
import { SerialSource, Recorder, ReplaySource } from './sources.js';
import { HeartRate } from './heart-rate.js';
import { HardwarePanel } from './panel.js';

const LOST = 0.5;
const TAP = 0.25;
const TURN = 2.4;
const KEY_STORE = 'foundry.hw';
const STRONG = 1.8;
const GESTURE = { calm: 1.25, normal: 1, keen: 0.8 };

const loadStoredSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
  } catch (e) {
    return {};
  }
};
const saveStoredSettings = (o) => {
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify(o));
  } catch (e) {}
};

export class Hardware {
  constructor(ctx) {
    this.ctx = ctx;
    this.saved = loadStoredSettings();
    this.joyFlip = ctx.params.flag('joyflip', this.saved.joyFlip !== false);
    this.sword = new SwordGestures({ blade: this.saved.blade });
    this.shield = new ShieldGestures({ guard: this.saved.guard });
    this.dev = {
      [DEVICE.SWORD]: this._createDeviceState('Schwert'),
      [DEVICE.SHIELD]: this._createDeviceState('Schild'),
    };
    this.reader = new FrameReader((p) => this._onPayload(p));
    this.recorder = new Recorder();
    this.heart = new HeartRate();
    this.heart.autoConnect().catch(() => {}); // a strap allowed before comes back by itself (where Chrome can list it)
    this.source = null;
    this.status = null;
    this.latency = 0;
    this.log = [];
    this.pulses = [];
    this.k2 = 0;
    this.menuY = 0;
    this.menuX = 0;
    this.lastJoyPress = false;
    this.lastGesture = null;
    this.gestureLevel = 'normal';
    this._pings = new Map();
    this._pingTimer = 0;
    this._base = null;
    if (ctx.input) ctx.input.onRumble = (s, w, t) => this.rumble(s, w, t);
    const p = ctx.params;
    if (typeof document !== 'undefined') {
      this.panel = new HardwarePanel(this, p.has('hw'));
      if (p.get('hw') === 'sim') this.useSim();
    }
  }
  _createDeviceState(name) {
    return { name, last: null, at: -1e9, count: 0, pps: 0, lost: 0, seq: -1, prevT: 0, prev: 0, edges: 0 };
  }

  async _switchSource(src) {
    await this.stop();
    this.source = src;
    await src.start();
    this._note(`Quelle: ${src.name}`);
  }
  onBytes = (b) => {
    this.recorder.push(b);
    this.reader.push(b);
  };
  async useSerial() {
    await this._switchSource(
      new SerialSource(this.onBytes, (s, e) => this._note(`Atom: ${s}${e ? ' ' + e.message : ''}`)),
    );
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      const tok = (Math.random() * 2 ** 32) >>> 0;
      this._pings.set(tok, performance.now());
      this.write(COMMANDS.ping(tok));
    }, 1000);
    this.write(COMMANDS.led(0, 0, 0));
  }
  useSim() {
    return this._switchSource(new SimulatorSource(this.onBytes));
  }
  useReplay(json, o) {
    return this._switchSource(new ReplaySource(this.onBytes, json, o));
  }
  async stop() {
    clearInterval(this._pingTimer);
    if (this.source) {
      const s = this.source;
      this.source = null;
      await s.stop();
      this._note('Quelle gestoppt');
    }
    this._releaseAllInputs();
  }
  write(bytes) {
    if (this.source) this.source.write(bytes);
  }
  get connected() {
    return !!this.source;
  }

  _onPayload(pl) {
    const p = decodePayload(pl);
    if (!p) return;
    if (p.type === 'imu') {
      const d = this.dev[p.device];
      if (!d) return;
      const now = performance.now();
      if (d.seq >= 0) {
        const gap = (p.seq - d.seq) & 0xffff;
        if (gap > 1 && gap < 1000) d.lost += gap - 1;
      }
      d.seq = p.seq;
      d.count++;
      const dt = d.prevT ? Math.min(0.05, Math.max(0.002, ((p.tUs - d.prevT) >>> 0) / 1e6)) : 0.01;
      d.prevT = p.tUs;
      // the shield's joystick is mounted upside down on the real hardware: forward and back turned (not for the simulator or a replay; &joyflip=0 or saved joyFlip false undoes it)
      if (p.device === DEVICE.SHIELD && p.joy && this.source && /^Atom/.test(this.source.name) && this.joyFlip)
        p.joy = [p.joy[0], -p.joy[1]];
      d.prev = d.last ? d.last.buttons : 0;
      d.last = p;
      d.at = now;
      const ev = (p.device === DEVICE.SWORD ? this.sword : this.shield).update(p, dt);
      for (const e of ev) this._gesture(p.device, e);
      d.edges |= p.buttons & ~d.prev;
    } else if (p.type === 'status') this.status = p;
    else if (p.type === 'pong') {
      const t = this._pings.get(p.token);
      if (t) {
        this.latency = performance.now() - t;
        this._pings.delete(p.token);
      }
    } else if (p.type === 'log') this._note('Atom: ' + p.text);
  }
  _gesture(device, e) {
    const map = { slash: 'attack', thrust: 'attack', overhead: 'heavy', flick: 'roll' };
    if (map[e.kind]) this.pulses.push(map[e.kind]);
    if (device === DEVICE.SWORD && map[e.kind]) {
      const t = this.sword.t,
        strong = e.kind === 'thrust' ? e.peak >= t.thrustG * STRONG : e.peak >= t.minPeak * STRONG;
      this.swing = { kind: e.kind, strong, at: performance.now() };
    }
    this.lastGesture = { kind: e.kind, at: performance.now() };
    if (e.kind === 'calibrated') {
      this.saved.guard = this.shield.ref;
      saveStoredSettings(this.saved);
      this.write(COMMANDS.vibrate(DEVICE.SWORD, 120, 80));
    }
    this._note(`${device === DEVICE.SWORD ? 'Schwert' : 'Schild'}: ${e.kind}${e.peak ? ' (' + e.peak + ')' : ''}`);
  }
  calibrateBlade() {
    const p = this.dev[DEVICE.SWORD].last;
    if (!p) return 'none';
    const b = this.sword.calibrate(p);
    if (!b) return 'flat';
    this.saved.blade = b;
    saveStoredSettings(this.saved);
    this._note(`Schwert-Ausgangslage kalibriert (${b})`);
    return 'ok';
  }
  takeSwing() {
    const s = this.swing;
    this.swing = null;
    return s && performance.now() - s.at < 400 ? s : null;
  }
  calibrateGuard() {
    const p = this.dev[DEVICE.SHIELD].last;
    if (!p) return false;
    this.shield.calibrate(p);
    this.saved.guard = this.shield.ref;
    saveStoredSettings(this.saved);
    this._note('Schild-Deckung kalibriert');
    return true;
  }
  _note(text) {
    this.log.unshift({ t: performance.now(), text });
    if (this.log.length > 12) this.log.pop();
  }

  update(dt) {
    const input = this.ctx.input,
      g = this.ctx.game;
    if (!input || !input.hwSet) return;
    const now = performance.now(),
      S = this.dev[DEVICE.SWORD],
      H = this.dev[DEVICE.SHIELD];
    for (const d of [S, H]) {
      if (now - d.ppsAt > 1000 || !d.ppsAt) {
        d.pps = d.count - (d.ppsCount || 0);
        d.ppsCount = d.count;
        d.ppsAt = now;
      }
    }
    const sOn = now - S.at < LOST * 1000,
      hOn = now - H.at < LOST * 1000;
    const sb = sOn ? S.last.buttons : 0,
      hb = hOn ? H.last.buttons : 0,
      sE = S.edges;
    S.edges = H.edges = 0;
    const menu = !g || g.paused || g.state === 'title' || g.state === 'won';
    const set = this.ctx.ui && this.ctx.ui.settings;
    if (set && set.gesture !== this.gestureLevel) this.setGestureSensitivity(set.gesture);
    const cine = g && (g.state === 'intro' || g.state === 'phase' || g.state === 'rescue');

    if (hb & BUTTON.KEY2) this.k2 += dt;
    else {
      if (this.k2 > 0 && this.k2 < TAP) {
        if (menu) this._key('Escape');
        else input.hwPulse('pause');
      }
      this.k2 = 0;
    }
    const turning = this.k2 >= TAP;

    if (menu) {
      input.hwStick(0, 0);
      input.hwTurn(0, 0);
      this._releaseHolds();
      const y = hOn ? this.shield.stick.y : 0,
        dir = y > 0.6 ? -1 : y < -0.6 ? 1 : 0;
      if (dir && dir !== this.menuY) this._key(dir < 0 ? 'ArrowUp' : 'ArrowDown');
      this.menuY = dir;
      const x = hOn && !dir ? this.shield.stick.x : 0,
        side = x > 0.6 ? 1 : x < -0.6 ? -1 : 0;
      if (side && side !== this.menuX) this._key(side < 0 ? 'ArrowLeft' : 'ArrowRight');
      this.menuX = side;
      if (sE & BUTTON.KEY1) this._key('Enter');
      this.pulses.length = 0;
      return;
    }
    this.menuY = this.menuX = 0;
    input.hwSet('skip', cine && !!(sb & BUTTON.KEY1));

    const st = hOn ? this.shield.stick : { x: 0, y: 0 };
    if (turning) {
      input.hwStick(0, 0);
      input.hwTurn(-st.x * TURN * dt, 0);
    } else {
      input.hwStick(st.x, st.y);
      input.hwTurn(0, 0);
    }

    input.hwSet('block', hOn && this.shield.guard);
    input.hwSet('roll', (!!(hb & BUTTON.KEY1) && !(hb & BUTTON.KEY2)) || !!(hb & BUTTON.JOY)); // the stick clicked in: roll, held: sprint (as shield KEY1)
    if (sE & BUTTON.KEY1) input.hwPulse('heal');
    if (sE & BUTTON.KEY2) input.hwPulse('jump');
    for (const a of this.pulses) input.hwPulse(a);
    this.pulses.length = 0;

    this.applyHeartRateToBoss(dt);
  }
  setGestureSensitivity(level) {
    const k = GESTURE[level] || 1;
    this.gestureLevel = GESTURE[level] ? level : 'normal';
    const sw = this.sword.t,
      sh = this.shield.t,
      S = TUNING.sword,
      H = TUNING.shield;
    sw.start = S.start * k;
    sw.minPeak = S.minPeak * k;
    sw.thrustG = S.thrustG * k;
    sh.flickG = H.flickG * k;
  }
  _releaseHolds() {
    const i = this.ctx.input;
    if (i && i.hwSet) for (const a of ['block', 'roll', 'skip']) i.hwSet(a, false);
  }
  _releaseAllInputs() {
    const i = this.ctx.input;
    if (i && i.hwSet) {
      this._releaseHolds();
      i.hwStick(0, 0);
      i.hwTurn(0, 0);
    }
    this.pulses.length = 0;
  }
  _key(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
  }

  rumble(strong = 0.5, weak = 0.5, seconds = 0.15) {
    if (!this.dev[DEVICE.SWORD].last) return;
    this.write(
      COMMANDS.vibrate(DEVICE.SWORD, Math.round(255 * Math.min(1, Math.max(strong, weak))), Math.round(seconds * 1000)),
    );
  }

  applyHeartRateToBoss() {
    const boss = this.ctx.boss,
      h = this.heart;
    if (!boss || !boss.rules) return;
    if (!this._base) this._base = { rest: boss.rules.rest, quick: boss.rules.quick };
    const on = !(this.ctx.ui && this.ctx.ui.settings && this.ctx.ui.settings.heartBoss === false);
    const live = on && h.live && h.rest,
      s = live ? h.stress : 0,
      calm = live && h.calm > 20;
    boss.rules.rest = this._base.rest * (1 - 0.3 * s) * (calm ? 1.15 : 1);
    boss.rules.quick = this._base.quick * (1 + 0.15 * s);
    this.mood = !live ? '' : calm ? 'ruhig' : s > 0.6 ? 'Angst' : s > 0.2 ? 'angespannt' : 'normal';
  }
}
