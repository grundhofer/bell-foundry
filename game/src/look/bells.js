import * as THREE from 'three';
import { PieceBuilder } from '../world/piece-builder.js';
import * as L from '../world/layout.js';
import { xorshift32 } from '../core/math.js';

const G = 9.81;
const REL = 0.08;
const SHOW = 0.5;
const MIN_STROKE = 0.15;

const PROFILE = [
  [0.0, 0.0],
  [0.3, 0.0],
  [0.46, -0.02],
  [0.53, -0.08],
  [0.56, -0.25],
  [0.59, -0.5],
  [0.65, -0.74],
  [0.75, -0.92],
  [0.88, -1.05],
  [0.97, -1.13],
  [1.0, -1.17],
  [0.985, -1.205],
  [0.93, -1.19],
  [0.84, -1.1],
  [0.72, -0.96],
  [0.6, -0.76],
  [0.53, -0.52],
  [0.49, -0.24],
  [0.42, -0.09],
  [0.25, -0.07],
  [0.0, -0.07],
];
const HEIGHT = 1.205;

function bellGeometry(seed) {
  const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 48);
  const pos = g.attributes.position,
    n = pos.count,
    col = new Float32Array(n * 3),
    r = xorshift32(seed);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const inner = PROFILE.length - 8;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i),
      a = Math.atan2(z, x),
      k = i % PROFILE.length;
    const p =
      0.5 + 0.25 * Math.sin(a * 3 + ph[0] + y * 4) + 0.25 * Math.sin(a * 7 + ph[1] - y * 9) * Math.sin(y * 13 + ph[2]);
    const shoulder = THREE.MathUtils.smoothstep(-y, 0.0, 0.25) * (1 - THREE.MathUtils.smoothstep(-y, 0.55, 1.0));
    const green = k >= inner ? 0 : THREE.MathUtils.smoothstep(p + shoulder * 0.35, 0.62, 0.9);
    const dark = k >= inner ? 0.35 : 1;
    col[i * 3] = (1 - green * 0.72) * dark;
    col[i * 3 + 1] = (1 - green * 0.1) * dark;
    col[i * 3 + 2] = (1 - green * 0.2 + green * 0.25) * dark;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function bellStrike(prime, seconds, rate = 48000, seed = 1) {
  const P = [
    [0.5, 0.55, 1.0],
    [1.0, 0.75, 0.62],
    [1.183, 0.6, 0.45],
    [1.506, 0.3, 0.33],
    [2.0, 0.6, 0.36],
    [2.52, 0.28, 0.22],
    [2.68, 0.22, 0.18],
    [3.01, 0.2, 0.15],
    [4.07, 0.13, 0.1],
    [5.43, 0.08, 0.07],
    [6.9, 0.05, 0.05],
  ];
  const n = Math.round(seconds * 1.15 * rate),
    out = new Float32Array(n),
    r = xorshift32(seed * 7919);
  for (const [ratio, amp, dk] of P) {
    const f = prime * ratio * (1 + (r() - 0.5) * 0.004),
      beat = 0.25 + r() * 0.9,
      tau = seconds * dk;
    if (f > rate * 0.45) continue;
    const w1 = (2 * Math.PI * f) / rate,
      w2 = (2 * Math.PI * (f + beat)) / rate,
      ph = r() * 6.28,
      dec = Math.exp(-1 / (tau * rate));
    let e = amp;
    for (let i = 0; i < n; i++) {
      out[i] += e * (Math.sin(w1 * i + ph) + 0.6 * Math.sin(w2 * i));
      e *= dec;
      if (e < 1e-5) break;
    }
  }
  const click = Math.round(0.012 * rate);
  let lp = 0;
  for (let i = 0; i < click; i++) {
    const x = r() * 2 - 1;
    lp += (x - lp) * 0.55;
    out[i] += (x - lp) * 0.9 * (1 - i / click) ** 2;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = 0.9 / (peak || 1);
  for (let i = 0; i < n; i++) out[i] *= k * Math.min(1, i / 24);
  return out;
}

export class Bells {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.list = [];
    this.t = 0;
    this.emberT = 0;
    this.played = 0;
    this.rand = xorshift32(4711);
    const arena = ctx.arena,
      kit = arena.kit;
    this.group = new THREE.Group();
    this.group.name = 'look:bells';
    const bronze = (this.bronze = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...look.bronze),
      metalness: 0.92,
      roughness: 0.4,
      vertexColors: true,
      side: THREE.DoubleSide,
    }));
    bronze.name = 'look.bronze';
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.85, metalness: 0 });
    wood.name = 'look.headstock';
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.8 });
    iron.name = 'look.bellIron';
    const chainLen = kit.has('chain') ? kit.get('chain').extra.length || 4 : 4;
    look.list.forEach((d, i) => {
      const z = L.PIER_Z[d.line],
        top = L.ribY(d.x),
        R = d.r,
        H = HEIGHT * R;
      const anchor = new THREE.Group();
      anchor.position.set(d.x, top, z);
      anchor.name = 'look:bell' + i;
      const n = Math.max(1, Math.round((top - d.y) / chainLen)),
        drop = n * chainLen;
      if (kit.has('chain')) {
        for (const sx of [-1, 1]) {
          const b = new PieceBuilder(kit, { seed: 300 + i * 2 + (sx > 0 ? 1 : 0) });
          for (let k = 0; k < n; k++)
            b.place('chain', { x: 0, y: -chainLen * k, ry: k * 1.3 + i }, { vary: 0, cast: false, mirror: false });
          const cg = b.build(arena.materials);
          cg.rotation.z = Math.atan2(sx * R * 0.9, drop);
          anchor.add(cg);
        }
      }
      const pivot = new THREE.Group();
      pivot.position.y = -drop;
      anchor.add(pivot);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(R * 2.1, R * 0.32, R * 0.46), wood);
      beam.position.y = R * 0.1;
      beam.castShadow = true;
      pivot.add(beam);
      for (const sx of [-0.5, 0.5]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(R * 0.08, R * 0.36, R * 0.5), iron);
        s.position.set(sx * R, R * 0.1, 0);
        pivot.add(s);
      }
      const crown = new THREE.Mesh(new THREE.TorusGeometry(R * 0.16, R * 0.05, 8, 20), bronze);
      crown.position.y = -R * 0.02;
      pivot.add(crown);
      const body = new THREE.Mesh(bellGeometry(17 + i), bronze);
      body.scale.setScalar(R);
      body.position.y = -R * 0.06;
      body.castShadow = !!d.cast;
      body.receiveShadow = true;
      pivot.add(body);
      const clapper = new THREE.Group();
      clapper.position.y = -R * 0.1;
      pivot.add(clapper);
      const len = H * 0.82;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.025, R * 0.035, len, 6), iron);
      rod.position.y = -len / 2;
      clapper.add(rod);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(R * 0.11, 12, 8), iron);
      ball.position.y = -len;
      clapper.add(ball);
      for (const m of [beam, crown, body, rod, ball]) m.layers.set(0);
      this.group.add(anchor);
      const lb = H * 0.42,
        lc = lb * 1.45;
      this.list.push({
        i,
        d,
        anchor,
        pivot,
        clapper,
        R,
        H,
        th: 0,
        w: 0,
        ph: 0,
        v: 0,
        wb: Math.sqrt(G / lb),
        wc: Math.sqrt(G / lc),
        damp: d.damp || 0.4,
        pos: new THREE.Vector3(d.x, top - drop - H * 0.6, z),
        prime: d.prime,
        seconds: d.seconds,
        buffer: null,
        voices: [],
      });
    });
    ctx.scene.add(this.group);

    const bus = ctx.bus;
    this.offs = [
      bus.on('boss-slam', (e) => this.shake(e.pos, (e.power || 1) * 1.3, 7)),
      bus.on('hit', (h) => {
        if (h.weight === 'colossal') this.shake(h.point, 0.6, 10);
        else if (h.weight === 'heavy') this.shake(h.point, 0.22, 8);
      }),
      bus.on('clash', (c) => {
        if (c.stone && (c.weight === 'heavy' || c.weight === 'colossal'))
          this.shake(c.point, c.weight === 'colossal' ? 0.5 : 0.15, 8);
      }),
    ];
    if (ctx.dev && typeof window !== 'undefined')
      window.__bells = {
        bells: this,
        kick: (i, v = 1) => this.kick(this.list[i], v),
        ring: (i, s = 1) => this.ring(this.list[i], s),
      };
  }

  async warm() {
    for (const b of this.list) {
      await new Promise((res) => setTimeout(res, 0));
      b.samples = bellStrike(b.prime, b.seconds, 48000, b.i + 1);
    }
  }

  shake(at, power, reach) {
    if (!at) return;
    for (const b of this.list) {
      const dx = b.pos.x - at.x,
        dz = b.pos.z - at.z,
        d = Math.hypot(dx, dz);
      this.kick(b, (power / (1 + d / reach)) * (dz >= 0 ? 1 : -1) * (0.8 + 0.4 * this.rand()));
    }
    const vfx = this.ctx.vfx;
    if (vfx && vfx.embers && Math.abs(at.z - L.DAIS.z) < 6 && power > 0.5)
      for (let k = 0; k < 4; k++) vfx.embers(this.crackPoint(), 6);
  }
  kick(b, v) {
    if (b) b.w += v / Math.sqrt(b.R);
  }

  update(dt) {
    this.t += dt;
    for (const b of this.list) {
      b.w += (-b.wb * b.wb * Math.sin(b.th) - b.damp * b.w) * dt;
      b.th += b.w * dt;
      b.v += (-b.wc * b.wc * Math.sin(b.ph) - 0.5 * b.v) * dt;
      b.ph += b.v * dt;
      const rel = b.ph - b.th;
      if (Math.abs(rel) > REL) {
        const vr = b.v - b.w,
          s = Math.sign(rel);
        b.ph = b.th + s * REL;
        if (vr * s > 0) {
          if (vr * s > MIN_STROKE) this.ring(b, Math.min(1, (vr * s) / 1.6));
          b.v = b.w - 0.35 * vr;
        }
      }
      b.pivot.rotation.x = b.th;
      b.clapper.rotation.x = (b.ph - b.th) * (SHOW / REL);
    }
    const vfx = this.ctx.vfx;
    if (vfx && vfx.embers && (this.emberT -= dt) <= 0) {
      this.emberT = 0.25 + this.rand() * 0.6;
      vfx.embers(this.crackPoint(), 1 + ((this.rand() * 2) | 0));
    }
  }
  crackPoint() {
    const r = this.rand;
    return { x: (r() * 2 - 1) * 7, y: L.DAIS.top + 0.05, z: L.DAIS.z + (r() * 2 - 1) * 2.5 + 1.5 };
  }

  ring(b, s) {
    const a = this.ctx.audio;
    if (!b || !a || !a.running || !a.ac || !b.samples) return false;
    const ac = a.ac;
    if (!b.buffer) {
      b.buffer = ac.createBuffer(1, b.samples.length, 48000);
      b.buffer.getChannelData(0).set(b.samples);
    }
    const q = a.where(b.pos, { ref: 14 });
    const vol = this.look.volume * (0.04 + 0.96 * s * s) * q.gain,
      now = ac.currentTime;
    const src = ac.createBufferSource(),
      gain = ac.createGain(),
      pan = ac.createStereoPanner(),
      send = ac.createGain();
    src.buffer = b.buffer;
    src.playbackRate.value = 1 + (this.rand() - 0.5) * 0.004;
    gain.gain.value = vol;
    pan.pan.value = q.pan;
    send.gain.value = this.look.hall * q.send;
    src.connect(gain);
    gain.connect(pan);
    pan.connect(a.world);
    pan.connect(send);
    send.connect(a.hallIn);
    b.voices.push({ src, gain });
    if (b.voices.length > 3) {
      const o = b.voices.shift();
      o.gain.gain.setTargetAtTime(0, now, 0.05);
      try {
        o.src.stop(now + 0.3);
      } catch (e) {}
    }
    src.onended = () => {
      const k = b.voices.findIndex((x) => x.src === src);
      if (k >= 0) b.voices.splice(k, 1);
      try {
        send.disconnect();
        pan.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
    src.start(now);
    this.played++;
    return true;
  }
}
