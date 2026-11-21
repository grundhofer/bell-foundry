// Show alternate fighters in a separate renderer. Dispose only assets loaded for the preview.
import * as THREE from 'three';
import { Assets } from '../core/assets.js';
import { Character } from '../characters/character.js';
import * as clipData from '../characters/clip-data.js';
import * as W from '../characters/weapons.js';
import { entryOf } from '../characters/roster.js';
import { buildGreatsword } from '../characters/greatsword.js';
import { FOUNDRY_LOOK } from '../config/foundry-look.js';
import { Options } from '../config/options.js';

const FOV = 26;
const START = 0.6;
const SWAY = 0.55,
  RATE = 0.45;

function createStudioScene(renderer) {
  const s = new THREE.Scene(),
    made = [];
  const add = (geo, color, side) => {
    const m = new THREE.MeshBasicMaterial({ color, side });
    made.push(geo, m);
    const o = new THREE.Mesh(geo, m);
    s.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(14, 9, 14), new THREE.Color(0.1, 0.09, 0.085), THREE.BackSide).position.y = 3;
  const panel = (c, k, x, y, z, w, h) => {
    const o = add(new THREE.PlaneGeometry(w, h), new THREE.Color(c[0] * k, c[1] * k, c[2] * k), THREE.DoubleSide);
    o.position.set(x, y, z);
    o.lookAt(0, 1, 0);
  };
  panel([1.0, 0.86, 0.7], 7, 3.5, 4, 4, 3, 2);
  panel([0.66, 0.78, 1.0], 5, -4.5, 3.5, -3.5, 2.5, 3);
  panel([1, 1, 1], 1.2, 0, 7.4, 0, 8, 8);
  const pm = new THREE.PMREMGenerator(renderer),
    rt = pm.fromScene(s, 0.04);
  pm.dispose();
  for (const d of made) d.dispose();
  return rt;
}

export class FigurePreview {
  constructor(ctx, host, caption) {
    this.ctx = ctx;
    this.host = host;
    this.caption = caption;
    this.key = '';
    this.token = 0;
    this.cur = null;
    this.raf = 0;
    this.last = 0;
    const own = (this.own = new Assets()),
      game = ctx && ctx.assets;
    const get = (n) => (own.has(n) ? own.get(n) : game.get(n));
    this.shelf = {
      has: (n) => own.has(n) || !!(game && game.has(n)),
      get,
      gltf: get,
      texture: get,
      json: get,
      buffer: get,
    };
    this.stage = { assets: this.shelf, params: new Options() };
    const canvas = (this.canvas = document.createElement('canvas'));
    host.insertBefore(canvas, host.firstChild);
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    const scene = (this.scene = new THREE.Scene());
    this.env = createStudioScene(r);
    scene.environment = this.env.texture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a1d12, 0.8));
    const light = (color, k, x, y, z) => {
      const l = new THREE.DirectionalLight(color, k);
      l.position.set(x, y, z);
      scene.add(l);
    };
    light(0xffe2c0, 2.6, 2.5, 4, 3.5);
    light(0x9fbfff, 2.2, -3, 3, -3);
    light(0xffffff, 0.45, -3, 1, 2);
    this.camera = new THREE.PerspectiveCamera(FOV, 0.75, 0.05, 60);
    this.turn = new THREE.Group();
    this.turn.rotation.y = START;
    scene.add(this.turn);
    this.phase = 0;
    this.frame = { cx: 0, cy: 1, h: 2, seen: null };
    this._fit = () => this.fit();
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(this._fit) : null;
    if (this.ro) this.ro.observe(host);
    this._loop = (t) => this._tick(t);
    this.fit();
  }

  show(o) {
    const key = o.role + '|' + o.id + '|' + (o.role === 'boss' ? o.weapon : '');
    this.words = o;
    this._caption();
    if (key === this.key) return;
    this.key = key;
    const token = ++this.token;
    this._state('busy');
    this._build(o)
      .then((made) => {
        if (token !== this.token || !this.renderer) {
          if (made) this._drop(made);
          return;
        }
        this._drop(this.cur);
        this.cur = made;
        this.turn.add(made.char.root);
        this._measure();
        this._state('');
        if (!this.raf) {
          this.last = 0;
          this.raf = requestAnimationFrame(this._loop);
        }
      })
      .catch((e) => {
        if (token !== this.token) return;
        console.warn(`preview: ${o.id} could not be shown: ${(e && e.message) || e}`);
        this._drop(this.cur);
        this.cur = null;
        this._state('failed');
      });
  }

  async _build(o) {
    const f = entryOf(o.id);
    if (!f) throw new Error('no figure "' + o.id + '"');
    const boss = o.role === 'boss',
      clips = boss ? 'boss.clips' : 'pilgrim.clips',
      model = f.asset;
    const kinds = boss ? ['hammer'] : ['sword', 'shield'];
    const need = {},
      want = (name, entry) => {
        if (!this.shelf.has(name)) need[name] = entry;
      };
    want(model, f.url);
    want(clips, 'assets/models/' + clips + '.glb');
    for (const [name, entry] of Object.entries(Object.assign({}, W.ASSETS, boss ? W.HAMMER_ASSETS : {})))
      want(name, entry);
    if (Object.keys(need).length) await this.own.load(need);
    if (!this.renderer) return null;
    const char = new Character(this.stage, {
      name: boss ? 'boss' : 'pilgrim',
      model,
      ref: clips,
      clips,
      data: boss ? clipData.boss : clipData.pilgrim,
    });
    char.play('idle', { fade: 0 });
    char.update(0);
    const made = { char, weapons: [], hands: [] };
    // the pilgrim's great sword, as the game hangs it on his sword frame (look/armour.js)
    const greatsword = () => {
      const w = W.makeFrame('sword'),
        g = buildGreatsword(FOUNDRY_LOOK.armour.player.greatsword);
      g.group.traverse((n) => {
        if (n.isMesh) n.userData.kit = true;
      });
      w.object.add(g.group);
      w.materials = { blade: g.blade, iron: g.iron, hot: g.hot };
      return w;
    };
    for (const kind of kinds) {
      const w = kind === 'sword' ? greatsword() : W.makeWeapon(this.stage, kind);
      made.weapons.push(w);
      if (kind === 'shield') {
        W.shieldSocket(char).add(w.object);
        continue;
      }
      const g = W.gripSocket(char);
      g.add(w.object);
      const at = new THREE.Vector3().setFromMatrixPosition(g.userData.rest),
        line = new THREE.Vector3().setFromMatrixColumn(g.userData.rest, 1).normalize();
      made.hands.push(
        W.makeHand(char, 'Right', {
          round: { point: at, axis: line, radius: (w.grip || 0.0175) + (boss ? 0.0105 : 0.012) },
        }),
      );
    }
    for (const h of made.hands) h.set(1);
    return made;
  }

  /** Sample the idle pose across the sway to frame the body. */
  _measure() {
    const turn = this.turn,
      was = turn.rotation.y,
      root = this.cur.char.root,
      v = new THREE.Vector3(),
      pts = [],
      body = [];
    root.position.set(0, 0, 0);
    turn.rotation.y = 0;
    turn.updateMatrixWorld(true);
    root.traverse((n) => {
      if (!n.isMesh || !n.geometry || !n.geometry.attributes.position) return;
      const pos = n.geometry.attributes.position,
        step = Math.max(1, Math.floor(pos.count / 1500)),
        kit = !!n.userData.kit;
      for (let i = 0; i < pos.count; i += step) {
        n.getVertexPosition(i, v).applyMatrix4(n.matrixWorld);
        pts.push(v.x, v.y, v.z, kit ? 1 : 0);
        if (!kit) body.push(v.x, v.z);
      }
    });
    if (!pts.length) {
      turn.rotation.y = was;
      return;
    }
    let bx0 = Infinity,
      bx1 = -Infinity,
      bz0 = Infinity,
      bz1 = -Infinity;
    for (let i = 0; i < body.length; i += 2) {
      const x = body[i],
        z = body[i + 1];
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (z < bz0) bz0 = z;
      if (z > bz1) bz1 = z;
    }
    const mx = body.length ? (bx0 + bx1) / 2 : 0,
      mz = body.length ? (bz0 + bz1) / 2 : 0;
    root.position.set(-mx, 0, -mz);
    turn.rotation.y = was;
    turn.updateMatrixWorld(true);
    const seen = [];
    let y0 = Infinity,
      y1 = -Infinity;
    for (let k = -4; k <= 4; k++) {
      const a = START + (SWAY * k) / 4,
        c = Math.cos(a),
        s = Math.sin(a);
      for (let i = 0; i < pts.length; i += 4) {
        if (pts[i + 3] && Math.abs(k) > 2) continue;
        const px = pts[i] - mx,
          y = pts[i + 1],
          pz = pts[i + 2] - mz;
        seen.push(px * c + pz * s, y, -px * s + pz * c);
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    Object.assign(this.frame, { cx: 0, cy: (y0 + y1) / 2, h: y1 - y0, seen });
    this.fit();
  }

  fit() {
    const r = this.renderer;
    if (!r) return;
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    r.setSize(w, h, false);
    const cam = this.camera,
      F = this.frame,
      t = Math.tan((FOV * Math.PI) / 180 / 2) / 1.08,
      ta = t * (w / h);
    cam.aspect = w / h;
    let d = F.h / 2 / t + 0.5;
    if (F.seen) {
      d = 0;
      const p = F.seen;
      for (let i = 0; i < p.length; i += 3)
        d = Math.max(d, p[i + 2] + Math.abs(p[i] - F.cx) / ta, p[i + 2] + Math.abs(p[i + 1] - F.cy) / t);
    }
    cam.position.set(F.cx, F.cy, d);
    cam.lookAt(F.cx, F.cy, 0);
    cam.near = 0.05;
    cam.far = d + F.h * 2 + 4;
    cam.updateProjectionMatrix();
    if (!this.raf) this._render();
  }

  _tick(t) {
    this.raf = 0;
    if (!this.renderer) return;
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 1 / 60;
    this.last = t;
    const c = this.cur;
    if (c) {
      c.char.update(dt);
      for (const h of c.hands) h.set(1);
    }
    this.phase += RATE * dt;
    this.turn.rotation.y = START + SWAY * Math.sin(this.phase);
    this._render();
    this.raf = requestAnimationFrame(this._loop);
  }
  _render() {
    this.renderer.render(this.scene, this.camera);
  }

  _caption() {
    const o = this.words || {},
      state = this.host.dataset.state;
    const what = o.weaponName ? `${o.name} · ${o.weaponName}` : o.name || '';
    this.caption.textContent =
      state === 'busy' ? `${what}: ${o.loading || '…'}` : state === 'failed' ? `${what}: ${o.failed || '×'}` : what;
  }
  _state(s) {
    if (s) this.host.dataset.state = s;
    else delete this.host.dataset.state;
    this._caption();
  }

  _drop(made) {
    if (!made) return;
    for (const w of made.weapons) {
      if (w.kind === 'sword')
        w.object.traverse((n) => {
          if (n.isMesh) n.geometry.dispose();
        });
      W.disposeWeapon(w);
    }
    made.char.dispose();
  }

  dispose() {
    this.token++;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.ro) this.ro.disconnect();
    this._drop(this.cur);
    this.cur = null;
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
    this.canvas.remove();
    this.own.map.clear();
    delete this.host.dataset.state;
    this.caption.textContent = '';
  }
}
