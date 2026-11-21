import * as THREE from 'three';
import { Environment } from './environment.js';
import { Lights } from './lights.js';
import { Materials } from './materials.js';
import { PostProcessing } from './post-processing.js';
import { AIR, AIR_DECL } from './shaders/chunks.js';

export const ASSETS = {};

export const QUALITY = {
  low: { dpr: 1, pixels: 1.0e6, samples: 0, shadow: 2048, ao: [2, 3], shafts: 8, bloomLevels: 5, floor: 0.5 },
  medium: { dpr: 1.5, pixels: 1.7e6, samples: 2, shadow: 2048, ao: [2, 3], shafts: 10, bloomLevels: 5, floor: 0.5 },
  high: { dpr: 2, pixels: 3.3e6, samples: 4, shadow: 4096, ao: [2, 4], shafts: 12, bloomLevels: 5, floor: 0.6 },
  ultra: { dpr: 2, pixels: 4.6e6, samples: 4, shadow: 4096, ao: [3, 5], shafts: 20, bloomLevels: 6, floor: 0.65 },
};

export const PHONE_QUALITY = {
  low: { dpr: 1.5, pixels: 0.8e6, samples: 0, shadow: 1024, ao: [2, 3], shafts: 6, bloomLevels: 4, floor: 0.5 },
};

const now = () => performance.now();

export class Graphics {
  /** The size and preserve options support fixed-size captures. */
  constructor(ctx, canvas, opts = {}) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.phone = !!opts.phone;
    this.quality = QUALITY[opts.quality] ? opts.quality : 'high';
    this.q = (this.phone && PHONE_QUALITY[this.quality]) || QUALITY[this.quality];
    this.fixedSize = opts.size || null;
    const params = (this.params = ctx.params);
    this.flags = new Set((params.get('gfx') || '').split(',').filter(Boolean));

    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserve,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.info.autoReset = false;
    r.setClearColor(0x000000, 1);
    this.scene = new THREE.Scene();
    this.scene.name = 'foundry';
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
    this.camera.layers.enable(2);

    this.post = {
      dof: { on: false, focus: 6, aperture: 0.02, maxBlur: 0.012 },
      letterbox: 0,
      fade: 0,
      exposure: 1,
      vignette: 0.3,
      hurt: 0,
    };
    this.mood = { candle: 1, gold: 0 };
    this.before = [];
    this.resolution = new THREE.Vector2(1, 1);
    this.air = { uniforms: { bfAir: { value: AIR } }, glsl: AIR_DECL };

    this.lights = new Lights(this, { shadowSize: this.q.shadow });
    this.env = new Environment(this);
    this.materials = new Materials(this);
    this.chain = new PostProcessing(this);
    if (params.get('view')) this.chain.debug = params.get('view');

    this.scale = 1;
    this.autoScale = !this.fixedSize && !params.has('scale');
    this.forceScale = params.has('scale') ? Math.min(1, Math.max(0.25, +params.get('scale') || 1)) : 0;
    this._time = 0;
    this._frames = 0;
    this._arenaDir = null;
    this._stats = {
      ms: 0,
      calls: 0,
      triangles: 0,
      scale: 1,
      size: [0, 0],
      cpu: { shadow: 0, hooks: 0, scene: 0, post: 0 },
      bakes: 0,
      level: 0,
      levels: 1,
      late: 0,
    };
    if (import.meta.url.includes('/graphics/next/')) this._stats.staged = true;
    this.ladder = [{ samples: this.q.samples, cheap: 0, k: 1 }];
    this.level = 0;
    this.samples = this.q.samples;
    this.pressure = 0;
    this._miss = 0;
    this._slow = 0;
    this._adaptT = 0;
    this._wait = 3;
    this._raiseWait = 6;
    this._sinceChange = 0;
    this._failedAt = -1;
    this._sinceFail = 1e9;
    this._probing = false;
    this._good = 0;
    this.applyQuality();
    this.resize();
    if (!this.fixedSize) window.addEventListener('resize', (this._onResize = () => this.resize()));
  }

  get sceneDepth() {
    return this.chain.sceneDepth;
  }

  applyQuality() {
    const q = this.q,
      c = this.chain,
      f = this.flags;
    c.q.ao = f.has('noao') ? [0, 0] : q.ao;
    c.q.shafts = f.has('noshafts') ? 0 : q.shafts;
    c.q.bloomLevels = q.bloomLevels;
    c.q.fxaa = !f.has('nofxaa');
    if (f.has('noao')) c.look.ao = 0;
    if (f.has('noshafts')) c.look.shafts = 0;
    if (f.has('nobloom')) c.look.bloom = 0;
    this.lights.setShadowSize(q.shadow);
  }

  resize() {
    const fixed = this.fixedSize,
      q = this.q;
    const w = fixed ? fixed[0] : Math.max(1, window.innerWidth),
      h = fixed ? fixed[1] : Math.max(1, window.innerHeight);
    const dpr = fixed ? 1 : Math.min(window.devicePixelRatio || 1, q.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, !fixed);
    const ow = Math.floor(w * dpr),
      oh = Math.floor(h * dpr);
    this.outW = ow;
    this.outH = oh;
    this.maxScale = this.forceScale || (fixed ? 1 : Math.min(1, Math.sqrt(q.pixels / (ow * oh))));
    this._buildQualityLadder();
    if (!this._sized) this.level = 0;
    else this.level = Math.min(this.level, this.ladder.length - 1);
    this._sized = true;
    this._applyLevel();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _buildQualityLadder() {
    const q = this.q,
      L = this.ladder;
    L.length = 0;
    L.push({ samples: q.samples, cheap: 0, k: 1 });
    if (!this.autoScale) return;
    const s = Math.min(q.samples, 2);
    if (q.samples > 2) L.push({ samples: s, cheap: 0, k: 1 });
    if (q.ao[0] * q.ao[1] > 6 || q.shafts > 8) L.push({ samples: s, cheap: 1, k: 1 });
    const cheap = L[L.length - 1].cheap,
      lo = Math.min(1, q.floor / this.maxScale);
    for (let k = 0.93; k > lo + 0.03; k *= 0.93) L.push({ samples: s, cheap, k });
    if (lo < 0.97) L.push({ samples: s, cheap, k: lo });
  }
  _applyLevel() {
    const l = this.ladder[this.level] || this.ladder[0],
      q = this.q,
      c = this.chain,
      f = this.flags;
    this.scale = this.forceScale || this.maxScale * l.k;
    this.samples = l.samples;
    c.q.ao = f.has('noao') ? [0, 0] : l.cheap ? [2, 3] : q.ao;
    c.q.shafts = f.has('noshafts') ? 0 : l.cheap ? Math.min(q.shafts, 8) : q.shafts;
    this._applyScale();
    this.pressure = this.ladder.length > 1 ? this.level / (this.ladder.length - 1) : 0;
    this._stats.level = this.level;
    this._stats.levels = this.ladder.length;
  }
  _applyScale() {
    const rw = Math.max(16, Math.round((this.outW * this.scale) / 2) * 2),
      rh = Math.max(16, Math.round((this.outH * this.scale) / 2) * 2);
    this.chain.setSize(rw, rh, this.outW, this.outH, this.flags.has('nomsaa') ? 0 : this.samples);
    this.resolution.set(rw, rh);
    this._stats.scale = +(rw / this.outW).toFixed(3);
    this._stats.size[0] = rw;
    this._stats.size[1] = rh;
    this._stats.samples = this.flags.has('nomsaa') ? 0 : this.samples;
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.quality) return;
    this.quality = name;
    this.q = (this.phone && PHONE_QUALITY[name]) || QUALITY[name];
    this._sized = false;
    this._miss = 0;
    this._slow = 0;
    this._adaptT = 0;
    this._wait = 3;
    this._raiseWait = 6;
    this._sinceChange = 0;
    this._failedAt = -1;
    this._sinceFail = 1e9;
    this._probing = false;
    this._good = 0;
    this.applyQuality();
    this.resize();
  }

  onBeforeRender(fn) {
    this.before.push(fn);
    return () => {
      const i = this.before.indexOf(fn);
      if (i >= 0) this.before.splice(i, 1);
    };
  }

  onWarm(fn) {
    (this.warmers || (this.warmers = [])).push(fn);
  }

  _syncArenaLighting() {
    const arena = this.ctx && this.ctx.arena;
    if (!arena || !arena.moonDir) return;
    if (this._arenaDir && this._arena === arena && this._arenaDir.equals(arena.moonDir)) return;
    this._arena = arena;
    this._arenaDir = (this._arenaDir || new THREE.Vector3()).copy(arena.moonDir);
    this.env.setMoonDir(arena.moonDir);
    this.lights.fit(this.env.moonDir);
    this.env.setHall(arena);
  }

  _adaptQuality(dt) {
    if (!(dt > 0) || dt > 0.25) return;
    const target = 1 / 60,
      bottom = this.ladder.length - 1,
      missed = dt > target * 1.3 ? 1 : 0;
    this._miss += (missed - this._miss) * 0.045;
    this._slow += (missed - this._slow) * 0.006;
    this._stats.late = this._slow;
    this._adaptT += dt;
    this._sinceChange += dt;
    this._sinceFail += dt;
    // Skip startup frames when measuring performance.
    if (!this._settled) {
      if (this._adaptT < 4) return;
      this._settled = true;
      this._miss = 0;
      this._slow = 0;
      this._adaptT = 0;
      this._wait = 2;
      return;
    }
    if (this._adaptT < this._wait) return;
    if ((this._miss > 0.45 || (this._slow > 0.07 && this._sinceChange > 4)) && this.level < bottom) {
      if (this._probing) {
        this._failedAt = this.level;
        this._sinceFail = 0;
        this._raiseWait = Math.min(300, this._raiseWait * 3);
        this.level = Math.min(bottom, this._good);
      } else this.level++;
      this._probing = false;
      this._applyLevel();
      this._adaptT = 0;
      this._wait = 1.5;
      this._sinceChange = 0;
      this._miss = 0;
      this._slow = 0;
    } else if (this._probing) {
      if (this._sinceChange > 8) this._probing = false;
    } else if (this._miss < 0.03 && this._slow < 0.012 && this.level > 0 && this._sinceChange > this._raiseWait) {
      const next = this.level - 1;
      if (this._sinceFail < 240 && next <= this._failedAt) {
        this._sinceChange = 0;
        return;
      }
      this._good = this.level;
      this._probing = true;
      this.level = next;
      this._applyLevel();
      this._adaptT = 0;
      this._wait = 0.8;
      this._sinceChange = 0;
      this._miss = 0;
      this._slow = 0;
    }
  }

  render(dt = 1 / 60) {
    const t0 = now(),
      r = this.renderer,
      st = this._stats,
      mood = this.mood,
      f = this.flags;
    r.info.reset();
    const game = this.ctx && this.ctx.game;
    this._time += dt;
    const time = game && typeof game.time === 'number' ? game.time : this._time;
    this._frames++;
    this._syncArenaLighting();
    this.lights.update(mood);
    this.env.update(time, mood, dt);
    this.materials.update(mood, dt);
    if (this.autoScale) this._adaptQuality(dt);

    // Update scene matrices once before all render passes.
    const scene = this.scene,
      auto = scene.matrixWorldAutoUpdate;
    scene.updateMatrixWorld();
    scene.matrixWorldAutoUpdate = false;
    if (!f.has('noshadow') || this._frames < 3) this.lights.refreshShadow(this.camera);
    const t1 = now();
    for (let i = 0; i < this.before.length; i++) this.before[i](dt);
    const t2 = now();
    r.setRenderTarget(this.chain.sceneRT);
    r.render(scene, this.camera);
    scene.matrixWorldAutoUpdate = auto;
    const t3 = now();
    if (f.has('nopost')) {
      const c = this.chain;
      c.m.copy.uniforms.tIn.value = c.sceneRT.texture;
      c.m.copy.uniforms.uScale.value.set(1, 1, 1, 1);
      c.draw(c.m.copy, null);
    } else this.chain.render(this.camera, mood, time);
    r.setRenderTarget(null);
    const t4 = now(),
      k = 0.1,
      c = st.cpu;
    st.ms += (t4 - t0 - st.ms) * (this._frames < 4 ? 1 : k);
    c.shadow += (t1 - t0 - c.shadow) * k;
    c.hooks += (t2 - t1 - c.hooks) * k;
    c.scene += (t3 - t2 - c.scene) * k;
    c.post += (t4 - t3 - c.post) * k;
    st.calls = r.info.render.calls;
    st.triangles = r.info.render.triangles;
    st.bakes = this.env.bakes;
    st.programs = r.info.programs ? r.info.programs.length : 0;
    if (this.ctx && this.ctx.dev) {
      const L = this.lights,
        a = st.candles || (st.candles = []);
      for (let i = 0; i < L.pool; i++) {
        const l = L.candles[i];
        a[i] = Math.round(l.intensity * 10) / 10 + '@' + Math.round(l.position.x) + ',' + Math.round(l.position.z);
      }
    }
  }

  stats() {
    return this._stats;
  }

  async warm() {
    const r = this.renderer;
    this._syncArenaLighting();
    this.lights.update(this.mood);
    this.env.update(this._time, this.mood, 0);
    this.materials.update(this.mood);
    // Compile for the HDR target's color space.
    r.setRenderTarget(this.chain.sceneRT);
    try {
      await r.compileAsync(this.scene, this.camera);
    } catch (e) {
      console.warn('gfx.warm: ' + (e && e.message));
    }
    r.setRenderTarget(null);
    this.chain.warm();
    const seen = new Set();
    const tex = (t) => {
      if (t && t.isTexture && !t.isRenderTargetTexture && !t.isDepthTexture && !seen.has(t) && t.image) {
        seen.add(t);
        try {
          r.initTexture(t);
        } catch (e) {}
      }
    };
    this.scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) tex(v);
        }
        if (m.uniforms)
          for (const k in m.uniforms) {
            const v = m.uniforms[k] && m.uniforms[k].value;
            if (v && v.isTexture) tex(v);
          }
      }
    });
    if (this.warmers)
      for (const fn of this.warmers) {
        try {
          fn();
        } catch (e) {
          console.warn('gfx.warm: a warm-up hook failed: ' + (e && e.message));
        }
      }
    const dof = this.post.dof,
      was = dof.on;
    dof.on = true;
    this.render(0);
    dof.on = was;
    this.render(0);
    this._stats.ms = 0;
    this._miss = 0;
    this._slow = 0;
    this._adaptT = 0;
    this._settled = false;
  }

  dispose() {
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.before.length = 0;
    this.chain.dispose();
    this.materials.dispose();
    this.env.dispose();
    this.lights.dispose();
    this.renderer.dispose();
  }
}
