import * as THREE from 'three';
import { Scene } from './timeline.js';
import { Curve, clamp, lerp, smoother } from './curves.js';
import { line } from './cues.js';
import { gameplayCameraPose } from './intro.js';
import { RESCUE_LINES } from '../core/constants.js';

const KEEP = 7.5;
const G = 9.8;
export const DROP = { drop: 1.2, from: 9, vt: 9 };
const UP = { back: { clip: 'getup', at: 4.25, speed: 1.75 }, face: { clip: 'getup_front', at: 1.95, speed: 1.6 } };
export const RESCUE_GRACE = 1.5;

export function buildRescue(ctx, st, rig) {
  const P = ctx.player,
    B = ctx.boss,
    props = ctx.cine.props,
    bnd = ctx.arena.bounds;
  const n = ctx.game.flow.rescues || 0,
    name = RESCUE_LINES[n % RESCUE_LINES.length],
    say = line(ctx, name);
  const v1 = new THREE.Vector3(),
    chest = new THREE.Vector3(),
    head = new THREE.Vector3(),
    hips = new THREE.Vector3(),
    drop = new THREE.Vector3();
  const lying = /fwd/.test(P.char.clipName || '') ? 'face' : 'back';

  let fx = 0,
    fz = 1,
    sx = 1,
    sz = 0,
    sideSign = 0,
    land = 0.3;
  const ray = new THREE.Raycaster(),
    hits = [];
  const surface = (x, z, y0) => {
    ray.set(v1.set(x, y0 + 1.5, z), new THREE.Vector3(0, -1, 0));
    ray.far = 2.5;
    hits.length = 0;
    P.root.updateMatrixWorld(true);
    ray.intersectObject(P.root, true, hits);
    const h = hits.find((q) => q.object.visible && q.object.isMesh && !q.object.userData.fxTwin);
    return h ? h.point.y : y0 + 0.13;
  };
  const measure = () => {
    st.bone(P, 'Spine2', chest);
    st.bone(P, 'Head', head);
    st.bone(P, 'Hips', hips);
    const fx0 = hips.x - head.x,
      fz0 = hips.z - head.z,
      fl = Math.hypot(fx0, fz0) || 1;
    fx = fx0 / fl;
    fz = fz0 / fl;
    sx = -fz;
    sz = fx;
    if (!sideSign) sideSign = sx * -chest.x + sz * -chest.z < 0 ? -1 : 1;
    sx *= sideSign;
    sz *= sideSign;
    land = surface(chest.x, chest.z, chest.y) + 0.004;
  };
  measure();
  const at = (out, along, side, y) => out.set(chest.x + fx * along + sx * side, y, chest.z + fz * along + sz * side);
  const fallen = (t) => ((DROP.vt * DROP.vt) / G) * Math.log(Math.cosh((G * t) / DROP.vt));
  const fallT = (() => {
    const h = DROP.from - 0.35;
    let lo = 0,
      hi = 6;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      if (fallen(m) < h) lo = m;
      else hi = m;
    }
    return hi;
  })();
  const LAND = DROP.drop + fallT;
  let top = DROP.from;
  const offeringAt = (out, T) => out.set(chest.x, Math.max(land, top - fallen(Math.max(0, T - DROP.drop))), chest.z);

  const room = (() => {
    let dx = B.pos.x - P.pos.x,
      dz = B.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    if (d >= KEEP) return null;
    if (d > 0.2) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = P.pos.z > 0 ? -1 : 1;
    }
    const lim = (x, z) => [clamp(x, -(bnd.hx - 3), bnd.hx - 3), clamp(z, -(bnd.hz - 4.5), bnd.hz - 4.5)];
    let [x, z] = lim(P.pos.x + dx * KEEP, P.pos.z + dz * KEEP);
    if (Math.hypot(x - P.pos.x, z - P.pos.z) < KEEP * 0.85) {
      const w = P.pos.z > 0 ? -1 : 1;
      [x, z] = lim(P.pos.x, P.pos.z + w * KEEP);
    }
    return { x, z, yaw: Math.atan2(P.pos.x - x, P.pos.z - z) };
  })();

  const dim = (k) => {
    const L = ctx.gfx.lights;
    if (L) L.dim = k;
  };
  const key = ctx.gfx.materials && ctx.gfx.materials.key,
    keyRest = key ? key.power : 1;
  const end = (skipped) => {
    props.hide();
    dim(1);
    if (key) key.power = keyRest;
    if (P.alive === false || P.hp < P.hpMax) P.revive();
    if (skipped) {
      st.play(P, 'idle', { fade: 0, loop: true });
      st.play(B, 'idle', { fade: 0, loop: true });
    }
    P.afterPuppet = RESCUE_GRACE;
    ctx.game.flow.rescues = n + 1;
  };

  const level = new Curve([
    [0, 0],
    [0.11, 0],
    [0.12, 1],
    [0.15, 0.55],
    [0.18, 1],
    [3.79, 1],
    [3.8, 0.5],
    [3.84, 0.15],
    [3.92, 0],
  ]);
  const sc = new Scene(ctx, st, rig, {
    name: 'rescue',
    duration: 4.6,
    end,
    letterbox: [
      [0, 1],
      [4.0, 1],
      [4.6, 0, 's'],
    ],
    exposure: [
      [0, 0.55],
      [LAND + 0.31, 0.55],
      [LAND + 0.36, 0.72],
      [LAND + 0.9, 0.55, 's'],
      [3.8, 0.55],
      [4.3, 1, 's'],
    ],
  });

  sc.at(0, () => {
    P.puppet = 'root';
    if (room) st.place(B, room.x, room.z, room.yaw);
    st.play(B, 'idle', { fade: 0.25, loop: true });
    st.look(B, chest, { weight: 0.6, rate: 2 });
    dim(0.2);
    if (key) key.power = keyRest * 0.25;
    ctx.gfx.post.hurt = 0;
    if (ctx.water && ctx.water.calm) ctx.water.calm();
    if (ctx.vfx && ctx.vfx.reset) ctx.vfx.reset();
    props.show(false);
    if (ctx.audio && ctx.audio.duck) ctx.audio.duck(0.75, 4.0);
  });
  const sideV = new THREE.Vector3();
  sc.during(0, 4.0, (T) => {
    const k = level.at(T);
    if (T < DROP.drop) st.bone(P, 'Spine2', v1);
    else v1.copy(chest);
    props.spot(v1.x, v1.z, k, sideV.set(sx, 0, sz));
  });
  sc.at(0.08, () => st.sound('spot_on', v1.set(chest.x, 4, chest.z)));
  sc.at(0.4, () => st.voice(name, say.text, say.seconds + 0.5, 'stranger'));
  sc.at(0.42, () => {
    if (ctx.audio && ctx.audio.duck) ctx.audio.duck(0.75, 3.5);
  });
  const live = new THREE.Vector3();
  sc.shot('spot', 0, {
    pos: (out, t) => {
      at(out, 3.3 + t * 0.1, 1.5, 6.2 - t * 0.35);
    },
    look: (out, _t) => {
      st.bone(P, 'Spine2', live);
      out.set(live.x, live.y + 0.1, live.z);
    },
    lag: 4,
    fov: [
      [0, 36],
      [1.15, 34],
    ],
    breathe: 0.03,
    sway: 0.004,
  });

  sc.at(DROP.drop, () => {
    measure();
    top = land + fallen(fallT);
    props.show(true);
    offeringAt(drop, DROP.drop);
    props.offering.position.copy(drop);
  });
  sc.during(DROP.drop, LAND, (T, dt, u) => {
    offeringAt(drop, T);
    props.offering.position.copy(drop);
    const k = T - DROP.drop;
    props.offering.rotation.set(0.35 * Math.sin(k * 2.1), 0.6 + k * 1.3, 0.25 * Math.sin(k * 1.7 + 1));
    if (u >= 1) props.offering.rotation.set(0, 0.6 + fallT * 1.3, 0);
  });
  const melt = !!(ctx.look && ctx.look.recast && ctx.look.recast.drop),
    calm = !!(ctx.ui && ctx.ui.settings && ctx.ui.settings.reducedMotion);
  const upLook = new THREE.Vector3();
  if (melt) {
    const tilt = (T) => smoother((T - 1.4) / 0.45);
    sc.shot('vault', 1.15, {
      pos: (out, t) => {
        at(out, -0.35 - t * 0.1, 1.9, land + 0.45 + t * 0.04);
      },
      look: (out, t, T) => {
        offeringAt(upLook, Math.max(T, DROP.drop));
        out.set(chest.x, chest.y + 0.05, chest.z).lerp(upLook, tilt(T));
      },
      lag: 9,
      fov: [
        [0, 38],
        [0.25, 38],
        [0.75, 50],
        [1.0, 47, 's'],
      ],
      focus: (out, t, T) => (T < 1.4 ? out.copy(chest) : offeringAt(out, Math.max(T, DROP.drop))),
      aperture: 0.15,
      breathe: 0.05,
    });
    const soft = (x, w) => w * Math.log1p(Math.exp(x / w)),
      floor = () => land + 2.3;
    sc.shot('down', 2.0, {
      pos: (out, t, T) => {
        offeringAt(upLook, T);
        at(out, -0.3, 0.42, calm ? floor() + 0.8 : floor() + soft(upLook.y + 1.2 - floor(), 0.45));
      },
      look: (out) => {
        out.set(chest.x + sx * 0.05, land, chest.z + sz * 0.05);
      },
      lag: 0,
      fov: 44,
      focus: (out, t, T) => offeringAt(out, T),
      aperture: 0.12,
      breathe: 0.02,
      sway: 0.002,
    });
    const back = (T) => smoother((T - GO) / 0.9),
      hitLook = new THREE.Vector3();
    sc.shot('impact', 2.6, {
      pos: (out, t, T) => {
        const k = back(T);
        at(out, 0.25 - k * 0.3, 2.5 + k * 0.6, land + 0.4 + k * 0.5);
      },
      look: (out, t, T) => {
        st.bone(P, 'Spine2', hitLook);
        out
          .set(chest.x, lerp(land + 0.3, land + 0.05, smoother((T - 2.6) / Math.max(0.05, LAND - 2.6))), chest.z)
          .lerp(hitLook.setY(hitLook.y + 0.1), back(T));
      },
      lag: 10,
      fov: { at: (t) => lerp(34, 38, back(t + 2.6)) },
      focus: (out) => out.copy(chest),
      aperture: 0.3,
      breathe: 0.04,
    });
  } else
    sc.shot('up', 1.15, {
      pos: (out, t) => {
        at(out, -0.9, 2.5, 0.32 + t * 0.03);
      },
      look: (out, t, T) => {
        offeringAt(upLook, Math.max(T, DROP.drop));
        if (T < DROP.drop) upLook.y = DROP.from + 1.2;
        out.set(chest.x + sx * 0.1, upLook.y - 0.35, chest.z + sz * 0.1);
      },
      lag: 7,
      fov: [
        [0, 46],
        [1.2, 42],
      ],
      focus: (out, t, T) => offeringAt(out, Math.max(T, DROP.drop)),
      aperture: 0.2,
      breathe: 0.06,
    });

  sc.at(LAND, () => {
    st.ripple(chest.x, chest.z, 0.6, 0.4);
    rig.shake(0.12, 0.25, 9);
  });
  const GO = LAND + 0.32,
    at3 = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  sc.at(GO, () => {
    P.revive();
    const fx = ctx.vfx;
    at3.set(chest.x, land + 0.06, chest.z);
    if (fx) {
      if (fx.hitFlash) fx.hitFlash(P, 0.8, 0xffd48a, 1.1);
      if (fx.sparks) fx.sparks(at3, up, 48, 1.35);
      if (fx.embers) fx.embers(at3, 36);
      if (fx.motes) {
        fx.motes(v1.copy(at3).setY(at3.y + 0.2), 70, 0xffd98a);
        fx.motes(v1.copy(at3).setY(at3.y + 0.45), 30, 0xffc46a);
      }
      if (fx.shock) fx.shock(v1.set(chest.x, 0, chest.z), 2.7, 0xc49a5c, 0.85, 0.3, 0);
    }
    st.ripple(chest.x, chest.z, 1.4, 0.7);
    rig.shake(0.22, 0.45, 11);
    st.sound('rescue_heal', v1.copy(at3));
  });
  sc.during(GO, GO + 0.28, (T, dt, u) => {
    props.burst(u);
    props.offering.position.y = land - props.height * 0.55 * u * u;
  });
  const hip = new THREE.Vector3(),
    mote = new THREE.Vector3();
  let wind = 0;
  sc.during(GO + 0.1, GO + 1.35, (T, dt, u) => {
    const fx = ctx.vfx;
    if (u >= 1 || !fx || !fx.motes || wind++ % 2) return;
    st.bone(P, 'Hips', hip);
    const a = (T - GO) * 10,
      h = 0.08 + u * 2.0,
      r = 0.6 - 0.3 * u;
    for (const k of [0, Math.PI])
      fx.motes(mote.set(hip.x + Math.cos(a + k) * r, h, hip.z + Math.sin(a + k) * r), 1, k ? 0xffe8b8 : 0xffd27a);
  });
  sc.at(GO + 0.08, () => {
    const U = UP[lying];
    st.play(P, U.clip, { fade: 0.3, at: U.at, speed: U.speed });
  });
  const catchLook = new THREE.Vector3();
  if (!melt)
    sc.shot('catch', 2.5, {
      pos: (out, t) => {
        at(out, 0.2, 1.85 - t * 0.08, 0.62 + t * 0.02);
      },
      look: (out, t, T) => {
        offeringAt(catchLook, T);
        const k = smoother((T - 2.5) / Math.max(0.1, LAND - 2.5));
        out.set(chest.x, lerp(Math.min(catchLook.y - 0.15, chest.y + 1.4), land + 0.1, k), chest.z);
        out.x += sx * 0.05;
        out.z += sz * 0.05;
      },
      lag: 16,
      fov: 31,
      focus: (out) => out.copy(chest),
      aperture: 0.3,
      breathe: 0.04,
    });

  sc.at(3.62, () => st.sound('spot_off', v1.set(chest.x, 4, chest.z)));
  sc.during(3.8, 4.3, (T, dt, u) => {
    dim(lerp(0.2, 1, smoother(u)));
    if (key) key.power = keyRest * lerp(0.25, 1, smoother(u));
  });
  const playPos = new THREE.Vector3(),
    playDir = new THREE.Vector3(),
    playLook = new THREE.Vector3();
  let playFov = 50;
  const probe = () => {
    playFov = gameplayCameraPose(ctx, playPos, playDir, st.playMode);
    playLook.copy(playPos).addScaledVector(playDir, 16);
  };
  const hand = (t) => smoother((t - 0.45) / 0.7);
  sc.during(3.3, 4.6, probe);
  const riseLook = new THREE.Vector3();
  sc.shot('rise', 3.3, {
    pos: (out, t) => {
      at(out, 2.6 - t * 0.3, 2.0 + t * 0.2, 0.6 + t * 0.35);
      out.lerp(playPos, hand(t));
    },
    look: (out, t) => {
      st.bone(P, 'Spine2', riseLook);
      out.set(riseLook.x, riseLook.y + 0.25, riseLook.z);
      out.lerp(playLook, hand(t));
    },
    lag: 6,
    fov: { at: (t) => lerp(40, playFov, hand(t)) },
    breathe: 0.05,
  });

  return sc.ready();
}
