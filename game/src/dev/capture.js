import * as THREE from 'three';
import { startPoint } from './index.js';
import { checkpoint } from './pilot.js';
import { ACTIONS, commandFrames, commandInput } from './input-script.js';

function commandsToFrames(cmds) {
  const out = [];
  for (const cmd of cmds) {
    if (!cmd || cmd.quit) continue;
    const frames = commandFrames(cmd);
    for (let i = 0; i < frames; i++) {
      out.push({ ...commandInput(cmd, i, frames), last: i === frames - 1 });
    }
  }
  return out;
}

export async function runCapture(game, params) {
  const mode = params.get('capture'),
    name = params.get('capname') || 'capture',
    ctx = game.ctx,
    loop = game.loop,
    input = ctx.input;
  const tail = (+params.get('tail') || 0) * 60;
  const post = (n, body) => fetch('/__shot/' + n, { method: 'POST', body });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const drawMode = params.get('draw') || 'pilot';
  let recs = null,
    checks = null;
  if (params.has('cmds')) {
    recs = commandsToFrames(await (await fetch(params.get('cmds'))).json());
    if (params.has('checks'))
      checks = new Map(((await (await fetch(params.get('checks'))).json()).checks || []).map((c) => [c[0], c]));
    input.enabled = false;
  }
  let i = 0,
    after = 0,
    ri = 0,
    over = false,
    diff = null,
    lastStep = Math.round(game.time * 60);
  let moved = 0;
  const _d = new THREE.Vector3();
  const events = [],
    plays = [];
  const brief = {
    swing: (e) => [e.who === 'boss' ? 'boss' : 'you', e.heavy ? 'heavy' : 'light'],
    whoosh: (e) => ['you', e.heavy ? 'heavy' : 'light'],
    hit: (e) => [
      e.target === ctx.boss ? 'boss' : 'you',
      e.heavy ? 'heavy' : 'light',
      e.blocked ? 'blocked' : '',
      e.fatal ? 'fatal' : '',
      e.kind || '',
      Math.round(e.damage || 0),
    ],
    clash: (e) => [e.who || '', e.stone ? 'stone' : '', e.floor ? 'floor' : '', e.weight || (e.heavy ? 'heavy' : '')],
    step: (e) => [e.who === 'boss' ? 'boss' : 'you', e.run ? 'run' : 'walk'],
    land: (e) => [e.who === 'boss' ? 'boss' : 'you', e.hard ? 'hard' : ''],
    'boss-slam': (e) => [e.power === undefined ? 1 : +(+e.power).toFixed(2)],
    'boss-move': (e) => [e.name, e.stage, e.n || 0],
  };
  for (const ev of [
    'whoosh',
    'swing',
    'hit',
    'clash',
    'step',
    'land',
    'roll',
    'boss-slam',
    'boss-move',
    'boss-stagger',
    'boss-died',
    'heal',
    'stamina-out',
    'player-died',
  ])
    ctx.bus.on(ev, (e) => {
      events.push([i, +game.time.toFixed(3), game.state, ev, ...(brief[ev] && e ? brief[ev](e) : [])]);
    });
  if (ctx.audio && typeof ctx.audio.play === 'function') {
    const au = ctx.audio,
      play = au.play.bind(au);
    au.play = (n, o) => {
      const ok = play(n, o);
      if (ok)
        plays.push([
          i,
          n,
          au.sounds && au.sounds[n] ? au.sounds[n].last : -1,
          +(o && o.volume !== undefined ? o.volume : 1).toFixed(2),
          +(o && o.rate !== undefined ? o.rate : 1).toFixed(2),
        ]);
      return ok;
    };
  }
  const told = () => JSON.stringify({ events, plays });
  const status = () => ({
    i,
    t: +game.time.toFixed(3),
    state: game.state,
    php: Math.round(ctx.player.hp),
    bhp: Math.round(ctx.boss.hp),
    done: (recs ? over : !!game.replayDone) && after >= tail,
    diff: recs ? (diff ? diff.step : null) : game.replayDiff ? game.replayDiff.step : null,
    moved,
  });

  const cam = ctx.cam,
    JOLT = ['jolt', 'joltT', 'joltClock', 'joltX', 'joltZ', 'joltAmp'];
  const film = { on: false };
  const modelOf = (who) => (who && who.char && who.char.model) || null;
  let hitSeen = false;
  if (recs)
    ctx.bus.on('hit', () => {
      hitSeen = true;
    });
  const ghost = (alpha) => {
    const keepSlow = game.slowT,
      keepScale = loop.scale,
      keep = {},
      m0 = modelOf(cam.jolt),
      mx0 = m0 ? m0.position.x : 0,
      mz0 = m0 ? m0.position.z : 0;
    for (const k of JOLT) keep[k] = cam[k];
    if (hitSeen || !film.on) {
      for (const k of JOLT) film[k] = cam[k];
      film.on = true;
      hitSeen = false;
    }
    for (const k of JOLT) cam[k] = film[k];
    const m1 = modelOf(cam.jolt),
      mx1 = m1 ? m1.position.x : 0,
      mz1 = m1 ? m1.position.z : 0;
    game.drawFrames = true;
    game.frame(1 / 60, alpha);
    game.drawFrames = false;
    for (const k of JOLT) film[k] = cam[k];
    if (m1) {
      m1.position.x = mx1;
      m1.position.z = mz1;
    }
    for (const k of JOLT) cam[k] = keep[k];
    if (m0) {
      m0.position.x = mx0;
      m0.position.z = mz0;
    }
    game.slowT = keepSlow;
    loop.scale = keepScale;
  };

  const tr = params.get('trace') ? params.get('trace').split(':').map(Number) : null,
    trSigs = [],
    trSeen = new Map(),
    trPosts = [];
  let trRows = [],
    trFile = 0;
  const trFlush = () => {
    if (trRows.length) {
      trPosts.push(post(`${name}_trace_${trFile++}.json`, JSON.stringify({ sigs: trSigs, rows: trRows })));
      trRows = [];
    }
  };
  const snap = (s) => {
    const names = [],
      vals = [];
    const put = (n, v) => {
      names.push(n);
      vals.push(v);
    };
    const hash = (str) => {
      let h = 0;
      for (let k = 0; k < str.length; k++) h = (h * 31 + str.charCodeAt(k)) | 0;
      return h;
    };
    const sum = (a) => {
      let t = 0;
      for (let k = 0; k < a.length; k++) t += a[k] * (1 + (k % 97) * 0.013);
      return t;
    };
    const walk = (pre, o, depth) => {
      if (!o) return;
      for (const k of Object.keys(o).sort()) {
        if (k === 'ctx' || k === 'data' || k === 'game' || k === 'listeners') continue;
        const v = o[k],
          n = pre + k,
          ty = typeof v;
        if (ty === 'number') put(n, v);
        else if (ty === 'boolean') put(n, v ? 1 : 0);
        else if (ty === 'string') put(n, hash(v));
        else if (v === null || v === undefined) put(n + '?', 0);
        else if (ty !== 'object') continue;
        else if (v.isVector3 || v.isVector2 || v.isVector4 || v.isQuaternion || v.isEuler) {
          put(n + '.x', v.x);
          put(n + '.y', v.y);
          if (v.z !== undefined) put(n + '.z', v.z);
          if (v.w !== undefined) put(n + '.w', v.w);
        } else if (ArrayBuffer.isView(v)) {
          if (v.length <= 8192) put(n + '[]', sum(v));
        } else if (Array.isArray(v)) {
          if (v.length <= 64 && v.every((x) => typeof x === 'number')) put(n + '[]', sum(v));
          else if (depth > 0 && v.length <= 24)
            v.forEach((x, j) => {
              if (x && typeof x === 'object' && !Array.isArray(x)) walk(`${n}[${j}].`, x, depth - 1);
            });
        } else if (
          depth > 0 &&
          (v.constructor === Object || k === 'graph' || k === 'mover' || k === 'action' || k === 'rig')
        )
          walk(n + '.', v, depth - 1);
      }
    };
    const body = (pre, who) => {
      if (!who) return;
      walk(pre + '.', who, 2);
      const c = who.char;
      if (!c) return;
      walk(pre + '.char.', c, 3);
      put(pre + '.model.x', c.model.position.x);
      put(pre + '.model.y', c.model.position.y);
      put(pre + '.model.z', c.model.position.z);
      let q = 0,
        p = 0,
        j = 0;
      for (const b in c.bones) {
        const o = c.bones[b],
          w = 1 + (j++ % 97) * 0.013;
        q += (o.quaternion.x + 2 * o.quaternion.y + 3 * o.quaternion.z + 5 * o.quaternion.w) * w;
        p += (o.position.x + 2 * o.position.y + 3 * o.position.z) * w;
      }
      put(pre + '.bones.turn', q);
      put(pre + '.bones.place', p);
    };
    body('you', ctx.player);
    body('her', ctx.boss);
    walk('cam.', ctx.cam, 1);
    walk('combat.', ctx.combat, 1);
    walk('loop.', loop, 0);
    put('game.time', game.time);
    put('game.state', hash(game.state));
    put('game.slowT', game.slowT || 0);
    const sig = names.join('|');
    let k = trSeen.get(sig);
    if (k === undefined) {
      k = trSigs.length;
      trSigs.push(names);
      trSeen.set(sig, k);
    }
    trRows.push([s, k, ...vals]);
    if (trRows.length >= 500) trFlush();
  };

  const frame = () => {
    if (!recs) {
      loop.advance(1 / 60);
      i++;
      if (game.replayDone) after++;
      return;
    }
    const r = recs[ri];
    if (r) {
      for (let k = 0; k < ACTIONS.length; k++) input.set(ACTIONS[k], r.on[k]);
      input.setMove(r.mx, r.my);
      input.setLook(r.lx, r.ly);
      game.drawFrames = drawMode === 'all' ? true : r.last;
      const held = loop.freeze > 0;
      loop.advance(1 / 60);
      if (r.last) {
        game.drawFrames = true;
        input.setLook(0, 0);
        ctx.camera.getWorldDirection(_d);
        hitSeen = false;
        film.on = false;
      } else if (drawMode === 'pilot') ghost(held ? 1 : loop.acc / loop.DT);
      ri++;
    } else {
      if (!over) {
        over = true;
        for (const a of ACTIONS) input.set(a, false);
        input.setMove(0, 0);
        input.setLook(0, 0);
      }
      game.drawFrames = drawMode !== 'none';
      loop.advance(1 / 60);
      after++;
    }
    i++;
    const s = Math.round(game.time * 60);
    if (s !== lastStep) {
      if (tr && s >= tr[0] && s <= tr[1]) snap(s);
      lastStep = s;
      const c = checks && checks.get(s);
      if (c && !diff) {
        const now = checkpoint(game, s),
          play = game.state === 'fight' && ctx.boss.alive !== false;
        if (now.some((v, k) => (play || k < 3) && Math.abs(v - c[k]) > 1e-9)) {
          diff = { step: s, logged: c, now };
          console.error(
            'capture: not the same fight at step ' +
              s +
              ': logged ' +
              JSON.stringify(c) +
              ' now ' +
              JSON.stringify(now),
          );
        } else if (!play && now.some((v, k) => Math.abs(v - c[k]) > 1e-9)) moved++;
      }
    }
  };
  const begin = () => {
    game.begin(startPoint(params));
    lastStep = Math.round(game.time * 60);
  };

  if (mode === 'check') {
    if (!recs) game.drawFrames = params.get('draw') === 'all';
    begin();
    loop.advance(0);
    let n = 0;
    while (!status().done && !status().diff && n < 60 * 60 * 20) {
      frame();
      n++;
      if (n % 900 === 0) await sleep(0);
    }
    trFlush();
    await Promise.all(trPosts);
    await post(name + '_events.json', told());
    await post(
      name + '.json',
      JSON.stringify({ frames: i, ...status(), detail: recs ? diff : game.replayDiff || null }),
    );
    document.title = 'capture done';
    return;
  }

  if (mode === 'video') {
    const seen = new WeakSet();
    const stepCss = (ms) => {
      void document.body.offsetWidth;
      for (const a of document.getAnimations()) {
        try {
          if (!seen.has(a)) {
            seen.add(a);
            a.pause();
            a.currentTime = 0;
          } else if (a.playState === 'running') a.pause();
          const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity,
            t = (Number(a.currentTime) || 0) + ms;
          if (Number.isFinite(end) && t >= end) a.finish();
          else a.currentTime = t;
        } catch (e) {}
      }
    };
    begin();
    loop.advance(0);
    stepCss(0);
    window.__cap = {
      ready: true,
      game,
      frame: () => {
        frame();
        stepCss(1000 / 60);
        return status();
      },
      skip: (n) => {
        for (let k = 0; k < n && !status().done && !status().diff; k++) {
          frame();
          stepCss(1000 / 60);
        }
        return status();
      },
    };
    document.title = 'capture ready';
    return new Promise(() => {});
  }

  if (mode === 'audio') {
    const audio = ctx.audio;
    audio.unlock();
    for (let k = 0; k < 100 && !(audio.ac && audio.ac.state === 'running'); k++) await sleep(50);
    if (!(audio.ac && audio.ac.state === 'running'))
      throw new Error('the sound engine did not start (is autoplay allowed for this browser?)');
    const ac = audio.ac,
      opts = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 };
    const tap = (suffix, ...nodes) => {
      const d = ac.createMediaStreamDestination();
      for (const n of nodes) n.connect(d);
      const r = new MediaRecorder(d.stream, opts),
        x = { suffix, r, chunks: [], start: 0, stopped: null };
      r.ondataavailable = (e) => {
        if (e.data && e.data.size) x.chunks.push(e.data);
      };
      x.stopped = new Promise((res) => {
        r.onstop = res;
      });
      return x;
    };
    const taps = [tap('', audio.ceiling)];
    if (params.get('stems') === '1')
      taps.push(tap('_music', audio.musicVol), tap('_sfx', audio.sfxVol, audio.voiceVol));
    for (const x of taps) {
      x.r.start();
      x.start = ac.currentTime;
    }
    await sleep(400);
    if (!recs) game.drawFrames = false;
    begin();
    if (recs) loop.advance(0);
    const t0 = ac.currentTime;
    await new Promise((res) => {
      const tick = () => {
        const due = Math.floor((ac.currentTime - t0) * 60);
        let n = 0;
        while (i < due && n < 40 && !status().done) {
          frame();
          n++;
        }
        if (n) audio.setListener(ctx.camera);
        if (status().done) res();
        else setTimeout(tick, 4);
      };
      tick();
    });
    await sleep(1500);
    for (const x of taps) x.r.stop();
    await Promise.all(taps.map((x) => x.stopped));
    for (const x of taps) await post(name + x.suffix + '.webm', new Blob(x.chunks, { type: 'audio/webm' }));
    const offsets = {};
    for (const x of taps) offsets[x.suffix || 'mix'] = t0 - x.start;
    await post(name + '_events.json', told());
    await post(
      name + '.json',
      JSON.stringify({
        offset: t0 - taps[0].start,
        offsets,
        frames: i,
        seconds: i / 60,
        rate: ac.sampleRate,
        ...status(),
      }),
    );
    document.title = 'capture done';
    return;
  }
  throw new Error('capture: say &capture=video, &capture=audio or &capture=check');
}
