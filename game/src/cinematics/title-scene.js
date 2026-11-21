import * as THREE from 'three';
import { cameraShot } from './camera-rig.js';
import { stageStanding } from './intro.js';

export class TitleScene {
  constructor(ctx, stage, rig) {
    this.ctx = ctx;
    this.stage = stage;
    this.rig = rig;
    this.t = 0;
    this.on = false;
    const k = ctx.arena.spawn.kneel,
      head = new THREE.Vector3();
    this.cam = cameraShot({
      pos: (out, t) =>
        out.set(
          k.x + 7.4 + Math.sin(t * 0.045) * 0.4,
          1.05 + Math.sin(t * 0.033 + 1) * 0.07,
          k.z + 8.8 - Math.sin(t * 0.027 + 0.4) * 0.5,
        ),
      look: (out, t) => out.set(k.x - 3.25 + Math.sin(t * 0.03) * 0.15, 3.2, k.z + 2.85),
      fov: 57,
      aperture: 0.25,
      breathe: 0.05,
      sway: 0.004,
      focus: (out) => {
        stage.bone(ctx.boss, 'Head', head);
        out.copy(head);
      },
    });
  }
  start() {
    const ctx = this.ctx,
      st = this.stage;
    this.on = true;
    this.t = 0;
    stageStanding(ctx, st);
    // The smith kneels at work by his planted hammer, as the intro opens.
    const B = ctx.boss,
      k = ctx.arena.spawn.kneel;
    st.place(B, k.x, k.z, 0);
    st.play(B, 'kneel_idle', { fade: 0, loop: true });
    ctx.player.puppet = true;
    st.play(ctx.player, 'idle', { fade: 0, loop: true });
    st.hidePilgrim();
    st.flush();
    this.rig.cut();
    this.update(0);
  }
  stop() {
    if (!this.on) return;
    const ctx = this.ctx,
      st = this.stage,
      s = ctx.arena.spawn;
    this.on = false;
    st.take();
    st.place(ctx.boss, s.boss.x, s.boss.z, s.boss.yaw || 0);
    st.play(ctx.boss, 'idle', { fade: 0, loop: true });
    st.place(ctx.player, s.player.x, s.player.z, s.player.yaw);
    st.flush();
    st.release();
    ctx.gfx.post.dof.on = false;
  }
  update(dt) {
    if (!this.on) return;
    this.t += dt;
    this.stage.update(dt);
    this.rig.apply(this.cam, this.t, dt, this.t);
  }
}
