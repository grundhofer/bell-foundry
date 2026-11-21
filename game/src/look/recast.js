import * as THREE from 'three';

export class Recast {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.t = -1;
    this.mats = null;
    this.steamT = 0;
    this.col = new THREE.Color();
    this.orange = new THREE.Color(1.0, 0.3, 0.04);
    this.white = new THREE.Color(1.0, 0.8, 0.5);
    const props = ctx.cine && ctx.cine.props;
    if (!props || !props.offering) {
      console.warn('look: recast: the rescue has no props');
      return;
    }
    this.props = props;
    const lamp = new THREE.Color(...look.lamp);
    if (props.lamp) props.lamp.color.copy(lamp);
    if (props.beamU) props.beamU.uColor.value.copy(lamp);
    if (props.poolU) props.poolU.uColor.value.copy(lamp);
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI,
        r = Math.sin(a) * Math.pow(1 - i / 16, 0.7);
      pts.push(new THREE.Vector2(Math.max(0.0001, r * 0.12), (1 - Math.cos(a)) * 0.17));
    }
    const dropMat = (this.dropMat = new THREE.MeshStandardMaterial({
      color: 0x100804,
      emissive: new THREE.Color(...look.drop),
      emissiveIntensity: look.dropStrength,
      roughness: 0.3,
      metalness: 0.2,
    }));
    dropMat.name = 'look.recast.drop';
    const drop = (this.drop = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), dropMat));
    drop.name = 'look:recast-drop';
    drop.scale.setScalar(look.dropScale);
    props.offering.add(drop);
    props.height = 0.34 * look.dropScale;
    const glow = new THREE.Color(...look.drop);
    props.burst = (k) => {
      const s = k <= 0 ? 1 : Math.max(0.001, 1 - k * k * (3 - 2 * k));
      props.offering.scale.setScalar(s);
      if (props.bounce) {
        props.bounce.color.copy(glow);
        props.boost = 1 + 0.8 * (k > 0 ? Math.sin(Math.min(1, k * 1.25) * Math.PI) : 0);
      }
      if (k > 0 && this.t < 0) this.start();
      if (k >= 1) {
        props.offering.visible = false;
        props.boost = 1;
      }
    };
    ctx.bus.on('cine', (e) => {
      if (e.name === 'rescue' && !e.on) this.stop();
    });
  }

  start() {
    const P = this.ctx.player;
    if (!P) return;
    this.mats = [];
    P.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m && m.emissive && !this.mats.some((x) => x.m === m))
          this.mats.push({ m, e: m.emissive.clone(), k: m.emissiveIntensity });
    });
    this.t = 0;
    const L = this.ctx.look,
      bells = L && L.bells;
    if (bells && bells.list.length) {
      const b = bells.list[0];
      bells.kick(b, 1.2);
      bells.ring(b, 1);
    }
    const fx = this.ctx.vfx,
      c = new THREE.Vector3(P.pos.x, P.pos.y + 0.3, P.pos.z);
    if (fx && fx.sparks) fx.sparks(c, new THREE.Vector3(0, 1, 0), 40, 1.4);
  }
  stop() {
    if (this.mats)
      for (const x of this.mats) {
        x.m.emissive.copy(x.e);
        x.m.emissiveIntensity = x.k;
      }
    this.mats = null;
    this.t = -1;
  }

  update(dt) {
    if (this.t < 0 || !this.mats) return;
    this.t += dt;
    const L = this.look,
      t = this.t,
      rise = Math.min(1, t / 0.08);
    const cool = t < L.hold ? 1 : Math.max(0, 1 - (t - L.hold) / L.cool),
      T = cool * cool * (3 - 2 * cool);
    const ss = (a, b, x) => {
      const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return u * u * (3 - 2 * u);
    };
    const col = this.col
      .setRGB(0.5, 0.03, 0)
      .lerp(this.orange, ss(0.05, 0.55, T))
      .lerp(this.white, ss(0.82, 1.0, T));
    const k = L.strength * rise * Math.pow(T, 1.2);
    for (const x of this.mats) {
      x.m.emissive.copy(col);
      x.m.emissiveIntensity = k;
    }
    const fx = this.ctx.vfx,
      P = this.ctx.player;
    if (fx && fx.dust && P && T > 0.05 && (this.steamT -= dt) <= 0) {
      this.steamT = 0.09;
      fx.dust(
        {
          x: P.pos.x + (Math.random() - 0.5) * 0.6,
          y: P.pos.y + 0.4 + Math.random() * 1.2,
          z: P.pos.z + (Math.random() - 0.5) * 0.6,
        },
        1,
      );
    }
    if (cool <= 0) this.stop();
  }
}
