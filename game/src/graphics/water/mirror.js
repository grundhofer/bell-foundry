import * as THREE from 'three';

const _plane = new THREE.Vector4(),
  _q = new THREE.Vector4(),
  _size = new THREE.Vector2();
export const MIRROR_ONLY = 3;

export class Mirror {
  /** y is the water level. sink is the clip plane depth in meters. */
  constructor(renderer, o = {}) {
    this.renderer = renderer;
    this.y = o.y || 0;
    this.sink = o.sink !== undefined ? o.sink : 0.012;
    this.scale = 1;
    this.maxLines = 1200;
    this.samples = 0;
    const cam = (this.cam = new THREE.PerspectiveCamera());
    cam.layers.set(0);
    cam.layers.enable(MIRROR_ONLY);
    cam.matrixAutoUpdate = false;
    cam.matrixWorldAutoUpdate = false;
    this.vp = new THREE.Matrix4();
    this.invVp = new THREE.Matrix4();
    this.reversed = renderer.capabilities.reversedDepthBuffer === true;
    this.depthMap = this.reversed ? new THREE.Vector2(1, 0) : new THREE.Vector2(2, -1);
    this.target = null;
    this.w = 0;
    this.h = 0;
    this.ready = false;
    this.enabled = true;
    this.skipped = 0;
    this.texture = null;
    this.depthTexture = null;
    this.onResize = null;
    this.fit();
  }

  setQuality(q, o = {}) {
    const t = { low: [0.5, 720, 0], medium: [0.75, 900, 0], high: [1, 1200, 0], ultra: [1, 1440, 4] }[q] || [
      1, 1200, 0,
    ];
    this.scale = o.scale > 0 ? o.scale : t[0];
    this.maxLines = t[1];
    const samples = o.samples >= 0 ? o.samples : t[2];
    if (this.samples !== samples) {
      this.samples = samples;
      this.w = 0;
    }
  }

  fit(size) {
    if (size) _size.copy(size);
    else this.renderer.getDrawingBufferSize(_size);
    const h = Math.max(64, Math.round(Math.min(this.maxLines, _size.y * this.scale) / 16) * 16),
      w = Math.max(64, Math.round((h * _size.x) / Math.max(1, _size.y) / 2) * 2);
    if (w === this.w && h === this.h && this.target) return;
    this.w = w;
    this.h = h;
    if (this.target) {
      this.target.depthTexture.dispose();
      this.target.dispose();
    }
    const depth = new THREE.DepthTexture(w, h);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.samples,
      depthTexture: depth,
    });
    this.texture = this.target.texture;
    this.depthTexture = depth;
    this.ready = false;
    if (this.onResize) this.onResize(this.texture, this.depthTexture);
  }

  render(scene, camera, size) {
    if (!this.enabled) return false;
    this.fit(size);
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements,
      cam = this.cam,
      e = cam.matrixWorld.elements,
      y0 = this.y;
    const height = m[13] - y0;
    if (height < 0.02) return false;
    const P = camera.projectionMatrix.elements;
    let down = false;
    for (let k = 0; k < 4 && !down; k++) {
      const x = ((k & 1 ? 1 : -1) + P[8]) / P[0],
        y = ((k & 2 ? 1 : -1) + P[9]) / P[5];
      down = m[1] * x + m[5] * y - m[9] < -1e-4;
    }
    if (!down) {
      this.skipped++;
      return false;
    }

    e[0] = -m[0];
    e[1] = m[1];
    e[2] = -m[2];
    e[3] = 0;
    e[4] = m[4];
    e[5] = -m[5];
    e[6] = m[6];
    e[7] = 0;
    e[8] = m[8];
    e[9] = -m[9];
    e[10] = m[10];
    e[11] = 0;
    e[12] = m[12];
    e[13] = 2 * y0 - m[13];
    e[14] = m[14];
    e[15] = 1;
    cam.matrix.copy(cam.matrixWorld);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.near = camera.near;
    cam.far = camera.far;
    cam.fov = camera.fov;
    cam.aspect = camera.aspect;
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrix.elements[8] = -cam.projectionMatrix.elements[8];

    const v = cam.matrixWorldInverse.elements,
      py = y0 - this.sink;
    _plane.set(v[4], v[5], v[6], 0);
    const vx = v[4] * py + v[12],
      vy = v[5] * py + v[13],
      vz = v[6] * py + v[14];
    _plane.w = -(_plane.x * vx + _plane.y * vy + _plane.z * vz);
    const p = cam.projectionMatrix.elements,
      rev = this.reversed;
    cam._reversedDepth = rev;
    _q.x = (Math.sign(_plane.x) + p[8]) / p[0];
    _q.y = (Math.sign(_plane.y) + p[9]) / p[5];
    _q.z = -1;
    if (rev) {
      _q.w = p[10] / p[14];
      const a = 1 / _plane.dot(_q);
      p[2] = -a * _plane.x;
      p[6] = -a * _plane.y;
      p[10] = -1 - a * _plane.z;
      p[14] = -a * _plane.w;
    } else {
      _q.w = (1 + p[10]) / p[14];
      const a = 2 / _plane.dot(_q);
      p[2] = a * _plane.x;
      p[6] = a * _plane.y;
      p[10] = a * _plane.z + 1;
      p[14] = a * _plane.w;
    }
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.invVp.copy(this.vp).invert();

    const r = this.renderer,
      prevTarget = r.getRenderTarget(),
      prevAuto = r.autoClear,
      prevXr = r.xr.enabled;
    const prevShadow = r.shadowMap.autoUpdate,
      prevNeeds = r.shadowMap.needsUpdate;
    r.xr.enabled = false;
    r.autoClear = true;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = false;
    r.setRenderTarget(this.target);
    r.render(scene, cam);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.xr.enabled = prevXr;
    r.shadowMap.autoUpdate = prevShadow;
    r.shadowMap.needsUpdate = prevNeeds;
    this.ready = true;
    return true;
  }

  dispose() {
    if (this.target) {
      this.target.depthTexture.dispose();
      this.target.dispose();
      this.target = null;
    }
  }
}
