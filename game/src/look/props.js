// Foundry props by Quaternius, Fantasy Props MegaKit (CC0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = 'assets/models/look/props/';

export class FoundryProps {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.t = 0;
    this.flames = [];
    this.group = new THREE.Group();
    this.group.name = 'look:deco';
    ctx.scene.add(this.group);
  }

  async load() {
    const loader = new GLTFLoader(),
      names = [...new Set(this.look.list.map((p) => p.name))],
      models = {};
    await Promise.all(
      names.map(async (n) => {
        try {
          models[n] = (await loader.loadAsync(DIR + n + '.gltf')).scene;
        } catch (e) {
          console.warn(`look: deco: ${n} would not load: ${e.message}`);
        }
      }),
    );
    const flameMat = (this.flameMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color(...this.look.flame),
      emissiveIntensity: this.look.flameStrength,
      roughness: 1,
    }));
    flameMat.name = 'look.deco.flame';
    const tint = this.look.tint ? new THREE.Color(...this.look.tint) : null,
      done = new Set();
    for (const p of this.look.list) {
      const src = models[p.name];
      if (!src) continue;
      const o = src.clone(true);
      o.position.set(
        p.x,
        p.y !== undefined ? p.y : this.ctx.arena && this.ctx.arena.ground ? this.ctx.arena.ground(p.x, p.z) : 0,
        p.z,
      );
      o.rotation.y = p.ry || 0;
      o.scale.setScalar(p.s || 1);
      o.traverse((n) => {
        if (!n.isMesh) return;
        n.castShadow = true;
        n.receiveShadow = true;
        const m = n.material;
        if (m && m.color && !done.has(m)) {
          done.add(m);
          if (tint) m.color.multiply(tint);
          if (this.look.selfLit && m.map) {
            m.emissive = new THREE.Color(1, 0.9, 0.8);
            m.emissiveMap = m.map;
            m.emissiveIntensity = this.look.selfLit;
            m.needsUpdate = true;
          }
        }
      });
      if (p.name === 'Torch_Metal') {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 8), flameMat);
        f.position.set(0, 0.5, 0.3);
        o.add(f);
        this.flames.push(f);
      }
      this.group.add(o);
    }
  }

  update(dt) {
    this.t += dt;
    if (this.flameMat)
      this.flameMat.emissiveIntensity =
        this.look.flameStrength * (0.8 + 0.2 * Math.sin(this.t * 9.0) * Math.sin(this.t * 5.3));
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      f.scale.y = 0.85 + 0.25 * Math.abs(Math.sin(this.t * 7 + i));
    }
  }
}
