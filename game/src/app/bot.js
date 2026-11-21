import * as THREE from 'three';
import { seededRandom } from '../core/math.js';
import { FEEL, ATTACKS, ROLL, BACKSTEP } from '../characters/player.js';

const BUTTONS = ['attack', 'heavy', 'block', 'roll', 'heal', 'lock'];
const _p = new THREE.Vector3(),
  _f = new THREE.Vector3();

export function attachBot(game, o = {}) {
  const ctx = game.ctx,
    bus = ctx.bus;
  if (ctx.params && ctx.params.get('probe') === 'feel') {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      let out;
      try {
        out = probeFeel(game);
      } catch (e) {
        out = { errors: ['the probe stopped: ' + (e && e.stack ? e.stack : e)] };
      }
      try {
        fetch('/__shot/feel.json', { method: 'POST', body: JSON.stringify(out, null, 1) }).catch(() => {});
      } catch (e) {}
      game.feel = out;
    };
  }
  const skill = Math.max(0, Math.min(1, o.skill === undefined || Number.isNaN(+o.skill) ? 1 : +o.skill));
  const trade = !!o.trade || !!(ctx.params && ctx.params.has('trade'));
  const rand = seededRandom((o.seed !== undefined ? o.seed : game.seed || 1) + 101);
  const stats = (game.botStats = {
    skill,
    time: 0,
    dealt: 0,
    taken: 0,
    hitsLanded: 0,
    hitsTaken: 0,
    blocked: 0,
    rolls: 0,
    flasksUsed: 0,
    deaths: 0,
    won: false,
    phase: 1,
    moves: {},
    log: [],
  });
  const note = (text) => {
    if (stats.log.length < 400) stats.log.push(`${stats.time.toFixed(1)} ${text}`);
  };

  const her = {
    move: null,
    stage: 'idle',
    since: 0,
    sawRecover: false,
    wasLive: false,
    hitIn: 9,
    staggerT: 9,
    moveT: 0,
    eta: 9,
    spot: null,
    open: -1,
  };
  const OPEN = {
    sweep: 0.55,
    cleave: 2.4,
    lunge: 2.2,
    spin: 1.6,
    leap: 2.4,
    stomp: 0.95,
    chorale: 1.2,
    hymn: 0.9,
    descant: 2.4,
    tide: 1.3,
  };
  const SOONEST = 1.0,
    AIRBORNE = 1.0,
    STAGGER = 3.2;
  const moveStat = (name) => stats.moves[name] || (stats.moves[name] = { seen: 0, hit: 0, blocked: 0 });
  const offs = [
    bus.on('boss-move', (e) => {
      if (e.stage === 'windup') moveStat(e.name).seen++;
      if (e.stage === 'recover') {
        her.sawRecover = true;
        her.open = typeof e.open === 'number' ? e.open : -1;
      }
      if (e.name === 'hymn' && e.stage === 'active' && her.move !== 'hymn') return;
      her.move = e.name;
      her.stage = e.stage;
      her.since = 0;
      her.wasLive = false;
      if (e.stage === 'windup') {
        her.moveT = 0;
        her.spot = null;
        her.eta = typeof e.eta === 'number' ? e.eta : 9;
        seen.delete(her);
      }
      her.hitIn = e.stage === 'windup' && typeof e.eta === 'number' ? e.eta : 9;
    }),
    bus.on('hit', (e) => {
      const dmg = Math.round(e.damage * 10) / 10;
      if (e.attacker === ctx.player) {
        stats.dealt += dmg;
        stats.hitsLanded++;
      } else if (e.target === ctx.player) {
        stats.taken += dmg;
        const m = her.move ? moveStat(her.move) : null;
        if (e.blocked) {
          stats.blocked++;
          if (m) m.blocked++;
        } else {
          stats.hitsTaken++;
          if (m) m.hit++;
        }
        note(
          `${e.blocked ? 'blocked' : 'hit by'} ${her.move || '?'}${e.kind ? ' (' + e.kind + ')' : ''} for ${dmg} (health ${Math.round(ctx.player.hp)})${e.blocked ? '' : ` [he was in ${was.state}, ${was.gap} m off, ${her.stage} ${her.moveT.toFixed(2)} s in, last roll ${was.sinceRoll} s ago]`}`,
        );
      }
    }),
    bus.on('roll', () => {
      stats.rolls++;
    }),
    bus.on('heal', () => {
      stats.flasksUsed++;
      note('drank');
    }),
    bus.on('player-died', () => {
      stats.deaths++;
      note(`died to ${her.move || '?'} (her health ${Math.round(ctx.boss.hp)})`);
    }),
    bus.on('boss-stagger', () => {
      her.staggerT = 0;
      note('she is staggered');
    }),
    bus.on('boss-phase', () => note('phase two')),
    bus.on('boss-died', () => {
      stats.won = true;
      note('she is down');
    }),
    bus.on('state', (e) => {
      if (e.to === 'fight') {
        her.stage = 'idle';
        her.move = null;
        her.since = 0;
        lockWait = 0.2;
      }
    }),
  ];

  const input = ctx.input;
  const want = {};
  for (const b of BUTTONS) want[b] = false;
  const tapLeft = {},
    fresh = {},
    last = {};
  for (const b of BUTTONS) {
    tapLeft[b] = 0;
    fresh[b] = false;
    last[b] = false;
  }
  const tap = (b, steps = 2) => {
    tapLeft[b] = steps;
    fresh[b] = true;
  };
  let mx = 0,
    my = 0;
  function steer(wx, wz, amount = 1) {
    const l = Math.hypot(wx, wz);
    if (l < 1e-5) {
      mx = my = 0;
      return;
    }
    let fx, fz;
    const cam = ctx.cam;
    if (cam && cam.mode !== 'cine' && typeof cam.yaw === 'number') {
      fx = Math.sin(cam.yaw);
      fz = Math.cos(cam.yaw);
    } else {
      ctx.camera.getWorldDirection(_f);
      const fl = Math.hypot(_f.x, _f.z) || 1;
      fx = _f.x / fl;
      fz = _f.z / fl;
    }
    wx /= l;
    wz /= l;
    mx = (-wx * fz + wz * fx) * amount;
    my = (wx * fx + wz * fz) * amount;
  }
  function hands() {
    for (const b of BUTTONS) {
      let on = want[b] || tapLeft[b] > 0;
      if (tapLeft[b] > 0) {
        if (fresh[b] && last[b]) on = false;
        else {
          fresh[b] = false;
          tapLeft[b]--;
        }
      }
      last[b] = on;
      input.set(b, on);
    }
    if (tapLeft.roll > 0 || fresh.roll) steer(rollX, rollZ);
    input.setMove(mx, my);
  }
  function letGo() {
    for (const b of BUTTONS) {
      want[b] = false;
      tapLeft[b] = 0;
      fresh[b] = false;
      last[b] = false;
      input.set(b, false);
    }
    mx = my = 0;
    input.setMove(0, 0);
  }

  const blade = { dist: 99, closing: 0, live: false, eta: 9, vx: 0, vz: 0 };
  function watchBlade() {
    const t = ctx.combat.nearestThreat ? ctx.combat.nearestThreat(ctx.player) : null;
    if (!t) {
      blade.live = false;
      blade.dist = 99;
      blade.eta = 9;
      return;
    }
    blade.live = t.live;
    blade.dist = t.dist;
    blade.closing = t.closing;
    blade.vx = t.vel.x;
    blade.vz = t.vel.z;
    blade.eta = t.closing > 0.5 ? Math.max(0, t.dist - 0.5) / t.closing : 9;
  }
  const BODY_BLOWS = { stomp: 2.5, reap: 0 };
  const seen = new Map();
  const coming = { eta: 9, x: 0, z: 0, key: null, kind: '' };
  function watchHall(p, b, ux, uz, lx, lz, gap) {
    coming.eta = 9;
    coming.key = null;
    const take = (eta, x, z, key, kind) => {
      if (eta < coming.eta && eta > -0.1) {
        coming.eta = eta;
        coming.x = x;
        coming.z = z;
        coming.key = key;
        coming.kind = kind;
      }
    };
    const fx = b.fx;
    if (fx) {
      if (fx.rings)
        for (const g of fx.rings) {
          if (!g.on || g.done) {
            seen.delete(g);
            continue;
          }
          const dx = g.x - p.pos.x,
            dz = g.z - p.pos.z,
            d = Math.hypot(dx, dz) || 1e-4;
          if (d > g.r) take((d - g.r - (g.band || 0.5)) / (g.v || 8), dx / d, dz / d, g, 'ring');
        }
      if (fx.waves)
        for (const w of fx.waves) {
          if (!w.on || w.done) {
            seen.delete(w);
            continue;
          }
          const rx = p.pos.x - w.x,
            rz = p.pos.z - w.z,
            ahead = rx * w.dx + rz * w.dz,
            side = Math.abs(-rx * w.dz + rz * w.dx);
          if (ahead > 0 && side < (w.width || 40) * 0.5) take((ahead - 0.5) / (w.v || 11), -w.dx, -w.dz, w, 'wave');
        }
      if (fx.blades)
        for (const k of fx.blades) {
          if (k.state !== 3 || k.spent) {
            if (k.state !== 2) seen.delete(k);
            continue;
          }
          if (Math.hypot(k.to.x - p.pos.x, k.to.z - p.pos.z) < 1.0 && (p.speed || 0) < 2.6)
            take((k.flight || 0.3) - k.t, lx * strafe, lz * strafe, k, 'light');
        }
    }
    if (ctx.combat.nextWarningEta) {
      const e = ctx.combat.nextWarningEta(p);
      if (e < 9) take(e, -ux, -uz, warnKey, 'warned');
    }
    if (her.hitIn < 9 && her.move && BODY_BLOWS[her.move] !== undefined && gap < BODY_BLOWS[her.move])
      take(her.hitIn, -ux, -uz, her, her.move);
  }
  const warnKey = {};

  let lockWait = 0.2,
    strafe = 1,
    strafeT = 0,
    swings = 0,
    swingWait = 0,
    dodgeWait = 0,
    guard = 0,
    healWait = 0,
    threatSeen = false,
    threatPlan = 'roll',
    lateT = 0,
    idleChance = 0,
    lastStage = 'idle',
    heldHeavy = 0,
    runIn = false,
    far = false;
  const spot = new THREE.Vector3(),
    was = { state: '', gap: 0, sinceRoll: 9 };
  let sinceRoll = 9;
  function flee(p, fromX, fromZ, lx, lz, speed = 1) {
    let ax = p.pos.x - fromX,
      az = p.pos.z - fromZ;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    if (!roomFor(p.pos.x + ax * 3, p.pos.z + az * 3)) {
      const sx = lx * strafe + ax * 0.3,
        sz = lz * strafe + az * 0.3;
      if (roomFor(p.pos.x + sx * 3, p.pos.z + sz * 3)) {
        ax = sx;
        az = sz;
      } else {
        ax = -lx * strafe + ax * 0.3;
        az = -lz * strafe + az * 0.3;
      }
    }
    steer(ax, az, speed);
  }
  const roomFor = (x, z) => {
    _p.set(x, 0, z);
    ctx.arena.resolve(_p, 0.4);
    return Math.hypot(_p.x - x, _p.z - z) < 0.4;
  };
  const ready0 = () => (far ? 6.6 : 2.3);
  const plan = () => (rand() < (1 - skill) * 0.7 ? 'freeze' : 'roll');
  let rollX = 0,
    rollZ = 0;
  function rollTo(p, rx, rz) {
    steer(rx, rz);
    rollX = rx;
    rollZ = rz;
    tap('roll');
    dodgeWait = 0.5;
    sinceRoll = 0;
  }

  function think(dt) {
    const p = ctx.player,
      b = ctx.boss;
    stats.time += dt;
    stats.phase = b.phase;
    her.since += dt;
    her.staggerT += dt;
    her.moveT += dt;
    if (her.hitIn < 9) her.hitIn -= dt;
    for (const k of BUTTONS) want[k] = false;
    mx = my = 0;
    sinceRoll += dt;
    was.state = p.state;
    was.gap = (p.gapTo ? p.gapTo(b) : 0).toFixed(1);
    was.sinceRoll = sinceRoll.toFixed(2);
    watchBlade();
    if (blade.live) her.wasLive = true;
    const quiet = !her.sawRecover && her.stage === 'active' && her.wasLive && !blade.live;
    const recovering = her.stage === 'recover' || quiet;
    if (lastStage !== her.stage) {
      lastStage = her.stage;
      idleChance = rand();
    }

    const dx = b.pos.x - p.pos.x,
      dz = b.pos.z - p.pos.z,
      dist = Math.hypot(dx, dz) || 1e-4,
      ux = dx / dist,
      uz = dz / dist;
    const gap = p.gapTo ? p.gapTo(b) : dist - b.radius - p.radius;
    const lx = -uz,
      lz = ux;
    lockWait -= dt;
    swingWait -= dt;
    dodgeWait -= dt;
    healWait -= dt;
    strafeT -= dt;
    if (!p.locked && lockWait <= 0 && b.alive) {
      tap('lock');
      lockWait = 0.6;
    }
    if (strafeT <= 0) {
      strafeT = 2 + rand() * 3;
      strafe = rand() < 0.5 ? -1 : 1;
      far = rand() < 0.28;
    }
    if (trade) {
      if (p.hp <= p.hpMax * 0.5 && p.flasks > 0 && healWait <= 0 && !p.busy) {
        tap('heal');
        healWait = 1.7;
      } else if (gap > 1.0) steer(ux, uz);
      else {
        steer(ux, uz, 0.01);
        if (swingWait <= 0 && p.stamina > 16) {
          tap('attack');
          swingWait = 0.4;
          swings++;
        }
      }
      hands();
      return;
    }
    const canRoll = p.stamina > 0 && dodgeWait <= 0 && !p.invulnerable;

    watchHall(p, b, ux, uz, lx, lz, gap);
    if (coming.key && coming.eta < 0.6) {
      let d = seen.get(coming.key);
      if (!d) {
        d = { plan: plan(), late: (1 - skill) * rand() * 0.1 };
        seen.set(coming.key, d);
      }
      if (d.plan === 'roll' && coming.eta <= 0.17 - d.late && canRoll) {
        let rx = coming.x,
          rz = coming.z;
        if (!roomFor(p.pos.x + rx * 3, p.pos.z + rz * 3)) {
          rx = lx * strafe;
          rz = lz * strafe;
        }
        rollTo(p, rx, rz);
        d.plan = 'done';
        hands();
        return;
      }
    }

    const offSpot = her.move === 'leap' && her.spot && Math.hypot(p.pos.x - spot.x, p.pos.z - spot.z) > 2.2;
    const danger = blade.live && !offSpot && (blade.dist < 1.3 || (blade.eta < 0.22 && blade.dist < 4.5));
    if (danger && !threatSeen) {
      threatSeen = true;
      threatPlan =
        plan() === 'freeze' ? 'freeze' : p.stamina < 8 ? 'block' : rand() < 0.2 && p.stamina > 45 ? 'block' : 'roll';
      lateT = (1 - skill) * rand() * 0.12;
    }
    if (!blade.live) {
      threatSeen = false;
      guard = Math.max(0, guard - dt);
    }
    if (danger && threatSeen) {
      lateT -= dt;
      if (lateT <= 0 && threatPlan === 'roll' && canRoll) {
        const side = blade.vx * lx + blade.vz * lz;
        let s = Math.abs(side) > 1.5 ? -Math.sign(side) : strafe;
        if (!roomFor(p.pos.x + lx * s * 3.2, p.pos.z + lz * s * 3.2)) s = -s;
        let rx = lx * s - ux * 0.25,
          rz = lz * s - uz * 0.25;
        if (!roomFor(p.pos.x + rx * 3, p.pos.z + rz * 3)) {
          rx = ux;
          rz = uz;
        }
        rollTo(p, rx, rz);
        threatPlan = 'rolled';
        hands();
        return;
      }
      if (threatPlan === 'block') guard = 0.4;
    }
    if (guard > 0) {
      want.block = true;
      steer(0, 0);
      hands();
      return;
    }

    const busyNow = her.stage === 'windup' || her.stage === 'active';
    const quick = b.phase === 2 ? 0.9 : 1;
    let hymnLive = false;
    if (b.fx && b.fx.blades)
      for (const k of b.fx.blades)
        if (k.state >= 1 && k.state <= 3) {
          hymnLive = true;
          break;
        }
    const soon = coming.eta < 1.1 || hymnLive;
    const openFor =
      !b.alive || soon
        ? 0
        : b.staggered
          ? Math.max(0, STAGGER - her.staggerT) + 0.6
          : recovering
            ? Math.max(
                0,
                (her.stage === 'recover' && her.open >= 0
                  ? her.open
                  : OPEN[her.move] !== undefined
                    ? OPEN[her.move]
                    : 0.7) - her.since,
              ) +
              SOONEST * quick
            : her.stage === 'idle'
              ? Math.max(0, 0.3 - her.since) + 0.72 * quick
              : 0;

    if (busyNow && her.move === 'stomp' && her.hitIn < 9 && her.hitIn > -0.1 && dist < 4.9 && !p.busy) {
      let d = seen.get(her);
      if (!d) {
        d = { plan: plan(), late: (1 - skill) * rand() * 0.1 };
        seen.set(her, d);
      }
      if (d.plan !== 'freeze') {
        flee(p, b.pos.x, b.pos.z, lx, lz);
        hands();
        return;
      }
    }
    if (busyNow && her.move === 'leap') {
      const hips = b.char && b.char.bones && b.char.bones.Hips,
        up = b.flying === true || (hips ? hips.getWorldPosition(_p).y > 1.42 * 0.93 * b.char.scale : false);
      if (!her.spot && (up || her.moveT >= AIRBORNE * (b.phase === 2 ? 0.9 : 1) + 0.25)) {
        her.spot = spot.copy(p.pos);
        her.leave = plan() !== 'freeze';
      }
      if (her.spot && her.leave && !p.busy) {
        const away = Math.hypot(p.pos.x - spot.x, p.pos.z - spot.z);
        if (away < 4.2 && her.moveT < her.eta + 0.45) {
          if (away < 0.3) steer(lx * strafe - ux * 0.2, lz * strafe - uz * 0.2);
          else flee(p, spot.x, spot.z, lx, lz);
          hands();
          return;
        }
      }
    }

    if (hymnLive && !p.busy) {
      if (gap < 6.5) flee(p, b.pos.x, b.pos.z, lx, lz);
      else {
        let sx = lx * strafe,
          sz = lz * strafe;
        if (!roomFor(p.pos.x + sx * 3, p.pos.z + sz * 3)) {
          strafe = -strafe;
          sx = -sx;
          sz = -sz;
        }
        steer(sx, sz);
      }
      hands();
      return;
    }

    const hurt = p.hp <= p.hpMax * 0.5 && p.flasks > 0;
    if (hurt) {
      const drinkTime = 1.4;
      const safe =
        !busyNow &&
        coming.eta > drinkTime &&
        !blade.live &&
        ((gap > 6 && openFor > 0.3) || openFor > drinkTime + 0.25 - (1 - skill) * 0.7);
      if (safe && healWait <= 0) {
        tap('heal');
        healWait = 1.7;
        steer(-ux, -uz, 0.4);
        hands();
        return;
      }
      if (healWait <= 0 && gap < 6.5 && !(b.staggered || (recovering && openFor > 1.2))) {
        flee(p, b.pos.x, b.pos.z, lx, lz);
        want.roll = p.stamina > 40 && gap < 5.5 && !busyNow && !soon;
        hands();
        return;
      }
    }

    const greed = (1 - skill) * (0.25 + 0.9 * idleChance);
    const greedy = her.stage === 'windup' && skill < 1 && idleChance > 0.3 + 0.7 * skill;
    const room = openFor + greed,
      open = b.alive && (room > 0.85 || greedy);
    const reach = p.speed < 1.2 ? 1.45 : 1.1;
    const keep = b.staggered ? 16 : b.phase === 2 ? 60 : 34;
    if (heldHeavy > 0) {
      heldHeavy -= dt;
      want.heavy = heldHeavy > 0;
      steer(ux, uz, 0.01);
      hands();
      return;
    }
    if (open && p.stamina > keep) {
      if (gap > reach) {
        steer(ux, uz);
        const walkIn = (gap - reach) / 4.6;
        if (gap > 4.2 && p.stamina > 55 && room > (gap - 2.3) / 6.6 + 1.1) {
          want.roll = true;
          runIn = true;
        } else if (runIn && p.state === 'sprint' && gap < 2.3 && swingWait <= 0) {
          tap('attack');
          swingWait = 0.5;
          runIn = false;
          swings++;
        } else if (gap < 2.2 && p.state !== 'sprint' && swingWait <= 0 && swings % 3 === 2) {
          tap('attack');
          swingWait = 0.45;
          swings++;
        } else {
          runIn = runIn && p.state === 'sprint';
          if (!runIn && room < walkIn + 0.85 && !greedy && gap > ready0()) steer(lx * strafe, lz * strafe, 0.62);
        }
      } else {
        runIn = false;
        steer(ux, uz, 0.01);
        if (swingWait <= 0) {
          if (b.staggered && room > 2.6 && p.stamina > 50 && !p.busy) {
            heldHeavy = 0.95;
            want.heavy = true;
            swingWait = 1.6;
          } else if (room > 0.85 || greedy) {
            tap('attack');
            swings++;
            swingWait = 0.4;
          }
        }
      }
      hands();
      return;
    }
    runIn = false;

    const busy = busyNow;
    const ready = hymnLive ? 4.2 : far ? 6.6 : busy ? 3.2 : 2.3,
      hymn = her.move === 'hymn' || hymnLive;
    if (gap > ready + 0.7) {
      if (hymnLive) steer(ux * 0.5 + lx * strafe, uz * 0.5 + lz * strafe);
      else steer(ux, uz);
      want.roll = gap > 11 && p.stamina > 70 && !soon;
    } else if (gap < ready - 0.9) steer(-ux + lx * strafe * 0.6, -uz + lz * strafe * 0.6);
    else {
      let sx = lx * strafe,
        sz = lz * strafe;
      if (!roomFor(p.pos.x + sx * 2.5, p.pos.z + sz * 2.5)) {
        strafe = -strafe;
        sx = -sx;
        sz = -sz;
      }
      steer(sx, sz, hymn ? 1 : 0.62);
    }
    hands();
  }

  let wasFight = false;
  const hook = (dt) => {
    const fight = game.state === 'fight' && ctx.player.alive && !ctx.player.puppet;
    if (!fight) {
      if (wasFight) letGo();
      wasFight = false;
    } else {
      wasFight = true;
      think(dt);
    }
  };
  hook.stats = stats;
  hook.dispose = () => {
    for (const off of offs) off();
    letGo();
  };
  return hook;
}

function probeFeel(game) {
  const ctx = game.ctx,
    DT = ctx.DT,
    input = ctx.input,
    p = ctx.player,
    b = ctx.boss,
    cam = ctx.cam,
    arena = ctx.arena;
  const out = { made: 'app/bot.js probeFeel', errors: [] };
  const r2 = (v) => Math.round(v * 100) / 100,
    sec = (steps) => (steps < 0 ? null : r2(steps * DT));
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) game.step(DT);
  };
  const clear = () => {
    for (const a of BUTTONS) input.set(a, false);
    input.setMove(0, 0);
    for (const a of BUTTONS) input.consume(a);
  };
  const free = () => !p.busy;
  const body = () => b.radius * FEEL.bodyGap + p.radius;
  const until = (pred, max = 600, each) => {
    for (let i = 0; i <= max; i++) {
      if (pred(i)) return i;
      if (each) each(i);
      step();
    }
    return -1;
  };
  const tap = (a, steps = 2) => {
    input.set(a, true);
    step(steps);
    input.set(a, false);
  };
  let laneX = 0;
  for (const x of [0, 2, -2, 4, -4, 6, -6]) {
    let ok = true;
    for (let z = 14; z >= -14 && ok; z -= 0.25) {
      _p.set(x, 0, z);
      if (arena.resolve(_p, 0.6)) ok = false;
    }
    if (ok) {
      laneX = x;
      break;
    }
  }
  const stage = (o = {}) => {
    clear();
    b.reset();
    b.ai = false;
    p.reset({ x: laneX, z: o.z0 === undefined ? 12 : o.z0, yaw: Math.PI });
    p.god = false;
    if (o.gap === undefined) {
      b.pos.set(laneX > 0 ? laneX - 8 : laneX + 8, 0, -15);
    } else b.pos.set(laneX, 0, p.pos.z - o.gap - body());
    b.yaw = 0;
    if (b.kit && b.kit.teleport) b.kit.teleport();
    if (cam.mode === 'cine') cam.mode = 'free';
    cam.setLock(!!o.lock);
    cam.snapBehind();
    step(o.settle === undefined ? 12 : o.settle);
    b.hp = b.hpMax;
    if (o.gap !== undefined) b.pos.set(laneX, 0, p.pos.z - o.gap - body());
  };
  const test = (name, fn) => {
    try {
      out[name] = fn();
    } catch (e) {
      out.errors.push(name + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
  };
  const hits = [];
  const off = ctx.bus.on('hit', (h) =>
    hits.push({ by: h.attacker === p ? 'him' : 'her', damage: r2(h.damage), blocked: h.blocked, t: game.time }),
  );
  const speedOver = (steps) => {
    const x0 = p.pos.x,
      z0 = p.pos.z;
    step(steps);
    return Math.hypot(p.pos.x - x0, p.pos.z - z0) / (steps * DT);
  };

  test('input', () => (input.selfTest ? input.selfTest() : { skipped: true }));

  test('run', () => {
    stage();
    input.setMove(0, 1);
    const z0 = p.pos.z;
    let first = -1,
      t90 = -1;
    for (let i = 0; i < 90; i++) {
      const z = p.pos.z;
      step();
      const v = (z - p.pos.z) / DT;
      if (first < 0 && v > 0.01) first = i;
      if (t90 < 0 && v >= 0.9 * FEEL.run) t90 = i + 1;
    }
    const top = speedOver(30);
    input.setMove(0, 0);
    const zs = p.pos.z;
    const stop = until(() => p.speed < 0.05, 120);
    return {
      firstMoveStep: first,
      to90pct: sec(t90),
      speed: r2(top),
      stopTime: sec(stop),
      stopDistance: r2(Math.abs(p.pos.z - zs)),
      wanted: FEEL.run,
      travelled: r2(z0 - p.pos.z),
    };
  });
  test('walk', () => {
    stage();
    input.setMove(0, 0.5);
    step(40);
    return { speed: r2(speedOver(30)), stick: 0.5 };
  });
  test('sprint', () => {
    stage({ z0: 14 });
    input.setMove(0, 1);
    input.set('roll', true);
    const st0 = p.stamina,
      starts = until(() => p.state === 'sprint', 120);
    step(40);
    const s1 = p.stamina,
      top = speedOver(60),
      drain = (s1 - p.stamina) / (60 * DT);
    input.set('roll', false);
    const back = until(() => p.state !== 'sprint', 60);
    return {
      startsAfter: sec(starts),
      speed: r2(top),
      staminaPerSecond: r2(drain),
      staminaAtStart: r2(st0),
      backToRunAfterRelease: sec(back),
      wanted: FEEL.sprint,
    };
  });
  test('turnRound', () => {
    stage();
    input.setMove(0, 1);
    step(70);
    const yaw0 = p.yaw,
      z0 = p.pos.z;
    input.setMove(0, -1);
    let faced = -1,
      speed90 = -1,
      zmin = z0;
    for (let i = 1; i <= 90; i++) {
      const z = p.pos.z;
      step();
      const v = (p.pos.z - z) / DT;
      zmin = Math.min(zmin, p.pos.z);
      const turned = Math.abs(Math.atan2(Math.sin(p.yaw - yaw0), Math.cos(p.yaw - yaw0)));
      if (faced < 0 && turned > Math.PI - 0.175) faced = i;
      if (speed90 < 0 && v >= 0.9 * FEEL.run) speed90 = i;
    }
    stage();
    const y1 = p.yaw;
    input.setMove(0, -1);
    const still = until(() => Math.abs(Math.atan2(Math.sin(p.yaw - y1), Math.cos(p.yaw - y1))) > Math.PI - 0.175, 90);
    stage();
    const y2 = p.yaw;
    input.setMove(1, 0);
    const quarter = until(
      () => Math.abs(Math.atan2(Math.sin(p.yaw - y2), Math.cos(p.yaw - y2))) > Math.PI / 2 - 0.175,
      90,
    );
    return {
      atFullRun: { facesBackAfter: sec(faced), fullSpeedBackAfter: sec(speed90), overshoot: r2(z0 - zmin) },
      fromStanding: { facesBackAfter: sec(still) },
      quarterTurnFromStanding: sec(quarter),
    };
  });
  test('locked', () => {
    const one = (mx, my) => {
      stage({ gap: 7, lock: true, z0: 6 });
      input.setMove(mx, my);
      step(45);
      const g0 = p.gapTo(b),
        v = speedOver(40);
      return { speed: r2(v), gapChange: r2(p.gapTo(b) - g0) };
    };
    return { toward: one(0, 1), away: one(0, -1), left: one(-1, 0), right: one(1, 0) };
  });

  const rollRun = (tapSteps, stickSteps, lockOn) => {
    stage(lockOn ? { gap: 6, lock: true, z0: 6 } : {});
    input.setMove(lockOn ? 1 : 0, lockOn ? 0 : 1);
    step(1);
    const x0 = p.pos.x,
      z0 = p.pos.z,
      st0 = p.stamina;
    let shown = -1,
      safe = 0,
      peak = 0,
      roll = false;
    input.set('roll', true);
    for (let i = 0; i < 150; i++) {
      if (i === tapSteps) input.set('roll', false);
      if (i === stickSteps) input.setMove(0, 0);
      const x = p.pos.x,
        z = p.pos.z;
      step();
      if (shown < 0 && (p.state === 'dodge' || p.state === 'roll')) shown = i;
      if (p.state === 'roll') roll = true;
      if (p.invulnerable) safe = i + 1;
      peak = Math.max(peak, Math.hypot(p.pos.x - x, p.pos.z - z) / DT);
      if (roll && free())
        return {
          shownInStep: shown,
          harmlessFor: sec(safe),
          distance: r2(Math.hypot(p.pos.x - x0, p.pos.z - z0)),
          over: sec(i + 1),
          stamina: r2(st0 - p.stamina),
          peakSpeed: r2(peak),
          tap: sec(tapSteps),
        };
    }
    return { failed: true, state: p.state };
  };
  test('roll', () => ({
    tap33ms: rollRun(2, 12),
    tap100ms: rollRun(6, 12),
    tap200ms: rollRun(12, 14),
    stickHeld: rollRun(2, 999),
    lockedSideways: rollRun(2, 12, true),
  }));
  test('rollThen', () => {
    const then = (a) => {
      stage();
      input.setMove(0, 1);
      step(1);
      tap('roll');
      step(10);
      input.set(a, true);
      step(2);
      input.set(a, false);
      const n = until(
        () => (a === 'roll' ? p.state === 'dodge' || (p.state === 'roll' && p.char.time < 0.2) : p.state === 'attack'),
        90,
      );
      return {
        secondPressAt: sec(12),
        startsAfterFirstPress: sec(n < 0 ? -1 : n + 14),
        as: p.state === 'attack' ? p.def.key : p.state,
      };
    };
    return { roll: then('roll'), attack: then('attack') };
  });
  test('backstep', () => {
    stage();
    const x0 = p.pos.x,
      z0 = p.pos.z,
      st0 = p.stamina;
    let safe = 0,
      shown = -1;
    input.set('roll', true);
    for (let i = 0; i < 150; i++) {
      if (i === 2) input.set('roll', false);
      step();
      if (shown < 0 && p.state === 'backstep') shown = i;
      if (p.invulnerable) safe = i + 1;
      if (shown >= 0 && free())
        return {
          shownInStep: shown,
          harmlessFor: sec(safe),
          distance: r2(Math.hypot(p.pos.x - x0, p.pos.z - z0)),
          over: sec(i + 1),
          stamina: r2(st0 - p.stamina),
        };
    }
    return { failed: true };
  });
  test('rollWindow', () => {
    const refused = [];
    for (let k = 0; k <= 40; k++) {
      stage({ settle: 4 });
      input.setMove(0, 1);
      step(1);
      input.set('roll', true);
      for (let i = 0; i < k; i++) {
        if (i === 2) input.set('roll', false);
        step();
      }
      const h = ctx.combat.strike({ attacker: b, target: p, damage: 1, heavy: false });
      if (!h) refused.push(k);
    }
    const last = refused.length ? refused[refused.length - 1] : -1;
    return { blowRefusedFrom: refused.length ? sec(refused[0]) : null, until: sec(last + 1), steps: refused.length };
  });
  test('holdIsSprint', () => {
    stage();
    input.setMove(0, 1);
    step(1);
    const st0 = p.stamina;
    input.set('roll', true);
    const n = until(() => p.state === 'sprint', 60);
    const paid = st0 - p.stamina;
    stage();
    input.setMove(0, 1);
    step(1);
    const st1 = p.stamina;
    input.set('roll', true);
    step(6);
    const h = ctx.combat.strike({ attacker: b, target: p, damage: 20, heavy: true });
    step(3);
    return {
      sprintAfter: sec(n),
      staminaPaidForTheStart: r2(paid),
      blowDuringTheHold: { refused: !h, becomes: p.state, staminaPaid: r2(st1 - p.stamina) },
    };
  });

  const prepare = (key) => {
    const chainTo = (k) => {
      tap('attack');
      const ok = until(() => p.state === 'attack' && p.def.key === k, 5) >= 0;
      if (!ok) return false;
      until(() => p.char.time >= p.def.chain + 1e-3, 200);
      return true;
    };
    if (key === 'light2') return chainTo('light1');
    if (key === 'light3') return chainTo('light1') && chainTo('light2');
    if (key === 'runLight' || key === 'runHeavy') {
      input.setMove(0, 1);
      input.set('roll', true);
      return until(() => p.state === 'sprint' && p.speed > FEEL.sprint * 0.95, 150) >= 0;
    }
    if (key === 'rollLight') {
      input.setMove(0, 1);
      step(1);
      tap('roll');
      until(() => p.state === 'roll' && p.char.time >= ROLL.cancel + 1e-3, 120);
      return p.state === 'roll';
    }
    return true;
  };
  const button = (key) => (key === 'heavy' || key === 'runHeavy' ? 'heavy' : 'attack');
  const timeline = (key, hold = 0) => {
    const res = {};
    const begin = (after) => {
      stage(key.startsWith('run') ? { z0: 14 } : {});
      if (!prepare(key)) return false;
      const st0 = p.stamina,
        a = button(key);
      input.set(a, true);
      let i = 0,
        armedAt = -1,
        offAt = -1,
        swingAt = -1;
      const offSwing = ctx.bus.on('swing', (e) => {
        if (e.who === 'player' && swingAt < 0) swingAt = i;
      });
      const info = { ok: false };
      for (; i < 400; i++) {
        if (i === Math.max(2, Math.round(hold / DT))) {
          input.set(a, false);
          if (key.startsWith('run')) {
            input.set('roll', false);
          }
        }
        if (after) after(i);
        step();
        if (i === 0) {
          if (!(p.state === 'attack' && p.def.key === key)) {
            info.got = p.def ? p.def.key : p.state;
            break;
          }
          info.ok = true;
          info.cost = r2(st0 - p.stamina);
        }
        const live = ctx.combat.armed(p);
        if (armedAt < 0 && live) armedAt = i + 1;
        else if (armedAt >= 0 && offAt < 0 && !live) offAt = i + 1;
        if (info.stop && info.stop(i)) break;
        if (p.state !== 'attack' || p.def.key !== key) {
          info.left = i + 1;
          info.into = p.state === 'attack' ? p.def.key : p.state;
          break;
        }
      }
      offSwing();
      input.set(a, false);
      info.armedAt = armedAt;
      info.offAt = offAt;
      info.swingAt = swingAt;
      return info;
    };
    const alone = begin();
    if (!alone || !alone.ok) return { failed: true, got: alone && alone.got };
    res.staminaCost = alone.cost;
    res.swing = sec(alone.swingAt);
    res.bladeLive = [sec(alone.armedAt), sec(alone.offAt)];
    res.overWithNoInput = sec(alone.left);
    const d = ATTACKS[key];
    res.damage = d.damage;
    res.poise = d.poise;
    if (hold && d.charged) {
      res.damage = d.charged.damage;
      res.poise = d.charged.poise;
    }
    const nextAt = (a, moveToo) => {
      const i0 = Math.max(4, Math.round(hold / DT) + 2);
      const info = begin((i) => {
        if (i === i0) {
          input.set(a, true);
          if (moveToo) input.setMove(0, 1);
        }
        if (i === i0 + 2 && a !== 'block') input.set(a, false);
        if (i > i0 + 2 && a !== 'block' && i % 12 === 0) {
          input.set(a, true);
        }
        if (i > i0 + 2 && a !== 'block' && i % 12 === 2) input.set(a, false);
      });
      input.set(a, false);
      input.setMove(0, 0);
      return info && info.ok ? { at: sec(info.left), into: info.into } : null;
    };
    res.nextAttack = nextAt('attack');
    res.roll = nextAt('roll', true);
    res.block = nextAt('block');
    const walk = begin((i) => {
      if (i === 6) input.setMove(0, 1);
    });
    input.setMove(0, 0);
    res.walkAway = walk && walk.ok ? sec(walk.left) : null;
    return res;
  };
  const lands = (key, gap, lock, hold = 0) => {
    const run = key.startsWith('run');
    stage(
      run
        ? { gap: gap + 11, lock, z0: 14 }
        : key === 'rollLight'
          ? { gap: gap + 2.6, lock, z0: 9 }
          : { gap, lock, z0: 6 },
    );
    if (!prepare(key)) return null;
    if (run) {
      if (until(() => p.gapTo(b) <= gap, 300) < 0) return null;
    }
    const n0 = hits.length,
      a = button(key),
      g = p.gapTo(b);
    input.set(a, true);
    if (run) input.set('roll', false);
    let i = 0;
    for (; i < 220; i++) {
      if (i === Math.max(2, Math.round(hold / DT))) input.set(a, false);
      step();
      if (i === 0 && !(p.state === 'attack' && p.def.key === key)) return null;
      if (hits.length > n0 || p.state !== 'attack') break;
    }
    input.set(a, false);
    clear();
    return hits.length > n0 ? { at: sec(i + 1), damage: hits[hits.length - 1].damage, pressedAtGap: r2(g) } : null;
  };
  const reach = (key, lock, hold = 0) => {
    let lo = 0,
      hi = 6;
    if (!lands(key, 0.05, lock, hold)) return { reach: 0, pointBlank: null };
    const near = lands(key, 0.05, lock, hold);
    for (let i = 0; i < 9; i++) {
      const m = (lo + hi) / 2;
      if (lands(key, m, lock, hold)) lo = m;
      else hi = m;
    }
    return { reach: r2(lo), hitAtPointBlank: near.at, damage: near.damage };
  };
  for (const key of ['light1', 'light2', 'light3', 'heavy', 'runLight', 'runHeavy', 'rollLight']) {
    test('attack_' + key, () => {
      const t = timeline(key);
      if (t.failed) return t;
      t.reachLocked = reach(key, true);
      const lunge = FEEL.lungeMax;
      FEEL.lungeMax = 0;
      t.reachWithoutCarry = reach(key, true).reach;
      FEEL.lungeMax = lunge;
      t.reachUnlocked = reach(key, false).reach;
      return t;
    });
  }
  test('attack_heavyHeld', () => {
    const t = timeline('heavy', 1.2);
    if (t.failed) return t;
    t.reachLocked = reach('heavy', true, 1.2);
    return t;
  });
  test('chain', () => {
    stage({ gap: 0.3, lock: true, z0: 6 });
    const n0 = hits.length,
      t0 = game.time;
    let i = 0;
    for (; i < 240; i++) {
      input.set('attack', i % 8 < 3);
      step();
      if (hits.length - n0 >= 3) break;
    }
    input.set('attack', false);
    return {
      cutsLandAt: hits.slice(n0).map((h) => r2(h.t - t0)),
      damages: hits.slice(n0).map((h) => h.damage),
      staminaLeft: r2(p.stamina),
    };
  });
  test('buffer', () => {
    let earliest = null;
    for (let early = 2; early <= 40; early += 2) {
      stage();
      input.setMove(0, 1);
      step(1);
      tap('roll');
      input.setMove(0, 0);
      const toCancel = until(() => p.state === 'roll' && p.char.time >= ROLL.cancel - 1e-3, 150);
      stage();
      input.setMove(0, 1);
      step(1);
      tap('roll');
      input.setMove(0, 0);
      step(Math.max(0, toCancel - early));
      tap('attack', 2);
      const came = until(() => p.state === 'attack', 80) >= 0;
      if (came) earliest = early;
      else break;
    }
    return { pressComesOutIfMadeUpTo: sec(earliest), beforeTheWindow: true, wanted: FEEL.queue };
  });

  const sword = p.kit.sword,
    _tip = new THREE.Vector3(),
    _base = new THREE.Vector3(),
    _old = new THREE.Vector3();
  const deg = (r) => Math.round((r * 180) / Math.PI);
  const bladePath = (key, hold = 0) => {
    const run = key.startsWith('run');
    stage(run ? { z0: 14 } : {});
    if (!prepare(key)) return { failed: true };
    const a = button(key),
      rows = [];
    let x0 = 0,
      z0 = 0,
      fx = 0,
      fz = 1;
    input.set(a, true);
    for (let i = 0; i < 400; i++) {
      if (i === Math.max(2, Math.round(hold / DT))) {
        input.set(a, false);
        if (run) {
          input.set('roll', false);
          input.setMove(0, 0);
        }
      }
      sword.tip.getWorldPosition(_old);
      step();
      if (i === 0) {
        if (!(p.state === 'attack' && p.def.key === key)) return { failed: true, got: p.def ? p.def.key : p.state };
        x0 = p.pos.x;
        z0 = p.pos.z;
        fx = Math.sin(p.aim);
        fz = Math.cos(p.aim);
      }
      if (p.state !== 'attack' || p.def.key !== key) break;
      sword.tip.getWorldPosition(_tip);
      sword.base.getWorldPosition(_base);
      const rx = _tip.x - p.pos.x,
        rz = _tip.z - p.pos.z,
        bx = _base.x - p.pos.x,
        bz = _base.z - p.pos.z;
      rows.push({
        t: (i + 1) * DT,
        clip: p.char.time,
        live: ctx.combat.armed(p),
        fwd: rx * fx + rz * fz,
        left: rx * fz - rz * fx,
        up: _tip.y,
        bfwd: bx * fx + bz * fz,
        bleft: bx * fz - bz * fx,
        bup: _base.y,
        carried: (p.pos.x - x0) * fx + (p.pos.z - z0) * fz,
        speed: _tip.distanceTo(_old) / DT,
        facing: Math.atan2(Math.sin(p.yaw - p.aim), Math.cos(p.yaw - p.aim)),
      });
    }
    input.set(a, false);
    clear();
    const at = (r) => ({
      t: r2(r.t),
      clip: r2(r.clip),
      fwd: r2(r.fwd),
      left: r2(r.left),
      up: r2(r.up),
      bearingDeg: deg(Math.atan2(r.left, r.fwd)),
      speed: r2(r.speed),
    });
    const live = rows.filter((r) => r.live),
      res = { clip: ATTACKS[key].clip, steps: rows.length };
    if (!live.length) {
      res.neverLive = true;
      return res;
    }
    let peak = rows[0];
    for (const r of rows) if (r.speed > peak.speed) peak = r;
    let i0 = rows.indexOf(peak),
      i1 = i0;
    while (i0 > 0 && rows[i0 - 1].speed > 0.3 * peak.speed) i0--;
    while (i1 < rows.length - 1 && rows[i1 + 1].speed > 0.3 * peak.speed) i1++;
    res.live = [r2(live[0].t), r2(live[live.length - 1].t + DT)];
    res.liveClip = [r2(live[0].clip), r2(live[live.length - 1].clip)];
    res.atOn = at(live[0]);
    res.atOff = at(live[live.length - 1]);
    res.peakSpeed = at(peak);
    res.fastStretch = [r2(rows[i0].t), r2(rows[i1].t)];
    res.fastStretchClip = [r2(rows[i0].clip), r2(rows[i1].clip)];
    let far = live[0],
      low = live[0],
      hi = live[0],
      lmin = live[0],
      lmax = live[0];
    for (const r of live) {
      if (r.fwd > far.fwd) far = r;
      if (r.up < low.up) low = r;
      if (r.up > hi.up) hi = r;
      if (r.left < lmin.left) lmin = r;
      if (r.left > lmax.left) lmax = r;
    }
    res.whileLive = {
      furthestAhead: at(far),
      lowest: at(low),
      highest: at(hi),
      mostRight: r2(lmin.left),
      mostLeft: r2(lmax.left),
      bodyCarried: [r2(live[0].carried), r2(live[live.length - 1].carried)],
      facingOffLineDeg: [deg(live[0].facing), deg(live[live.length - 1].facing)],
    };
    let farAll = rows[0];
    for (const r of rows) if (r.fwd > farAll.fwd) farAll = r;
    res.furthestAheadEver = at(farAll);
    const cross = [];
    for (let i = 1; i < rows.length; i++) {
      const q = rows[i - 1],
        r = rows[i];
      if (r.fwd > 0.3 && q.fwd > 0.3 && q.left > 0 !== r.left > 0)
        cross.push({
          t: r2(r.t),
          clip: r2(r.clip),
          fwd: r2(r.fwd),
          up: r2(r.up),
          live: r.live,
          goingTo: r.left > 0 ? 'his left' : 'his right',
        });
    }
    res.crossesTheLine = cross;
    const inFront = rows.filter(
      (r) => r.fwd > 0.6 && Math.abs(Math.atan2(r.left, r.fwd)) < 0.61 && r.up < 2.3 && r.speed > 1.5,
    );
    res.inFrontAndMoving = inFront.length
      ? {
          from: r2(inFront[0].t),
          to: r2(inFront[inFront.length - 1].t),
          clipFrom: r2(inFront[0].clip),
          clipTo: r2(inFront[inFront.length - 1].clip),
          steps: inFront.length,
          liveSteps: inFront.filter((r) => r.live).length,
        }
      : null;
    res.path = rows
      .filter((r, i) => i % 3 === 0)
      .map((r) => [r2(r.t), r2(r.clip), r.live ? 1 : 0, r2(r.fwd), r2(r.left), r2(r.up), r2(r.speed)]);
    return res;
  };
  test('blade', () => {
    const o = {
      note: 'metres in his own frame at the press: fwd along the aimed line from his feet, left = his shield side; path rows are [t, clip time, live, fwd, left, up, speed of the point]',
    };
    for (const key of ['light1', 'light2', 'light3', 'heavy', 'runLight', 'runHeavy', 'rollLight'])
      o[key] = bladePath(key);
    return o;
  });
  const inHisFrame = (v, out) => {
    const s = Math.sin(p.yaw),
      c = Math.cos(p.yaw),
      x = v.x - p.pos.x,
      z = v.z - p.pos.z;
    out.fwd = r2(x * s + z * c);
    out.left = r2(x * c - z * s);
    out.up = r2(v.y);
    return out;
  };
  const dirInHisFrame = (x, y, z) => {
    const s = Math.sin(p.yaw),
      c = Math.cos(p.yaw),
      f = x * s + z * c,
      l = x * c - z * s;
    return {
      bearingDeg: deg(Math.atan2(l, f)),
      pitchDeg: deg(Math.asin(Math.max(-1, Math.min(1, y / (Math.hypot(x, y, z) || 1))))),
    };
  };
  const shieldNow = () => {
    const o = p.kit.shield && p.kit.shield.object;
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements;
    return {
      centre: inHisFrame(_tip.set(e[12], e[13], e[14]), {}),
      faces: dirInHisFrame(e[8], e[9], e[10]),
      top: dirInHisFrame(e[4], e[5], e[6]),
    };
  };
  const bodyNow = () => {
    const caps = (p.char.hurt || []).map((cap) => {
      const A = new THREE.Vector3(),
        B = new THREE.Vector3();
      if (cap.bone) {
        cap.bone.updateWorldMatrix(true, false);
        A.copy(cap.a).applyMatrix4(cap.bone.matrixWorld);
        B.copy(cap.b).applyMatrix4(cap.bone.matrixWorld);
      } else {
        cap.a.getWorldPosition(A);
        cap.b.getWorldPosition(B);
      }
      return {
        from: (cap.bone || cap.a).name,
        to: cap.bone ? '' : cap.b.name,
        r: cap.r,
        a: inHisFrame(A, {}),
        b: inHisFrame(B, {}),
      };
    });
    const box = new THREE.Box3(),
      one = new THREE.Box3();
    let any = false;
    p.char.model.traverse((m) => {
      if (m.isSkinnedMesh) {
        m.computeBoundingBox();
        one.copy(m.boundingBox).applyMatrix4(m.matrixWorld);
        box.union(one);
        any = true;
      }
    });
    const lo = inHisFrame(box.min, {}),
      hi = inHisFrame(box.max, {});
    let top = 0,
      bottom = 9;
    for (const k of caps) {
      top = Math.max(top, k.a.up + k.r, k.b.up + k.r);
      bottom = Math.min(bottom, k.a.up - k.r, k.b.up - k.r);
    }
    return {
      capsules: caps,
      capsulesTop: r2(top),
      capsulesBottom: r2(bottom),
      drawnBody: any ? { bottom: r2(box.min.y), top: r2(box.max.y), worldBoxMin: lo, worldBoxMax: hi } : null,
    };
  };
  test('shield', () => {
    stage({ gap: 3, lock: true, z0: 6 });
    step(30);
    const rest = shieldNow();
    input.set('block', true);
    step(40);
    const up = shieldNow(),
      body = bodyNow();
    const stops = [];
    for (let a = -180; a < 180; a += 10) {
      stage({ gap: 3, lock: true, z0: 6, settle: 6 });
      input.set('block', true);
      step(12);
      const ang = p.yaw + (a * Math.PI) / 180,
        h = ctx.combat.strike({
          attacker: { pos: new THREE.Vector3(p.pos.x + Math.sin(ang) * 3, 0, p.pos.z + Math.cos(ang) * 3) },
          target: p,
          damage: 10,
          heavy: false,
          weapon: {},
        });
      if (h && h.blocked) stops.push(a);
    }
    input.set('block', false);
    return {
      atRest: rest,
      raised: up,
      note: 'faces: which way the board looks (bearing + = to his left, 0 = straight ahead at her); centre: metres from his feet',
      blocksBladesFromDeg: stops.length ? [stops[0], stops[stops.length - 1]] : null,
      ruleDeg: deg(FEEL.blockArc),
      bodyBehindIt: body,
    };
  });
  test('body', () => {
    stage({ gap: 3, lock: true, z0: 6 });
    step(30);
    return bodyNow();
  });

  test('solid', () => {
    const res = {};
    stage({ gap: 3, lock: true, z0: 6, settle: 2 });
    p.pos.set(b.pos.x + 0.5, 0, b.pos.z + 0.6);
    let most = 0,
      lx = p.pos.x,
      lz = p.pos.z;
    for (let i = 0; i < 15; i++) {
      step();
      most = Math.max(most, Math.hypot(p.pos.x - lx, p.pos.z - lz));
      lx = p.pos.x;
      lz = p.pos.z;
    }
    res.putInsideHer = {
      fromHerMiddle: r2(Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z)),
      needs: r2(body()),
      mostInOneStep: r2(most),
      gap: r2(p.gapTo(b)),
    };
    const S = Array.isArray(b.solid) ? b.solid : [];
    let near = null;
    for (const c of S) {
      if (!c.a || !c.b || Math.min(c.a.y, c.b.y) - c.r > 1.9) continue;
      const sx = c.b.x - c.a.x,
        sz = c.b.z - c.a.z,
        l2 = sx * sx + sz * sz,
        t = l2 > 1e-8 ? Math.max(0, Math.min(1, ((p.pos.x - c.a.x) * sx + (p.pos.z - c.a.z) * sz) / l2)) : 0,
        d = Math.hypot(p.pos.x - c.a.x - sx * t, p.pos.z - c.a.z - sz * t) - c.r - p.radius;
      if (!near || d < near.clear) near = { part: c.name || '', clear: r2(d) };
    }
    res.nearestPartOfHer = near;
    res.herSolidParts = S.length;
    const stones = arena.colliders || [];
    let big = null;
    for (const c of stones) if (!big || c.r > big.r) big = c;
    if (big) {
      const inward = Math.hypot(big.x, big.z) || 1,
        ux = -big.x / inward,
        uz = -big.z / inward;
      b.reset();
      b.ai = false;
      b.pos.set(-big.x, 0, -big.z);
      p.reset({ x: big.x + ux * (big.r + 2.2), z: big.z + uz * (big.r + 2.2), yaw: Math.atan2(-ux, -uz) });
      cam.setLock(false);
      cam.snapBehind();
      step(6);
      const c2 = Math.cos(cam.yaw),
        s2 = Math.sin(cam.yaw),
        wx = -ux,
        wz = -uz;
      input.setMove(-wx * c2 + wz * s2, wx * s2 + wz * c2);
      step(1);
      tap('roll');
      let nearest = 9;
      for (let i = 0; i < 70; i++) {
        step();
        nearest = Math.min(nearest, Math.hypot(p.pos.x - big.x, p.pos.z - big.z) - big.r - p.radius);
      }
      input.setMove(0, 0);
      res.rollAtTheGreatStone = { nearestToItsFace: r2(nearest) };
      b.reset();
      b.ai = false;
      b.pos.set(-big.x, 0, -big.z);
      p.reset({ x: big.x + ux * (big.r + 1.15), z: big.z + uz * (big.r + 1.15), yaw: Math.atan2(-ux, -uz) });
      cam.setLock(false);
      cam.snapBehind();
      step(6);
      let clashes = 0,
        recoil = false,
        deepest = 9;
      const offC = ctx.bus.on('clash', (e) => {
        if (e.stone && !e.floor) clashes++;
      });
      tap('attack');
      for (let i = 0; i < 70; i++) {
        step();
        if (p.state === 'recoil') recoil = true;
        sword.tip.getWorldPosition(_tip);
        if (_tip.y < 1.6) deepest = Math.min(deepest, Math.hypot(_tip.x - big.x, _tip.z - big.z) - big.r);
      }
      offC();
      res.cutIntoTheGreatStone = {
        clashes,
        recoiled: recoil,
        pointNearestItsCircle: r2(deepest),
        note: 'the blade takes the stone to begin 0.2 m inside its circle',
      };
    }
    return res;
  });
  test('reactions', () => {
    const one = (...a) => {
      stage({ gap: 6, lock: true, z0: 6, settle: 6 });
      if (a[5]) p.hp = a[5];
      p.testHit(a[0], a[1], a[2], a[3], a[4]);
      return p.char.clipName + ' (' + p.state + ')';
    };
    return {
      lightFromTheFront: one(12, false, false, 0, 1.0),
      lightFromHisRight: one(12, false, false, -90, 1.0),
      lightFromHisLeft: one(12, false, false, 90, 1.0),
      lightToTheHead: one(12, false, false, 0, 1.6),
      heavy: one(30, true, false, 0, 1.1),
      thrownDown: one(40, true, true, 0, 1.1),
      killedByAColossalBlow: one(40, true, true, 0, 1.1, 5),
      killedFromTheFront: one(12, false, false, 20, 1.1, 5),
      killedFromBehind: one(30, true, false, 180, 1.1, 5),
    };
  });

  const blow = (o) => ctx.combat.strike(Object.assign({ attacker: b, target: p, damage: 30, heavy: true }, o));
  test('block', () => {
    stage({ gap: 3, lock: true, z0: 6 });
    input.set('block', true);
    step(1);
    const upInStep = p.blocking ? 0 : until(() => p.blocking, 30);
    step(10);
    const st0 = p.stamina,
      hp0 = p.hp,
      h = blow();
    const costHeavy = st0 - p.stamina,
      chip = hp0 - p.hp;
    step(60);
    const st1 = p.stamina,
      h2 = blow({ damage: 14, heavy: false });
    const costLight = st1 - p.stamina;
    stage({ gap: 3, lock: true, z0: 6 });
    input.set('block', true);
    step(8);
    let n = 0;
    while (p.blocking && n < 12) {
      blow();
      n++;
      step(20);
    }
    const broke = p.state === 'stagger';
    const freeAfter = until(free, 300);
    stage({ gap: 3, lock: true, z0: 6 });
    input.set('block', true);
    step(30);
    blow();
    step(Math.round((FEEL.regenDelay + 0.3) / DT));
    const a = p.stamina;
    step(60);
    const regenBlock = (p.stamina - a) / (60 * DT);
    stage({ gap: 3, z0: 6 });
    p.yaw = 0;
    step(1);
    input.set('block', true);
    step(6);
    const hb = ctx.combat.strike({ attacker: b, target: p, damage: 30, heavy: true, weapon: {} });
    return {
      shieldUpInStep: upInStep,
      heavyBlow30: { blocked: !!(h && h.blocked), stamina: r2(costHeavy), health: r2(chip) },
      lightBlow14: { blocked: !!(h2 && h2.blocked), stamina: r2(costLight) },
      guardBreaksOnBlow: n,
      broke,
      staggerLasts: sec(freeAfter),
      staminaBackWhileBlocking: r2(regenBlock),
      fromBehindBlocked: !!(hb && hb.blocked),
    };
  });
  test('struck', () => {
    const one = (o) => {
      stage({ gap: 3, lock: true, z0: 6 });
      const x0 = p.pos.x,
        z0 = p.pos.z,
        hp0 = p.hp;
      blow(o);
      const st = p.state;
      let safe = 0;
      const n = until((i) => {
        if (p.invulnerable) safe = i;
        return free();
      }, 400);
      return {
        state: st,
        health: r2(hp0 - p.hp),
        controlBackAfter: sec(n),
        pushed: r2(Math.hypot(p.pos.x - x0, p.pos.z - z0)),
        harmlessFor: sec(safe),
      };
    };
    return {
      light12: one({ damage: 12, heavy: false }),
      heavy30: one({ damage: 30, heavy: true }),
      thrownDown45: one({ damage: 45, heavy: true }),
    };
  });
  test('heal', () => {
    stage();
    p.hp = 40;
    step(1);
    input.set('heal', true);
    step(2);
    input.set('heal', false);
    let begins = -1,
      done = -1;
    const n = until((i) => {
      if (begins < 0 && p.hp > 40.01) begins = i + 2;
      if (done < 0 && p.hp >= 84.99) done = i + 2;
      return i > 2 && free();
    }, 300);
    stage();
    p.hp = 40;
    input.setMove(0, 1);
    step(20);
    input.set('heal', true);
    step(2);
    input.set('heal', false);
    step(20);
    const v = speedOver(20);
    return {
      healthStartsRising: sec(begins),
      allOf45In: sec(done),
      freeAgain: sec(n + 2),
      flasksLeft: p.flasks,
      walkingSpeedWhileDrinking: r2(v),
      layers: p.hasOverlay,
    };
  });
  test('stamina', () => {
    stage();
    input.setMove(0, 1);
    step(1);
    tap('roll');
    input.setMove(0, 0);
    until(free, 200);
    const low = p.stamina;
    const waits = until(() => p.stamina > low + 0.01, 200);
    const a = p.stamina;
    step(12);
    const rate = (p.stamina - a) / (12 * DT);
    return {
      afterARollItWaits: sec(waits),
      thenPerSecond: r2(rate),
      fullAgainAfterARoll: r2(waits * DT + (100 - low) / rate),
    };
  });

  test('camera', () => {
    const frame = (gap) => {
      stage({ gap, lock: true, z0: 6, settle: 90 });
      const c = ctx.camera;
      c.updateMatrixWorld();
      c.updateProjectionMatrix();
      const y = (x, h, z) => {
        _p.set(x, h, z).project(c);
        return r2(_p.y * 0.5 + 0.5);
      };
      return {
        gap,
        hisFeet: y(p.pos.x, 0, p.pos.z),
        hisHead: y(p.pos.x, 1.8, p.pos.z),
        herFeet: y(b.pos.x, 0, b.pos.z),
        herCrown: y(b.pos.x, cam.top, b.pos.z),
        fov: r2(c.fov),
        lensBehindHim: r2(Math.hypot(c.position.x - p.pos.x, c.position.z - p.pos.z)),
        lensHeight: r2(c.position.y),
      };
    };
    const framing = [0, 1, 2, 4, 8, 14].map(frame);
    stage({ gap: 0.6, lock: true, z0: 6, settle: 90 });
    let peak = 0,
      total = 0,
      last = cam.yaw;
    input.setMove(0.75, 0.66);
    step(1);
    tap('roll');
    for (let i = 0; i < 150; i++) {
      if (i === 30) input.setMove(0, 0);
      step();
      const d = Math.abs(Math.atan2(Math.sin(cam.yaw - last), Math.cos(cam.yaw - last)));
      last = cam.yaw;
      peak = Math.max(peak, d / DT);
      total += d;
    }
    stage({ z0: arena.bounds.hz - 0.5 });
    step(60);
    const wall = {
      lensBehindHim: r2(Math.hypot(ctx.camera.position.x - p.pos.x, ctx.camera.position.z - p.pos.z)),
      lensHeight: r2(ctx.camera.position.y),
    };
    return {
      screenHeightOf: framing,
      note: '0 = bottom edge of the picture, 1 = top edge',
      rollPastHerLegs: {
        peakSwingDegPerSecond: r2((peak * 180) / Math.PI),
        totalSwingDeg: r2((total * 180) / Math.PI),
      },
      backToTheWestWall: wall,
    };
  });

  test('cost', () => {
    stage({ gap: 3, lock: true, z0: 4 });
    b.ai = true;
    p.god = true;
    const parts = {
        input: [input, 'update'],
        player: [p, 'update'],
        combat: [ctx.combat, 'update'],
        camera: [cam, 'update'],
        hisPose: [p.char, 'update'],
        hisKit: [p.kit, 'update'],
      },
      ms = {},
      saved = {};
    for (const k in parts) {
      const [o, f] = parts[k],
        fn = o[f];
      saved[k] = fn;
      ms[k] = 0;
      o[f] = function (...a) {
        const t = performance.now();
        const r = fn.apply(this, a);
        ms[k] += performance.now() - t;
        return r;
      };
    }
    const t0 = performance.now(),
      n = 600;
    for (let i = 0; i < n; i++) {
      input.setMove(i % 240 < 120 ? 1 : -1, i % 90 < 30 ? 1 : 0);
      input.set('attack', i % 50 < 3);
      input.set('roll', i % 170 > 165);
      step();
    }
    const all = performance.now() - t0;
    for (const k in parts) {
      const [o, f] = parts[k];
      o[f] = saved[k];
    }
    clear();
    b.ai = false;
    p.god = false;
    const res = { steps: n, wholeStepMs: r2((all / n) * 1000) / 1000 };
    for (const k in ms) res[k + 'Ms'] = Math.round((ms[k] / n) * 10000) / 10000;
    res.playerOwnMs = Math.round(((ms.player - ms.hisPose - ms.hisKit) / n) * 10000) / 10000;
    res.mineMs =
      Math.round(((ms.input + ms.player - ms.hisPose - ms.hisKit + ms.combat + ms.camera) / n) * 10000) / 10000;
    return res;
  });

  off();
  clear();
  input.setMove(null);
  p.reset();
  b.reset();
  cam.setLock(false);
  cam.snapBehind();
  out.numbers = { FEEL, ROLL, BACKSTEP, bossRadius: b.radius, solidGap: r2(body()) };
  return out;
}
