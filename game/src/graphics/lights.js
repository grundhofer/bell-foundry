// Keep the light count fixed to avoid recompiling shaders.
import * as THREE from 'three';
import { pointLightDecay } from './shaders/chunks.js';

const rgb = (r, g, b) => new THREE.Color().setRGB(r, g, b);
export const LIGHT_COLORS = {
  moon: rgb(0.72, 0.83, 1.0),
  moonGold: rgb(1.0, 0.86, 0.62),
  sky: rgb(0.074, 0.116, 0.226),
  skyGold: rgb(0.066, 0.07, 0.235),
  ground: rgb(0.016, 0.024, 0.044),
  groundWarm: rgb(0.006, 0.003, 0.001),
  groundGold: rgb(0.012, 0.002, 0.036),
  fill: rgb(0.42, 0.58, 1.0),
  fillGold: rgb(0.5, 0.48, 1.0),
  candle: rgb(1.0, 0.56, 0.23),
  boss: rgb(1.0, 0.86, 0.58),
  flash: rgb(1.0, 0.92, 0.78),
};
const _v = new THREE.Vector3(),
  _x = new THREE.Vector3(),
  _y = new THREE.Vector3();
const addScaled = (to, c, k) => {
  to.r += c.r * k;
  to.g += c.g * k;
  to.b += c.b * k;
  return to;
};

export class Lights {
  constructor(gfx, o = {}) {
    this.gfx = gfx;
    const r = (this.renderer = gfx.renderer),
      scene = (this.scene = gfx.scene);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    this.group = new THREE.Group();
    this.group.name = 'lights';
    scene.add(this.group);
    this.moonIntensity = 3.0;
    this.ambient = 1;
    this.candleGain = 1.25;
    this.moonGold = 0.8;

    const moon = (this.moon = new THREE.DirectionalLight(LIGHT_COLORS.moon, this.moonIntensity));
    moon.name = 'moon';
    moon.castShadow = true;
    moon.shadow.mapSize.set(o.shadowSize || 4096, o.shadowSize || 4096);
    moon.shadow.radius = 1.5;
    moon.shadow.autoUpdate = true;
    this.group.add(moon, moon.target);
    this.hemi = new THREE.HemisphereLight(LIGHT_COLORS.sky, LIGHT_COLORS.ground, 1);
    this.hemi.name = 'ambient';
    this.group.add(this.hemi);
    this.fillIntensity = 0.2;
    const fill = (this.fill = new THREE.DirectionalLight(LIGHT_COLORS.fill, this.fillIntensity));
    fill.name = 'fill';
    fill.position.set(0.3, 0.62, 1).normalize().multiplyScalar(30);
    this.group.add(fill, fill.target);

    this.box = new THREE.Box3(new THREE.Vector3(-21, -0.3, -31), new THREE.Vector3(21, 27, 25));
    this.moonDir = new THREE.Vector3(0, 13.3, -35.5).normalize();
    this.fit(this.moonDir);

    this.pool = 8;
    this.candles = [];
    this.candleBase = new Float32Array(this.pool);
    for (let i = 0; i < this.pool; i++) {
      const l = new THREE.PointLight(LIGHT_COLORS.candle, 0, 10, pointLightDecay(0.3));
      l.name = 'candle' + i;
      l.position.set(0, 0.4, 0);
      this.candles.push(l);
      this.group.add(l);
    }
    const make = (name, color, distance, size2) => {
      const l = new THREE.PointLight(color, 0, distance, pointLightDecay(size2));
      l.name = name;
      l.position.set(0, 1, 0);
      this.group.add(l);
      return l;
    };
    this.managed = {
      boss: [make('boss', LIGHT_COLORS.boss, 24, 30)],
      flash: [make('flash0', LIGHT_COLORS.flash, 16, 0.2), make('flash1', LIGHT_COLORS.flash, 16, 0.2)],
    };
    this.bossGain = 2.0;
    {
      const l = this.managed.boss[0],
        self = this;
      let own = l.intensity;
      Object.defineProperty(l, 'intensity', {
        get() {
          return own * self.bossGain;
        },
        set(v) {
          own = v;
        },
        enumerable: true,
        configurable: true,
      });
    }
    this.given = { boss: 0, flash: 0 };
    const spot = (this.spot = new THREE.SpotLight(LIGHT_COLORS.flash, 0, 0, 0.09, 0.2, 2));
    spot.name = 'spot';
    spot.castShadow = false;
    this.group.add(spot, spot.target);
    this.dim = 1;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.trigger = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false, fog: false }),
    );
    this.trigger.frustumCulled = false;
    this.triggerCam = new THREE.Camera();
    this.tiny = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.shadowLights = [moon];
    this.viewCamera = null;
    this.trigger.onBeforeRender = () => {
      if (this.viewCamera) r.shadowMap.render(this.shadowLights, this.scene, this.viewCamera);
    };
    this.update(gfx.mood);
  }

  fit(dir) {
    this.moonDir.copy(dir).normalize();
    const m = this.moonDir,
      moon = this.moon,
      cam = moon.shadow.camera,
      b = this.box;
    _x.set(0, 1, 0).cross(m);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.normalize();
    _y.copy(m).cross(_x).normalize();
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      const x = _v.dot(_x),
        y = _v.dot(_y),
        z = _v.dot(m);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const size = moon.shadow.mapSize.x,
      half = Math.max(x1 - x0, y1 - y0) / 2,
      texel = (2 * half) / size;
    const hx = Math.ceil(half / texel) * texel,
      cx = Math.round((x0 + x1) / 2 / texel) * texel,
      cy = Math.round((y0 + y1) / 2 / texel) * texel;
    const near = 1,
      depth = z1 - z0 + 4;
    moon.target.position
      .set(0, 0, 0)
      .addScaledVector(_x, cx)
      .addScaledVector(_y, cy)
      .addScaledVector(m, z0 - 2);
    moon.position.copy(moon.target.position).addScaledVector(m, depth + near);
    cam.left = -hx;
    cam.right = hx;
    cam.top = hx;
    cam.bottom = -hx;
    cam.near = near;
    cam.far = near + depth;
    cam.updateProjectionMatrix();
    moon.shadow.bias = -0.012 / depth;
    moon.shadow.normalBias = 0.012;
    this.texel = texel;
    this.depth = depth;
    moon.updateMatrixWorld();
    moon.target.updateMatrixWorld();
    const hl = Math.hypot(m.x, m.z) || 1;
    this.hemi.position.set((m.x / hl) * 0.67, 0.74, (m.z / hl) * 0.67);
    this.hemi.updateMatrixWorld();
    this.renderer.shadowMap.needsUpdate = true;
  }

  setShadowSize(size) {
    if (this.moon.shadow.mapSize.x !== size) {
      this.moon.shadow.mapSize.set(size, size);
      this.fit(this.moonDir);
    }
  }

  setCandle(i, x, y, z, intensity) {
    const l = this.candles[i];
    if (!l) return;
    l.position.set(x, y, z);
    this.candleBase[i] = intensity > 0 ? intensity : 0;
    l.intensity = this.candleBase[i] * this.candleScale;
  }

  add(kind) {
    const list = this.managed[kind] || this.managed.flash,
      k = this.managed[kind] ? kind : 'flash';
    const l = list[this.given[k] % list.length];
    this.given[k]++;
    return l;
  }

  update(mood) {
    const c = Math.min(1, Math.max(0, mood.candle)),
      g = Math.min(1, Math.max(0, mood.gold)),
      dim = this.dim;
    this.moon.color.copy(LIGHT_COLORS.moon).lerp(LIGHT_COLORS.moonGold, g);
    this.moon.intensity = this.moonIntensity * (1 - (1 - this.moonGold) * g) * dim;
    this.fill.color.copy(LIGHT_COLORS.fill).lerp(LIGHT_COLORS.fillGold, g);
    this.fill.intensity = this.fillIntensity * (1 - 0.3 * g) * dim;
    this.hemi.color.copy(LIGHT_COLORS.sky).lerp(LIGHT_COLORS.skyGold, g);
    addScaled(
      addScaled(this.hemi.groundColor.copy(LIGHT_COLORS.ground), LIGHT_COLORS.groundWarm, c),
      LIGHT_COLORS.groundGold,
      g,
    );
    this.hemi.intensity = this.ambient * dim;
    this.candleScale = (0.35 + 0.65 * c) * this.candleGain * dim;
    for (let i = 0; i < this.pool; i++) this.candles[i].intensity = this.candleBase[i] * this.candleScale;
  }

  refreshShadow(camera) {
    const r = this.renderer;
    r.shadowMap.needsUpdate = true;
    if (this.scene.matrixWorldAutoUpdate) this.scene.updateMatrixWorld();
    this.viewCamera = camera;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.tiny);
    r.render(this.trigger, this.triggerCam);
    r.setRenderTarget(prev);
    this.viewCamera = null;
    r.shadowMap.needsUpdate = false;
  }

  get shadowMap() {
    const m = this.moon.shadow.map;
    return m ? m.depthTexture : null;
  }
  get shadowMatrix() {
    return this.moon.shadow.matrix;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const l of [
      this.moon,
      this.fill,
      this.hemi,
      ...this.candles,
      ...this.managed.boss,
      ...this.managed.flash,
      this.spot,
    ]) {
      if (l.parent) l.parent.remove(l);
      l.dispose();
    }
    this.trigger.geometry.dispose();
    this.trigger.material.dispose();
    this.tiny.dispose();
  }
}
