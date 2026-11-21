import * as THREE from 'three';
import { Scene } from './timeline.js';
import { Curve, DEG, clamp, lerp, ramp, smoother } from './curves.js';
import { rackFocus } from './camera-rig.js';
import { cues, line } from './cues.js';

export const STAND_YAW = Math.PI / 2;
export const SWORD_YAW = Math.PI / 2;
const BOSS_WALK = 1.177;
const STAND = 5.5;

export function swordSpot(ctx, out) {
  const k = ctx.arena.spawn.kneel;
  return out.set(k.x + 3.7, 0, k.z + 1.0);
}

const STILL = { clip: 'look_down', from: 3.05 };

export function stageStanding(ctx, stage) {
  const B = ctx.boss,
    k = ctx.arena.spawn.kneel,
    s = swordSpot(ctx, new THREE.Vector3());
  B.puppet = true;
  stage.place(B, k.x, k.z, STAND_YAW);
  const h = stage.play(B, STILL.clip, { fade: 0, at: STILL.from, speed: 0 });
  stage.plant(s.x, s.z, SWORD_YAW);
  stage.glow(0);
  stage.blade(0);
  stage.fade(0);
  return h;
}

const _p0 = new THREE.Vector3(),
  _q0 = new THREE.Quaternion();
export function gameplayCameraPose(ctx, pos, dir, mode = 'free') {
  const pc = ctx.cam,
    cam = ctx.camera,
    f = ctx.player;
  _p0.copy(cam.position);
  _q0.copy(cam.quaternion);
  let ok = false,
    fov = 50;
  if (pc && pc.snapBehind) {
    const was = pc.mode;
    pc.mode = mode;
    pc.snapBehind();
    cam.updateMatrixWorld();
    if (cam.position.distanceToSquared(_p0) > 1e-6 || Math.abs(cam.quaternion.dot(_q0)) < 0.999999) {
      pos.copy(cam.position);
      cam.getWorldDirection(dir);
      ok = true;
    }
    fov = pc.fovNow || pc.fov || 50;
    pc.mode = was;
  }
  if (!ok) {
    const cp = Math.cos(0.2),
      d = 5.2;
    pos.set(f.pos.x - Math.sin(f.yaw) * cp * d, 1.45 + Math.sin(0.2) * d, f.pos.z - Math.cos(f.yaw) * cp * d);
    dir.set(f.pos.x, 1.85, f.pos.z).sub(pos).normalize();
  }
  cam.position.copy(_p0);
  cam.quaternion.copy(_q0);
  cam.updateMatrixWorld();
  return fov;
}

export function buildIntro(ctx, st, rig) {
  const c = cues(ctx, 'intro'),
    A = ctx.arena,
    K = A.spawn.kneel,
    PS = A.spawn.player,
    BS = A.spawn.boss,
    D = A.spawn.door;
  const P = ctx.player,
    B = ctx.boss,
    S = B.char.scale || 3.667,
    say = line(ctx, 'boss_intro');
  const v1 = new THREE.Vector3(),
    v2 = new THREE.Vector3(),
    v3 = new THREE.Vector3(),
    candle = new THREE.Vector3();
  const headB = (out) => st.bone(B, 'Head', out),
    headP = (out) => st.bone(P, 'Head', out),
    chestP = (out) => st.bone(P, 'Spine2', out);
  const gripB = (out) => {
    const o = B.kit.sword.object;
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(out);
  };

  const RING = 8.5;
  // The opening looks into the furnace first; the smith kneels at work by his hammer.
  const forge = ctx.look && ctx.look.furnace,
    MATCH = 3;
  const end = (skipped) => {
    st.relax(P, false, 0);
    st.place(P, PS.x, PS.z, PS.yaw);
    if (skipped) st.play(P, 'idle', { fade: 0, loop: true });
    st.sheathe(false);
    st.take();
    st.place(B, BS.x, BS.z, BS.yaw || 0);
    if (skipped) st.play(B, 'idle', { fade: 0, loop: true });
    st.glow(0);
    st.blade(0);
    st.fade(0);
    if (skipped) {
      st.relight(1, 0);
      st.snuff(K.x, K.z, RING, 0);
    }
    st.mood(st.candlelight(), 0);
    st.flush();
  };

  const sc = new Scene(ctx, st, rig, {
    name: 'intro',
    duration: c.end,
    end,
    letterbox: [
      [0, 1],
      [c.end - 1.6, 1],
      [c.end, 0, 's'],
    ],
    fade: [
      [0, 1],
      [0.35, 1],
      [2.0, 0, 's'],
    ],
    exposure: [
      [0, 1],
      [c.chord - 0.05, 1],
      [c.chord + 0.22, 1.25],
      [c.chord + 1.8, 1, 's'],
    ],
  });

  sc.at(0, () => {
    st.relight(1, 0);
    st.mood(1, 0);
    stageStanding(ctx, st);
    st.place(B, K.x, K.z, 0);
    st.play(B, 'kneel_idle', { fade: 0, loop: true });

    P.puppet = true;
    st.sheathe(true);
    st.play(P, 'look_around', { fade: 0, at: STAND, speed: 0 });
    st.hidePilgrim();
    st.candleNear(1.6, 5.5, candle);
  });

  const flame = (out) => out.set(candle.x, candle.y + 0.03, candle.z);

  const m = forge.mouthAt,
    fire = (out) => out.set(m.x + 0.2, m.sill + 1.5, m.front - 0.8);
  sc.shot('furnace', 0, {
    pos: [
      [0, [m.x + 2.4, m.sill + 0.6, m.front + 4.2]],
      [MATCH, [m.x + 2.0, m.sill + 0.75, m.front + 3.4], 's'],
    ],
    look: [
      [0, [m.x + 0.3, m.sill + 1.1, m.front - 1]],
      [MATCH, [m.x + 0.45, m.sill + 1.55, m.front - 1], 's'],
    ],
    fov: [
      [0, 28],
      [MATCH, 25],
    ],
    aperture: 0.7,
    breathe: 0.05,
    sway: 0.003,
    focus: rackFocus(fire, (out) => out.set(m.x + 1.9, m.sill + 0.8, m.front + 2.9), [
      [0, 0],
      [MATCH - 0.8, 0],
      [MATCH, 1, 's'],
    ]),
  });

  const c0 = 1.2,
    cs = 1.6;
  sc.shot('candle', MATCH, {
    pos: (out, t) => {
      t = c0 + t * cs;
      const k = smoother((t - 1.2) / 4.8);
      out.set(candle.x + 0.24 - t * 0.01, lerp(0.56, 0.2, k), candle.z + lerp(0.5, 0.66, k));
    },
    look: (out, t) => {
      t = c0 + t * cs;
      const k = smoother((t - 1.2) / 4.8);
      out.set(candle.x, candle.y + lerp(-0.02, 0.09, k), candle.z);
    },
    fov: 21,
    aperture: 1,
    breathe: 0.05,
    sway: 0.003,
    focus: rackFocus((out) => out.set(candle.x + 0.2, 0.4, candle.z + 0.45), flame, [
      [0, 0],
      [0.2, 0.05],
      [1.7, 1, 's'],
    ]),
  });

  const naveLen = c.doors - c.nave;
  // Foundry: a low flight over the water toward the furnace, candles sliding past close.
  sc.shot('nave', c.nave, {
    pos: [
      [0, [1.0, 0.5, 18.6]],
      [naveLen * 0.5, [-0.45, 0.38, 9.6], 'c'],
      [naveLen, [0.2, 0.46, 0.8]],
    ],
    look: [
      [0, [0.4, 1.3, -21]],
      [naveLen, [0, 2.3, -21]],
    ],
    fov: [
      [0, 34],
      [naveLen, 30],
    ],
    breathe: 0.03,
    sway: 0.002,
  });

  const WALK = 'walk_in',
    STOPPED = st.mark(P, WALK, 'stopped', 7.9),
    T0 = c.sight + 1.25 - STOPPED;
  const gone = { x: 0, z: 0, yaw: 0 },
    by = { x: 0, z: 0, yaw: 0 },
    carries = st.carried(P, WALK, STOPPED, gone);
  const stopX = D.x - 0.75,
    stopZ = D.z - 4.0;
  const far = Math.hypot(gone.x, gone.z),
    across = stopX - D.x;
  const walkYaw = carries
    ? Math.atan2(across, -Math.sqrt(Math.max(1e-6, far * far - across * across))) - Math.atan2(gone.x, gone.z)
    : Math.PI;
  const wc = Math.cos(walkYaw),
    ws = Math.sin(walkYaw);
  const startX = stopX - (gone.x * wc + gone.z * ws),
    startZ = stopZ - (-gone.x * ws + gone.z * wc);
  const walkAt = (t, out) => {
    st.carried(P, WALK, t, by);
    return out.set(startX + by.x * wc + by.z * ws, 0, startZ - by.x * ws + by.z * wc);
  };
  const passes = (z) => {
    for (let t = 0; t < STOPPED; t += 1 / 60) if (walkAt(t, v3).z <= z) return T0 + t;
    return T0 + STOPPED;
  };
  const LEAVES = D.z + 1.75;
  let walk = null;
  sc.at(T0, () => {
    st.place(P, startX, startZ, walkYaw);
    walk = st.play(P, WALK, { fade: 0, loop: false });
    st.dirty.add(P);
    st.look(P, v1.set(0.4, 2.6, -6), { weight: 0.6, rate: 2 });
    st.key(P, 0);
  });
  sc.during(T0, c.mask + 3.5, () => {
    if (walk && P.char.clipName === WALK) {
      walkAt(walk.time, v3);
      P.pos.x = v3.x;
      P.pos.z = v3.z;
    }
  });
  const lit0 = passes(LEAVES + 0.9),
    lit1 = passes(LEAVES - 0.7);
  sc.during(lit0, lit1, (T, dt, u) => st.key(P, u >= 1 ? undefined : smoother(u)));
  sc.at(passes(LEAVES + 0.2), () => st.look(P, v1.set(-10, 7.5, 9), { weight: 0.6, rate: 1.8, limit: 0.5 }));
  sc.at(passes(LEAVES - 1.3), () => st.look(P, v1.set(0.4, 3, -6), { weight: 0.75, rate: 1.6, limit: 0.7 }));
  sc.at(c.sight + 0.5, () => st.look(P, headB(v1), { weight: 0.85, rate: 2.5 }));

  sc.shot('doors', c.doors, {
    pos: [
      [0, [2.3, 0.3, 14.9]],
      [3, [2.1, 0.32, 14.2]],
    ],
    look: [
      [0, [-1.3, 1.88, 22.2]],
      [3, [-1.1, 1.78, 20.2]],
    ],
    fov: 30,
    aperture: 0.5,
    focus: chestP,
    breathe: 0.07,
  });
  const bz = walkAt(c.doors + 4.4 - T0, v3).z,
    bx = v3.x + 0.25;
  let bootX = bx + 1.95,
    bootY = 0.15;
  sc.shot(
    'boots',
    c.doors + 3,
    {
      pos: (out, t) => out.set(bootX - t * 0.017, bootY + t * 0.003, bz + 0.15 - t * 0.117),
      look: (out) => {
        st.bone(P, 'LeftFoot', v1);
        st.bone(P, 'RightFoot', v2);
        out.lerpVectors(v1, v2, 0.5);
        out.y = 0.13;
        out.z -= 0.6;
      },
      lag: 3.2,
      fov: 32,
      aperture: 0.5,
      focus: (out) => {
        st.bone(P, 'LeftFoot', v1);
        st.bone(P, 'RightFoot', v2);
        out.lerpVectors(v1, v2, 0.5);
      },
      breathe: 0.1,
    },
    {
      enter: () => {
        let best = -1;
        for (const off of [1.95, 1.6, 2.3, 1.3, 2.65]) {
          const x = bx + off,
            mid = bx + off * 0.62;
          const gap = Math.min(
            st.candleGap(x, bz),
            st.candleGap(x, bz - 0.3),
            st.candleGap(mid, bz) * 1.5,
            st.candleGap(mid, bz - 0.5) * 1.5,
          );
          if (gap > best) {
            best = gap;
            bootX = x;
          }
          if (gap > 0.9) break;
        }
        bootY = best < 0.55 ? 0.4 : 0.15;
      },
    },
  );

  sc.shot('sight', c.sight, {
    pos: [
      [0, [1.42, 1.25, D.z + 10.0]],
      [3, [1.08, 1.3, D.z + 9.3]],
    ],
    look: [
      [0, [-3.3, 4.9, K.z]],
      [3, [-3.1, 5.1, K.z]],
    ],
    fov: 26,
    aperture: 0.5,
    breathe: 0.07,
    focus: rackFocus(headP, headB, [
      [0, 0.35],
      [0.5, 0.35],
      [1.8, 1, 's'],
    ]),
  });

  sc.shot('mask', c.mask, {
    pos: (out, t) => {
      const a = lerp(10, 27, t / 3.5) * DEG;
      headB(out);
      out.x += Math.sin(a) * 3.5;
      out.y -= 1.15 - t * 0.03;
      out.z += Math.cos(a) * 3.5;
    },
    look: (out) => {
      headB(out);
      out.x += 0.32;
      out.y += 0.75;
    },
    fov: [
      [0, 19.5],
      [3.5, 18.5],
    ],
    aperture: 1,
    focus: headB,
    breathe: 0.05,
    sway: 0.004,
  });
  sc.at(c.mask + 0.8, () => st.snuff(K.x + 0.6, K.z, 3.4, 1.8));
  sc.at(c.mask + 0.9, () => st.look(B, v1.set(PS.x, 1.6, PS.z + 4), { weight: 0.75, rate: 1.9, limit: 0.75 }));
  sc.at(c.line, () => st.voice('boss_intro', say.text, say.seconds + 0.4));

  const lampT = c.mask + 3.5;
  sc.at(lampT, () => {
    st.place(P, PS.x, PS.z, PS.yaw);
    st.play(P, 'look_around', { fade: 0, at: STAND, speed: 0.12 });
    st.relax(P, false, 0);
    st.look(P, headB(v1), { weight: 0.8, rate: 4 });
    P.puppet = 'root';
  });
  sc.shot('listen', lampT, {
    pos: [
      [0, [PS.x + 0.75, 1.46, PS.z - 2.4]],
      [2.5, [PS.x + 0.62, 1.48, PS.z - 2.2]],
    ],
    look: (out) => {
      headP(out);
      out.x -= 0.1;
      out.y -= 0.1;
    },
    fov: [
      [0, 18],
      [2.5, 17.4],
    ],
    aperture: 0.8,
    focus: (out) => {
      headP(out);
      out.z -= 0.13;
    },
    breathe: 0.06,
    sway: 0.004,
  });
  sc.at(c.rise, () =>
    st.look(P, v1.set(K.x + 0.6264124014506807, 3.4670078837380927, K.z - 0.131809335787068), { weight: 0.8, rate: 4 }),
  );

  const STAMP = 1.367;

  sc.perform(
    B,
    'kneel_up',
    [
      [c.rise, 0],
      [c.chord - STAMP + 0.35, 1.95],
    ],
    { fade: 0.4, root: false },
  );
  sc.perform(
    B,
    'roar',
    [
      [c.chord - STAMP, 0],
      [c.chord + 3.9, STAMP + 3.9],
    ],
    { fade: 0.35, root: false },
  );
  sc.at(c.chord, () => st.step(B, 'l'));
  sc.at(c.chord + 3.9, () => st.play(B, 'idle', { fade: 0.8, loop: true }));

  sc.at(c.chord - 0.45, () =>
    st.look(B, v1.set(K.x + 0.6596189718485985, 10, K.z + 13.853813709388202), { weight: 0.9, rate: 2.4 }),
  );
  sc.during(c.rise + 0.3, c.chord - 0.2, (T, dt, u) => {
    if (u >= 1) return;
    const n = Math.floor(T * 14),
      a = n * 2.399963,
      r = (0.9 + 0.7 * ((n * 0.618) % 1)) * S * 0.3;
    if (Math.floor((T - dt) * 14) !== n) {
      st.bone(B, 'Hips', v3);
      const x = v3.x + Math.cos(a) * r,
        z = v3.z + Math.sin(a) * r;
      st.ripple(x, z, 0.45, 0.3);
      if (ctx.vfx && ctx.vfx.spray)
        ctx.vfx.spray(v1.set(x, 0.3 + 0.5 * ((n * 0.382) % 1), z), v2.set(0, -1, 0), 5, 0.35);
    }
  });
  sc.at(c.chord, () => {
    rig.shake(0.5, 1.6, 3.2);
    st.ripple(B.pos.x, B.pos.z, 3, 2.4);
    st.gust(B.pos.x, B.pos.z, 1);
    if (ctx.vfx && ctx.vfx.motes) ctx.vfx.motes(v1.set(B.pos.x, 5.2, B.pos.z), 40, 0xffe2a0);
  });
  sc.during(c.chord, c.chord + 3, (T, dt, u) =>
    st.glow(u >= 1 ? 0.6 : 0.9 * smoother(u * 4) - 0.3 * smoother((u - 0.4) / 0.6)),
  );
  let windZ = 0;
  sc.at(c.chord + 0.1, () => {
    windZ = K.z + 2;
  });
  sc.during(c.chord + 0.1, c.chord + 4.6, (T, dt, u) => {
    const z = lerp(K.z + 2, PS.z + 3, u);
    if (z - windZ >= 0.9 || u >= 1) {
      windZ = z;
      st.wake(-9.5, z, 9.5, z, 0.42 * (1 - 0.5 * u));
    }
  });

  const tipB = (out) => {
    const o = B.kit.sword.tip;
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(out);
  };
  const maskB = (out) => {
    headB(out);
    out.y += 0.45;
    return out;
  };
  // The smith's reveal: on the glowing hammer head, then up to his mask as he rises into the roar.
  sc.during(c.rise - 0.1, c.chord + 3, (T, dt, u) =>
    st.blade(u >= 1 ? 0 : 0.85 * ramp(c.rise - 0.1, c.rise + 0.5, T) * (1 - ramp(c.chord + 2.4, c.chord + 3, T))),
  );
  const tilt = (t) => smoother((t - 0.7) / 2.5);
  sc.shot('rise', c.rise, {
    pos: (out, t) => {
      tipB(out);
      out.x -= 0.9 + t * 0.06;
      out.y = 0.32 + 0.1 * t;
      out.z += 3.6 - t * 0.08;
    },
    look: (out, t) => {
      tipB(v1);
      v1.y += 0.6;
      maskB(out);
      out.y -= 1.1;
      out.lerp(v1, 1 - tilt(t));
    },
    fov: { at: (t) => lerp(30, 38, tilt(t)) },
    aperture: 0.8,
    breathe: 0.05,
    sway: 0.003,
    focus: rackFocus(tipB, maskB, [
      [0, 0],
      [0.7, 0],
      [3.2, 1, 's'],
    ]),
  });
  sc.shot('gaze', c.chord + 3, {
    pos: [
      [0, [-1.15, 1.05, K.z + 9.6]],
      [3, [-0.7, 1.4, K.z + 7.9]],
    ],
    look: (out) => {
      headB(out);
      out.y -= 0.7;
    },
    lag: 4,
    fov: 36,
    aperture: 0.3,
    focus: headB,
    breathe: 0.07,
  });
  sc.at(c.chord + 2.3, () => st.look(B, v1.set(PS.x, 1.6, PS.z), { weight: 0.85, rate: 1.5, limit: 1.0 }));

  sc.at(c.draw - 0.2, () => {
    st.play(P, 'look_around', { fade: 0, at: STAND, speed: 0.1 });
    st.look(P, headB(v1), { weight: 0.9, rate: 3 });
  });
  const HILT = c.draw + 1.5;
  sc.perform(
    P,
    'draw_sword',
    [
      [c.draw + 0.5, 0],
      [HILT - 0.12, st.mark(P, 'draw_sword', 'hilt', 0.45) + 0.01],
      [HILT, 0.49],
    ],
    { fade: 0.3, root: true },
  );
  sc.shot('hilt', c.draw, {
    pos: [
      [0, [PS.x + 1.05, 1.0, PS.z - 2.3]],
      [1.5, [PS.x + 0.95, 1.04, PS.z - 2.15]],
    ],
    look: (out) => {
      st.bone(P, 'Spine', out);
      out.y += 0.12;
    },
    lag: 5,
    fov: 32,
    aperture: 0.5,
    focus: (out) => st.bone(P, 'Spine1', out),
    depth: 0.7,
    breathe: 0.09,
  });
  const GRIP = c.draw + 1.0,
    FREE = HILT + 0.4;
  sc.shot('grip', GRIP, {
    pos: [
      [0, [PS.x + 0.9, 1.56, PS.z - 0.59]],
      [FREE - GRIP, [PS.x + 0.95, 1.6, PS.z - 0.61]],
    ],
    look: (out, t, T) => {
      out.set(PS.x - 0.16, 1.03, PS.z - 0.2);
      st.bone(P, 'RightHand', v1);
      out.lerp(v1, 0.2 * ramp(HILT + 0.02, HILT + 0.3, T));
    },
    lag: 9,
    fov: 28,
    aperture: 0.1,
    breathe: 0.08,
  });
  sc.at(HILT, () => {
    st.sheathe(false);
    st.sound('sword_draw', P.pos);
  });
  sc.perform(
    P,
    'draw_sword2',
    [
      [HILT, 0],
      [HILT + 0.95, 0.75],
    ],
    { fade: 0.05, root: true },
  );
  sc.at(HILT + 0.95, () => st.play(P, 'idle', { fade: 0.5, loop: true }));
  sc.shot('draw', FREE, {
    pos: [
      [0, [PS.x + 2.5, 1.76, PS.z - 0.56]],
      [1.1, [PS.x + 2.64, 1.88, PS.z - 0.46]],
    ],
    look: [
      [0, [PS.x, 1.24, PS.z - 0.21]],
      [0.6, [PS.x, 1.37, PS.z - 0.18], 's'],
    ],
    fov: 30,
    aperture: 0.4,
    focus: chestP,
    depth: 0.8,
    breathe: 0.1,
  });
  const REGARD = c.draw + 3;
  sc.at(c.draw + 0.3, () => st.play(B, 'look_down', { fade: 1.4, at: 0.02, speed: 0 }));
  sc.at(REGARD + 0.9, () => {
    st.look(B, gripB(v1), { weight: 0.9, rate: 1.6, limit: 1.1 });
  });
  const regardTurn = new Curve([
    [REGARD + 1.0, 0, 's'],
    [c.sweep - 0.1, 0.62, 's'],
  ]);
  let regarded = 0;
  sc.during(REGARD + 1.0, c.sweep - 0.1, (T) => {
    const y = regardTurn.at(T);
    B.yaw += y - regarded;
    regarded = y;
  });
  sc.shot('regard', REGARD, {
    pos: (out, t) => {
      const a = (33 + t * 5) * DEG;
      headB(out);
      out.x += Math.sin(a) * 5.0;
      out.y -= 2.0;
      out.z += Math.cos(a) * 5.0;
    },
    look: (out) => {
      headB(out);
      out.y += 0.45;
    },
    lag: 4,
    fov: 22,
    aperture: 0.7,
    focus: headB,
    breathe: 0.06,
  });

  const TAKE_YAW = 0.95;
  const GRASP = 1.4;
  const REACH = 0.045 * S;
  const hold = new THREE.Vector3(),
    takeAt = new THREE.Vector3();
  let grasp = null;
  sc.at(c.sweep, () => {
    st.place(B, K.x, K.z, TAKE_YAW);
    st.play(B, 'pull_lever', { fade: 0, at: GRASP, speed: 0 });
    st.dirty.add(B);
    st.flush();
    st.bone(B, 'RightArm', v1);
    st.bone(B, 'RightHand', v2);
    gripB(hold);
    v2.sub(v1).setY(0);
    const reach = v2.length() + REACH;
    v2.normalize();
    takeAt.set(K.x + hold.x - v2.x * reach - v1.x, 0, K.z + hold.z - v2.z * reach - v1.z);
    st.place(B, takeAt.x, takeAt.z, TAKE_YAW);
    st.dirty.add(B);
    grasp = st.grasp(B);
    grasp.point.copy(hold);
    grasp.axis.set(0, 1, 0);
    grasp.weight = 0;
    grasp.grip = 0;
    grasp.swing = 0.35;
    st.look(B, hold, { weight: 0.9, rate: 6, limit: 1.1 });
    B.puppet = true;
  });
  const TAKE = c.sweep + 1.4;
  sc.perform(
    B,
    'pull_lever',
    [
      [c.sweep, 0.72],
      [c.sweep + 0.8, GRASP],
      [TAKE, GRASP + 0.2],
    ],
    { fade: 0, root: false },
  );
  // The final span callback runs after events at the same time.
  sc.during(c.sweep, TAKE, (T, dt, u) => {
    if (!grasp) return;
    if (u >= 1) return;
    grasp.weight = ramp(c.sweep + 0.05, c.sweep + 0.72, T);
    grasp.grip = ramp(c.sweep + 0.66, c.sweep + 1.0, T);
  });
  // The hand lets the planted haft go over a moment, not in one frame.
  const LET = 0.5;
  sc.during(TAKE, TAKE + LET, (T, dt, u) => {
    if (grasp) {
      grasp.weight = u >= 1 ? 0 : 1 - smoother(u);
      if (u >= 1) grasp.grip = 0;
    }
  });
  sc.shot('hand', c.sweep, {
    pos: (out, t) => {
      headB(v2);
      out.copy(hold).sub(v2).setY(0).normalize();
      const sx = -out.z,
        sz2 = out.x;
      out.multiplyScalar(2.5 - t * 0.12).add(hold);
      out.x += sx * 0.9;
      out.z += sz2 * 0.9;
      out.y = hold.y - 1.55;
    },
    look: (out) => {
      headB(v2);
      out.copy(hold).lerp(v2, 0.3);
      out.y += 0.05;
    },
    fov: 31,
    aperture: 0.5,
    focus: (out) => out.copy(hold),
    breathe: 0.06,
  });
  sc.at(TAKE, () => {
    st.look(B, v1.set(PS.x, 1.6, PS.z), { weight: 0.6, rate: 3 });
    st.place(B, takeAt.x, takeAt.z, TAKE_YAW);
    st.take();
    st.blade(0.3);
    st.ripple(hold.x, hold.z, 1.6, 0.8);
  });
  sc.perform(
    B,
    'slash_low',
    [
      [TAKE, 0.03],
      [TAKE + 0.7, 0.27],
      [c.fall - 0.5, 0.34],
      [c.fall, 0.7],
      [c.fall + 0.66, 1.13],
      [c.fall + 1.7, 1.45],
      [c.name - 0.15, 1.8],
    ],
    { fade: 0.3, root: true },
  );
  sc.at(c.name - 0.15, () => st.play(B, 'idle', { fade: 0.5, loop: true }));
  const WA = TAKE_YAW - 0.35;
  sc.shot('windup', TAKE, {
    pos: (out, t) => {
      const d = 7.8 - t * 0.35;
      out.set(takeAt.x + Math.sin(WA) * d, 1.1 + t * 0.12, takeAt.z + Math.cos(WA) * d);
    },
    look: (out) => {
      st.bone(B, 'RightHand', v1);
      headB(out);
      const y = out.y - 0.5;
      out.lerp(v1, 0.3);
      out.y = y;
    },
    lag: 4,
    fov: 40,
    breathe: 0.08,
  });
  const turn = new Curve([
    [c.fall, TAKE_YAW, 's'],
    [c.fall + 1.35, 0, 's'],
  ]);
  let lastYaw = TAKE_YAW;
  sc.at(c.fall - 0.25, () => st.blade(1));
  sc.at(c.fall, () => {
    lastYaw = TAKE_YAW;
    ctx.bus.emit('swing', { who: 'boss', heavy: true, weapon: B.weapon });
  });
  sc.during(c.fall, c.fall + 1.35, (T) => {
    const y = turn.at(T);
    B.yaw += y - lastYaw;
    lastYaw = y;
  });
  sc.at(c.fall + 0.3, () => {
    st.snuff(K.x, K.z, RING, 2.3);
    rig.shake(0.35, 0.8, 7);
    st.gust(K.x, K.z, 1);
    if (ctx.vfx && ctx.vfx.splashRing) ctx.vfx.splashRing(v1.set(B.pos.x, 0.07, B.pos.z), 5.5, 1);
    else st.ripple(B.pos.x, B.pos.z, 4, 3);
  });
  sc.during(c.fall + 0.3, c.name + 1.5, (T, dt, u) => st.blade(u >= 1 ? 0 : 1 - smoother(u)));
  const RING_CUT = c.fall - 0.27;
  sc.shot('ring', RING_CUT, {
    pos: [
      [0, [4.6, 8.1, K.z + 15.5]],
      [0.27, [4.5, 8.4, K.z + 15.2]],
      [3.27, [2.8, 12.2, K.z + 11.4]],
    ],
    look: (out) => {
      st.bone(B, 'Hips', out);
      out.y = 2.7;
    },
    lag: 3,
    fov: 40,
    breathe: 0.05,
  });

  const playPos = new THREE.Vector3(),
    playDir = new THREE.Vector3(),
    playLook = new THREE.Vector3();
  let playFov = 50;
  const wideP = new Curve([
      [0, [5.3, 0.85, 19.6]],
      [6, [4.6, 0.95, 19.2]],
    ]),
    wideL = new Curve([
      [0, [-1.9, 3.3, 0.5]],
      [6, [-1.5, 3.4, 0.2]],
    ]);
  const hand = (t) => smoother((t - 1.9) / (c.end - c.name - 1.9));
  const probe = () => {
    playFov = gameplayCameraPose(ctx, playPos, playDir, st.playMode);
    playLook.copy(playPos).addScaledVector(playDir, 24);
  };
  sc.at(c.name, () => {
    st.place(P, PS.x, PS.z, PS.yaw);
    st.look(P, null);
    st.look(B, null, { rate: 2 });
    probe();
  });
  sc.during(c.name + 1.5, c.end, probe);
  // Foundry: one bar looking up at him with the furnace behind, then the usual hand-over.
  const HERO = 3;

  sc.shot('hero', c.name, {
    pos: (out, t) => out.set(-2.3 + t * 0.08, 0.28 + t * 0.02, 1.4 - t * 0.27),
    look: (out, t) => {
      headB(out);
      out.y -= 1.3 - 0.45 * t;
    },
    lag: 1.5,
    fov: [
      [0, 36],
      [HERO, 32],
    ],
    aperture: 0.5,
    focus: headB,
    breathe: 0.05,
    sway: 0.003,
  });
  sc.during(c.name, c.name + HERO, (T, dt) => {
    const n = Math.floor(T * 30);
    if (Math.floor((T - dt) * 30) === n || !ctx.vfx || !ctx.vfx._ember) return;
    const a = (n * 0.618) % 1,
      b = (n * 0.382) % 1,
      z = -2.5 - 5 * b;
    ctx.vfx._ember(
      lerp(-4, 3, a),
      3 + 3.5 * ((n * 0.7548) % 1),
      z,
      0.15 * (a - 0.5),
      -0.25,
      0.1,
      3.2,
      1.5,
      0.45,
      2.6,
      1.8,
    );
  });

  sc.shot('name', c.name + HERO, {
    pos: (out, t) => {
      t += HERO;
      wideP.into(t, out);
      out.lerp(playPos, hand(t));
    },
    look: (out, t) => {
      t += HERO;
      wideL.into(t, out);
      out.lerp(playLook, hand(t));
    },
    fov: { at: (t) => lerp(38, playFov, hand(t + HERO)) },
    breathe: 0.06,
  });
  sc.at(c.name + 0.5, () => st.nameCard(ctx.boss.name, 4.4));
  let stride = null,
    fromX = 0,
    fromZ = 0;
  const adv = new Curve([
    [c.name + 1.2, 0, 's'],
    [c.name + 3.4, 1, 's'],
  ]);
  sc.at(c.name + 1.1, () => {
    B.puppet = true;
    fromX = B.pos.x;
    fromZ = B.pos.z;
    stride = st.play(B, 'walk_f', { fade: 0.45, at: 0.6, speed: 0.6, loop: true });
  });
  sc.during(c.name + 1.2, c.name + 3.4, (T, _dt, _u) => {
    const k = adv.at(T);
    B.pos.x = lerp(fromX, BS.x, k);
    B.pos.z = lerp(fromZ, BS.z, k);
    if (stride && B.char.clipName === 'walk_f')
      stride.timeScale = clamp(
        (Math.abs(adv.speed(T)) * Math.hypot(BS.x - fromX, BS.z - fromZ)) / (BOSS_WALK * S),
        0.25,
        1.2,
      );
  });
  sc.at(c.name + 3.0, () => st.play(B, 'idle', { fade: 0.6, loop: true }));
  sc.during(c.name, c.end - 0.3, (T, dt, u) => {
    st.glow(0.6 * (1 - smoother(u)));
  });
  sc.during(c.fall, c.end, () => st.mood(st.candlelight()));

  return sc.ready();
}
