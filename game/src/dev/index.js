import { MOVES } from './input-script.js';

export function startPoint(params) {
  return params.get('at') || 'fight';
}

export function parseScript(text) {
  const out = [];
  for (const part of (text || '').split(',')) {
    const m = part.trim().match(/^([a-z]+)@([\d.]+)(?:-([\d.]+))?$/i);
    if (m) out.push({ action: m[1], t0: +m[2], t1: m[3] !== undefined ? +m[3] : +m[2] + 0.1 });
  }
  return out;
}
function applyScript(input, script, t) {
  const want = {};
  let mx = 0,
    my = 0,
    moved = false;
  for (const s of script) {
    const on = t >= s.t0 && t < s.t1;
    if (MOVES[s.action]) {
      moved = true;
      if (on) {
        mx += MOVES[s.action][0];
        my += MOVES[s.action][1];
      }
    } else want[s.action] = want[s.action] || on;
  }
  for (const a in want) input.set(a, want[a]);
  if (moved) input.setMove(mx, my);
}

export function parseScheduledCalls(text) {
  const out = [];
  for (const part of (text || '').split(';')) {
    const m = part.trim().match(/^([\w.$]+)(?:\((.*)\)|=(.+))?@([\d.]+)$/);
    if (!m) {
      if (part.trim()) console.error('&do: cannot read "' + part + '"');
      continue;
    }
    out.push({
      text: part.trim(),
      path: m[1].split('.'),
      args: m[2] !== undefined ? JSON.parse('[' + m[2] + ']') : null,
      value: m[3] !== undefined ? JSON.parse(m[3]) : undefined,
      t: +m[4],
    });
  }
  return out;
}
function runScheduledCall(ctx, d) {
  let o = ctx;
  const p = d.path;
  for (let i = 0; i < p.length - 1; i++) {
    o = o[p[i]];
    if (o === undefined || o === null) throw new Error('nothing at ' + p.slice(0, i + 1).join('.'));
  }
  const k = p[p.length - 1];
  if (d.args) {
    if (typeof o[k] !== 'function') throw new Error(p.join('.') + ' is not a function');
    o[k](...d.args);
  } else o[k] = d.value;
}

const fighterByName = (ctx, name) => (name === 'player' || name === 'pilgrim' ? ctx.player : ctx.boss);

export async function attach(game, params) {
  const ctx = game.ctx,
    shot = params.get('shot'),
    perf = params.get('perf'),
    fight = params.get('fight'),
    auto = !!(shot || perf || fight || params.has('pilot') || params.has('capture'));
  const canvas = game.canvas;
  const post = (name, body) => fetch('/__shot/' + name, { method: 'POST', body });
  const grab = (type = 'image/png', q) => new Promise((r) => canvas.toBlob(r, type, q));

  if (auto) ctx.input.enabled = false;
  game.begin(startPoint(params));
  if (params.get('ui') === '0') document.getElementById('ui').style.display = 'none';
  if (params.has('bright')) {
    const k = params.num('bright', 3);
    ctx.gfx.onBeforeRender(() => {
      ctx.gfx.post.exposure = k;
    });
  }
  if (params.has('god')) ctx.player.god = true;
  if (params.has('php')) ctx.player.hp = params.num('php', 100);
  if (params.has('bosshp')) ctx.boss.hp = ctx.boss.hpMax * params.num('bosshp', 1);
  if (params.has('noai')) ctx.boss.ai = false;
  for (const part of (params.get('place') || '').split(';')) {
    const m = part.match(/^(\w+):(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?$/);
    if (m) {
      const f = fighterByName(ctx, m[1]);
      f.pos.set(+m[2], 0, +m[3]);
      if (m[4] !== undefined) f.yaw = (+m[4] * Math.PI) / 180;
    }
  }
  for (const part of (params.get('anim') || '').split(',')) {
    const [n, clip, speed] = part.split(':');
    if (!clip) continue;
    const f = fighterByName(ctx, n);
    f.puppet = params.has('root') ? 'root' : true;
    f.char.play(clip, { loop: true, fade: 0, force: true, speed: +speed || 1 });
  }
  for (const part of (params.get('pose') || '').split(',')) {
    const m = part.match(/^(\w+):(\w+)@([\d.]+)$/);
    if (!m) continue;
    const f = fighterByName(ctx, m[1]);
    f.puppet = true;
    const a = f.char.play(m[2], { fade: 0, force: true, at: +m[3] });
    if (a) a.paused = true;
  }
  if (params.has('cam')) {
    const c = params.get('cam').split(',').map(Number),
      rel = params.get('camrel'),
      fov = params.num('fov', 0);
    game.hooks.camera.push((cam) => {
      const o = rel ? fighterByName(ctx, rel).pos : { x: 0, z: 0 };
      cam.position.set(c[0] + o.x, c[1], c[2] + o.z);
      cam.up.set(0, 1, 0);
      cam.lookAt((c[3] || 0) + o.x, c[4] || 0, (c[5] || 0) + o.z);
      if (fov && cam.fov !== fov) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      cam.updateMatrixWorld();
    });
  }
  const hooks = [],
    t0 = game.time;
  const script = parseScript(params.get('play'));
  if (script.length) hooks.push(() => applyScript(ctx.input, script, game.time - t0));
  if (params.has('bot')) {
    const bot = await import('../app/bot.js');
    hooks.push(bot.attachBot(game, { skill: params.num('bot', 1) }));
  }
  const todo = parseScheduledCalls(params.get('do'));
  if (todo.length)
    hooks.push(() => {
      const t = game.time - t0;
      for (const d of todo)
        if (!d.done && t >= d.t) {
          d.done = true;
          try {
            runScheduledCall(ctx, d);
          } catch (e) {
            console.error('&do failed: ' + d.text + ': ' + e.message);
          }
        }
    });
  game.hooks.afterInput.push(...hooks);
  if (params.has('pilot')) {
    await (await import('./pilot.js')).runPilot(game, params);
    return true;
  }
  if (params.has('replay')) {
    const log = await (await fetch(params.get('replay'))).json();
    (await import('./pilot.js')).installReplay(game, log);
  }
  if (params.has('capture')) {
    await (await import('./capture.js')).runCapture(game, params);
    return true;
  }
  const ct = params.num('ct', 0);
  if (ct > 0) {
    game.drawFrames = false;
    for (let i = 0, n = Math.round(ct * 60); i < n; i++) {
      game.loop.freeze = 0;
      game.loop.advance(1 / 60);
    }
    game.drawFrames = true;
  }
  if (!auto) return false;

  const loop = game.loop,
    noStop = params.has('nostop');
  const advance = (seconds) => {
    const n = Math.max(0, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) {
      if (noStop) loop.freeze = 0;
      game.drawFrames = i >= n - 6 || i % 6 === 0;
      loop.advance(1 / 60);
    }
    game.drawFrames = true;
  };
  const state = () => {
    const p = ctx.player,
      b = ctx.boss,
      r = (v) => +v.toFixed(2);
    return {
      t: r(game.time),
      state: game.state,
      p: `${r(p.pos.x)},${r(p.pos.z)}`,
      pyaw: r(p.yaw),
      php: Math.round(p.hp),
      st: Math.round(p.stamina),
      ps: p.state,
      b: `${r(b.pos.x)},${r(b.pos.z)}`,
      bhp: Math.round(b.hp),
      bs: b.state,
      cine: ctx.cine.playing ? r(ctx.cine.time) : '-',
    };
  };
  if (fight) {
    const limit = params.num('limit', 420),
      maxDeaths = params.num('deaths', 3),
      r1 = (v) => +v.toFixed(1);
    const side = () => ({ hits: 0, damage: 0, blocked: 0 });
    const tally = {
      seed: game.seed,
      dealt: side(),
      taken: side(),
      moves: {},
      deaths: [],
      phaseAt: null,
      staggers: 0,
      wonAt: null,
      rolls: 0,
      heals: 0,
      errors: [],
    };
    ctx.bus.on('hit', (h) => {
      const s = h.attacker === ctx.player ? tally.dealt : tally.taken;
      s.hits++;
      s.damage += h.damage || 0;
      if (h.blocked) s.blocked++;
    });
    ctx.bus.on('boss-move', (e) => {
      if (e.stage === 'windup') tally.moves[e.name] = (tally.moves[e.name] || 0) + 1;
    });
    ctx.bus.on('player-died', () =>
      tally.deaths.push({ t: r1(game.time), bossHp: Math.round(ctx.boss.hp), phase: ctx.boss.phase }),
    );
    ctx.bus.on('boss-phase', () => {
      if (tally.phaseAt === null) tally.phaseAt = r1(game.time);
    });
    ctx.bus.on('boss-stagger', () => tally.staggers++);
    ctx.bus.on('roll', () => tally.rolls++);
    ctx.bus.on('heal', () => tally.heals++);
    window.addEventListener('error', (e) => tally.errors.push(String(e.message)));
    game.drawFrames = false;
    for (let i = 0, n = Math.round(limit * 60); i < n; i++) {
      loop.freeze = 0;
      loop.advance(1 / 60);
      if (game.state === 'won' && !ctx.cine.playing) {
        tally.wonAt = r1(game.time);
        break;
      }
      if (tally.deaths.length >= maxDeaths) break;
      if (i % 900 === 899) await new Promise((r) => setTimeout(r, 0));
    }
    game.drawFrames = true;
    loop.advance(0);
    tally.dealt.damage = Math.round(tally.dealt.damage);
    tally.taken.damage = Math.round(tally.taken.damage);
    await post(fight, JSON.stringify({ ...tally, ...state(), bot: game.botStats || null }, null, 1));
    if (shot) await post(shot, await grab());
    document.title = 'fight done';
    return true;
  }
  advance(params.num('t', 1));
  if (perf) {
    const gl = ctx.gfx.renderer.getContext(),
      px = new Uint8Array(4),
      times = [];
    for (let i = 0; i < 240; i++) {
      const a = performance.now();
      loop.freeze = 0;
      loop.advance(1 / 60);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - a);
    }
    times.sort((a, b) => a - b);
    const mem = performance.memory ? { jsHeapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : {};
    await post(
      perf,
      JSON.stringify({
        avgMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
        medianMs: +times[120].toFixed(2),
        p95Ms: +times[228].toFixed(2),
        ...ctx.gfx.stats(),
        ...mem,
        ...state(),
      }),
    );
    document.title = 'perf done';
    return true;
  }
  loop.advance(0);
  await new Promise((r) => requestAnimationFrame(r));
  if (params.has('record')) {
    const base = params.get('record'),
      fps = params.num('fps', 30),
      n = Math.round(params.num('seconds', 6) * fps);
    for (let i = 1; i <= n; i++) {
      loop.freeze = 0;
      loop.advance(1 / fps);
      await post(`${base}_${String(i).padStart(4, '0')}.jpg`, await grab('image/jpeg', 0.93));
    }
    await post(shot, await grab());
    document.title = 'shot done';
    return true;
  }
  const frames = Math.max(0, Math.min(24, params.num('frames', 0))),
    fdt = params.num('dt', 0.25);
  if (frames > 1) {
    const base = shot.replace(/\.\w+$/, ''),
      ext = (shot.match(/\.(\w+)$/) || [0, 'png'])[1],
      log = [];
    for (let i = 0; i < frames; i++) {
      if (i) {
        advance(fdt);
        loop.advance(0);
      }
      log.push(state());
      await post(`${base}_f${String(i).padStart(2, '0')}.${ext}`, await grab());
    }
    await post(base + '_frames.json', JSON.stringify({ dt: fdt, frames: log }));
  } else await post(shot, await grab());
  document.title = 'shot done';
  return true;
}
