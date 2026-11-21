import * as THREE from 'three';
import { Scene } from './timeline.js';
import { Curve, DEG, clamp, lerp, ramp, smoother } from './curves.js';
import { cues, line } from './cues.js';
import { gameplayCameraPose } from './intro.js';

export function marks(ctx, dist, out = {}) {
  const B = ctx.boss,
    b = ctx.arena.bounds;
  const bx = clamp(B.pos.x, -3, 3),
    bz = clamp(B.pos.z, -(b.hz - 8), b.hz - 4.5 - dist);
  out.bx = bx;
  out.bz = bz;
  out.px = bx;
  out.pz = bz + dist;
  out.byaw = 0;
  out.pyaw = Math.PI;
  out.dx = 0;
  out.dz = 1;
  return out;
}

export function buildPhase2(ctx, st, rig) {
  const c = cues(ctx, 'turn'),
    P = ctx.player,
    B = ctx.boss,
    say = line(ctx, 'boss_phase');
  const m = marks(ctx, 10.5),
    v1 = new THREE.Vector3(),
    v2 = new THREE.Vector3(),
    tip = new THREE.Vector3();
  const headB = (out) => st.bone(B, 'Head', out);
  const tipB = (out) => {
    const o = B.kit.sword.tip;
    if (o) {
      o.updateWorldMatrix(true, false);
      o.getWorldPosition(out);
    } else out.set(m.bx, 0, m.bz + 4);
    return out;
  };
  const at = (out, f, s, y) => out.set(m.bx + m.dx * f - m.dz * s, y, m.bz + m.dz * f + m.dx * s);
  const lift = new Curve([
    [c.chord + 0.5, 0, 's'],
    [c.chord + 2.6, 1.3, 's'],
    [c.end - 1.7, 1.2],
    [c.end - 0.25, 0, 's'],
  ]);
  const R = ctx.look && ctx.look.rupture,
    BLAST = R ? 1.55 : 0;

  const end = (skipped) => {
    B.pos.y = 0;
    st.take();
    st.place(B, m.bx, m.bz, m.byaw);
    if (skipped) st.play(B, 'idle', { fade: 0, loop: true });
    st.place(P, m.px, m.pz, m.pyaw);
    if (skipped) st.play(P, 'idle', { fade: 0, loop: true });
    st.glow(1);
    st.blade(0.6);
    if (skipped) {
      st.snuffAll(0);
    }
    st.mood(0, 1);
    st.flush();
    if (R) R.done(skipped);
  };

  const sc = new Scene(ctx, st, rig, {
    name: 'phase2',
    duration: c.end,
    end,
    letterbox: [
      [0, 0],
      [0.5, 1, 's'],
      [c.end - 1.3, 1],
      [c.end, 0, 's'],
    ],
    exposure: [
      [0, 1.18],
      [0.5, 1, 's'],
      [c.chord - 0.05, 1],
      [c.chord + 0.3, 1.22],
      [c.chord + 2.2, 1, 's'],
    ],
  });

  const HIT = 0.13;
  sc.at(0, () => {
    st.puppets(true);
    st.place(P, m.px, m.pz, m.pyaw);
    st.play(P, 'idle', { fade: 0, loop: true });
    st.look(P, headB(v1), { weight: 0.8, rate: 3 });
    st.take();
    st.place(B, m.bx, m.bz, m.byaw);
    st.look(B, null);
    st.blade(1);
  });
  sc.perform(
    B,
    'cast',
    [
      [0, 2.23],
      [HIT, 2.37],
      [2.5, 2.75],
      [c.out, 3.15],
      [c.chord - 0.35, 3.66],
      [c.chord + 1.0, 4.4],
    ],
    { fade: 0, root: false },
  );
  sc.at(HIT, () => {
    tipB(tip);
    v1.set(lerp(m.bx, tip.x, 0.6), 0, lerp(m.bz, tip.z, 0.6));
    ctx.bus.emit('boss-slam', { pos: v1, radius: 2.8, power: 1.3 });
    rig.shake(0.75, 0.9, 8);
    st.wake(B.pos.x, B.pos.z + 1.2, tip.x, tip.z, 1.2);
    st.snuff(v1.x, v1.z, 4.5, 1.2);
  });
  sc.at(2.45, () => st.snuffAll(c.out - 2.5));
  sc.during(0.2, c.out + 0.6, (T, dt, u) => {
    st.mood(u >= 1 ? 0 : st.candlelight() * (1 - u * u));
    st.blade(1 - 0.7 * u);
  });
  let ring = 0;
  sc.during(0.2, c.out - 0.3, (T, dt, u) => {
    const r = 2 + u * 24;
    if (r - ring >= 1.4) {
      ring = r;
      const n = 9 + Math.round(r * 0.5),
        step = 6.2832 / n;
      for (let k = 0; k < n; k++) {
        const a = k * step + r * 0.31,
          b = a + step * 0.42;
        st.wake(m.bx + Math.cos(a) * r, m.bz + Math.sin(a) * r, m.bx + Math.cos(b) * r, m.bz + Math.sin(b) * r, 0.45);
      }
    }
  });
  sc.shot('stroke', 0, {
    pos: (out, t) => {
      at(out, 9.4 - t * 0.2, 3.4 - t * 0.05, 0.55 + t * 0.03);
    },
    look: (out, t) => {
      const k = smoother(t / 0.8);
      at(out, lerp(1.6, 2.0, k), 0.3, lerp(2.35, 1.6, k) + t * 0.02);
    },
    fov: 46,
    breathe: 0.12,
  });

  const WEST_IN = 17.4,
    far = Math.min(20.6, WEST_IN - m.bz - 1.2),
    short = clamp((20.6 - far) / 7.4, 0, 1);
  sc.shot('dark', 2.5, {
    pos: (out, t) => {
      at(out, far + t * 0.45, -1.7, 8.2 + t * 0.5 + 4.4 * short);
    },
    look: (out) => {
      at(out, lerp(4.6, 5.9, short), 0, 0.6);
    },
    fov: lerp(44, 60, short),
    breathe: 0.05,
  });

  sc.at(c.line, () => st.voice('boss_phase', say.text, say.seconds + 0.4));
  sc.shot('last', c.out, {
    pos: (out, t) => {
      at(out, 10.5 - 2.9 + t * 0.12, -1.35 + t * 0.05, 1.3 + t * 0.02);
    },
    look: (out) => {
      st.bone(P, 'Head', out);
      out.y -= 0.17;
    },
    lag: 5,
    fov: [
      [0, 29],
      [2.5, 27.5],
    ],
    aperture: 0.55,
    focus: (out) => st.bone(P, 'Spine2', out),
    breathe: 0.07,
  });
  sc.during(c.out + 0.2, c.chord, (T, dt, u) => {
    st.glow(0.12 * u);
  });

  const HEAD = { from: c.chord - 0.3, up: 1.3, to: c.end - 0.3, pitch: -8 * DEG, clip: 'powerup', at: 1.58 },
    gaze = new THREE.Vector3();
  const hq = new THREE.Quaternion(),
    htq = new THREE.Quaternion();
  let bowed = -0.5;
  const facePitch = () => {
    const h = B.char.bones.Head;
    if (!h || !B.char.tposeWorld) return bowed;
    h.getWorldQuaternion(hq);
    B.char.tposeWorld('Head', htq);
    hq.multiply(htq.invert());
    return Math.asin(clamp(v2.set(0, 0, 1).applyQuaternion(hq).y, -1, 1));
  };
  sc.at(HEAD.from, () => {
    st.lookKeep(B, 2);
    bowed = Math.min(HEAD.pitch, facePitch());
  });
  sc.during(HEAD.from, HEAD.to, (T, dt, u) => {
    if (u >= 1) {
      st.look(B, null, { rate: 20 });
      st.pose(B, HEAD.clip, HEAD.at, 0, 'head');
      return;
    }
    const pitch = lerp(bowed, HEAD.pitch, smoother((T - HEAD.from) / HEAD.up));
    headB(gaze);
    gaze.x += m.dx * 60;
    gaze.z += m.dz * 60;
    gaze.y += Math.tan(pitch) * 60;
    st.look(B, gaze, { weight: 1, rate: 150, head: 1, chest: 0 });
    st.pose(
      B,
      HEAD.clip,
      HEAD.at,
      Math.min(ramp(HEAD.from, c.chord + 0.9, T), 1 - ramp(c.end - 1.05, c.end - 0.4, T)),
      'head',
    );
  });
  sc.perform(
    B,
    'powerup',
    [
      [c.chord + 0.75, 0.55],
      [c.chord + 2.0, 1.25],
      [c.end - 1.2, 2.2],
    ],
    { fade: 0.7, root: false },
  );
  sc.at(c.chord, () => {
    rig.shake(0.45, 1.8, 3);
    st.ripple(m.bx, m.bz, 3, 2.5);
    st.gust(m.bx, m.bz, 1);
    st.play(P, 'block_idle', { fade: 0.5, loop: true });
    if (ctx.vfx && ctx.vfx.motes) ctx.vfx.motes(v1.set(m.bx, 5, m.bz), 60, 0xffe2a0);
  });
  sc.during(c.chord + 0.5, c.end - 0.25, (T, dt, u) => {
    B.pos.y = u >= 1 ? 0 : lift.at(T);
  });
  sc.during(c.chord, c.chord + 3.6, (T, dt, u) => {
    st.glow(0.12 + 0.88 * smoother(u));
    st.mood(0, smoother(u));
    st.blade(0.3 + 0.3 * u);
  });
  sc.at(c.end - 1.2, () => {
    st.play(B, 'idle', { fade: 0.9, loop: true });
    st.play(P, 'idle', { fade: 0.8, loop: true });
  });
  sc.at(c.end - 0.3, () => {
    st.ripple(m.bx, m.bz, 3, 2.2);
    rig.shake(0.25, 0.5, 7);
    if (ctx.vfx && ctx.vfx.splashRing) ctx.vfx.splashRing(v1.set(m.bx, 0.07, m.bz), 3.5, 0.7);
  });

  if (R) {
    sc.during(0, c.end, (T) => R.play(T - c.chord));
    sc.shot('blast', c.chord - 0.06, {
      pos: (out, t) => out.set(8.6 - t * 0.5, 1.6 + t * 0.15, -11.2 + t * 0.3),
      look: (out, t) => out.set(-3.6 + t * 0.2, 3.5 - t * 0.3, -20.4),
      fov: 60,
      breathe: 0.05,
    });
    sc.at(c.chord + R.times.door, () => rig.shake(0.3, 0.5, 10));
    sc.at(c.chord + R.times.beam, () => rig.shake(0.35, 0.6, 9));
  }

  const playPos = new THREE.Vector3(),
    playDir = new THREE.Vector3(),
    playLook = new THREE.Vector3();
  let playFov = 50;
  const len = c.end - c.chord,
    hand = (t) => smoother((t - len * 0.5) / (len * 0.5));
  const probe = () => {
    playFov = gameplayCameraPose(ctx, playPos, playDir, st.playMode);
    playLook.copy(playPos).addScaledVector(playDir, 16);
  };
  sc.at(c.chord, probe);
  sc.during(c.chord + len * 0.45, c.end, probe);
  sc.shot('pipes', c.chord + BLAST, {
    pos: (out, t) => {
      t += BLAST;
      at(out, 9.1 - t * 0.2, -2.6, 0.9 + t * 0.1);
      out.lerp(playPos, hand(t));
    },
    look: (out, t) => {
      t += BLAST;
      at(out, 0, 0.5, 5.9 + t * 0.25);
      out.lerp(playLook, hand(t));
    },
    fov: { at: (t) => lerp(46, playFov, hand(t + BLAST)) },
    breathe: 0.07,
  });

  return sc.ready();
}
