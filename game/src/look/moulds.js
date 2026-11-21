import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { xorshift32 } from '../core/math.js';

const BELL = [
  [0.0, 0.0],
  [0.46, -0.02],
  [0.56, -0.25],
  [0.6, -0.5],
  [0.66, -0.74],
  [0.77, -0.93],
  [0.9, -1.06],
  [1.0, -1.17],
];

function loamMouldGeometry(points, segs, rough, seed) {
  const g = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
  const p = g.attributes.position,
    r = xorshift32(seed),
    ph = [r() * 6.3, r() * 6.3, r() * 6.3],
    col = new Float32Array(p.count * 3).fill(1);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      rad = Math.hypot(x, z);
    if (rad < 1e-4) continue;
    const a = Math.atan2(z, x);
    const n =
      Math.sin(a * 5 + ph[0] + y * 3) * 0.5 +
      Math.sin(a * 11 + ph[1] - y * 7) * 0.3 +
      Math.sin(a * 23 + y * 17 + ph[2]) * 0.2;
    const fine = Math.sin(a * 41 + y * 29 + ph[1]) * Math.sin(a * 37 - y * 31 + ph[0]);
    const k = (rad + (n + fine * 0.35) * rough) / rad;
    p.setX(i, x * k);
    p.setZ(i, z * k);
    const patch = 0.5 + 0.5 * Math.sin(a * 3 + ph[2] + y * 2.3) * Math.sin(a * 6 - ph[0] + y * 4.1);
    const v = (0.62 + 0.5 * patch) * (0.55 + 0.45 * Math.min(1, Math.max(0, y / 1.2)));
    col[i * 3] = v * 1.04;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v * 0.94;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function bellRadiusAt(y) {
  for (let i = 1; i < BELL.length; i++) {
    const [r0, y0] = BELL[i - 1],
      [r1, y1] = BELL[i];
    if (y >= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 1;
}
const place = (g, x, y, z, ry = 0, s = 1) =>
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
      new THREE.Vector3(s, s, s),
    ),
  );
const band = (radius, y, thick) => {
  const t = new THREE.TorusGeometry(radius, thick, 6, 36);
  t.rotateX(Math.PI / 2);
  t.translate(0, y, 0);
  return t;
};

export class Moulds {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.t = 0;
    this.emberT = 0;
    this.rand = xorshift32(99);
    const arena = ctx.arena,
      ground = (x, z) => (arena.ground ? arena.ground(x, z) : 0);
    const parts = { clay: [], baked: [], iron: [], brick: [], molten: [] };
    this.vents = [];
    look.list.forEach((m, i) => {
      const R = m.r,
        H = 1.17 * R,
        y0 = ground(m.x, m.z),
        ry = m.ry || 0,
        seed = 40 + i;
      const at = (g) => place(g, m.x, y0, m.z, ry);
      if (m.kind === 'core') {
        const plinth = new THREE.CylinderGeometry(R * 1.05, R * 1.1, R * 0.35, 10);
        plinth.translate(0, R * 0.175, 0);
        parts.brick.push(at(plinth));
        const core = loamMouldGeometry(BELL.map(([r, y]) => [r * 0.86 * R, H + y * R]).reverse(), 32, R * 0.025, seed);
        core.translate(0, R * 0.35, 0);
        parts.baked.push(at(core));
        const spindle = new THREE.CylinderGeometry(R * 0.03, R * 0.03, R * 0.5, 6);
        spindle.translate(0, R * 0.35 + H + R * 0.2, 0);
        parts.iron.push(at(spindle));
        return;
      }
      const top = H * 1.08;
      const cope = loamMouldGeometry(
        BELL.map(([r, y]) => [r * 1.16 * R + (r > 0 ? 0.1 : 0), top + y * 1.08 * R]).reverse(),
        48,
        R * 0.05,
        seed,
      );
      parts.clay.push(at(cope));
      for (const f of [0.1, 0.4, 0.7])
        parts.iron.push(at(band(bellRadiusAt(-1.17 * (1 - f)) * 1.16 * R + 0.1 + R * 0.03, top * f, R * 0.025)));
      const cup = new THREE.CylinderGeometry(R * 0.2, R * 0.12, R * 0.22, 12, 1, true);
      cup.translate(R * 0.12, top + R * 0.1, 0);
      parts.clay.push(at(cup));
      const riser = new THREE.CylinderGeometry(R * 0.07, R * 0.09, R * 0.3, 8);
      riser.translate(-R * 0.22, top + R * 0.12, 0);
      parts.clay.push(at(riser));
      if (m.kind === 'hot') {
        const melt = new THREE.CircleGeometry(R * 0.18, 14);
        melt.rotateX(-Math.PI / 2);
        melt.translate(R * 0.12, top + R * 0.17, 0);
        parts.molten.push(at(melt));
        const cx = R * 1.75,
          cr = R * 0.38;
        const cru = new THREE.CylinderGeometry(cr, cr * 0.75, cr * 1.6, 14, 1, true);
        cru.translate(cx, cr * 0.8, 0);
        parts.baked.push(at(cru));
        const surf = new THREE.CircleGeometry(cr * 0.92, 14);
        surf.rotateX(-Math.PI / 2);
        surf.translate(cx, cr * 1.45, 0);
        parts.molten.push(at(surf));
        const runner = new THREE.BoxGeometry(cx - R * 0.6, 0.05, R * 0.12);
        runner.translate((cx + R * 0.4) / 2, 0.09, 0);
        parts.molten.push(at(runner));
        const v = new THREE.Vector3(R * 0.12, top + R * 0.2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        this.vents.push({ x: m.x + v.x, y: y0 + v.y, z: m.z + v.z });
        const v2 = new THREE.Vector3(cx, cr * 1.5, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        this.vents.push({ x: m.x + v2.x, y: y0 + v2.y, z: m.z + v2.z });
      }
    });
    const c = look.colours;
    const mats = (this.materials = {
      clay: new THREE.MeshStandardMaterial({
        color: new THREE.Color(...c.clay),
        roughness: 0.95,
        metalness: 0,
        vertexColors: true,
      }),
      baked: new THREE.MeshStandardMaterial({
        color: new THREE.Color(...c.baked),
        roughness: 0.9,
        metalness: 0,
        vertexColors: true,
      }),
      iron: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.65, metalness: 0.8 }),
      brick: new THREE.MeshStandardMaterial({ color: new THREE.Color(...c.brick), roughness: 0.95, metalness: 0 }),
      molten: new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: new THREE.Color(...c.molten),
        emissiveIntensity: c.moltenStrength,
        roughness: 0.4,
      }),
    });
    this.group = new THREE.Group();
    this.group.name = 'look:moulds';
    for (const k in parts) {
      if (!parts[k].length) continue;
      mats[k].name = 'look.mould.' + k;
      const list = parts[k].map((x) => {
        x = x.index ? x.toNonIndexed() : x;
        if (!x.attributes.color)
          x.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 3).fill(1), 3),
          );
        return x;
      });
      const g = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(g, mats[k]);
      mesh.name = 'look:mould-' + k;
      mesh.castShadow = k !== 'molten';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    ctx.scene.add(this.group);
  }

  update(dt) {
    this.t += dt;
    const m = this.materials.molten,
      c = this.look.colours;
    m.emissiveIntensity = c.moltenStrength * (0.85 + 0.1 * Math.sin(this.t * 2.3) + 0.05 * Math.sin(this.t * 7.1));
    const vfx = this.ctx.vfx;
    if (this.vents.length && vfx && vfx.embers && (this.emberT -= dt) <= 0) {
      this.emberT = 0.3 + this.rand() * 0.5;
      vfx.embers(this.vents[(this.rand() * this.vents.length) | 0], 1 + ((this.rand() * 2) | 0));
    }
  }
}
