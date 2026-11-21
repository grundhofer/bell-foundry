import * as THREE from 'three';
import { ACTIONS, commandFrames, commandInput } from './input-script.js';

const DEGREES_PER_RADIAN = 180 / Math.PI,
  r1 = (v) => Math.round(v * 10) / 10,
  r2 = (v) => Math.round(v * 100) / 100;
const wrap = (a) => {
  a = ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a;
};

export function checkpoint(game, s) {
  const p = game.ctx.player,
    b = game.ctx.boss;
  return [s, p.hp, b.hp, p.pos.x, p.pos.z, b.pos.x, b.pos.z];
}

export function installReplay(game, log) {
  const input = game.ctx.input,
    map = new Map(log.steps.map((e) => [e[0], e])),
    last = log.steps.length ? log.steps[log.steps.length - 1][0] : 0;
  const checks = new Map((log.checks || []).map((c) => [c[0], c]));
  input.enabled = false;
  game.replayDone = false;
  game.replayDiff = null;
  game.replayLast = last;
  const upd = input.update.bind(input);
  input.update = () => {
    const done = Math.round(game.time * 60),
      k = done + 1,
      e = map.get(k);
    const c = checks.get(done);
    if (c && !game.replayDiff) {
      const now = checkpoint(game, done);
      if (now.some((v, i) => Math.abs(v - c[i]) > 1e-9)) {
        game.replayDiff = { step: done, logged: c, now };
        console.error(
          'replay: not the same fight at step ' +
            done +
            ': logged ' +
            JSON.stringify(c) +
            ' now ' +
            JSON.stringify(now),
        );
      }
    }
    if (e) {
      input.setMove(e[1], e[2]);
      input.setLook(e[3], e[4]);
      ACTIONS.forEach((a, bit) => input.set(a, !!(e[5] & (1 << bit))));
    } else {
      input.setMove(0, 0);
      input.setLook(0, 0);
      for (const a of ACTIONS) input.set(a, false);
      if (k > last) game.replayDone = true;
    }
    upd();
  };
}

export async function runPilot(game, params) {
  const sess = params.get('pilot') || 'x',
    ctx = game.ctx,
    input = ctx.input,
    loop = game.loop,
    bus = ctx.bus;
  const post = (name, body) => fetch('/__shot/' + name, { method: 'POST', body });
  const grab = () => new Promise((r) => game.canvas.toBlob(r, 'image/jpeg', 0.82));
  input.enabled = false;
  let n = 0,
    lastMove = null,
    events = [];
  const steps = [];
  const checks = [];
  const stepIndex = () => Math.round(game.time * 60);
  bus.on('*', (name, d) => {
    if (name === 'hit')
      events.push(
        `${d.attacker === ctx.player ? 'you hit her' : 'she hit you'} for ${Math.round(d.damage || 0)}${d.blocked ? ' (blocked)' : ''}${d.fatal ? ' FATAL' : ''}`,
      );
    else if (name === 'boss-move') {
      lastMove = d;
      events.push(`her ${d.name}: ${d.stage}`);
    } else if (name === 'state') events.push(`game: ${d.from} -> ${d.to}`);
    else if (
      [
        'boss-slam',
        'boss-stagger',
        'boss-phase',
        'boss-died',
        'player-died',
        'player-respawn',
        'stamina-out',
        'heal',
        'roll',
      ].includes(name)
    )
      events.push(name);
    else if (name === 'lock') events.push(d.on ? 'locked on' : 'lock released');
    else if (name === 'cine') events.push(`cutscene ${d.name} ${d.on ? 'begins' : 'ends'}`);
  });
  const _d = new THREE.Vector3();
  const observe = () => {
    const p = ctx.player,
      b = ctx.boss,
      cam = ctx.camera;
    cam.getWorldDirection(_d);
    const camYaw = Math.atan2(_d.x, _d.z);
    const dx = b.pos.x - p.pos.x,
      dz = b.pos.z - p.pos.z,
      dist = Math.hypot(dx, dz),
      toHer = Math.atan2(dx, dz);
    const side = (a) => {
      const d = Math.round(wrap(a) * DEGREES_PER_RADIAN);
      return d === 0 ? 'dead ahead' : `${Math.abs(d)} deg to the ${d > 0 ? 'left' : 'right'}`;
    };
    return {
      t: r2(game.time),
      step: stepIndex(),
      state: game.state,
      cutscene: ctx.cine.playing ? `${ctx.cine.name} ${r1(ctx.cine.time)}/${r1(ctx.cine.duration)}` : null,
      you: {
        hp: Math.round(p.hp),
        hpMax: p.hpMax,
        stamina: Math.round(p.stamina),
        flasks: p.flasks,
        state: p.state,
        locked: !!p.locked,
        x: r1(p.pos.x),
        z: r1(p.pos.z),
      },
      her: {
        hp: Math.round(b.hp),
        hpMax: b.hpMax,
        phase: b.phase,
        state: b.state,
        move: lastMove ? `${lastMove.name} (${lastMove.stage})` : null,
        staggered: !!b.staggered,
        x: r1(b.pos.x),
        z: r1(b.pos.z),
      },
      distance: r1(dist),
      herFromCamera: side(toHer - camYaw),
      herFromYourFacing: side(toHer - p.yaw),
      sheFacesYou: Math.abs(wrap(Math.atan2(-dx, -dz) - b.yaw)) < 0.6,
      candles: r2(ctx.candles.lit),
      events,
    };
  };
  loop.advance(0);
  await post(`pilot_${sess}_obs.json`, JSON.stringify({ id: 0, ...observe() }));
  await post(`pilot_${sess}_obs.jpg`, await grab());
  await post(`pilot_${sess}_done_0.txt`, 'ok');
  for (;;) {
    let cmd;
    try {
      cmd = await (await fetch(`/__pilot/next?s=${sess}&after=${n}`)).json();
    } catch (e) {
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    if (!cmd || !cmd.id) continue;
    n = cmd.id;
    events = [];
    if (cmd.quit) {
      await post(
        `pilot_${sess}_log.json`,
        JSON.stringify({ seed: game.seed, url: location.search, rules: ctx.player.rules, steps, checks }),
      );
      await post(`pilot_${sess}_done_${n}.txt`, 'quit');
      document.title = 'pilot done';
      return;
    }
    const frames = commandFrames(cmd);
    let prevStep = stepIndex();
    for (let i = 0; i < frames; i++) {
      const { mx, my, on, lx, ly } = commandInput(cmd, i, frames);
      let mask = 0;
      ACTIONS.forEach((a, bit) => {
        input.set(a, on[bit]);
        if (on[bit]) mask |= 1 << bit;
      });
      input.setMove(mx, my);
      input.setLook(lx, ly);
      game.drawFrames = i === frames - 1;
      loop.advance(1 / 60);
      const s = stepIndex();
      if (s !== prevStep) {
        steps.push([s, mx, my, lx, ly, mask]);
        prevStep = s;
        if (s % 30 === 0) checks.push(checkpoint(game, s));
      }
    }
    game.drawFrames = true;
    input.setLook(0, 0);
    await post(`pilot_${sess}_obs.json`, JSON.stringify({ id: n, ...observe() }));
    if (cmd.shot !== false) await post(`pilot_${sess}_obs.jpg`, await grab());
    if (n % 20 === 0)
      await post(
        `pilot_${sess}_log.json`,
        JSON.stringify({ seed: game.seed, url: location.search, rules: ctx.player.rules, steps, checks }),
      );
    await post(`pilot_${sess}_done_${n}.txt`, 'ok');
  }
}
