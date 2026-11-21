import * as THREE from 'three';
import { AIR } from './shaders/chunks.js';
import { insertAfterInclude } from './shader-patch.js';
const WATER_Y = 0.07;

const rgb = (r, g, b) => new THREE.Color().setRGB(r, g, b);
const isStandard = (m) => m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);

const WORLD_GLSL = /* glsl */ `
vec3 bfWorldPos() { return ( - vViewPosition - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix ); }
vec3 bfWorldDir( vec3 v ) { return normalize( v * mat3( viewMatrix ) ); }
float bfHash3( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float bfNoise3( vec3 p ) {
	vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( bfHash3( i ), bfHash3( i + vec3( 1, 0, 0 ) ), f.x ), mix( bfHash3( i + vec3( 0, 1, 0 ) ), bfHash3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( bfHash3( i + vec3( 0, 0, 1 ) ), bfHash3( i + vec3( 1, 0, 1 ) ), f.x ), mix( bfHash3( i + vec3( 0, 1, 1 ) ), bfHash3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;

const WET_PARS = /* glsl */ `uniform vec4 uBfWet;`;
const WET_CODE = /* glsl */ `
	{
		vec3 bfP = bfWorldPos();
		float bfLine = bfP.y + 0.07 * sin( bfP.x * 2.3 + bfP.z * 1.7 ) + 0.05 * sin( bfP.z * 5.1 - bfP.x * 3.3 );
		float bfK = uBfWet.x * ( 1.0 - smoothstep( uBfWet.y, uBfWet.y + uBfWet.z, bfLine ) );
		diffuseColor.rgb *= mix( 1.0, uBfWet.w, bfK );
		roughnessFactor = mix( roughnessFactor, min( roughnessFactor, 0.3 ), bfK );
	}`;

const DETAIL_PARS = /* glsl */ `
uniform sampler2D tEvNoise;
uniform vec4 uBfDetail;
vec4 bfTri( vec3 p, vec3 w ) { return texture2D( tEvNoise, p.zy ) * w.x + texture2D( tEvNoise, p.xz ) * w.y + texture2D( tEvNoise, p.xy ) * w.z; }
vec3 bfBump( vec3 pos, vec3 n, float h, float face ) {
	vec3 sx = dFdx( pos ), sy = dFdy( pos );
	vec3 r1 = cross( sy, n ), r2 = cross( n, sx );
	float det = dot( sx, r1 ) * face;
	vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
	return normalize( abs( det ) * n - grad );
}`;
const DETAIL_COLOR = /* glsl */ `
	vec3 bfDP = bfWorldPos() * uBfDetail.x;
	#ifdef FLAT_SHADED
		vec3 bfDN = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
	#else
		vec3 bfDN = normalize( vNormal );
	#endif
	vec3 bfDW = abs( bfWorldDir( bfDN ) ); bfDW = pow( bfDW, vec3( 4.0 ) ); bfDW /= bfDW.x + bfDW.y + bfDW.z;
	vec4 bfD = bfTri( bfDP, bfDW ), bfD2 = bfTri( bfDP * 0.173 + 0.37, bfDW );
	diffuseColor.rgb *= 1.0 + uBfDetail.z * ( ( bfD.b - 0.5 ) * 0.9 + ( bfD2.r - 0.5 ) * 1.4 );
	roughnessFactor = clamp( roughnessFactor + uBfDetail.w * ( bfD.a - 0.5 + ( bfD2.g - 0.5 ) * 0.8 ), 0.045, 1.0 );`;
const DETAIL_NORMAL = /* glsl */ `
	normal = bfBump( - vViewPosition, normal, ( bfD.r + bfD2.b * 2.0 ) * uBfDetail.y / uBfDetail.x, faceDirection );`;

const GHOST = /* glsl */ `
	#ifdef USE_FOG
	if ( bfAir[ 14 ].w > 0.003 ) {
		vec2 bfGd = vFogWorld.xz - bfAir[ 8 ].xy;
		float bfGy = vFogWorld.y - bfAir[ 8 ].z;
		if ( dot( bfGd, bfGd ) < bfAir[ 15 ].x && bfGy > - 0.4 && bfGy < bfAir[ 8 ].w + 1.3 && distance( vFogWorld, cameraPosition ) < bfAir[ 15 ].y ) {
			if ( fract( 52.9829189 * fract( dot( floor( gl_FragCoord.xy ), vec2( 0.06711056, 0.00583715 ) ) ) ) < bfAir[ 14 ].w * 1.02 ) discard;
		}
	}
	#endif`;
function ghostable(material) {
  if (!material || material.userData.bfGhost) return material;
  material.userData.bfGhost = true;
  const before = material.onBeforeCompile,
    key = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    if (before) before.call(this, shader, renderer);
    const tag = '#include <clipping_planes_fragment>';
    if (shader.fragmentShader.includes(tag)) shader.fragmentShader = shader.fragmentShader.replace(tag, tag + GHOST);
  };
  material.customProgramCacheKey = function () {
    return (key ? key.call(this) : '') + '|ev:ghost';
  };
  material.needsUpdate = true;
  return material;
}

const CHAR_PARS = /* glsl */ `
uniform vec4 uBfChar0; uniform vec4 uBfChar1; uniform vec4 uBfChar2; uniform vec4 uBfChar3; uniform vec4 uBfTone;
uniform vec3 uBfRim; uniform vec3 uBfSelf; uniform vec3 uBfGold; uniform vec3 uBfFlash; uniform vec3 uBfTint;
float bfGoldTrim = 0.0;
float bfDissolveEdge = 0.0;
vec3 bfCharPos;`;
const CHAR_DISCARD = /* glsl */ `
	bfCharPos = bfWorldPos();
	if ( uBfChar2.y > 0.002 ) {
		float bfN = bfNoise3( bfCharPos * 9.0 ) * 0.7 + bfNoise3( bfCharPos * 31.0 ) * 0.3;
		float bfCut = uBfChar2.y * 1.12 - 0.06 + 0.25 * uBfChar2.y * clamp( ( bfCharPos.y - uBfChar3.z ) / max( uBfChar1.w, 0.1 ), 0.0, 1.0 );
		if ( bfN < bfCut ) discard;
		bfDissolveEdge = 1.0 - smoothstep( 0.0, 0.09, bfN - bfCut );
	}`;
const CHAR_SURFACE = /* glsl */ `
	{
		vec3 bfC = diffuseColor.rgb;
		float bfMx = max( bfC.r, max( bfC.g, bfC.b ) ), bfMn = min( bfC.r, min( bfC.g, bfC.b ) );
		float bfLum = dot( bfC, vec3( 0.2126, 0.7152, 0.0722 ) );
		bfGoldTrim = uBfChar3.w * smoothstep( 0.42, 0.68, ( bfMx - bfMn ) / max( bfMx, 1e-3 ) );
		metalnessFactor = clamp( ( metalnessFactor - uBfChar3.x ) / max( uBfChar3.y - uBfChar3.x, 1e-3 ), 0.0, 1.0 );
		roughnessFactor = clamp( roughnessFactor * uBfChar2.z + uBfChar2.w, 0.06, 1.0 );
		roughnessFactor = mix( roughnessFactor, uBfTone.z, bfGoldTrim );
		vec3 bfPlain = mix( bfC, vec3( bfLum ) * vec3( 1.0, 0.985, 0.955 ), uBfTone.x ) * uBfTone.y;
		vec3 bfGoldC = vec3( 1.0, 0.76, 0.34 ) * ( 0.5 + 1.1 * bfLum );
		diffuseColor.rgb = mix( mix( bfPlain, bfC * uBfTint, metalnessFactor ), bfGoldC, bfGoldTrim );
		metalnessFactor = max( metalnessFactor, bfGoldTrim );
	}
	{
		float bfLine = bfCharPos.y + 0.05 * sin( bfCharPos.x * 9.0 + bfCharPos.z * 7.0 );
		float bfK = uBfChar1.z * ( 1.0 - smoothstep( uBfChar1.x, uBfChar1.x + uBfChar1.y, bfLine ) );
		diffuseColor.rgb *= 1.0 - 0.42 * bfK;
		roughnessFactor = mix( roughnessFactor, min( roughnessFactor, 0.14 ), bfK );
	}`;
const CHAR_LIGHT = /* glsl */ `
	{
		vec3 bfV = normalize( vViewPosition );
		float bfFres = pow( 1.0 - saturate( dot( normal, bfV ) ), uBfChar0.y );
		float bfBack = saturate( dot( normal, vec3( 0.0, 0.675, - 0.737 ) ) * 0.5 + 0.62 );
		float bfOcc = 1.0;
		#ifdef USE_AOMAP
			bfOcc = mix( 1.0, texture2D( aoMap, vAoMapUv ).r, 0.8 );
		#endif
		totalEmissiveRadiance += uBfRim * ( bfFres * bfBack * bfOcc * uBfChar0.x );
		vec3 bfNW = bfWorldDir( normal );
		totalEmissiveRadiance += diffuseColor.rgb * uBfSelf * ( uBfChar0.z * ( 0.62 + 0.38 * bfNW.y ) * ( 1.0 - 0.75 * metalnessFactor ) * bfOcc );
		float bfH = clamp( ( bfCharPos.y - uBfChar3.z ) / max( uBfChar1.w, 0.1 ), 0.0, 1.0 );
		float bfRise = uBfChar0.w * smoothstep( 0.0, 0.3, uBfChar0.w * 1.3 - bfH );
		totalEmissiveRadiance += uBfGold * bfRise * ( 1.0 - 0.4 * bfH ) * mix( uBfTone.w, 1.0, bfGoldTrim ) * ( 0.55 + 0.45 * bfFres ) * bfOcc;
		totalEmissiveRadiance += uBfFlash * uBfChar2.x * ( 0.35 + 0.65 * bfFres );
		totalEmissiveRadiance += uBfGold * bfDissolveEdge * 8.0;
	}`;

function noiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y, s) => {
    let h = Math.imul(x * 374761393 + y * 668265263 + s * 2147483647, 1274126177);
    h ^= h >>> 13;
    h = Math.imul(h, 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const value = (x, y, period, s) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      fx = smooth(x - xi),
      fy = smooth(y - yi),
      w = (v) => ((v % period) + period) % period;
    const a = hash(w(xi), w(yi), s),
      b = hash(w(xi + 1), w(yi), s),
      c = hash(w(xi), w(yi + 1), s),
      d = hash(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  for (let ch = 0; ch < 4; ch++) {
    let lo = 1e9,
      hi = -1e9;
    const tmp = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let v = 0,
          amp = 0.5,
          period = ch === 0 ? 8 : ch === 3 ? 12 : 6;
        for (let o = 0; o < 5; o++) {
          v += amp * value((x / size) * period, (y / size) * period, period, ch * 17 + o * 5 + 1);
          amp *= ch === 0 ? 0.55 : 0.5;
          period *= 2;
        }
        tmp[y * size + x] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    for (let i = 0; i < size * size; i++) data[i * 4 + ch] = Math.round((255 * (tmp[i] - lo)) / (hi - lo));
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.name = 'gfx.noise';
  t.needsUpdate = true;
  return t;
}

const CHARACTER_SHADING = {
  player: {
    rim: 0.9,
    rimPower: 2.5,
    self: 0,
    rimColor: rgb(0.5, 0.66, 1.0),
    wetLine: 0.36,
    wetFade: 0.3,
    height: 1.8,
    rough: [0.72, 0.0],
    metal: [0.2, 0.62],
    goldTrim: 0,
    tone: [0, 1.3, 0.3, 0],
    tint: rgb(2.6, 3.0, 3.7),
    env: 1.9,
    normal: 1.0,
    key: 0.3,
    column: 1.3,
  },
  boss: {
    rim: 0.45,
    rimPower: 3.2,
    self: 0.46,
    rimColor: rgb(0.78, 0.86, 1.0),
    wetLine: 0.95,
    wetFade: 0.9,
    height: 6.6,
    rough: [0.8, 0.0],
    metal: [0.5, 1.0],
    goldTrim: 1,
    tone: [0.3, 1.12, 0.3, 0.03],
    tint: rgb(1, 1, 1),
    env: 1.1,
    normal: 0.75,
    key: 1.15,
    column: 3.0,
    rimGold: rgb(1.0, 0.78, 0.44),
    rimTwo: 2.2,
    selfTwo: 0.85,
    keyTwo: 1.8,
    goldPower: 1.5,
  },
};
const _k = new THREE.Vector3(),
  _kc = new THREE.Color();

export class Materials {
  constructor(gfx) {
    this.gfx = gfx;
    this.looks = [];
    this.made = [];
    this.noise = noiseTexture(256);
    this.colors = {
      self: rgb(0.9, 0.95, 1.0),
      selfGold: rgb(1.0, 0.88, 0.66),
      gold: rgb(1.0, 0.66, 0.25),
      flash: rgb(1.0, 0.93, 0.8),
    };
    this.kitGold = 0.88;
    this.ghost = { radius: 1.9, reach: 2.8 };
    this.key = {
      power: 1.5,
      cool: rgb(0.8, 0.88, 1.0),
      gold: rgb(1.0, 0.84, 0.58),
      coolTwo: rgb(0.78, 0.82, 1.0),
      from: new THREE.Vector3(-0.52, 0.72, 0.6),
      dir: new THREE.Vector3(0, 0.77, 0.64),
      at: new THREE.Vector3(),
      set: false,
    };
  }

  _injectShaderFeatures(material, add) {
    if (!isStandard(material)) return material;
    const ev = material.userData.ev || (material.userData.ev = { uniforms: {}, has: {} });
    let changed = false;
    for (const k in add) {
      if (!ev.has[k]) {
        ev.has[k] = true;
        changed = true;
      }
      Object.assign(ev.uniforms, add[k]);
    }
    if (!changed) return material;
    if (!ev.hooked) {
      ev.hooked = true;
      const before = material.onBeforeCompile,
        key = material.customProgramCacheKey;
      material.onBeforeCompile = (shader, renderer) => {
        if (before) before.call(material, shader, renderer);
        const has = ev.has;
        Object.assign(shader.uniforms, ev.uniforms);
        let f = shader.fragmentShader;
        f = f.replace(
          'void main() {',
          WORLD_GLSL +
            (has.wet ? WET_PARS : '') +
            (has.detail ? DETAIL_PARS : '') +
            (has.character ? CHAR_PARS : '') +
            '\nvoid main() {',
        );
        if (has.character) f = insertAfterInclude(f, 'clipping_planes_fragment', CHAR_DISCARD);
        f = insertAfterInclude(
          f,
          'metalnessmap_fragment',
          (has.character ? CHAR_SURFACE : '') + (has.detail ? DETAIL_COLOR : '') + (has.wet ? WET_CODE : ''),
        );
        if (has.detail) f = insertAfterInclude(f, 'normal_fragment_maps', DETAIL_NORMAL);
        if (has.character)
          f = insertAfterInclude(
            f,
            'normal_fragment_maps',
            '\troughnessFactor = min( 1.0, roughnessFactor + 0.55 * length( fwidth( normal ) ) );',
          );
        if (has.character) f = insertAfterInclude(f, 'emissivemap_fragment', CHAR_LIGHT);
        if (has.character && f.includes('#include <fog_fragment>'))
          f = f.replace(
            '#include <fog_fragment>',
            'vec3 bfClear = gl_FragColor.rgb;\n\t#include <fog_fragment>\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, bfClear, 0.5 );',
          );
        shader.fragmentShader = f;
      };
      material.customProgramCacheKey = () =>
        (key ? key.call(material) : '') + '|ev:' + Object.keys(ev.has).sort().join(',');
    }
    material.needsUpdate = true;
    return material;
  }

  _createMaterial(Type, defaults, o) {
    // eslint-disable-next-line no-unused-vars -- these keys are pulled out only so they stay out of `rest` (the material constructor)
    const { detail, wet, wetLine, wetFade, wetDark, scale, ...rest } = o || {};
    const m = new Type(Object.assign({}, defaults, rest));
    this.made.push(m);
    return ghostable(m);
  }

  stone(o = {}) {
    const m = this._createMaterial(THREE.MeshStandardMaterial, { color: 0x8d94a3, roughness: 0.86, metalness: 0 }, o);
    const detail = o.detail !== undefined ? o.detail : o.normalMap ? 0 : 1;
    if (detail > 0)
      this._injectShaderFeatures(m, {
        detail: {
          tEvNoise: { value: this.noise },
          uBfDetail: { value: new THREE.Vector4(1 / (o.scale || 1.6), 0.0035 * detail, 0.14 * detail, 0.16 * detail) },
        },
      });
    if (o.wet) this.wet(m, o.wet, o);
    return m;
  }

  metal(o = {}) {
    const m = this._createMaterial(THREE.MeshStandardMaterial, { color: 0xc9d0da, roughness: 0.3, metalness: 1 }, o);
    const detail = o.detail !== undefined ? o.detail : o.roughnessMap ? 0 : 0.5;
    if (detail > 0)
      this._injectShaderFeatures(m, {
        detail: {
          tEvNoise: { value: this.noise },
          uBfDetail: { value: new THREE.Vector4(1 / (o.scale || 0.35), 0.0004 * detail, 0.08 * detail, 0.22 * detail) },
        },
      });
    if (o.wet) this.wet(m, o.wet, o);
    return m;
  }

  wet(material, amount = 1, o = {}) {
    if (!isStandard(material)) return material;
    const ev = material.userData.ev,
      u = ev && ev.uniforms.uBfWet;
    const line = WATER_Y + (o.wetLine !== undefined ? o.wetLine : 0.5),
      fade = o.wetFade !== undefined ? o.wetFade : 0.9,
      dark = o.wetDark !== undefined ? o.wetDark : 0.55;
    if (u) {
      u.value.set(amount, line, fade, dark);
      return material;
    }
    return this._injectShaderFeatures(material, {
      wet: { uBfWet: { value: new THREE.Vector4(amount, line, fade, dark) } },
    });
  }

  character(root, { who = 'player', ...o } = {}) {
    if (root.userData.look) return root.userData.look;
    const W = Object.assign({}, CHARACTER_SHADING[who] || CHARACTER_SHADING.player, o),
      C = this.colors;
    const u = {
      uBfChar0: { value: new THREE.Vector4(W.rim, W.rimPower, W.self, 0) },
      uBfChar1: { value: new THREE.Vector4(WATER_Y + W.wetLine, W.wetFade, 1, W.height) },
      uBfChar2: { value: new THREE.Vector4(0, 0, W.rough[0], W.rough[1]) },
      uBfChar3: { value: new THREE.Vector4(W.metal[0], W.metal[1], 0, W.goldTrim) },
      uBfTone: { value: new THREE.Vector4(W.tone[0], W.tone[1], W.tone[2], W.tone[3] || 0) },
      uBfTint: { value: W.tint.clone() },
      uBfRim: { value: W.rimColor.clone() },
      uBfSelf: { value: C.self.clone() },
      uBfGold: { value: C.gold.clone().multiplyScalar(W.goldPower || 1.5) },
      uBfFlash: { value: C.flash.clone().multiplyScalar(3) },
    };
    const look = {
      who,
      root,
      materials: [],
      uniforms: u,
      base: W,
      _gold: who === 'boss' ? null : 0,
      _goldNow: 0,
      key: 1,
      _rim: 1,
      _glow: 1,
      ghost: 0,
    };
    Object.defineProperties(look, {
      gold: {
        get() {
          return this._gold === null ? this._goldNow : this._gold;
        },
        set(v) {
          this._gold = v === undefined ? null : v;
        },
      },
      rim: {
        get() {
          return this._rim;
        },
        set(v) {
          this._rim = v;
        },
      },
      glow: {
        get() {
          return this._glow;
        },
        set(v) {
          this._glow = v;
        },
      },
      wet: {
        get() {
          return u.uBfChar1.value.z;
        },
        set(v) {
          u.uBfChar1.value.z = v;
        },
      },
      flash: {
        get() {
          return u.uBfChar2.value.x;
        },
        set(v) {
          u.uBfChar2.value.x = v;
        },
      },
      fade:
        who === 'player'
          ? {
              get() {
                return this.ghost;
              },
              set(v) {
                this.ghost = v;
              },
            }
          : {
              get() {
                return u.uBfChar2.value.y;
              },
              set(v) {
                u.uBfChar2.value.y = v;
              },
            },
    });
    const seen = new Map();
    root.traverse((n) => {
      if (!n.isSkinnedMesh) return;
      const one = (m) => {
        if (!isStandard(m)) return m;
        let c = seen.get(m);
        if (!c) {
          c = m.clone();
          c.name = (m.name || 'body') + ':' + who;
          c.userData = {};
          c.envMapIntensity = W.env;
          if (c.normalScale) c.normalScale.multiplyScalar(W.normal);
          this._injectShaderFeatures(c, { character: u });
          ghostable(c);
          seen.set(m, c);
          look.materials.push(c);
        }
        return c;
      };
      n.material = Array.isArray(n.material) ? n.material.map(one) : one(n.material);
    });
    this.looks.push(look);
    root.userData.look = look;
    return look;
  }

  update(mood, dt = 1 / 60) {
    const g = Math.min(1, Math.max(0, mood.gold)),
      A = AIR,
      K = this.key,
      C = this.colors;
    const e = this.gfx.camera.matrixWorld.elements;
    let bx = e[8],
      bz = e[10];
    const bl = Math.hypot(bx, bz);
    if (bl > 1e-4) {
      bx /= bl;
      bz /= bl;
    } else {
      bx = 0;
      bz = 1;
    }
    _k.set(bx * K.from.z + e[0] * K.from.x, K.from.y, bz * K.from.z + e[2] * K.from.x).normalize();
    const cut =
      !K.set ||
      K.dir.dot(_k) < 0.7 ||
      Math.abs(e[12] - K.at.x) + Math.abs(e[13] - K.at.y) + Math.abs(e[14] - K.at.z) > 1.5;
    K.at.set(e[12], e[13], e[14]);
    if (cut) {
      K.dir.copy(_k);
      K.set = true;
    } else K.dir.lerp(_k, 1 - Math.exp(-5 * Math.min(0.1, Math.max(0, dt)))).normalize();
    A[48] = K.dir.x;
    A[49] = K.dir.y;
    A[50] = K.dir.z;
    _kc.copy(K.cool).lerp(K.gold, g);
    A[52] = _kc.r * K.power;
    A[53] = _kc.g * K.power;
    A[54] = _kc.b * K.power;
    _kc.copy(K.cool).lerp(K.coolTwo, g);
    A[56] = _kc.r * K.power;
    A[57] = _kc.g * K.power;
    A[58] = _kc.b * K.power;
    A[37] = 0;
    A[45] = 0;
    A[59] = 0;
    A[60] = this.ghost.radius * this.ghost.radius;
    A[61] = this.ghost.reach;
    for (let i = 0; i < this.looks.length; i++) {
      const l = this.looks[i],
        u = l.uniforms,
        W = l.base,
        m = l.root.matrixWorld.elements,
        gold = l._gold === null ? g * (W.goldScale !== undefined ? W.goldScale : 1) : l._gold;
      l._goldNow = l._gold === null && l.who === 'boss' ? g * this.kitGold : 0;
      u.uBfChar0.value.w = gold;
      u.uBfChar3.value.z = m[13];
      u.uBfChar0.value.x = W.rim * l._rim * (1 + ((W.rimTwo || 1) - 1) * gold);
      if (W.rimGold) u.uBfRim.value.copy(W.rimColor).lerp(W.rimGold, gold);
      if (W.self > 0) {
        u.uBfSelf.value.copy(C.self).lerp(C.selfGold, gold);
        u.uBfChar0.value.z = W.self * l._glow * (1 + ((W.selfTwo || 1) - 1) * gold);
      }
      const o = l.who === 'boss' ? 40 : 32;
      A[o] = m[12];
      A[o + 1] = m[14];
      A[o + 2] = m[13];
      A[o + 3] = W.height;
      A[o + 4] = W.column;
      A[o + 5] = W.key * l.key * (1 + ((W.keyTwo || 1) - 1) * gold) * (1 - u.uBfChar2.value.y);
      A[o + 6] = 0;
      A[o + 7] = 0;
      if (l.who === 'player') {
        const ghost = (A[59] = Math.min(1, Math.max(0, l.ghost || 0)));
        if (ghost > 0.003) {
          const p = this.gfx.ctx && this.gfx.ctx.player,
            kit = p && p.kit;
          if (kit && kit.fade > 0 && (!p.look || p.look === l)) kit.fade = 0;
        }
      }
    }
  }

  lookOf(object) {
    for (let o = object; o; o = o.parent) if (o.userData && o.userData.look) return o.userData.look;
    let found = null;
    if (object && object.traverse)
      object.traverse((o) => {
        if (!found && o.userData && o.userData.look) found = o.userData.look;
      });
    return found;
  }

  release(root) {
    const l = root.userData.look;
    if (!l) return;
    for (const m of l.materials) m.dispose();
    const i = this.looks.indexOf(l);
    if (i >= 0) this.looks.splice(i, 1);
    delete root.userData.look;
  }

  dispose() {
    for (const l of this.looks) {
      for (const m of l.materials) m.dispose();
      delete l.root.userData.look;
    }
    this.looks.length = 0;
    for (const m of this.made) m.dispose();
    this.made.length = 0;
    this.noise.dispose();
  }
}
