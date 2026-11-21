import { Curve } from './curves.js';
import { cameraShot } from './camera-rig.js';

export class Scene {
  constructor(ctx, stage, rig, o) {
    this.ctx = ctx;
    this.stage = stage;
    this.rig = rig;
    this.name = o.name;
    this.duration = o.duration;
    this.shots = [];
    this.events = [];
    this.spans = [];
    this.endFn = o.end || (() => {});
    this.letterbox = o.letterbox ? new Curve(o.letterbox) : null;
    this.fade = o.fade ? new Curve(o.fade) : null;
    this.exposure = o.exposure ? new Curve(o.exposure) : null;
    this.si = -1;
    this.ei = 0;
    this.current = null;
    this.cuts = 0;
    this.lb = -1;
  }

  shot(name, at, cam, o = {}) {
    this.shots.push({ name, at, cam: cameraShot(cam), enter: o.enter || null, tick: o.tick || null });
    return this;
  }
  at(t, fn) {
    this.events.push({ at: t, fn, n: this.events.length });
    return this;
  }
  during(from, to, fn) {
    this.spans.push({ from, to, fn, done: false });
    return this;
  }

  perform(f, clip, keys, o = {}) {
    const curve = new Curve(keys),
      st = this.stage,
      from = keys[0][0],
      to = keys[keys.length - 1][0];
    let action = null;
    this.at(from, () => {
      action = st.play(f, clip, { fade: o.fade, at: curve.at(from), speed: 0 });
      if (o.root !== undefined) f.puppet = o.root ? 'root' : true;
    });
    this.during(from, to, (T, dt, u) => {
      if (!action || f.char.clipName !== clip) return;
      if (u >= 1) {
        action.timeScale = o.then === undefined ? 0 : o.then;
        return;
      }
      action.timeScale = (curve.at(Math.min(to, T + dt)) - action.time) / dt;
    });
    return this;
  }

  ready() {
    this.shots.sort((a, b) => a.at - b.at);
    this.events.sort((a, b) => a.at - b.at || a.n - b.n);
    if (!this.shots.length || this.shots[0].at > 0)
      throw new Error(`cutscene "${this.name}": the first shot must start at 0`);
    return this;
  }

  step(T, dt) {
    const st = this.stage,
      eps = 1e-6;
    for (;;) {
      const ns = this.shots[this.si + 1],
        ne = this.events[this.ei];
      const ts = ns ? ns.at : Infinity,
        te = ne ? ne.at : Infinity;
      if (Math.min(ts, te) > T + eps) break;
      if (ts <= te) {
        this.si++;
        this.current = ns;
        this.cuts++;
        this.rig.cut();
        if (ns.enter) ns.enter();
      } else {
        this.ei++;
        ne.fn(T);
      }
    }
    for (let i = 0; i < this.spans.length; i++) {
      const s = this.spans[i];
      if (s.done || T + eps < s.from) continue;
      if (T + eps >= s.to) {
        s.fn(s.to, dt, 1);
        s.done = true;
      } else s.fn(T, dt, (T - s.from) / (s.to - s.from));
    }
    st.flush();
    st.update(dt);
    const shot = this.current;
    if (shot.tick) shot.tick(T - shot.at, dt, T);
    this.rig.apply(shot.cam, T - shot.at, dt, T);
    const post = this.ctx.gfx.post,
      ui = this.ctx.ui;
    if (this.letterbox) {
      const k = this.letterbox.at(T);
      post.letterbox = k;
      if (ui && ui.letterbox && Math.abs(k - this.lb) > 1e-4) {
        this.lb = k;
        ui.letterbox(k);
      }
    }
    if (this.fade) post.fade = this.fade.at(T);
    if (this.exposure) post.exposure = this.exposure.at(T);
  }

  end(skipped) {
    this.endFn(skipped);
  }
}
