import { FILES } from './manifest.js';
import { SOUNDS, SOUND_DEFAULTS, MUTED, wireSoundEvents } from './sounds.js';
import { naveImpulse } from './reverb-impulse.js';
import { RESCUE_LINES } from '../core/constants.js';
import { CHOSEN, entryOf } from '../characters/roster.js';
import { mulberry32, clamp } from '../core/math.js';
import { FOUNDRY_LOOK } from '../config/foundry-look.js';

const SFX = FILES.sfx;
const DIR = { sfx: 'assets/audio/sfx/', music: 'assets/audio/music/' };
// The foundry's spoken lines (FILES.voice_giesserei, assets/audio/voice_giesserei/).
const FOUNDRY_VOICE = 'voice_' + FOUNDRY_LOOK.name;
const VOICE = {};
for (const name in FILES[FOUNDRY_VOICE])
  VOICE[name] = { ...FILES[FOUNDRY_VOICE][name], dir: `assets/audio/${FOUNDRY_VOICE}/` };
// The smith's deep voice (FILES.voice_smith) for every boss figure but the women (roster: voice 'female'), who keep the
// foundry's female set.
const BOSS_FIGURE = CHOSEN ? entryOf(CHOSEN.boss) : null;
const BOSS_VOICE = BOSS_FIGURE && BOSS_FIGURE.voice !== 'female' && FILES.voice_smith ? 'voice_smith' : null;
if (BOSS_VOICE)
  for (const name in FILES[BOSS_VOICE])
    VOICE[name] = { ...FILES[BOSS_VOICE][name], dir: `assets/audio/${BOSS_VOICE}/` };
const FURNACE = FOUNDRY_LOOK.hall.furnace;

export const ASSETS = {};
for (const name in SFX)
  SFX[name].takes.forEach((file, i) => {
    ASSETS[`sfx.${name}.${i}`] = { url: DIR.sfx + file, type: 'buffer', optional: true };
  });
for (const name in VOICE)
  ASSETS[`voice.${name}`] = { url: VOICE[name].dir + VOICE[name].file, type: 'buffer', optional: true };
if (FILES.music.json) ASSETS['music.json'] = { url: DIR.music + 'music.json', type: 'json', optional: true };
for (const name in FILES.music.files)
  ASSETS[`music.${name}`] = { url: DIR.music + FILES.music.files[name], type: 'buffer', optional: true };

const RATE = 48000;
const WORLD_VOICES = 24,
  UI_VOICES = 3;
const WIDTH = 0.85;
const NEAR = 2.5;
const HALL_LEVEL = 1.15;
const JOIN = 0.75;
const START = 0.04;
const LEAD = 12;
const CHAIN = { intro: 'phase1', turn: 'phase2' };
const CINE_OF = { intro: 'intro', turn: 'phase2', ending: 'ending' };
const KEEP = {
  boot: ['title', 'intro'],
  title: ['title', 'intro'],
  intro: ['intro'],
  fight: [],
  phase: ['turn', 'phase2'],
  dead: ['phase1'],
  won: ['ending'],
};
const KEEP_LINE = {
  boot: 'boss_intro',
  title: 'boss_intro',
  intro: 'boss_intro',
  phase: 'boss_phase',
  won: 'boss_end',
};
const MUSIC_RATE = 48000;
const VOICE_DUCK = 0.3;
const LIMITER = { threshold: -8, knee: 8, ratio: 12, attack: 0.003, release: 0.18 };
const LIMITER_TRIM = 0.731;
const EMPTY = Object.freeze({});
const square = (v) => clamp(v, 0, 1) ** 2;

function cancelAndHold(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

function ceilingCurve(n = 4097) {
  const c = new Float32Array(n),
    knee = 0.7,
    top = 0.94;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2,
      a = Math.abs(x);
    c[i] = a <= knee ? x : Math.sign(x) * (knee + (top - knee) * Math.tanh((a - knee) / (top - knee)));
  }
  return c;
}

// Audio engines share the decoded effects cache.
const decoders = new Map();
const DECODED = new WeakMap();
function decodeFresh(bytes, rate = RATE) {
  let d = decoders.get(rate);
  if (!d) decoders.set(rate, (d = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, rate)));
  return d.decodeAudioData(bytes.slice(0));
}
function decodeShared(bytes, rate = RATE) {
  let p = DECODED.get(bytes);
  if (!p) {
    p = decodeFresh(bytes, rate);
    DECODED.set(bytes, p);
  }
  return p;
}
const megabytes = (buffer) => (buffer ? (buffer.length * buffer.numberOfChannels * 4) / 1048576 : 0);

class Loop {
  constructor(audio, name, o) {
    this.audio = audio;
    this.name = name;
    this.volume = o.volume === undefined ? 1 : o.volume;
    this.rate = o.rate === undefined ? 1 : o.rate;
    this.fadeIn = o.fade === undefined ? 0.6 : o.fade;
    this.placed = false;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.src = null;
    this.gain = null;
    this.pan = null;
    this.send = null;
    this.stopped = false;
    this.level = 1;
    if (o.pos) this.setPos(o.pos);
  }
  start() {
    const a = this.audio,
      s = a.sounds[this.name];
    if (this.src || this.stopped || !s || !a.running || a.muted.has(this.name)) return;
    const buf = s.takes[0];
    if (!buf) return;
    const ac = a.ac,
      t = ac.currentTime,
      def = s.def;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = this.rate;
    const le = s.loop ? Math.min(s.loop[1], buf.duration) : buf.duration,
      ls = s.loop ? Math.min(s.loop[0], le) : 0;
    src.loopStart = ls;
    src.loopEnd = le;
    this.gain = ac.createGain();
    this.pan = ac.createStereoPanner();
    this.send = ac.createGain();
    this.level = def.trim * s.gains[0];
    this.gain.gain.value = 0;
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.linearRampToValueAtTime(this.level * this.volume * this.place(), t + Math.max(0.01, this.fadeIn));
    this.send.gain.value = def.wet;
    src.connect(this.gain);
    this.gain.connect(this.pan);
    this.pan.connect(def.ui ? a.uiBus : a.world);
    if (def.wet > 0 && !def.ui) {
      this.pan.connect(this.send);
      this.send.connect(a.hallIn);
    }
    src.start(t, ls + a.rand() * (le - ls) * 0.98);
    this.src = src;
  }
  place() {
    if (!this.placed || !this.pan) return 1;
    const a = this.audio,
      s = a.sounds[this.name],
      q = a.where(this, s.def);
    this.pan.pan.setTargetAtTime(q.pan, a.ac.currentTime, 0.05);
    return q.gain;
  }
  follow() {
    if (!this.src || !this.placed) return;
    this.gain.gain.setTargetAtTime(this.level * this.volume * this.place(), this.audio.ac.currentTime, 0.08);
  }
  setPos(pos) {
    this.placed = true;
    this.x = pos.x;
    this.y = pos.y;
    this.z = pos.z;
  }
  setVolume(v, seconds = 0.2) {
    this.volume = v;
    if (this.src) {
      const t = this.audio.ac.currentTime,
        g = this.gain.gain;
      cancelAndHold(g, t);
      g.setTargetAtTime(this.level * v * this.place(), t, Math.max(0.005, seconds / 3));
    }
  }
  setRate(r, seconds = 0.1) {
    this.rate = r;
    if (this.src) this.src.playbackRate.setTargetAtTime(r, this.audio.ac.currentTime, Math.max(0.005, seconds / 3));
  }
  stop(fade = 0.4) {
    if (this.stopped) return;
    this.stopped = true;
    const all = this.audio.loops,
      i = all.indexOf(this);
    if (i >= 0) all.splice(i, 1);
    const src = this.src;
    if (!src) return;
    const t = this.audio.ac.currentTime,
      g = this.gain.gain,
      nodes = [this.gain, this.pan, this.send];
    cancelAndHold(g, t);
    g.setTargetAtTime(0, t, Math.max(0.004, fade / 4));
    src.onended = () => {
      try {
        src.disconnect();
        for (const n of nodes) n.disconnect();
      } catch (e) {}
    };
    try {
      src.stop(t + fade + 0.05);
    } catch (e) {}
    this.src = null;
  }
}

export class GameAudio {
  constructor(ctx, opts = EMPTY) {
    this.ctx = ctx;
    const p = ctx.params,
      has = (k) => !!(p && p.has && p.has(k));
    this.auto = !!(ctx.game && ctx.game.auto);
    this.log = has('audiolog');
    this.noMusic = this.auto && !has('music');
    this.ac = null;
    this.own = false;
    this.forced = !!opts.force;
    this.running = false;
    this.unlocked = false;
    this.paused = false;
    this.disposed = false;
    this.hidden = false;
    this.vol = { music: 0.8, sfx: 0.9, voice: 1 };
    if (ctx.ui && ctx.ui.settings) this.readVolumes(ctx.ui.settings);
    this.muted = new Set(MUTED);
    if (has('mute')) for (const n of String(p.get('mute')).split(',')) if (n) this.muted.add(n);
    this.rand = mulberry32(0x9e3779b9);
    this.L = { x: 0, y: 1.7, z: 0, rx: 1, ry: 0, rz: 0 };
    this.Q = { pan: 0, gain: 1, send: 1 };
    this.nPlayed = 0;
    this.nDropped = 0;
    this.nStolen = 0;
    this.peakVoices = 0;
    this.unknown = new Set();
    this.loops = [];
    this.ch = [];
    this.duckAmt = 0;
    this.duckUntil = 0;

    const A = ctx.assets,
      have = (n) => !!(A && A.has && A.has(n));
    this.sounds = {};
    const jobs = [];
    for (const name in SFX) {
      const f = SFX[name],
        n = f.takes.length;
      const s = (this.sounds[name] = {
        name,
        def: { ...SOUND_DEFAULTS, ...(SOUNDS[name] || EMPTY) },
        n,
        takes: new Array(n).fill(null),
        gains: f.gains || new Array(n).fill(1),
        loop: f.loop || null,
        last: -1,
        lastT: -1e9,
      });
      for (let i = 0; i < n; i++)
        if (have(`sfx.${name}.${i}`))
          jobs.push([
            A.buffer(`sfx.${name}.${i}`),
            (b) => {
              s.takes[i] = b;
            },
            f.rate || RATE,
          ]);
    }
    this.voices = {};
    for (const name in VOICE) {
      const f = VOICE[name];
      this.voices[name] = {
        name,
        text: f.text || '',
        seconds: f.seconds || 0,
        gain: f.gain === undefined ? 1 : f.gain,
        buffer: null,
        decoding: null,
        has: have('voice.' + name),
      };
    }
    this.vSrc = null;
    this.vGain = null;
    this.vResolve = null;
    this.vLeft = 0;
    this.vName = null;
    this.ready = this.decodeAll(jobs);

    this.msec = {};
    const mj = have('music.json') ? A.json('music.json') : null,
      sections = mj ? mj.sections || mj : null;
    if (sections) {
      for (const name in FILES.music.files) {
        const d = sections[name];
        if (!d || typeof d !== 'object' || !have('music.' + name)) continue;
        const cues = d.cues && typeof d.cues === 'object' ? d.cues : {};
        this.msec[name] = {
          name,
          loop: !!d.loop,
          ls: +d.loopStart || 0,
          le: +d.loopEnd || 0,
          end: +cues.end || 0,
          dur: +d.duration || 0,
          cues,
          bars: Array.isArray(d.bars) ? d.bars : null,
          bar: d.bpm > 0 && d.beatsPerBar > 0 ? (60 / d.bpm) * d.beatsPerBar : 0,
          next: d.next !== undefined ? d.next : CHAIN[name] || null,
          gain: typeof d.gain === 'number' ? d.gain : 1,
          buffer: null,
          decoding: null,
          failed: false,
        };
      }
    }
    this.mCur = null;
    this.mNext = null;
    this.mOpts = EMPTY;
    this.gSec = null;
    this.gPos = 0;
    this.keepT = 0;
    this.latency = 0;

    this.dripT = 2.5;
    this.dripAt = { x: 0, y: 0.1, z: 0 };
    this.dripO = { pos: this.dripAt, volume: 1, rate: 1 };
    this.bed = null;

    this.afterStep = null;
    this.ended = (e) => {
      const src = e.target,
        c = src.ch;
      if (c && c.src === src) c.src = null;
      try {
        src.disconnect();
      } catch (err) {}
    };
    this.offs = wireSoundEvents(this, ctx);
    this.gesture = () => this.unlock();
    this.visible = () => this.visibility();
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.gesture, true);
      window.addEventListener('keydown', this.gesture, true);
      document.addEventListener('visibilitychange', this.visible);
    }
    this.impulse = naveImpulse(RATE);
    if (opts.context) {
      this.attach(opts.context, false);
      this.unlocked = true;
      this.stateChanged();
    } else if (this.auto) this.unlock();
    this.bed = this.loop('bed_nave', { fade: 3 });
    this.furnace = FURNACE
      ? this.loop('furnace', { fade: 3, pos: { x: 0, y: (FURNACE.base || 0) + 2.5, z: FURNACE.front - 1.5 } })
      : null;
    this.furnaceK = 1;
    this.keepNeededBuffers();
  }

  async decodeAll(jobs) {
    for (const [bytes, put, rate] of jobs) {
      if (this.disposed) return;
      try {
        put(await decodeShared(bytes, rate));
      } catch (e) {
        console.warn('sound: a file would not decode', e && e.message);
      }
    }
    if (this.running) for (let i = 0; i < this.loops.length; i++) this.loops[i].start();
  }

  unlock() {
    if (this.disposed) return;
    if (!this.ac) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      let ac;
      try {
        ac = new AC({ sampleRate: RATE, latencyHint: 'interactive' });
      } catch (e) {
        try {
          ac = new AC();
        } catch (e2) {
          return;
        }
      }
      this.attach(ac, true);
    }
    this.unlocked = true;
    if (this.ac.state !== 'running' && this.ac.state !== 'closed' && !this.hidden && this.ac.resume) {
      const r = this.ac.resume();
      if (r && r.catch) r.catch(() => {});
    }
    this.stateChanged();
  }

  attach(ac, own) {
    this.ac = ac;
    this.own = own;
    const g = (v = 1) => {
      const n = ac.createGain();
      n.gain.value = v;
      return n;
    };
    this.master = g();
    this.limiter = ac.createDynamicsCompressor();
    for (const k in LIMITER) this.limiter[k].value = LIMITER[k];
    this.trim = g(LIMITER_TRIM);
    this.pre = g(0.5);
    this.ceiling = ac.createWaveShaper();
    this.ceiling.curve = ceilingCurve();
    this.ceiling.oversample = '2x';
    this.master.connect(this.limiter);
    this.limiter.connect(this.trim);
    this.trim.connect(this.pre);
    this.pre.connect(this.ceiling);
    this.ceiling.connect(ac.destination);
    this.sfxVol = g(square(this.vol.sfx));
    this.musicVol = g(square(this.vol.music));
    this.voiceVol = g(square(this.vol.voice));
    this.sfxVol.connect(this.master);
    this.musicVol.connect(this.master);
    this.voiceVol.connect(this.master);
    this.world = g(this.paused ? 0 : 1);
    this.world.connect(this.sfxVol);
    this.uiBus = g();
    this.uiBus.connect(this.sfxVol);
    if (!this.impulse || this.impulse.rate !== ac.sampleRate) this.impulse = naveImpulse(ac.sampleRate);
    const ir = ac.createBuffer(2, this.impulse.left.length, ac.sampleRate);
    ir.getChannelData(0).set(this.impulse.left);
    ir.getChannelData(1).set(this.impulse.right);
    this.hallIn = g();
    this.hallHp = ac.createBiquadFilter();
    this.hallHp.type = 'highpass';
    this.hallHp.frequency.value = 110;
    this.hallHp.Q.value = 0.6;
    this.hall = ac.createConvolver();
    this.hall.normalize = false;
    this.hall.buffer = ir;
    this.hallOut = g(HALL_LEVEL);
    this.hallIn.connect(this.hallHp);
    this.hallHp.connect(this.hall);
    this.hall.connect(this.hallOut);
    this.hallOut.connect(this.world);
    this.musicIn = g();
    this.musicDuck = g();
    this.musicPause = g(this.paused ? 0.4 : 1);
    this.musicTone = ac.createBiquadFilter();
    this.musicTone.type = 'lowpass';
    this.musicTone.frequency.value = this.paused ? 900 : 20000;
    this.musicTone.Q.value = 0.5;
    this.musicIn.connect(this.musicDuck);
    this.musicDuck.connect(this.musicTone);
    this.musicTone.connect(this.musicPause);
    this.musicPause.connect(this.musicVol);
    this.ch.length = 0;
    for (let i = 0; i < WORLD_VOICES + UI_VOICES; i++) {
      const ui = i >= WORLD_VOICES,
        gain = g(0),
        pan = ac.createStereoPanner(),
        send = g(0);
      gain.connect(pan);
      pan.connect(ui ? this.uiBus : this.world);
      if (!ui) {
        pan.connect(send);
        send.connect(this.hallIn);
      }
      this.ch.push({ gain, pan, send, src: null, level: 0, t0: 0, dur: 1, ui, name: '' });
    }
    ac.onstatechange = () => this.stateChanged();
  }

  stateChanged() {
    if (!this.ac || this.disposed) return;
    const run = this.forced || this.ac.state === 'running';
    if (run && !this.running) {
      this.running = true;
      this.latency = clamp(this.ac.outputLatency || this.ac.baseLatency || 0, 0, 0.3);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', this.gesture, true);
        window.removeEventListener('keydown', this.gesture, true);
      }
      for (let i = 0; i < this.loops.length; i++) this.loops[i].start();
      if (this.gSec && !(this.mCur && !this.mCur.done) && !this.mNext) this.transitionMusic(this.gSec, this.mOpts);
      if (this.log)
        console.info(`[audio] running at ${this.ac.sampleRate} Hz, latency ${Math.round(this.latency * 1000)} ms`);
    } else if (!run) this.running = false;
  }

  visibility() {
    this.hidden = document.visibilityState === 'hidden';
    if (!this.ac || !this.own || !this.unlocked) return;
    const r = this.hidden ? this.ac.suspend() : this.ac.resume();
    if (r && r.catch) r.catch(() => {});
  }

  where(pos, def) {
    const L = this.L,
      Q = this.Q,
      dx = pos.x - L.x,
      dy = pos.y - L.y,
      dz = pos.z - L.z,
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const g = d <= def.ref ? 1 : def.ref / d;
    Q.gain = g;
    Q.pan = clamp(((dx * L.rx + dy * L.ry + dz * L.rz) / (d > NEAR ? d : NEAR)) * WIDTH, -WIDTH, WIDTH);
    Q.send = 1 / Math.sqrt(g);
    return Q;
  }

  play(name, o = EMPTY) {
    const s = this.sounds[name];
    if (!s) {
      if (!this.unknown.has(name)) {
        this.unknown.add(name);
        if (this.ctx.dev && SOUNDS[name] === undefined) console.warn(`sound: nothing is called "${name}"`);
      }
      return false;
    }
    if (!this.running || this.muted.has(name)) return false;
    const def = s.def,
      ac = this.ac,
      now = ac.currentTime;
    if (now - s.lastT < def.gap) return false;
    let k = 0;
    if (o.take !== undefined) k = ((o.take % s.n) + s.n) % s.n;
    else if (s.n > 1) {
      if (s.last < 0) k = (this.rand() * s.n) | 0;
      else {
        k = (this.rand() * (s.n - 1)) | 0;
        if (k >= s.last) k++;
      }
    }
    const buf = s.takes[k];
    if (!buf) return false;
    let vol = def.trim * s.gains[k] * (o.volume === undefined ? 1 : o.volume) * (0.92 + 0.16 * this.rand());
    let pan = 0,
      send = def.wet;
    if (o.pos && !def.ui) {
      const q = this.where(o.pos, def);
      vol *= q.gain;
      pan = q.pan;
      send *= q.send;
    }
    const c = this.channel(def.ui, vol * def.pri, now);
    if (!c) {
      this.nDropped++;
      return false;
    }
    let when = now;
    const gp = c.gain.gain;
    gp.cancelScheduledValues(now);
    if (c.src) {
      gp.setTargetAtTime(0, now, 0.004);
      when = now + 0.016;
      const old = c.src;
      old.onended = null;
      try {
        old.stop(when);
      } catch (e) {}
      this.nStolen++;
    }
    gp.setValueAtTime(vol, when);
    c.pan.pan.cancelScheduledValues(now);
    c.pan.pan.setValueAtTime(pan, when);
    if (!c.ui) {
      c.send.gain.cancelScheduledValues(now);
      c.send.gain.setValueAtTime(send, when);
    }
    const src = ac.createBufferSource(),
      rate =
        (o.rate === undefined ? 1 : o.rate) *
        (1 + (this.rand() * 2 - 1) * (o.jitter === undefined ? def.jitter : o.jitter));
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.ch = c;
    src.onended = this.ended;
    src.connect(c.gain);
    src.start(when);
    c.src = src;
    c.level = vol * def.pri;
    c.t0 = when;
    c.dur = buf.duration / rate;
    c.name = name;
    s.last = k;
    s.lastT = now;
    this.nPlayed++;
    if (def.duck) this.duck(def.duck[0], def.duck[1]);
    if (this.log)
      console.info(`[audio] ${name}#${k} vol ${vol.toFixed(2)} pan ${pan.toFixed(2)} hall ${send.toFixed(2)}`);
    return true;
  }

  channel(ui, level, now) {
    const a = ui ? WORLD_VOICES : 0,
      b = ui ? this.ch.length : WORLD_VOICES;
    let free = null,
      least = null,
      low = Infinity,
      busy = 0;
    for (let i = a; i < b; i++) {
      const c = this.ch[i];
      if (!c.src) {
        if (!free) free = c;
        continue;
      }
      busy++;
      const left = 1 - (now - c.t0) / c.dur,
        score = c.level * (left < 0.1 ? 0.01 : left * left);
      if (score < low) {
        low = score;
        least = c;
      }
    }
    if (!ui && busy + 1 > this.peakVoices) this.peakVoices = Math.min(WORLD_VOICES, busy + 1);
    return free || (low < level ? least : null);
  }

  loop(name, o = EMPTY) {
    const l = new Loop(this, name, o);
    this.loops.push(l);
    if (this.running) l.start();
    return l;
  }

  voice(name) {
    this.hush(0.1);
    const v = this.voices[name];
    if (!v) {
      if (this.ctx.dev && !this.unknown.has(name)) {
        this.unknown.add(name);
        console.warn(`sound: no spoken line called "${name}"`);
      }
      return Promise.resolve(false);
    }
    this.vName = name;
    this.vLeft = v.seconds;
    if (v.buffer) this.speak(v, 0);
    else this.lineBuffer(name);
    return new Promise((resolve) => {
      this.vResolve = resolve;
    });
  }
  speak(v, late) {
    if (!this.running || this.muted.has('voice') || late > v.seconds - 0.3) return;
    const ac = this.ac,
      t = ac.currentTime,
      src = ac.createBufferSource(),
      gain = ac.createGain();
    src.buffer = v.buffer;
    src.connect(gain);
    gain.connect(this.voiceVol);
    if (late > 0.02) {
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(v.gain, t + 0.06);
    } else gain.gain.value = v.gain;
    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
      } catch (e) {}
      if (this.vSrc === src) {
        this.vSrc = null;
        this.vGain = null;
      }
    };
    src.start(t + 0.01, Math.max(0, late));
    this.vSrc = src;
    this.vGain = gain;
    this.duck(VOICE_DUCK, v.seconds - late + 0.25);
    if (this.log)
      console.info(`[audio] voice ${v.name} ${v.seconds}s${late > 0.02 ? ' (from ' + late.toFixed(2) + ' s)' : ''}`);
  }
  lineBuffer(name) {
    const v = this.voices[name];
    if (!v || !v.has) return null;
    if (v.buffer) return v.buffer;
    if (!v.decoding) {
      v.decoding = decodeFresh(this.ctx.assets.buffer('voice.' + name)).then(
        (buf) => {
          v.decoding = null;
          if (this.disposed) return;
          v.buffer = buf;
          if (this.vName === name && this.vResolve && !this.vSrc) this.speak(v, v.seconds - this.vLeft);
        },
        (e) => {
          v.decoding = null;
          v.has = false;
          console.warn(`sound: line "${name}" would not decode`, e && e.message);
        },
      );
    }
    return null;
  }
  voiceInfo(name) {
    const v = this.voices[name];
    return v ? { text: v.text, seconds: v.seconds } : null;
  }
  hush(fade = 0.15) {
    const src = this.vSrc,
      r = this.vResolve;
    if (src && this.ac) {
      const t = this.ac.currentTime,
        g = this.vGain.gain;
      cancelAndHold(g, t);
      g.setTargetAtTime(0, t, Math.max(0.004, fade / 4));
      try {
        src.stop(t + fade + 0.03);
      } catch (e) {}
      this.vSrc = null;
      this.vGain = null;
      cancelAndHold(this.musicDuck.gain, t);
      this.musicDuck.gain.setTargetAtTime(1, t, 0.3);
      this.duckUntil = 0;
    }
    this.vResolve = null;
    this.vLeft = 0;
    this.vName = null;
    if (r) r(false);
  }

  music(section = null, o = EMPTY) {
    const m = section ? this.msec[section] : null,
      prev = this.gSec ? this.msec[this.gSec] : null;
    if (section !== this.gSec || !m || !m.loop || o.restart) {
      let pos = o.at || 0;
      if (
        prev &&
        !prev.loop &&
        prev.next === section &&
        prev.end > 0 &&
        Math.abs(prev.end - this.gPos) <= JOIN &&
        !o.at
      )
        pos = this.gPos - prev.end;
      this.gSec = section;
      this.gPos = pos;
    }
    this.mOpts = o;
    if (this.log) console.info(`[audio] music ${section}${m ? '' : section ? ' (no such file yet)' : ''}`);
    this.keepNeededBuffers();
    if (this.running) this.transitionMusic(section, o);
  }

  musicTime() {
    if (this.auto || (this.ac && !this.own)) {
      const m = this.gSec ? this.msec[this.gSec] : null;
      return m && this.gPos > 0 && (m.loop || !m.dur || this.gPos < m.dur) ? this.gPos : 0;
    }
    if (!this.running) return 0;
    const now = this.ac.currentTime;
    this.promoteQueuedSection(now);
    const p = this.mCur;
    if (!p || p.done) return 0;
    let t = p.p0 + (now - p.a0) - this.latency;
    if (t <= 0) return 0;
    const m = p.m;
    if (m.loop) {
      if (t >= m.le && m.le > m.ls) t = m.ls + ((t - m.ls) % (m.le - m.ls));
    } else if (t >= m.dur) return 0;
    return t;
  }
  get musicSection() {
    if (this.auto || !this.running) return this.gSec && this.msec[this.gSec] ? this.gSec : null;
    this.promoteQueuedSection(this.ac.currentTime);
    return this.mCur && !this.mCur.done ? this.mCur.name : null;
  }
  cue(section, name) {
    const m = this.msec[section];
    return m ? m.cues[name] : undefined;
  }
  musicInfo(section) {
    const m = this.msec[section];
    return m ? { loop: m.loop, loopStart: m.ls, loopEnd: m.le, end: m.end, bars: m.bars, cues: m.cues } : null;
  }

  musicBuffer(name) {
    const m = this.msec[name];
    if (!m || m.failed) return null;
    if (m.buffer) return m.buffer;
    if (!m.decoding) {
      m.decoding = decodeFresh(this.ctx.assets.buffer('music.' + name), MUSIC_RATE).then(
        (buf) => {
          m.decoding = null;
          m.buffer = buf;
          m.dur = buf.duration;
          if (!(m.le > 0) || m.le > buf.duration) m.le = buf.duration;
          if (!(m.end > 0) || m.end > buf.duration) m.end = buf.duration;
          if (!this.disposed) this.musicReady(name);
        },
        (e) => {
          m.decoding = null;
          m.failed = true;
          console.warn(`sound: music "${name}" would not decode`, e && e.message);
        },
      );
    }
    return null;
  }
  musicReady(name) {
    if (!this.running) return;
    const cur = this.mCur;
    if (this.gSec === name && !(cur && cur.name === name && !cur.done) && !(this.mNext && this.mNext.name === name))
      this.transitionMusic(name, this.mOpts);
    else if (cur && !cur.done && cur.m.next === name && !this.mNext) this.follow();
  }

  keepNeededBuffers() {
    const c = this.ctx,
      game = c.game,
      state = (game && game.state) || 'boot',
      boss = c.boss,
      want = this.keepSet || (this.keepSet = new Set());
    want.clear();
    const list = KEEP[state] || KEEP.fight;
    for (let i = 0; i < list.length; i++) want.add(list[i]);
    const two = !!(boss && boss.phase === 2),
      hp = boss && boss.hpMax > 0 ? boss.hp / boss.hpMax : 1;
    if (state === 'fight') {
      want.add(two ? 'phase2' : 'phase1');
      if (!two && hp < 0.64) want.add('turn');
      if (two && hp < 0.14) want.add('ending');
    } else if (state === 'intro' && !this.msec.intro) want.add('phase1');
    if (this.gSec) {
      want.add(this.gSec);
      const m = this.msec[this.gSec];
      if (m && !m.loop && m.next && (!(m.end > 0) || m.end - this.gPos < LEAD + 1)) want.add(m.next);
    }
    if (this.mCur && !this.mCur.done) want.add(this.mCur.name);
    if (this.mNext) want.add(this.mNext.name);
    for (const name in this.msec) {
      const m = this.msec[name];
      if (want.has(name)) {
        if (!this.noMusic) this.musicBuffer(name);
      } else if (m.buffer && !m.decoding) {
        m.buffer = null;
        if (this.log) console.info(`[audio] music ${name} let go`);
      }
    }
    const line =
      state === 'fight'
        ? two
          ? hp < 0.14
            ? 'boss_end'
            : null
          : hp < 0.64
            ? 'boss_phase'
            : null
        : KEEP_LINE[state] || null;
    const g = this.ctx.game,
      rescue =
        g && (state === 'fight' || state === 'rescue') ? RESCUE_LINES[(g.rescues || 0) % RESCUE_LINES.length] : null;
    for (const name in this.voices) {
      const v = this.voices[name];
      if (name === line || name === rescue || name === this.vName) this.lineBuffer(name);
      else if (v.buffer && !v.decoding && this.vSrc === null) v.buffer = null;
    }
  }

  promoteQueuedSection(now) {
    const n = this.mNext;
    if (n && now >= n.a0) {
      this.mNext = null;
      this.mCur = n;
      this.follow();
    }
  }
  dropQueuedSection() {
    const p = this.mNext;
    if (!p) return;
    this.mNext = null;
    p.done = true;
    p.src.onended = null;
    try {
      p.src.stop();
    } catch (e) {}
    try {
      p.src.disconnect();
      p.gain.disconnect();
    } catch (e) {}
  }
  follow() {
    const cur = this.mCur;
    if (!cur || cur.done || cur.m.loop || this.mNext) return;
    const next = cur.m.next && this.msec[cur.m.next];
    if (!next) return;
    if (this.gSec !== cur.name && this.gSec !== next.name) return;
    const now = this.ac.currentTime,
      left = cur.endAc - now;
    if (left <= 0.005 || left > LEAD) return;
    if (!this.musicBuffer(next.name)) return;
    this.mNext = this.player(next, cur.endAc, 0, 0);
    if (this.log) console.info(`[audio] music ${next.name} set to follow ${cur.name} in ${left.toFixed(2)} s`);
  }

  player(m, when, offset, fadeIn) {
    const ac = this.ac,
      src = ac.createBufferSource(),
      gain = ac.createGain();
    src.buffer = m.buffer;
    if (m.loop) {
      src.loop = true;
      src.loopStart = m.ls;
      src.loopEnd = m.le;
    }
    offset = clamp(offset, 0, Math.max(0, (m.loop ? m.le : m.dur) - 0.02));
    if (fadeIn > 0.02) {
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(m.gain, when + fadeIn);
    } else gain.gain.value = m.gain;
    src.connect(gain);
    gain.connect(this.musicIn);
    src.start(when, offset);
    const p = {
      m,
      name: m.name,
      src,
      gain,
      a0: when,
      p0: offset,
      endAc: m.loop ? Infinity : when + (m.end - offset),
      done: false,
    };
    src.onended = () => {
      p.done = true;
      try {
        src.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
    return p;
  }
  fadeOut(p, seconds, from) {
    const g = p.gain.gain;
    cancelAndHold(g, from);
    g.setTargetAtTime(0, from, Math.max(0.005, seconds / 4.6));
    try {
      p.src.stop(from + seconds + 0.05);
    } catch (e) {}
  }
  nextBar(p, now) {
    const m = p.m;
    let t = p.p0 + (now - p.a0);
    if (m.le > m.ls && t >= m.le) t = m.ls + ((t - m.ls) % (m.le - m.ls));
    let wait = 0;
    if (m.bars && m.bars.length) {
      let next = m.le;
      for (let i = 0; i < m.bars.length; i++)
        if (m.bars[i] > t + 0.03 && m.bars[i] <= m.le) {
          next = m.bars[i];
          break;
        }
      wait = next - t;
    } else if (m.bar > 0) {
      wait = m.bar - ((t - m.ls) % m.bar);
      if (wait < 0.03) wait += m.bar;
    }
    return now + clamp(wait, 0, 6);
  }

  transitionMusic(name, o) {
    const ac = this.ac,
      now = ac.currentTime;
    this.promoteQueuedSection(now);
    const cur = this.mCur && !this.mCur.done ? this.mCur : null,
      m = name ? this.msec[name] : null;
    if (!m) {
      this.dropQueuedSection();
      if (cur) this.fadeOut(cur, o.fade !== undefined ? o.fade : name ? 1.5 : 2.5, now);
      this.mCur = null;
      return;
    }
    if (cur && cur.name === name && !o.restart && (m.loop || now - cur.a0 < 0.3)) {
      if (this.mNext && this.mNext.name !== cur.m.next) this.dropQueuedSection();
      return;
    }
    if (this.mNext) {
      if (this.mNext.name === name && this.mNext.a0 - now <= JOIN) return;
      this.dropQueuedSection();
    }
    if (this.noMusic || !this.musicBuffer(name)) return;
    let when = now,
      fadeIn = 0,
      fadeOut = 0,
      offset = o.at || 0;
    if (!m.loop && !o.at) {
      const cine = this.ctx.cine;
      offset =
        cine && cine.playing && cine.name === CINE_OF[name]
          ? cine.time
          : this.gSec === name
            ? Math.max(0, this.gPos)
            : 0;
      if (offset < 0.05) offset = 0;
    }
    if (cur) {
      if (!cur.m.loop) {
        const left = cur.endAc - now;
        if (left > JOIN) {
          fadeOut = o.fade !== undefined ? o.fade : 0.6;
          fadeIn = START;
        } else if (left > 0) when = cur.endAc;
      } else if (m.loop) {
        when = this.nextBar(cur, now);
        fadeOut = o.fade !== undefined ? o.fade : 2;
        fadeIn = START;
      } else fadeOut = Math.min(o.fade !== undefined ? o.fade : 0.8, 1.5);
    } else if (m.loop) fadeIn = o.fade !== undefined ? o.fade : name === 'title' ? 2.5 : START;
    if (!m.loop && offset >= m.dur - 0.05) {
      if (cur) this.fadeOut(cur, 1, now);
      this.mCur = null;
      return;
    }
    const p = this.player(m, when, offset, fadeIn);
    if (cur && fadeOut > 0) this.fadeOut(cur, fadeOut, when);
    if (when > now + 0.002) this.mNext = p;
    else {
      this.mCur = p;
      this.follow();
    }
    if (this.log)
      console.info(
        `[audio] music ${name} starts ${when > now ? 'in ' + (when - now).toFixed(2) + ' s' : 'now'} at ${offset.toFixed(2)} s${cur ? ' after ' + cur.name : ''}`,
      );
  }

  setListener(camera) {
    if (!camera || !camera.matrixWorld) return;
    const e = camera.matrixWorld.elements,
      L = this.L;
    L.x = e[12];
    L.y = e[13];
    L.z = e[14];
    L.rx = e[0];
    L.ry = e[1];
    L.rz = e[2];
  }
  readVolumes(v) {
    for (const k of ['music', 'sfx', 'voice'])
      if (typeof v[k] === 'number' && v[k] >= 0) this.vol[k] = Math.min(1, v[k]);
  }
  setVolumes(v) {
    if (!v) return;
    this.readVolumes(v);
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.sfxVol.gain.setTargetAtTime(square(this.vol.sfx), t, 0.03);
    this.musicVol.gain.setTargetAtTime(square(this.vol.music), t, 0.03);
    this.voiceVol.gain.setTargetAtTime(square(this.vol.voice), t, 0.03);
  }
  duck(amount, seconds) {
    if (!this.ac) return;
    const t = this.ac.currentTime,
      g = this.musicDuck.gain;
    amount = clamp(amount, 0, 1);
    if (t < this.duckUntil && amount <= this.duckAmt) {
      if (t + seconds <= this.duckUntil) return;
      amount = this.duckAmt;
    }
    this.duckAmt = amount;
    this.duckUntil = t + seconds;
    cancelAndHold(g, t);
    g.setTargetAtTime(1 - amount, t, 0.05);
    g.setTargetAtTime(1, t + seconds, 0.3);
  }
  pause(on) {
    this.paused = !!on;
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.world.gain.setTargetAtTime(on ? 0 : 1, t, on ? 0.03 : 0.1);
    this.musicPause.gain.setTargetAtTime(on ? 0.4 : 1, t, 0.12);
    this.musicTone.frequency.setTargetAtTime(on ? 900 : 20000, t, on ? 0.08 : 0.2);
  }

  update(dt) {
    if (this.vResolve) {
      this.vLeft -= dt;
      if (this.vLeft <= 0) {
        const r = this.vResolve;
        this.vResolve = null;
        this.vName = null;
        r(true);
      }
    }
    if (this.gSec) {
      this.gPos += dt;
      const m = this.msec[this.gSec];
      if (m) {
        if (m.loop) {
          if (m.le > m.ls && this.gPos >= m.le) this.gPos -= m.le - m.ls;
        } else if (m.end > 0 && this.gPos >= m.end && m.next && this.msec[m.next]) {
          this.gPos -= m.end;
          this.gSec = m.next;
        }
      }
    }
    if (this.afterStep) this.afterStep();
    this.keepT -= dt;
    if (this.keepT <= 0) {
      this.keepT = 2;
      this.keepNeededBuffers();
    }
    if (!this.running) return;
    this.promoteQueuedSection(this.ac.currentTime);
    if (this.mCur && !this.mCur.done && !this.mCur.m.loop && !this.mNext && this.mCur.m.next) this.follow();
    for (let i = 0; i < this.loops.length; i++) this.loops[i].follow();
    if (this.furnace) {
      // the furnace roars louder once it has broken open (phase two)
      const k = this.ctx.boss && this.ctx.boss.phase === 2 ? 1.6 : 1;
      if (k !== this.furnaceK) {
        this.furnaceK = k;
        this.furnace.setVolume(k, k > 1 ? 4 : 1);
      }
    }
    this.dripT -= dt;
    if (this.dripT <= 0) {
      const r = this.rand,
        L = this.L,
        a = r() * Math.PI * 2,
        d = 4 + r() * 14;
      this.dripT = 1.2 + r() * r() * 7;
      this.dripAt.x = clamp(L.x + Math.sin(a) * d, -12, 12);
      this.dripAt.z = clamp(L.z + Math.cos(a) * d, -20, 20);
      this.dripO.volume = 0.5 + r() * 0.5;
      this.play('drip', this.dripO);
    }
  }

  stats() {
    let voices = 0,
      mb = 0,
      music = 0;
    for (let i = 0; i < this.ch.length; i++) if (this.ch[i].src) voices++;
    for (const n in this.sounds) for (const b of this.sounds[n].takes) mb += megabytes(b);
    for (const n in this.voices) mb += megabytes(this.voices[n].buffer);
    for (const n in this.msec) music += megabytes(this.msec[n].buffer);
    return {
      state: this.ac ? this.ac.state : 'none',
      voices,
      peakVoices: this.peakVoices,
      played: this.nPlayed,
      dropped: this.nDropped,
      stolen: this.nStolen,
      effectsMB: +mb.toFixed(1),
      musicMB: +music.toFixed(1),
      music: this.musicSection,
      musicTime: +this.musicTime().toFixed(2),
      loops: this.loops.length,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.hush(0);
    this.disposed = true;
    this.running = false;
    for (const off of this.offs) off();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.gesture, true);
      window.removeEventListener('keydown', this.gesture, true);
      document.removeEventListener('visibilitychange', this.visible);
    }
    if (!this.ac) return;
    this.ac.onstatechange = null;
    for (const l of this.loops.slice()) l.stop(0);
    this.dropQueuedSection();
    if (this.mCur) {
      try {
        this.mCur.src.stop();
      } catch (e) {}
      this.mCur = null;
    }
    for (const c of this.ch)
      if (c.src) {
        c.src.onended = null;
        try {
          c.src.stop();
        } catch (e) {}
        c.src = null;
      }
    try {
      this.master.disconnect();
      this.ceiling.disconnect();
    } catch (e) {}
    if (this.own && this.ac.close) {
      const r = this.ac.close();
      if (r && r.catch) r.catch(() => {});
    }
    for (const n in this.msec) this.msec[n].buffer = null;
  }
}
