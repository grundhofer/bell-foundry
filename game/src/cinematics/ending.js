import * as THREE from 'three';
import { Scene } from './timeline.js';
import { Curve, DEG, Spring3, clamp, lerp, ramp, smoother, wobble } from './curves.js';
import { ArmPendulum, DampedSpring } from './stage.js';
import { cues, line } from './cues.js';
import { gameplayCameraPose } from './intro.js';
import { PIER_X, PIER_Z } from '../world/layout.js';
import { OPTIONS } from '../config/options.js';

const WINDOW = { x: 0, z: -21.5 };
// Use &cinedebug to log the final sword placement.
const DEBUG = OPTIONS.has('cinedebug');
const STAND = 5.5;

export function buildEnding(ctx, st, rig) {
  const c = cues(ctx, 'ending'),
    P = ctx.player,
    B = ctx.boss,
    S = B.char.scale || 3.667,
    say = line(ctx, 'boss_end');
  const bd = ctx.arena.bounds,
    v1 = new THREE.Vector3(),
    v2 = new THREE.Vector3(),
    v3 = new THREE.Vector3(),
    sw = new THREE.Vector3();
  const headB = (out) => st.bone(B, 'Head', out);
  const T3 = 9,
    T4 = 13.5,
    T5 = 20.5,
    T6 = c.last;
  let gone = false;

  const DIE = 'death_knees2',
    REEL = 0.55,
    KNEES = 2.565,
    HANGS = 2.626,
    SUNK = 2.758,
    BREAST = 3.2,
    LIES = 3.85,
    BREATH = 'kneel_idle2';
  const car = { x: 0, z: 0, yaw: 0 },
    carS = { x: 0, z: 0, yaw: 0 };
  let stoodX = B.pos.x,
    stoodZ = B.pos.z;
  if (B.char.clipName !== DIE && st.carried(B, DIE, clamp(B.char.time - (B.struckAt || 0), 0, 0.95), car)) {
    const cs = Math.cos(B.yaw),
      sn = Math.sin(B.yaw),
      x = car.x * S * 0.3,
      z = car.z * S * 0.3;
    stoodX += x * cs + z * sn;
    stoodZ += -x * sn + z * cs;
  }
  let b0x = clamp(stoodX, -5.5, 5.5),
    b0z = clamp(stoodZ, -(bd.hz - 5.5), bd.hz - 9);
  let dx = P.pos.x - stoodX,
    dz = P.pos.z - stoodZ;
  const far = Math.hypot(dx, dz);
  if (far < 0.3) {
    dx = 0;
    dz = 1;
  } else {
    dx /= far;
    dz /= far;
  }
  const d0 = clamp(far, 0.3, 9);
  const F_REST = 0.37,
    R_REST = -0.09;
  st.carried(B, DIE, SUNK, carS);
  st.carried(B, DIE, REEL, car);
  const START_F = F_REST + (car.z - carS.z) * S,
    START_R = R_REST - (car.x - carS.x) * S;
  st.bone(B, 'Hips', v1);
  const hipX = v1.x - B.pos.x,
    hipZ = v1.z - B.pos.z;
  const ahead = far > 9 ? d0 : (P.pos.x - B.pos.x) * dx + (P.pos.z - B.pos.z) * dz;
  const e0 = ahead + START_F - (hipX * dx + hipZ * dz);
  const FALL = 0.5 * S;
  let BACK = 4.4;
  {
    const edge = (g) => (g > e0 + 1e-3 ? 1 : 0.3);
    const fits = (g) =>
      Math.abs(b0x + dx * g) <= bd.hx - edge(g) + 1e-3 && Math.abs(b0z + dz * g) <= bd.hz - edge(g) + 1e-3;
    while (BACK > 4.19 && !fits(Math.max(e0, FALL + BACK))) BACK -= 0.2;
    const g = Math.max(e0, FALL + BACK),
      e = edge(g),
      tx = b0x + dx * g,
      tz = b0z + dz * g;
    b0x += clamp(tx, -(bd.hx - e), bd.hx - e) - tx;
    b0z += clamp(tz, -(bd.hz - e), bd.hz - e) - tz;
  }
  const LIE = [
    [4.85, 0.75],
    [5.1, -0.9],
    [4.35, 2.0],
    [3.5, 0.6],
    [2.6, 0.6],
    [1.2, 1.9],
    [1.35, -0.8],
    [-0.4, 2.8],
    [-0.4, -1.4],
    [START_F - 1.5, 0.4],
    [START_F - 0.7, -1.4],
    [START_F - 0.7, 1.4],
    [Math.max(e0, FALL + BACK), 0],
  ];
  for (let pass = 0; pass < 3; pass++)
    for (const [f, r] of LIE)
      for (const o of ctx.arena.colliders || []) {
        const ex = b0x + dx * f - dz * r - o.x,
          ez = b0z + dz * f + dx * r - o.z,
          d = Math.hypot(ex, ez) || 1e-3,
          over = (o.r || 1) + 0.35 - d;
        if (over > 0) {
          b0x += (ex / d) * over;
          b0z += (ez / d) * over;
        }
      }
  const bWas = { x: B.pos.x, z: B.pos.z };
  const s0x = b0x + dx * START_F - dz * START_R - hipX,
    s0z = b0z + dz * START_F + dx * START_R - hipZ;
  const p0x = far > 9 ? s0x + dx * d0 : P.pos.x + s0x - B.pos.x,
    p0z = far > 9 ? s0z + dz * d0 : P.pos.z + s0z - B.pos.z;
  const kx = b0x + dx * FALL,
    kz = b0z + dz * FALL;
  const MARK = Math.max(e0, FALL + BACK);
  const mx = b0x + dx * MARK,
    mz = b0z + dz * MARK;
  const faceB = Math.atan2(dx, dz),
    faceP = Math.atan2(-dx, -dz);
  const at = (out, f, s, y) => out.set(kx + dx * f - dz * s, y, kz + dz * f + dx * s);
  const LX = bd.hx + 1.5,
    LZ0 = -(bd.hz + 2.5),
    LZ1 = bd.hz + 4,
    PIER_CLEAR = 2.3;
  const fit = (out) => {
    const ox = out.x - kx,
      oz = out.z - kz;
    let k = 1;
    if (out.x > LX) k = Math.min(k, (LX - kx) / ox);
    else if (out.x < -LX) k = Math.min(k, (-LX - kx) / ox);
    if (out.z > LZ1) k = Math.min(k, (LZ1 - kz) / oz);
    else if (out.z < LZ0) k = Math.min(k, (LZ0 - kz) / oz);
    if (k < 1) {
      k = Math.max(0.4, k);
      out.x = kx + ox * k;
      out.z = kz + oz * k;
    }
    for (const pz of PIER_Z) {
      const px = out.x > 0 ? PIER_X : -PIER_X,
        ex = out.x - px,
        ez = out.z - pz,
        d = Math.hypot(ex, ez);
      if (d >= PIER_CLEAR) continue;
      let ux = ex,
        uz = ez;
      if (d < 0.05 || Math.sign(ux) === Math.sign(px)) {
        ux = -Math.sign(px);
        uz = ez >= 0 ? 0.6 : -0.6;
      }
      const l = Math.hypot(ux, uz);
      out.x = px + (ux / l) * PIER_CLEAR;
      out.z = pz + (uz / l) * PIER_CLEAR;
    }
    return out;
  };
  const stones = ctx.arena.colliders || [];
  const blocked = (f, s) => {
    at(v1, f, s, 0);
    fit(v1);
    const ax = v1.x,
      az = v1.z,
      sx = kx - ax,
      sz = kz - az,
      l2 = sx * sx + sz * sz || 1;
    for (const o of stones) {
      const t = clamp(((o.x - ax) * sx + (o.z - az) * sz) / l2, 0, 1),
        ex = ax + sx * t - o.x,
        ez = az + sz * t - o.z,
        m = (o.r || 1) + 0.9;
      if (ex * ex + ez * ez < m * m) return true;
    }
    return false;
  };
  const sideOf = (f, s) => (!blocked(f, s) ? 1 : !blocked(f, -s) ? -1 : 0);
  const room = (f, s) => {
    at(v1, f, s, 0);
    fit(v1);
    return Math.hypot(v1.x - kx, v1.z - kz);
  };
  at(sw, -FALL - 0.04 * S, 0.368 * S, 0);
  const SWORD_YAW = faceB + Math.PI / 2;
  const SINK = 0.16 * S;
  const stand = () => {
    if (!B.kit.plantSword) return;
    st.plant(sw.x, sw.z, SWORD_YAW);
    const o = B.kit.sword.object;
    o.position.y -= SINK;
    o.updateMatrixWorld(true);
  };

  const end = (skipped) => {
    st.glow(0);
    st.blade(0);
    st.fade(1);
    if (breath) {
      breath.end = breath.time;
      breath = null;
    }
    st.look(B, null, { rate: 7, limitPitch: 40 * DEG });
    stand();
    if (!gone && ctx.vfx && ctx.vfx.dissolve) {
      ctx.vfx.dissolve(B.root, 0.01);
      gone = true;
    }
    st.place(P, mx, mz, faceP);
    st.sheathe(true);
    if (skipped) {
      st.play(P, 'look_around', { fade: 0, at: STAND, speed: 0.1 });
      st.relight(1, 0);
    }
    st.mood(1, 0);
    st.flush();
  };

  const sc = new Scene(ctx, st, rig, {
    name: 'ending',
    duration: c.end,
    end,
    letterbox: [
      [0, 0],
      [0.8, 1, 's'],
      [c.end - 1.6, 1],
      [c.end, 0, 's'],
    ],
  });

  const gold0 = ctx.gfx.mood.gold,
    yaw0 = B.yaw,
    pyaw0 = P.yaw;
  const wrap = (a) => {
    a %= Math.PI * 2;
    return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a;
  };
  sc.at(0, () => {
    st.puppets(true);
    carry();
    st.place(B, s0x, s0z, yaw0);
    st.place(P, p0x, p0z, pyaw0);
    B.root.updateMatrixWorld(true);
    P.root.updateMatrixWorld(true);
    st.look(P, headB(v1), { weight: 0.8, rate: 2.5 });
    st.look(B, null);
  });
  const BACKS = [0.35, 2.95],
    goes = Math.hypot(mx - p0x, mz - p0z);
  if (goes > 0.05) {
    const backK = new Curve([
        [BACKS[0], 0, 's'],
        [BACKS[1], 1, 's'],
      ]),
      turnP = wrap(faceP - pyaw0);
    sc.at(BACKS[0], () => {
      if (st.has(P, '@move')) st.play(P, '@move', { fade: 0.2 });
    });
    sc.during(BACKS[0], BACKS[1], (T, dt, u) => {
      const k = backK.at(T);
      P.pos.x = lerp(p0x, mx, k);
      P.pos.z = lerp(p0z, mz, k);
      P.yaw = pyaw0 + turnP * smoother(u * 2.5);
      if (P.char.move) P.char.move(0, u >= 1 ? 0 : -backK.speed(T) * goes);
    });
    sc.at(BACKS[1], () => st.play(P, 'idle', { fade: 0.35, loop: true }));
  }
  const FALLS = clamp(T3 + 1.2 + say.seconds + 0.1, T3 + 2.6, T4 - 1.3),
    TIP = 1.05;
  const T_KNEES = 2.0,
    stag = new Curve([
      [0, REEL],
      [0.55, 1.1],
      [1.25, 1.9],
      [1.62, 2.3],
      [T_KNEES, KNEES],
    ]);
  const SLIPS = [3.35, 3.8, 4.2],
    OFF = 4.55;
  const FLOORS = [
    [T_KNEES, HANGS, 6.5, 0.45],
    [SLIPS[0], 2.645, 9, 0.5],
    [SLIPS[1], 2.664, 9, 0.5],
    [SLIPS[2], 2.683, 9, 0.5],
    [OFF + 0.05, 2.728, 6, 0.4],
    [6.5, 2.75, 4.5, 0.5],
    [7.55, 2.772, 3.2, 0.7],
    [8.1, 2.746, 6.5, 0.45],
    [T3 + 0.85, 2.742, 3, 0.8],
    [FALLS - 0.3, 2.766, 4, 0.7],
  ];
  const trunk = new DampedSpring(KNEES, 0);
  let die = null,
    floorI = 0,
    passed = false;
  sc.at(0, () => {
    die = st.play(B, DIE, { fade: 0.5, at: REEL, speed: 0 });
  });
  sc.during(0, T_KNEES, (T, dt, u) => {
    if (!die || B.char.clipName !== DIE) return;
    if (u >= 1) {
      trunk.set(die.time, stag.speed(T_KNEES - 0.02));
      return;
    }
    die.timeScale = (stag.at(Math.min(T_KNEES, T + dt)) - die.time) / dt;
  });
  sc.during(T_KNEES, FALLS, (T, dt, u) => {
    if (!die || B.char.clipName !== DIE || u >= 1) return;
    while (floorI < FLOORS.length - 1 && T >= FLOORS[floorI + 1][0]) floorI++;
    const F = FLOORS[floorI];
    trunk.step(F[1] + 0.003 * wobble(T * 0.7, 9), F[2], F[3], dt);
    if (trunk.x > 2.624) passed = true;
    if (passed && trunk.x < 2.6205) trunk.set(2.6205, Math.max(0, trunk.v));
    die.timeScale = (Math.min(trunk.x, 2.772) - die.time) / dt;
  });
  const UPRIGHT = new Curve([
    [0, 0, 's'],
    [0.45, 0.36],
    [1.35, 0.36],
    [1.9, 0, 's'],
  ]);
  sc.during(0, 1.92, (T, dt, u) => st.pose(B, 'idle', 0.5, u >= 1 ? 0 : UPRIGHT.at(T), 'torso'));
  const BREATHES = [0.3, FALLS + 0.45];
  const breathRate = new Curve([
    [0.3, 1.9],
    [3, 1.8],
    [5, 1.5],
    [7, 1.2],
    [9, 1.0],
    [FALLS, 0.8],
  ]);
  const breathDeep = new Curve([
    [0.3, 0, 's'],
    [1.1, 2.6],
    [2.3, 3.6],
    [4.5, 3.4],
    [6, 3.2],
    [8, 3.0],
    [9, 2.4],
    [FALLS - 0.2, 1.6],
    [FALLS + 0.4, 0, 's'],
  ]);
  let breath = null,
    breathAt = 0;
  sc.at(BREATHES[0], () => {
    if (B.char.additive && st.has(B, BREATH)) {
      breath = B.char.additive(BREATH, { weight: 0, at: 0, end: 1e9, fadeIn: 0, fadeOut: 0 });
      if (breath) breath.speed = 0;
    }
  });
  sc.during(BREATHES[0], BREATHES[1], (T, dt, u) => {
    if (!breath) return;
    if (u >= 1) {
      breath.end = breath.time;
      breath = null;
      return;
    }
    breathAt = (breathAt + dt * breathRate.at(T) * (1 + 0.22 * wobble(T * 1.3, 2))) % 4.2667;
    breath.time = breathAt;
    breath.gain = breathDeep.at(T) * (1 + 0.25 * wobble(T * 0.9, 5));
  });
  const HEADS = [
    [0, -24, 3.5, 0.6],
    [T_KNEES + 0.03, -20, 9, 0.35],
    [T_KNEES + 0.6, -10, 3.5, 0.8],
    [SLIPS[0] + 0.08, -14, 8, 0.4],
    [SLIPS[1] + 0.08, -18, 8, 0.4],
    [SLIPS[2] + 0.08, -22, 8, 0.4],
    [OFF + 0.22, -36, 7, 0.38],
    [5.7, -24, 2.6, 0.9],
    [6.6, -37, 6, 0.45],
    [7.15, -30, 2.5, 0.9],
    [7.6, -40, 5, 0.5],
    [8.15, -21, 7, 0.45],
    [8.7, -29, 2, 0.9],
    [T3 + 0.75, -24, 2.4, 0.85],
    [FALLS - 0.45, -40, 5, 0.6],
  ];
  const LOLL = new Curve([
    [0, 0],
    [2.2, 0],
    [3.2, 9],
    [4.4, 7],
    [5.4, -6],
    [8, 4],
    [FALLS, 3],
  ]);
  const headUp = new DampedSpring(),
    headTurn = new DampedSpring(),
    hq = new THREE.Quaternion(),
    htq = new THREE.Quaternion(),
    hf = new THREE.Vector3(),
    gaze = new THREE.Vector3();
  let headI = 0,
    headOn = false,
    chestSlow = 0;
  const facing = (name, out) => {
    const b = B.char.bones[name];
    if (!b || !B.char.tposeWorld) {
      out.x = 0;
      out.y = B.yaw;
      return out;
    }
    b.getWorldQuaternion(hq);
    B.char.tposeWorld(name, htq);
    hq.multiply(htq.invert());
    hf.set(0, 0, 1).applyQuaternion(hq);
    out.x = Math.asin(clamp(hf.y, -1, 1));
    out.y = Math.atan2(hf.x, hf.z);
    return out;
  };
  sc.during(0, FALLS + TIP + 0.4, (T, dt, u) => {
    if (u >= 1) {
      st.look(B, null, { rate: 7, limitPitch: 40 * DEG });
      return;
    }
    if (T >= FALLS && die && die.time >= BREAST) {
      st.look(B, null, { rate: 7 });
      return;
    }
    facing('Spine2', v2);
    const chest = v2.x,
      chestYaw = v2.y;
    if (!headOn) {
      headOn = true;
      facing('Head', v2);
      headUp.set(clamp(v2.x, -0.6, 0.45));
      headTurn.set(clamp(wrap(v2.y - B.yaw), -0.9, 0.9));
      chestSlow = chest;
    }
    let yw;
    if (T < FALLS) {
      while (headI < HEADS.length - 1 && T >= HEADS[headI + 1][0]) headI++;
      const H = HEADS[headI];
      chestSlow += (chest - chestSlow) * (1 - Math.exp(-dt * 1.5));
      headUp.step(H[1] * DEG + 0.45 * (chest - chestSlow), H[2], H[3], dt);
      const toHim = clamp(wrap(Math.atan2(P.pos.x - B.pos.x, P.pos.z - B.pos.z) - B.yaw), -0.9, 0.9);
      headTurn.step(toHim + LOLL.at(T) * DEG, 4, 0.8, dt);
    } else {
      headUp.step(chest - 20 * DEG, 9, 0.7, dt);
      headTurn.step(clamp(wrap(chestYaw - B.yaw), -0.9, 0.9), 4, 0.8, dt);
    }
    const up = clamp(headUp.x, T < FALLS ? -0.69 : -1.45, 0.5);
    yw = B.yaw + headTurn.x;
    headB(gaze);
    gaze.x += Math.sin(yw) * Math.cos(up) * 50;
    gaze.z += Math.cos(yw) * Math.cos(up) * 50;
    gaze.y += Math.sin(up) * 50;
    st.look(B, gaze, { weight: 1, rate: 150, head: 1, chest: 0, limitPitch: T < FALLS ? undefined : 1.48 });
  });
  let dyaw = wrap(faceB - yaw0);
  if (dyaw < -2.5) dyaw += Math.PI * 2;
  const TURN = lerp(1.4, 1.0, ramp(0.5, 1.5, Math.abs(dyaw)));
  const turnK = new Curve([
    [0.05, 0, 's'],
    [TURN, 1, 's'],
  ]);
  let turned = 0;
  sc.during(0.05, TURN, (T) => {
    const w = dyaw * turnK.at(T);
    B.yaw += w - turned;
    turned = w;
  });
  // Offset root motion so the boss ends at F_REST.
  const DRIFT = new Curve([
    [2.76, 0, 's'],
    [2.9, 0.3],
    [3.06, 0.55, 's'],
  ]);
  let unseen = false;
  const body = new THREE.Vector3(b0x, 0, b0z);
  const wasX = b0x - dx * 0.335 - dz * 0.1,
    wasZ = b0z - dz * 0.335 + dx * 0.1;
  sc.during(0, c.end, (_T) => {
    if (unseen) {
      B.pos.x = wasX;
      B.pos.z = wasZ;
      return;
    }
    st.bone(B, 'Hips', v1);
    const ox = v1.x - B.pos.x,
      oz = v1.z - B.pos.z;
    const ct = die && B.char.clipName === DIE ? die.time : REEL;
    st.carried(B, DIE, ct, car);
    const f = F_REST + (car.z - carS.z) * S,
      r = R_REST - (car.x - carS.x) * S + DRIFT.at(ct);
    body.set(b0x + dx * f - dz * r, 0, b0z + dz * f + dx * r);
    B.pos.x = body.x - ox;
    B.pos.z = body.z - oz;
  });
  const KAPPA = 2.4,
    COSH1 = Math.cosh(KAPPA) - 1,
    SETTLE = 0.95;
  let tip0 = SUNK,
    fallen = 0,
    rest = null;
  const tipped = (t) => (t <= TIP ? tip0 + ((BREAST - tip0) * (Math.cosh((KAPPA * t) / TIP) - 1)) / COSH1 : rest.at(t));
  sc.at(FALLS, () => {
    tip0 = die && B.char.clipName === DIE ? clamp(die.time, 2.74, 2.78) : SUNK;
    rest = new Curve([
      [TIP, BREAST],
      [TIP + 0.5, 3.75],
      [TIP + SETTLE, LIES, 's'],
    ]);
  });
  const fdbg = DEBUG ? { sword: 1e9, swordT: 0, swordB: '', him: 1e9, himT: 0, himB: '' } : null;
  sc.during(FALLS, FALLS + TIP + SETTLE, (T, dt, u) => {
    if (!die || !rest || B.char.clipName !== DIE) return;
    if (fdbg) {
      for (const n of [
        'RightLeg',
        'RightFoot',
        'RightToeBase',
        'LeftFoot',
        'LeftToeBase',
        'RightHand',
        'RightForeArm',
        'Hips',
      ]) {
        st.bone(B, n, v1);
        const d = Math.hypot(v1.x - sw.x, v1.z - sw.z);
        if (d < fdbg.sword) {
          fdbg.sword = d;
          fdbg.swordT = T;
          fdbg.swordB = n;
        }
      }
      for (const n of ['LeftHand', 'RightHand', 'HeadTop_End', 'Head']) {
        st.bone(B, n, v1);
        const d = Math.hypot(v1.x - P.pos.x, v1.z - P.pos.z);
        if (d < fdbg.him) {
          fdbg.him = d;
          fdbg.himT = T;
          fdbg.himB = n;
        }
      }
      if (u >= 1)
        console.log(
          `ENDING fall: she falls at ${FALLS.toFixed(2)} s; nearest to the standing sword's middle ${fdbg.sword.toFixed(2)} m (${fdbg.swordB} at ${fdbg.swordT.toFixed(2)} s); nearest to him ${fdbg.him.toFixed(2)} m (${fdbg.himB} at ${fdbg.himT.toFixed(2)} s); he stands ${Math.hypot(P.pos.x - b0x, P.pos.z - b0z).toFixed(2)} m from where she stood`,
        );
    }
    die.timeScale = u >= 1 ? 0 : (tipped(Math.min(TIP + SETTLE, T + dt - FALLS)) - die.time) / dt;
    st.pose(B, DIE, LIES, 0.65 * Math.min(ramp(2.95, 3.15, die.time), 1 - ramp(3.55, 3.82, die.time)), 'legs');
    if (fallen < 1 && die.time >= 3.08) {
      fallen = 1;
      for (const h of ['LeftHand', 'RightHand']) {
        st.bone(B, h, v1);
        st.ripple(v1.x, v1.z, 0.9, 0.5);
      }
    }
    if (fallen < 2 && die.time >= BREAST) {
      fallen = 2;
      st.bone(B, 'Spine2', v1);
      v1.y = 0;
      ctx.bus.emit('land', { who: 'boss', pos: v1, hard: false });
      rig.shake(0.4, 0.7, 7);
    }
  });
  const OVER = 0.85,
    HANG = 1.3,
    DROP = 1.5,
    LAND = 1.97,
    PUT = 5.0;
  const REACH = 0.52 * S;
  const qa = new THREE.Quaternion(),
    qb = new THREE.Quaternion(),
    qm = new THREE.Quaternion(),
    qd = new THREE.Quaternion(),
    qt = new THREE.Quaternion(),
    qi = new THREE.Quaternion();
  const pa = new THREE.Vector3(),
    pb = new THREE.Vector3(),
    ph = new THREE.Vector3(),
    sca = new THREE.Vector3(),
    dir = new THREE.Vector3(),
    outv = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0),
    NOTURN = new THREE.Quaternion();
  const dbg = DEBUG ? { him: 1e9, himT: 0, over: 0, overT: 0, last: 0 } : null;
  let flying = false,
    wet = false,
    grasp = null,
    split = 0.4;
  function carry() {
    const s = B.kit.sword,
      o = s && s.object;
    if (!o || !B.kit.plantSword || B.kit.swordPlanted) return;
    o.updateWorldMatrix(true, false);
    o.matrixWorld.decompose(pa, qa, sca);
    pa.x += s0x - B.pos.x;
    pa.z += s0z - B.pos.z;
    stand();
    pb.copy(o.position);
    qb.copy(o.quaternion);
    o.position.copy(pa);
    o.quaternion.copy(qa);
    o.updateMatrixWorld(true);
    ph.copy(pb);
    ph.y += SINK + 0.22 * S;
    dir.set(0, 1, 0).applyQuaternion(qa).normalize();
    outv.set(-dz, 0.3, dx).normalize();
    qm.setFromUnitVectors(dir, outv).multiply(qa);
    qd.setFromUnitVectors(outv, DOWN).multiply(qm);
    qt.copy(qd).invert().multiply(qb);
    const a1 = dir.angleTo(outv),
      a2 = outv.angleTo(DOWN);
    split = clamp(a1 / (a1 + a2), 0.1, 0.9);
    flying = true;
    wet = false;
    grasp = st.grasp(B);
    grasp.swing = 0.35;
    grasp.weight = 1;
    grasp.grip = 1;
    grasp.point.copy(pa);
    grasp.axis.set(0, -1, 0).applyQuaternion(qa);
  }
  sc.during(0, LAND, (T, dt, u) => {
    if (!flying) return;
    const s = B.kit.sword,
      o = s.object;
    if (u >= 1) {
      o.position.copy(pb);
      o.quaternion.copy(qb);
      o.updateMatrixWorld(true);
      flying = false;
      rig.shake(0.3, 0.45, 9);
      if (dbg)
        console.log(
          `ENDING sword: she turns ${(dyaw * 57.3).toFixed(0)} deg in ${TURN.toFixed(2)} s; moved under the cut ${Math.hypot(s0x - bWas.x, s0z - bWas.z).toFixed(2)} m; he backs to ${MARK.toFixed(1)} m; nearest to him ${dbg.him.toFixed(2)} m at ${dbg.himT.toFixed(2)} s; her arm short by at most ${dbg.over.toFixed(2)} m at ${dbg.overT.toFixed(2)} s while she carried it (the sword waits), by ${(dbg.late || 0).toFixed(2)} m from the hang to the floor (the hand is that far off the grip)`,
        );
      return;
    }
    if (T < DROP) v2.lerpVectors(pa, ph, smoother(T / HANG));
    else v2.lerpVectors(ph, pb, Math.pow((T - DROP) / (LAND - DROP), 1.6));
    st.bone(B, 'RightArm', v3);
    v2.sub(v3);
    const l = v2.length(),
      free = ramp(HANG, DROP, T);
    if (l > REACH) v2.multiplyScalar(lerp(REACH / l, 1, free));
    v2.add(v3);
    if (T >= DROP) {
      const hx = v2.x - v3.x,
        hz = v2.z - v3.z,
        up2 = REACH * REACH - hx * hx - hz * hz;
      if (up2 > 0 && v2.y > v3.y + Math.sqrt(up2)) v2.y = Math.max(pb.y, v3.y + Math.sqrt(up2));
    }
    o.position.copy(v2);
    const off = Math.max(0, v2.distanceTo(v3) - REACH);
    const ko = smoother((T - 0.06) / (OVER - 0.06));
    if (ko < split) o.quaternion.copy(qa).slerp(qm, ko / split);
    else o.quaternion.copy(qm).slerp(qd, (ko - split) / (1 - split));
    o.quaternion.multiply(qi.copy(NOTURN).slerp(qt, ko));
    o.updateMatrixWorld(true);
    if (s.tip) {
      s.tip.getWorldPosition(v2);
      if (!wet && v2.y < 0.12) {
        wet = true;
        rig.shake(0.4, 0.7, 7);
        st.ripple(v2.x, v2.z, 2.2, 1.2);
        ctx.bus.emit('boss-slam', { pos: v1.set(v2.x, 0, v2.z), radius: 1.6, power: 0.55 });
      }
      if (dbg) {
        for (let i = 0; i <= 16; i++) {
          v1.lerpVectors(o.position, v2, i / 16);
          const d = Math.hypot(v1.x - P.pos.x, Math.max(0, v1.y - 1.9), v1.z - P.pos.z);
          if (d < dbg.him) {
            dbg.him = d;
            dbg.himT = T;
          }
        }
        dbg.last = Math.max(0, l - REACH);
        if (dbg.last > dbg.over && T < HANG) {
          dbg.over = dbg.last;
          dbg.overT = T;
        }
        if (T >= HANG) dbg.late = Math.max(dbg.late || 0, off);
      }
    }
  });
  const gp = new THREE.Vector3(),
    ga = new THREE.Vector3(),
    hp = new THREE.Vector3();
  const slip = new Curve([
    [SLIPS[0], 0, 's'],
    [SLIPS[0] + 0.14, 1, 's'],
    [SLIPS[1], 1, 's'],
    [SLIPS[1] + 0.14, 2, 's'],
    [SLIPS[2], 2, 's'],
    [SLIPS[2] + 0.14, 3, 's'],
  ]);
  const ARM_G = 7.4,
    ARM_DRAG = 2.2,
    ARM_STOP = 0.07;
  const armR = new ArmPendulum(),
    armL = new ArmPendulum(),
    ARM_L = 0.7;
  let graspL = null;
  const clipAt = () => (die && B.char.clipName === DIE ? die.time : REEL);
  const hung = () => 1 - ramp(2.84, 3.02, clipAt());
  const hangs = (dg, sh, side, g, dt) => {
    dg.step(ARM_G, ARM_DRAG, ARM_STOP, dt);
    const k = smoother(dg.down),
      out = side * lerp(0.45, 0.58, ramp(2.69, 2.75, clipAt()));
    dg.point(sh, lerp(dg.len, 0.94 * REACH, k), g.point);
    g.point.x += (-dz * out + dx * 0.1) * k;
    g.point.z += (dx * out + dz * 0.1) * k;
    if (g.point.y < 0.3) g.point.y = 0.3;
    return k;
  };
  sc.during(0, FALLS + TIP, (T, dt, u) => {
    if (!grasp) return;
    if (u >= 1) {
      grasp.weight = 0;
      grasp.grip = 0;
      return;
    }
    const o = B.kit.sword.object;
    gp.copy(o.position);
    ga.set(0, -1, 0).applyQuaternion(o.quaternion);
    if (T <= SLIPS[0]) {
      grasp.point.copy(gp);
      grasp.axis.copy(ga);
      grasp.weight = 1;
      grasp.grip = 1;
      return;
    }
    st.bone(B, 'RightArm', v3);
    if (T < OFF) {
      const k = slip.at(T),
        hx = v3.x - gp.x,
        hz = v3.z - gp.z,
        hl = Math.hypot(hx, hz) || 1;
      grasp.point.copy(gp);
      grasp.point.x += (hx / hl) * 0.09 * k;
      grasp.point.z += (hz / hl) * 0.09 * k;
      grasp.point.y -= 0.03 * k;
      grasp.axis.copy(ga);
      grasp.weight = 1;
      grasp.grip = 1 - 0.18 * k;
      return;
    }
    if (!armR.on) armR.release(v3, grasp.point);
    const k = hangs(armR, v3, 1, grasp, dt);
    grasp.axis.set(lerp(ga.x, dx, k), lerp(ga.y, 0, k), lerp(ga.z, dz, k)).normalize();
    grasp.swing = 0.35 * (1 - k);
    grasp.grip = lerp(0.46, 0.3, k);
    grasp.weight = hung();
  });
  sc.during(ARM_L, FALLS + TIP, (T, dt, u) => {
    if (!graspL) {
      graspL = st.grasp(B, 'Left');
      graspL.swing = 0;
      graspL.grip = 0.3;
      graspL.axis.set(dx, 0, dz);
    }
    if (u >= 1) {
      graspL.weight = 0;
      graspL.grip = 0;
      return;
    }
    st.bone(B, 'LeftArm', v3);
    if (!armL.on) {
      st.bone(B, 'LeftHand', hp);
      armL.release(v3, hp, 0.6);
    }
    hangs(armL, v3, -1, graspL, dt);
    graspL.weight = Math.min(
      ramp(ARM_L, ARM_L + 0.4, T) *
        (1 - 0.4 * Math.min(ramp(T_KNEES - 0.3, T_KNEES - 0.05, T), 1 - ramp(T_KNEES, T_KNEES + 0.35, T))),
      hung(),
    );
  });
  sc.during(0.2, 9, (T, dt, u) => {
    st.glow(0.12 + 0.8 * (1 - smoother(u * 2.2)));
    st.blade(0.6 * (1 - u));
  });
  sc.during(0.4, 8.6, (T, dt, u) => {
    const k = smoother(u);
    st.mood(undefined, gold0 * (1 - k));
    st.bossLight(lerp(1, 0.2, k));
  });
  const fore = (f, s, pan) => {
    at(v1, f, s, 0);
    fit(v1);
    at(v2, 0.8, 0.3, 0);
    const ax = v1.x,
      az = v1.z,
      bx = v2.x - ax,
      bz = v2.z - az,
      l0 = Math.hypot(bx, bz) || 1;
    const lx = bx - (bz / l0) * pan,
      lz = bz + (bx / l0) * pan,
      ll = Math.hypot(lx, lz) || 1;
    let worst = 0;
    for (const [qx, qz, lim] of [
      [mx, mz, 30],
      [b0x + dx * 0.4, b0z + dz * 0.4, 22],
    ]) {
      const ox = qx - ax,
        oz = qz - az,
        d = Math.hypot(ox, oz) || 1;
      if (Math.acos(clamp((ox * lx + oz * lz) / (d * ll), -1, 1)) > lim * DEG) worst = 6;
    }
    for (const o of stones) {
      const ox = o.x - ax,
        oz = o.z - az,
        d = Math.hypot(ox, oz);
      if (d > l0 + 4 || d < 0.01) continue;
      const off = Math.acos(clamp((ox * lx + oz * lz) / (d * ll), -1, 1)) - Math.asin(Math.min(1, (o.r || 1) / d));
      if (off < 38 * DEG)
        worst = Math.max(worst, ((10 * (o.h || 2)) / d) * (0.4 + 0.6 * (1 - Math.max(0, off) / (38 * DEG))));
    }
    return worst;
  };
  let fallF = 11.5,
    fallSd = -5.5,
    fallY = 3.6,
    fallPan = 0;
  {
    let best = -1e9;
    for (const [f, sd, pen] of [
      [11.5, -5.5, 0],
      [11.5, 5.5, 0.6],
      [2.5, -12.5, 1.2],
      [2.5, 12.5, 1.8],
      [6, -10.5, 1.5],
      [6, 10.5, 2.1],
      [-1.5, -12.5, 1.9],
      [-1.5, 12.5, 2.5],
    ]) {
      const hid = blocked(f, sd);
      let pan = 0,
        cost = hid ? 100 : 1e9;
      if (!hid)
        for (const p of [0, -1.2, 1.2, -2.4, 2.4]) {
          const c = fore(f, sd, p) + Math.abs(p) * 0.12;
          if (c < cost - 1e-6) {
            cost = c;
            pan = p;
          }
        }
      const score = room(f, sd) - pen - cost;
      if (score > best) {
        best = score;
        fallF = f;
        fallSd = sd;
        fallY = hid ? 3.6 : 0.9;
        fallPan = pan;
      }
    }
  }
  at(v1, fallF, fallSd, 0);
  fit(v1);
  at(v2, 0.8, 0.3, 0);
  const panV = new THREE.Vector3(-(v2.z - v1.z), 0, v2.x - v1.x)
    .setLength(Math.abs(fallPan) || 1e-9)
    .multiplyScalar(Math.sign(fallPan));
  sc.shot('fall', 0, {
    pos: (out, t) => fit(at(out, fallF - t * 0.2 * (fallF > 6 ? 1 : 0), fallSd * (1 - t * 0.016), fallY + t * 0.03)),
    look: [
      [0, at(v1, 0.0, 0.3, 3.8).add(panV).toArray()],
      [3, at(v1, 1.0, 0.3, 2.8).add(panV).toArray()],
    ],
    fov: 46,
    breathe: 0.1,
  });

  const sagS = sideOf(4.6, -2.9) || 1;
  sc.shot('sag', c.tune, {
    pos: (out, t) => at(out, 4.6 - t * 0.12, (-2.9 + t * 0.07) * sagS, 1.25 + t * 0.03),
    look: (out) => {
      headB(out);
      out.lerp(v1.set(sw.x, out.y + 0.9, sw.z), 0.4);
      out.y += 0.05;
    },
    lag: 2.5,
    fov: [
      [0, 40],
      [6, 38],
    ],
    aperture: 0.4,
    focus: headB,
    breathe: 0.07,
  });
  sc.at(PUT, () => st.play(P, 'sheath', { fade: 0.4 }));
  sc.at(PUT + 1.05, () => st.sheathe(true));
  sc.at(PUT + 1.5, () => st.play(P, 'look_around', { fade: 0.8, at: STAND, speed: 0.1 }));

  sc.at(T3 + 1.2, () => st.voice('boss_end', say.text, say.seconds + 0.6));
  const maskAt = new THREE.Vector3(),
    maskAim = new Spring3(),
    maskOut = new THREE.Vector3(),
    maskLie = new THREE.Vector3(),
    maskOn = new Spring3(),
    maskHead = new THREE.Vector3();
  let maskT = -1,
    maskP = -1;
  const follow = (T) => {
    headB(v3);
    if (maskP < 0) maskOn.reset(v3);
    else if (T > maskP) maskOn.step(v3, 1.6, Math.min(0.05, T - maskP));
    maskP = T;
    return maskHead.set(maskOn.x, maskOn.y, maskOn.z);
  };
  sc.shot('mask', T3, {
    pos: (out, t, T) => {
      if (T < FALLS || maskT < 0) {
        out.copy(follow(T));
        const a = (30 - t * 2.2) * DEG,
          r = 4.3;
        out.x += (dx * Math.cos(a) + dz * Math.sin(a)) * r;
        out.z += (dz * Math.cos(a) - dx * Math.sin(a)) * r;
        out.y -= 1.75 - t * 0.05;
        maskAt.copy(out);
        at(maskLie, 2.0, 0.58, 0.45);
        maskOut.copy(out).sub(maskLie).setY(0).normalize();
        return;
      }
      const k = smoother((T - FALLS - 0.4) / 1.1);
      out.copy(maskAt).addScaledVector(maskOut, 1.3 * k);
      out.y += 3.0 * k;
    },
    look: (out, t, T) => {
      if (T < FALLS || maskT < 0) {
        out.copy(maskHead).lerp(headB(v3), 0.35);
        out.x += dx * 0.3;
        out.z += dz * 0.3;
        out.y += 0.02;
        maskAim.reset(out);
        maskT = T;
        return;
      }
      headB(out);
      out.x += dx * 0.3;
      out.z += dz * 0.3;
      out.y += 0.02;
      maskAim.step(out, 4, Math.min(0.05, T - maskT));
      maskT = T;
      out.set(maskAim.x, maskAim.y, maskAim.z).lerp(maskLie, smoother((T - FALLS - 0.62) / 0.5));
    },
    fov: [
      [0, 19],
      [FALLS - T3, 18.3],
      [FALLS - T3 + 0.35, 18.6],
      [T4 - T3, 36],
    ],
    aperture: [
      [0, 0.9],
      [FALLS - T3, 0.9],
      [T4 - T3, 0.3],
    ],
    focus: (out, t, T) => {
      headB(out);
      if (T > FALLS) out.lerp(maskLie, smoother((T - FALLS - 0.62) / 0.5));
    },
    breathe: 0.05,
    sway: 0.004,
  });

  const lies = new THREE.Vector3(),
    lieA = new THREE.Vector3(),
    lieB = new THREE.Vector3();
  const lying = () => {
    st.bone(B, 'Hips', lieA);
    headB(lieB);
    return lies.lerpVectors(lieA, lieB, 0.5);
  };
  sc.at(FALLS + 0.3, () => st.look(P, at(v1, 2.4, 0.6, 0.6), { weight: 0.85, rate: 3 }));
  sc.at(T4, () => {
    st.sound('hymn_cast', B.pos, 0.8);
    if (ctx.vfx && ctx.vfx.dissolve) {
      ctx.vfx.dissolve(B.root, 6);
      gone = true;
    }
  });
  sc.at(T4 + 0.9, () => {
    lying();
    st.look(P, v1.set(lies.x, 9, lies.z), { weight: 0.7, rate: 0.8 });
  });
  sc.during(T4, T4 + 6, (T, dt, u) => {
    st.bossLight(0.2 + 0.5 * Math.sin(Math.min(1, u * 1.4) * Math.PI));
  });
  sc.during(T4 + 0.4, T5 + 1.2, (T, dt, u) => {
    if (!(ctx.vfx && ctx.vfx.motes) || u >= 1) return;
    const n = Math.floor(T * 6);
    if (Math.floor((T - dt) * 6) === n) return;
    if (!unseen) {
      st.bone(B, 'Hips', lieA);
      headB(lieB);
    }
    const top = 1.5 + 9.5 * smoother(u * 1.25),
      y = Math.max(0.4, top - 3 * ((n * 0.618) % 1)),
      r = 0.9,
      along = (n * 0.4142) % 1;
    ctx.vfx.motes(
      v1.set(
        lerp(lieA.x, lieB.x, along) + Math.sin(n * 2.4) * r,
        y,
        lerp(lieA.z, lieB.z, along) + Math.cos(n * 2.4) * r,
      ),
      36,
      0xfff0c8,
    );
  });
  let ux = kx - WINDOW.x,
    uz = kz - WINDOW.z;
  {
    const l = Math.hypot(ux, uz) || 1;
    ux /= l;
    uz /= l;
  }
  let side = dx * -uz + dz * ux > 0 ? -1 : 1,
    lightY = 0.9;
  {
    const seen = (sd) => {
      v1.set(kx + ux * 17 - uz * sd * 4, 0, kz + uz * 17 + ux * sd * 4);
      fit(v1);
      const ax = v1.x,
        az = v1.z,
        sx = kx - ax,
        sz = kz - az,
        l2 = sx * sx + sz * sz || 1;
      for (const o of stones) {
        const t = clamp(((o.x - ax) * sx + (o.z - az) * sz) / l2, 0, 1),
          ex = ax + sx * t - o.x,
          ez = az + sz * t - o.z,
          m = (o.r || 1) + 0.9;
        if (ex * ex + ez * ez < m * m) return false;
      }
      return true;
    };
    if (!seen(side)) {
      if (seen(-side)) side = -side;
      else lightY = 3.4;
    }
  }
  sc.shot('light', T4, {
    pos: (out, t) =>
      fit(out.set(kx + ux * (17 - t * 0.2) - uz * side * 4, lightY, kz + uz * (17 - t * 0.2) + ux * side * 4)),
    look: [
      [0, [kx - ux * 2, 3.7, kz - uz * 2]],
      [7, [kx - ux * 2, 4.2, kz - uz * 2]],
    ],
    fov: 46,
    breathe: 0.06,
  });

  sc.at(T5, () => {
    unseen = true;
    B.pos.x = wasX;
    B.pos.z = wasZ;
    B.pos.y = 4;
    st.play(B, DIE, { fade: 0, at: 2.75, speed: 0 });
    st.relight(1, 5.6);
    st.look(P, null, { rate: 1.5 });
  });
  sc.at(T5 + 0.01, () => {
    B.pos.y = 0;
    st.dirty.add(B);
  });
  sc.during(T5, T5 + 6, (T, dt, u) => st.mood(smoother(u)));
  sc.at(T5 + 2.4, () => st.play(P, 'bow', { fade: 0.5 }));
  sc.at(T5 + 2.4 + 2.5, () => st.play(P, 'look_around', { fade: 0.7, at: STAND, speed: 0.1 }));

  const playPos = new THREE.Vector3(),
    playDir = new THREE.Vector3(),
    playLook = new THREE.Vector3();
  let playFov = 50;
  const hand = (T) => smoother((T - T6 + 0.5) / (c.end - T6 + 0.5));
  const liftS = sideOf(13, 3.6) || 1;
  at(v1, 13, 3.6 * liftS, 1.1);
  fit(v1);
  const L0 = v1.toArray();
  const hiZ = clamp(Math.max(kz, mz) + 12, -4, bd.hz + 2),
    midX = (kx + mx) * 0.5;
  const hiX = hiZ > 12 ? Math.min(midX * 0.3, -1.5) : midX * 0.3;
  const liftP = new Curve([
    [T5, L0],
    [T5 + 3, [lerp(L0[0], hiX, 0.45), 5.5, lerp(L0[2], hiZ, 0.45)], 'c'],
    [T6, [hiX, 11.5, hiZ], 'c'],
    [c.end, [hiX, 12, hiZ + 1]],
  ]);
  const liftL = new Curve([
    [T5, at(v1, 1.5, 0.6 * liftS, 2.2).toArray()],
    [T5 + 3.5, [lerp(kx, mx, 0.5), 0.8, lerp(kz, mz, 0.5)], 'c'],
    [T6, [lerp(kx, mx, 0.8), 0.3, lerp(kz, mz, 0.8)]],
  ]);
  const probe = () => {
    playFov = gameplayCameraPose(ctx, playPos, playDir, st.playMode);
    playLook.copy(playPos).addScaledVector(playDir, 14);
  };
  sc.at(T5, probe);
  sc.during(T6 - 0.5, c.end, probe);
  sc.shot('lift', T5, {
    pos: (out, t) => {
      liftP.into(T5 + t, out);
      out.lerp(playPos, hand(T5 + t));
    },
    look: (out, t) => {
      liftL.into(T5 + t, out);
      out.lerp(playLook, hand(T5 + t));
    },
    fov: { at: (t) => lerp(42, playFov, hand(T5 + t)) },
    breathe: 0.05,
  });

  return sc.ready();
}
