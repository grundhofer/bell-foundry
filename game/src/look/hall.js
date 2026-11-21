import * as THREE from 'three';
import { Arena } from '../world/arena.js';
import * as L from '../world/layout.js';
import { FOUNDRY } from '../graphics/shaders/foundry.js';
import { xorshift32 } from '../core/math.js';
import { FOUNDRY_LOOK } from '../config/foundry-look.js';

const H = FOUNDRY_LOOK.hall;
if (H.outer) {
  const D = H.outer.width,
    MASS = ['ashlar'];
  const side = (sd) => (sd === 's' ? 1 : -1);
  Arena.prototype.aisles = function (b) {
    for (const sd of ['s', 'n']) {
      const sx = side(sd),
        x = sx * L.PIER_X,
        x2 = sx * (L.PIER_X + D),
        A = L.AISLE[sd];
      const o = (xx, z, extra = {}) => ({ zone: this.zone(xx, z), cast: MASS, mirror: MASS, ...extra });
      A.arch.forEach((code, j) => {
        const z = L.PIER_Z[j];
        if (code) b.place(code === 'full' ? 'aisle_arch' : 'aisle_arch_broken', { x, z, sx }, o(x, z, { tint: 0.95 }));
      });
      A.arch.forEach((code, j) => {
        const z = L.PIER_Z[j];
        b.place('pier', { x: x2, z, sx }, o(x2, z, { tint: 0.9, mirror: true }));
        if (code || j === 0 || j === A.arch.length - 1)
          b.place(code === 'broken' ? 'aisle_arch_broken' : 'aisle_arch', { x: x2, z, sx }, o(x2, z, { tint: 0.92 }));
      });
      L.NAVE[sd].forEach((code, i) => {
        const z = L.BAY_Z[i],
          st = L.RUIN_STATES[code.replace('~', '')];
        b.place(st.stack[0], { x: x2, z, sx, sz: code.endsWith('~') ? -1 : 1 }, o(x2, z, { tint: 0.9 }));
      });
      A.wall.forEach((code, i) => {
        const z = L.BAY_Z[i];
        b.place(
          'aisle_' + code.replace('~', ''),
          { x: x2, z, sx, sz: code.endsWith('~') ? -1 : 1 },
          o(x2, z, { tint: 0.88 }),
        );
      });
      A.arch.forEach((code, j) => {
        const z = L.PIER_Z[j];
        b.place('respond', { x: x2, z, sx }, { zone: this.zone(x2, z), tint: 0.88, cast: false, mirror: false });
      });
    }
  };
  const east = Arena.prototype.eastEnd,
    west = Arena.prototype.westEnd;
  Arena.prototype.eastEnd = function (b) {
    east.call(this, b);
    const zc = L.PIER_Z[0] - L.BAY / 2,
      zp = L.PIER_Z[0] - L.BAY,
      zone = 'e';
    for (const sx of [1, -1]) {
      const x2 = sx * (L.PIER_X + D);
      b.place('pier', { x: x2, z: zp, sx }, { zone, cast: MASS, mirror: true });
      b.place('arcade_full', { x: x2, z: zc, sx }, { zone, cast: MASS, mirror: MASS });
      b.place('aisle_full', { x: x2, z: zc, sx }, { zone, tint: 0.88, cast: MASS, mirror: MASS });
      b.place('aisle_arch', { x: x2, z: zp, sx }, { zone, tint: 0.92, cast: MASS, mirror: MASS });
      if (this.kit.has('east_aisle'))
        b.place(
          sx > 0 ? 'east_aisle' : 'east_aisle_ruin',
          { x: sx * D, sx },
          { zone, tint: 0.88, cast: MASS, mirror: MASS },
        );
    }
  };
  Arena.prototype.westEnd = function (b) {
    west.call(this, b);
    if (!this.kit.has('east_aisle')) return;
    const tz = L.WEST_Z + 0.35 + L.EAST_Z,
      zone = 'w';
    b.place('east_aisle', { x: -D, z: tz, ry: Math.PI }, { zone, tint: 0.88, cast: false, mirror: MASS });
    b.place('east_aisle_ruin', { x: D, z: tz, ry: Math.PI, sx: -1 }, { zone, tint: 0.88, cast: false, mirror: MASS });
  };
}

function brickTextures(seed = 7) {
  const N = 512,
    rows = 7,
    per = 3,
    r = xorshift32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const height = new Float32Array(N * N);
  g.fillStyle = '#1a1210';
  g.fillRect(0, 0, N, N);
  const rh = N / rows,
    bw = N / per,
    m = 5;
  for (let y = 0; y < rows; y++)
    for (let x = -1; x <= per; x++) {
      const x0 = x * bw + (y % 2 ? bw / 2 : 0),
        y0 = y * rh;
      const v = 0.55 + r() * 0.45,
        burnt = r() < 0.18;
      const col = burnt ? [52 * v, 30 * v, 24 * v] : [118 * v, 58 * v, 40 * v];
      g.fillStyle = `rgb(${col.map((k) => k | 0).join(',')})`;
      g.fillRect(x0 + m, y0 + m, bw - 2 * m, rh - 2 * m);
      for (let k = 0; k < 60; k++) {
        g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.15})`;
        g.fillRect(x0 + m + r() * (bw - 2 * m), y0 + m + r() * (rh - 2 * m), 2 + r() * 4, 2 + r() * 3);
      }
      for (let py = Math.max(0, y0 + m) | 0; py < Math.min(N, y0 + rh - m); py++)
        for (let px = Math.max(0, x0 + m) | 0; px < Math.min(N, x0 + bw - m); px++) {
          const e = Math.min(px - x0 - m, x0 + bw - m - px, py - y0 - m, y0 + rh - m - py);
          height[py * N + px] = Math.min(1, e / 6);
        }
    }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const nd = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const h = (xx, yy) => height[((yy + N) % N) * N + ((xx + N) % N)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * 2.5,
        dy = (h(x, y + 1) - h(x, y - 1)) * 2.5,
        l = Math.hypot(dx, dy, 1),
        o = (y * N + x) * 4;
      nd[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      nd[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      nd[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nd[o + 3] = 255;
    }
  const normal = new THREE.DataTexture(nd, N, N);
  normal.needsUpdate = true;
  for (const t of [map, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
  }
  return { map, normal };
}
/** Use UVs in meters so brick tiles stay the same size. */
function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d),
    uv = g.attributes.uv;
  const size = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * size[f][0], uv.getY(i) * size[f][1]);
    }
  return g;
}
function cylinder(rt, rb, h, seg = 24) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, true),
    uv = g.attributes.uv,
    c = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * c, uv.getY(i) * h);
  return g;
}

export const NOISE = `
float fnH( vec2 p ) { p = fract( p * vec2( 127.1, 311.7 ) ); p += dot( p, p + 19.19 ); return fract( p.x * p.y ); }
float fnN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( fnH( i ), fnH( i + vec2( 1, 0 ) ), f.x ), mix( fnH( i + vec2( 0, 1 ) ), fnH( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float fnF( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i++ ) { s += a * fnN( p ); p = p * 2.03 + vec2( 1.7, 9.2 ); a *= 0.5; } return s; }
vec3 fnFire( float k ) {
	vec3 c = mix( vec3( 0.0 ), vec3( 0.32, 0.012, 0.0 ), smoothstep( 0.0, 0.3, k ) );
	c = mix( c, vec3( 1.0, 0.17, 0.008 ), smoothstep( 0.25, 0.55, k ) );
	c = mix( c, vec3( 1.9, 0.62, 0.06 ), smoothstep( 0.5, 0.8, k ) );
	return mix( c, vec3( 3.2, 2.1, 1.0 ), smoothstep( 0.82, 1.0, k ) );
}
`;
const PLAIN_VERT = `
attribute float aLayer;
varying vec2 vUv;
varying float vLayer;
varying vec3 vP;
void main() { vUv = uv; vLayer = aLayer; vec4 w = modelMatrix * vec4( position, 1.0 ); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
// Hot colours stay below the white end of the tone curve; only the cores reach yellow-white.
const FLAME_RAMP = `
vec3 fnFlame( float k ) {
	vec3 c = mix( vec3( 0.0 ), vec3( 0.42, 0.025, 0.0 ), smoothstep( 0.0, 0.16, k ) );
	c = mix( c, vec3( 1.45, 0.17, 0.008 ), smoothstep( 0.12, 0.4, k ) );
	c = mix( c, vec3( 2.6, 0.7, 0.05 ), smoothstep( 0.36, 0.68, k ) );
	c = mix( c, vec3( 3.8, 1.75, 0.3 ), smoothstep( 0.64, 0.88, k ) );
	return mix( c, vec3( 5.0, 3.3, 1.3 ), smoothstep( 0.88, 1.0, k ) );
}
`;
const FLAME_VERT = `
attribute float aLayer;
uniform float uLite;
varying vec2 vUv;
varying float vLayer;
varying vec3 vP;
void main() {
	vUv = uv; vLayer = aLayer; vec4 w = modelMatrix * vec4( position, 1.0 ); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
	if ( uLite > 0.5 && ( abs( aLayer - 1.0 ) < 0.1 || abs( aLayer - 3.0 ) < 0.1 ) ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
}
`;
// Layers 0-4 stand back to front over the coals, 9 licks out under the crown. Each layer is two rows of tongues whose heights lick up and down.
const FLAME_FRAG = `
uniform float uTime;
uniform float uFlare;
uniform float uStrength;
varying vec2 vUv;
varying float vLayer;
varying vec3 vP;
${NOISE}
${FLAME_RAMP}
float fnTongue( float cx, float y, float tall, float t, float s ) {
	float id = floor( cx ), fx = fract( cx ) - 0.5 - ( fnH( vec2( id, s ) ) - 0.5 ) * 0.3;
	float k = fnN( vec2( id * 1.37 + s, t * ( 0.8 + 0.5 * fnH( vec2( s, id ) ) ) ) ), h = tall * ( 0.25 + 0.75 * k * sqrt( k ) ), yy = y / h;
	return 0.38 * pow( max( 1.0 - yy, 0.0 ), 0.7 ) - abs( fx ) - max( yy - 1.0, 0.0 ) * 1.4;
}
void main() {
	float L = vLayer, lick = step( 8.5, L ), y = vUv.y, s = L * 3.71;
	float t = uTime * ( 1.0 + 0.06 * L * ( 1.0 - lick ) ), x = vP.x, ym = vP.y;
	float sway = ( fnN( vec2( x * 0.9 + s, ym * 0.8 - t * 1.1 ) ) - 0.5 ) * ( 0.15 + 1.4 * y ) + ( fnN( vec2( x * 2.2 - s, ym * 1.9 - t * 2.3 ) ) - 0.5 ) * 0.35 * y;
	float tall = 0.7 + 0.4 * uFlare;
	float cx = x * 1.5 + sway * 1.5 + s;
	float d = max( fnTongue( cx, y, tall, t, s ), fnTongue( cx * 1.7 + 0.43, y, tall * 0.8, t * 1.2, s + 7.0 ) / 1.7 );
	d = max( d, ( 0.12 - y * 1.6 ) * ( 1.0 - lick ) );
	float n = fnN( vec2( cx * 4.3, ym * 3.0 - t * 4.6 ) );
	d += ( n - 0.5 ) * ( 0.06 + 0.2 * y );
	if ( lick > 0.5 ) {
		float mid = exp( - pow( ( vUv.x - 0.5 ) * 3.2, 2.0 ) );
		float gust = smoothstep( 0.35, 0.75, fnN( vec2( t * 0.7, 3.0 ) ) * 0.6 + uFlare * 0.7 );
		d -= ( 1.0 - mid * gust ) * 0.5 + ( 1.0 - smoothstep( 0.0, 0.3, y ) ) * 0.4;
	} else d -= ( 1.0 - smoothstep( 0.0, 0.1, min( vUv.x, 1.0 - vUv.x ) ) ) * 0.4;
	float w = fwidth( d ) * 0.8 + 0.002 + 0.03 * y * y, m = smoothstep( - w, w, d );
	if ( m < 0.002 ) discard;
	float core = smoothstep( 0.0, 0.3, d ), streak = fnN( vec2( cx * 2.6 + 3.0, ym * 1.2 - t * 3.1 ) ), lum = 0.7 + 0.6 * fnN( vec2( cx * 3.1 - 1.7, ym * 2.2 - t * 3.6 ) );
	float temp = clamp( 0.16 + core * ( 0.72 - 0.4 * y ) - 0.3 * y + 0.2 * ( streak - 0.5 ) + ( 0.12 + 0.3 * core ) * exp( - y * 6.0 ), 0.0, 1.0 );
	float near = lick > 0.5 ? 1.0 : 0.4 + 0.15 * L;
	gl_FragColor = vec4( fnFlame( temp * ( 0.8 + 0.2 * near ) ) * near * lum * m * uStrength, m * ( 0.35 + 0.55 * core ) );
}
`;
const COAL_FRAG = `
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vP;
${NOISE}
${FLAME_RAMP}
vec2 fnCell( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ); float d1 = 8.0, d2 = 8.0;
	for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
		vec2 g = vec2( float( x ), float( y ) ), o = vec2( fnH( i + g ), fnH( i + g + 17.3 ) );
		float d = length( g + o - f );
		if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
	}
	return vec2( d1, d2 );
}
void main() {
	vec2 q = vP.xz * 6.5;
	q += ( vec2( fnN( q * 0.6 + vec2( 0.0, uTime * 1.1 ) ), fnN( q * 0.6 + vec2( 5.2, uTime * 1.1 ) ) ) - 0.5 ) * 0.1;
	vec2 c = fnCell( q + ( vec2( fnN( q * 0.5 ), fnN( q * 0.5 + 7.0 ) ) - 0.5 ) * 0.8 );
	float breath = fnN( q * 0.3 + vec2( uTime * 0.25, - uTime * 0.18 ) );
	float crack = 1.0 - smoothstep( 0.0, 0.035 + 0.05 * breath, c.y - c.x );
	float hot = smoothstep( 0.45, 0.85, fnN( q * 0.22 + vec2( uTime * 0.06, - uTime * 0.05 ) ) ) * ( 1.0 - 0.6 * smoothstep( 0.1, 0.5, c.x ) );
	float heat = 0.05 + 0.08 * vUv.y + crack * ( 0.5 + 0.4 * breath ) + hot * 0.55 + 0.08 * breath;
	gl_FragColor = vec4( fnFlame( clamp( heat, 0.0, 1.0 ) ) * uStrength, 1.0 );
}
`;
// Firebox lining: brick map lit by the moving flame light, warped a little by the heat.
const BOX_FRAG = `
uniform float uTime;
uniform float uStrength;
uniform vec2 uBox;
uniform sampler2D uMap;
uniform float uOpen;
varying vec3 vP;
${NOISE}
${FLAME_RAMP}
void main() {
	vec3 n = abs( normalize( cross( dFdx( vP ), dFdy( vP ) ) ) );
	float h = clamp( ( vP.y - uBox.x ) / uBox.y, 0.0, 1.0 );
	vec2 uv = n.z > 0.5 ? vP.xy : ( n.x > 0.5 ? vP.zy : vP.xz );
	uv += ( vec2( fnN( uv * vec2( 4.0, 6.0 ) + vec2( 0.0, - uTime * 1.6 ) ), fnN( uv * vec2( 4.0, 6.0 ) + vec2( 3.3, - uTime * 1.6 ) ) ) - 0.5 ) * 0.014 * ( 1.0 - h );
	vec3 alb = texture2D( uMap, uv ).rgb;
	float lit = fnN( vec2( vP.x * 0.7 + vP.z * 0.7, vP.y * 0.9 - uTime * 1.3 ) ) * 0.6 + fnN( vec2( vP.x * 1.9 - uTime * 0.4, vP.y * 2.2 - uTime * 2.4 ) ) * 0.4;
	float k = exp( - h * 3.0 ) * ( 0.45 + 1.2 * lit * lit ) + ( n.y > 0.5 ? 0.3 * lit : 0.0 );
	vec3 c = alb * mix( vec3( 3.3, 1.05, 0.18 ), vec3( 4.0, 2.4, 1.0 ), 0.5 * uOpen ) * k * ( 1.0 + 1.2 * uOpen ) + fnFlame( ( 0.18 + 0.25 * uOpen ) * exp( - h * 3.0 ) ) * ( 0.4 + 0.4 * uOpen );
	gl_FragColor = vec4( c * uStrength, 1.0 );
}
`;
const MELT_FRAG = `
uniform float uTime;
uniform float uStrength;
uniform vec3 uGlow;
uniform vec3 uCrust;
varying vec2 vUv;
${NOISE}
void main() {
	float s = vUv.y - uTime * 0.45;
	float edge = smoothstep( 0.0, 0.3, vUv.x ) * ( 1.0 - smoothstep( 0.7, 1.0, vUv.x ) );
	float n = fnF( vec2( vUv.x * 3.0, s * 2.6 ) );
	float crust = smoothstep( 0.6, 0.76, n + ( 1.0 - edge ) * 0.3 );
	float hot = 0.75 + 0.35 * fnN( vec2( vUv.x * 7.0, s * 7.0 ) );
	float streak = smoothstep( 0.55, 0.85, fnN( vec2( vUv.x * 5.0, s * 1.2 ) ) ) * edge;
	vec3 c = mix( uGlow * hot * ( 1.0 + 1.6 * streak ), uCrust + uGlow * 0.06 * ( 1.0 - smoothstep( 0.7, 0.9, n ) ), crust );
	gl_FragColor = vec4( c * uStrength, 1.0 );
}
`;
// Light the floor with an additive card to keep the light count fixed.
const POOL_FRAG = `
uniform vec3 uColour;
uniform vec4 uSrc;
uniform vec4 uBounds;
varying vec3 vP;
void main() {
	vec2 d = vP.xz - uSrc.xy;
	float fwd = max( d.y, 0.0 ), side = max( abs( d.x ) - uSrc.z * ( 0.8 + 0.45 * fwd ), 0.0 );
	float k = exp( - fwd / uSrc.w ) * exp( - side * side * 0.9 ) * smoothstep( -0.05, 0.3, d.y );
	k *= smoothstep( uBounds.x, uBounds.x + 0.8, vP.x ) * ( 1.0 - smoothstep( uBounds.z - 0.8, uBounds.z, vP.x ) ) * ( 1.0 - smoothstep( uBounds.w - 0.5, uBounds.w, vP.z ) );
	gl_FragColor = vec4( uColour * k, 1.0 );
}
`;
const AIR_VERT = `
attribute vec4 aSeed;
attribute float aKind;
uniform float uTime;
uniform float uScale;
uniform float uFlare;
uniform vec3 uSmoke;
uniform vec3 uWarm;
varying vec4 vCol;
varying float vKind;
varying float vSeed;
void main() {
	float life = aKind < 0.5 ? mix( 1.3, 2.6, aSeed.y ) : ( aKind < 1.5 ? mix( 1.8, 3.2, aSeed.y ) : ( aKind < 2.5 ? mix( 7.0, 10.0, aSeed.y ) : ( aKind < 3.5 ? mix( 4.0, 6.0, aSeed.y ) : mix( 1.6, 3.0, aSeed.y ) ) ) );
	float ph = fract( uTime / life + aSeed.x ), age = ph * life;
	vec3 p = position, c;
	float size, a = 1.0;
	if ( aKind > 3.5 ) {
		// Embers lifting off the coals through the flames and out of the mouth.
		p += vec3( ( aSeed.z - 0.5 ) * 0.5, 0.7 + 0.9 * aSeed.w, 0.35 + 0.5 * aSeed.y ) * age + vec3( 0.0, 0.25, 0.0 ) * age * age;
		p.x += sin( age * ( 3.0 + 2.0 * aSeed.w ) + aSeed.z * 40.0 ) * 0.12 * age;
		float k = 1.0 - ph, twinkle = 0.55 + 0.45 * sin( age * ( 23.0 + 20.0 * aSeed.z ) + aSeed.w * 60.0 );
		c = mix( vec3( 0.7, 0.06, 0.0 ), mix( vec3( 3.2, 0.95, 0.1 ), vec3( 4.2, 2.2, 0.5 ), smoothstep( 0.75, 1.0, k ) ), smoothstep( 0.2, 0.6, k ) ) * twinkle * smoothstep( 0.0, 0.2, k ) * smoothstep( 0.0, 0.04, ph );
		size = mix( 0.014, 0.03, aSeed.z );
		a = 0.0;
	} else if ( aKind < 1.5 ) {
		vec3 v = aKind < 0.5 ? vec3( ( aSeed.z - 0.5 ) * 1.6, 0.9 + 1.6 * aSeed.w, 0.7 + 1.3 * aSeed.y ) : vec3( ( aSeed.z - 0.5 ) * 1.2, 2.2 + 2.0 * aSeed.w, ( aSeed.y - 0.5 ) * 1.2 );
		p += v * age + vec3( 0.25, 0.55, 0.0 ) * age * age;
		p.x += sin( age * 2.7 + aSeed.z * 31.0 ) * 0.22 * age;
		p.z += cos( age * 2.3 + aSeed.w * 17.0 ) * 0.12 * age;
		float twinkle = 0.65 + 0.35 * sin( age * 37.0 + aSeed.w * 50.0 );
		float k = 1.0 - ph;
		c = mix( vec3( 0.5, 0.05, 0.0 ), mix( vec3( 3.0, 0.9, 0.12 ), vec3( 4.4, 2.6, 0.9 ), smoothstep( 0.7, 1.0, k ) ), smoothstep( 0.15, 0.6, k ) ) * twinkle * smoothstep( 0.0, 0.25, k );
		c *= aKind < 0.5 ? ( 0.75 + 0.6 * uFlare ) : 1.0;
		size = mix( 0.035, 0.06, aSeed.z );
		a = 0.0;
	} else {
		float sm = aKind < 2.5 ? 1.0 : 0.0;
		vec3 v = sm > 0.5 ? vec3( ( aSeed.z - 0.5 ) * 0.5 + 0.35, 1.1 + 0.6 * aSeed.w, ( aSeed.y - 0.5 ) * 0.5 ) : vec3( ( aSeed.z - 0.5 ) * 0.5, 0.5 + 0.3 * aSeed.w, 0.18 );
		p += v * age * ( 1.0 - 0.18 * ph );
		p.x += sin( age * 0.6 + aSeed.w * 9.0 ) * 0.5 * ph;
		size = sm > 0.5 ? mix( 1.8, 8.0, ph ) * ( 0.8 + 0.4 * aSeed.z ) : mix( 0.5, 2.2, ph );
		float alpha = ( sm > 0.5 ? 0.62 : 0.16 ) * smoothstep( 0.0, 0.1, ph ) * ( 1.0 - ph ) * ( 1.0 - ph );
		c = mix( uWarm, uSmoke, smoothstep( 0.0, 0.22, ph ) ) * alpha;
		a = alpha;
	}
	vec4 mv = modelViewMatrix * vec4( p, 1.0 );
	gl_Position = projectionMatrix * mv;
	gl_PointSize = clamp( size * uScale / max( - mv.z, 0.3 ), 1.5, 400.0 );
	vCol = vec4( c, a );
	vKind = aKind;
	vSeed = aSeed.w;
}
`;
const AIR_FRAG = `
varying vec4 vCol;
varying float vKind;
varying float vSeed;
void main() {
	vec2 q = gl_PointCoord - 0.5;
	float r = length( q );
	if ( vKind < 1.5 || vKind > 3.5 ) {
		float k = exp( - r * r * 24.0 ) + 0.25 * ( 1.0 - smoothstep( 0.0, 0.5, r ) );
		if ( k < 0.01 ) discard;
		gl_FragColor = vec4( vCol.rgb * k, 0.0 );
	} else {
		float n = 0.75 + 0.25 * sin( atan( q.y, q.x ) * 3.0 + vSeed * 20.0 );
		float k = 1.0 - smoothstep( 0.12 * n, 0.5 * n, r );
		if ( k * vCol.a < 0.003 ) discard;
		gl_FragColor = vec4( vCol.rgb * k, vCol.a * k );
	}
}
`;

const HEAT_PARS = `
varying vec3 vFnPos;
uniform vec4 uFnMouth;      // half width, arch base Y, sill Y, front Z (m)
uniform vec3 uFnHeat;
uniform vec4 uFnK;          // edge falloff (1/m), iron glow, time, soot
uniform vec2 uFnTop;
uniform float uFnOpen;
${NOISE}
float fnEdge() {
	float dx = abs( vFnPos.x ) - uFnMouth.x;
	float d = vFnPos.y < uFnMouth.y ? dx : length( vec2( vFnPos.x, vFnPos.y - uFnMouth.y ) ) - uFnMouth.x;
	d = max( d, uFnMouth.z - vFnPos.y );
	float deep = clamp( ( uFnMouth.w - vFnPos.z ) / 0.8, 0.0, 1.0 );
	float e = exp( - max( d, 0.0 ) * uFnK.x ) * ( 0.6 + 0.4 * deep );
	return e * ( 0.8 + 0.4 * fnN( vFnPos.xy * 3.0 + vec2( 0.0, - uFnK.z * 0.35 ) ) );
}
float fnSpill() {
	vec3 d = vFnPos - vec3( 0.0, uFnMouth.y, uFnMouth.w + 0.6 );
	return exp( - dot( d, d ) / 9.0 );
}
`;
const SOOT = `
{
	float above = vFnPos.y - uFnTop.y;
	float plume = exp( - pow( vFnPos.x / ( 1.5 + 0.3 * max( above, 0.0 ) ), 2.0 ) ) * smoothstep( -0.8, 0.6, above );
	float high = smoothstep( uFnTop.x - 3.5, uFnTop.x + 1.5, vFnPos.y );
	float s = clamp( plume * 0.6 + high * 0.35, 0.0, 0.8 ) * ( 0.7 + 0.3 * fnN( vFnPos.xy * 1.7 + vFnPos.z ) ) * uFnK.w;
	diffuseColor.rgb *= 1.0 - s;
}`;
const HEAT_BRICK = `
	{ float e = fnEdge(); totalEmissiveRadiance += ( diffuseColor.rgb + 0.04 ) * uFnHeat * ( e + 0.18 * fnSpill() ) + uFnHeat * 0.05 * e * e * e;
	  if ( uFnOpen > 0.0 ) {
		float r = abs( fnF( vFnPos.xy * vec2( 0.55, 0.8 ) + vFnPos.z * 0.3 ) - 0.5 ) + 0.4 * abs( fnN( vFnPos.xy * 2.1 ) - 0.5 );
		float near = exp( - max( length( vec2( vFnPos.x, max( vFnPos.y - uFnMouth.y, 0.0 ) ) ) - uFnMouth.x, 0.0 ) * 0.45 ) * step( uFnMouth.w - 1.3, vFnPos.z );
		totalEmissiveRadiance += uFnHeat * ( 1.0 - smoothstep( 0.0, 0.03 + 0.03 * uFnOpen, r ) ) * near * uFnOpen * 1.6;
	  } }`;
const HEAT_IRON = `
	{ float e = fnEdge(); totalEmissiveRadiance += uFnHeat * vec3( 1.0, 0.75, 0.6 ) * ( uFnK.y * e * e * e * e + 0.08 * fnSpill() ); }`;
const IRON_COLOUR = `
	{ float n = fnN( vFnPos.xy * 3.1 + vFnPos.z * 2.0 ) * 0.6 + fnN( vFnPos.zy * 11.0 + vFnPos.x ) * 0.4; diffuseColor.rgb *= 0.7 + 0.6 * n; }`;

function applyHeatShader(mat, uniforms, iron) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFnPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n\tvFnPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAT_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (iron ? IRON_COLOUR : SOOT))
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' + (iron ? HEAT_IRON : HEAT_BRICK),
      );
  };
  mat.customProgramCacheKey = () => (iron ? 'look-furnace-iron' : 'look-furnace-brick');
  return mat;
}

class Soup {
  constructor() {
    this.p = [];
    this.n = [];
    this.u = [];
  }
  quad(a, b, c, d, na, nb, nc, nd, ua, ub, uc, ud) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * (na[0] + nc[0]) + cr[1] * (na[1] + nc[1]) + cr[2] * (na[2] + nc[2]) < 0;
    const v = flip
      ? [
          [a, na, ua],
          [d, nd, ud],
          [c, nc, uc],
          [b, nb, ub],
        ]
      : [
          [a, na, ua],
          [b, nb, ub],
          [c, nc, uc],
          [d, nd, ud],
        ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      this.p.push(...v[k][0]);
      this.n.push(...v[k][1]);
      this.u.push(...v[k][2]);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    return g;
  }
}
function archPath(mw, sill, spring, off = 0, seg = 28) {
  const out = [],
    push = (x, y, nx, ny) => {
      const l = out.length ? out[out.length - 1] : null;
      out.push({
        x: x + nx * off,
        y: y + ny * off,
        nx,
        ny,
        s: l ? l.s + Math.hypot(x + nx * off - l.x, y + ny * off - l.y) : 0,
      });
    };
  for (let k = 0; k <= 2; k++) push(-mw, sill + ((spring - sill) * k) / 2, -1, 0);
  for (let k = 1; k <= seg; k++) {
    const a = Math.PI * (1 - k / seg);
    push(Math.cos(a) * mw, spring + Math.sin(a) * mw, Math.cos(a), Math.sin(a));
  }
  for (let k = 1; k <= 2; k++) push(mw, spring - ((spring - sill) * k) / 2, 1, 0);
  return out;
}
function archBand(path, t, zf, zb, zs) {
  const S = new Soup();
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1],
      ai = [a.x, a.y],
      bi = [b.x, b.y],
      ao = [a.x + a.nx * t, a.y + a.ny * t],
      bo = [b.x + b.nx * t, b.y + b.ny * t];
    const f = [0, 0, 1],
      na = [-a.nx, -a.ny, 0],
      nb = [-b.nx, -b.ny, 0],
      oa = [a.nx, a.ny, 0],
      ob = [b.nx, b.ny, 0];
    S.quad([...ai, zf], [...bi, zf], [...bo, zf], [...ao, zf], f, f, f, f, [0, a.s], [0, b.s], [t, b.s], [t, a.s]);
    S.quad(
      [...ai, zf],
      [...bi, zf],
      [...bi, zb],
      [...ai, zb],
      na,
      nb,
      nb,
      na,
      [0, a.s],
      [0, b.s],
      [zf - zb, b.s],
      [zf - zb, a.s],
    );
    if (zs < zf)
      S.quad(
        [...ao, zf],
        [...bo, zf],
        [...bo, zs],
        [...ao, zs],
        oa,
        ob,
        ob,
        oa,
        [0, a.s],
        [0, b.s],
        [zf - zs, b.s],
        [zf - zs, a.s],
      );
  }
  return S.geometry();
}
function block(x0, y0, z0, x1, y1, z1) {
  const g = box(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
function ibeam(x, y0, y1, z0, d = 0.3, w = 0.26) {
  const f = 0.05,
    out = [
      block(x - w / 2, y0, z0, x + w / 2, y1, z0 + f),
      block(x - w / 2, y0, z0 + d - f, x + w / 2, y1, z0 + d),
      block(x - 0.035, y0, z0 + f, x + 0.035, y1, z0 + d - f),
    ];
  return out;
}
function rivet(x, y, z, r = 0.032) {
  const g = new THREE.CylinderGeometry(r * 0.8, r, 0.045, 6);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
function chain(x, y0, y1, z, out) {
  const step = 0.13;
  for (let k = 0, y = y0 + step / 2; y < y1; k++, y += step) {
    const g = new THREE.TorusGeometry(0.05, 0.015, 4, 8);
    g.scale(1, 1.45, 1);
    if (k % 2) g.rotateY(Math.PI / 2);
    g.translate(x, y, z);
    out.push(g);
  }
}
function bellShape(h) {
  const w = h * 0.42,
    s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.quadraticCurveTo(-w * 0.95, h * 0.12, -w * 0.72, h * 0.3);
  s.quadraticCurveTo(-w * 0.55, h * 0.5, -w * 0.58, h * 0.72);
  s.quadraticCurveTo(-w * 0.55, h * 0.9, 0, h * 0.9);
  s.quadraticCurveTo(w * 0.55, h * 0.9, w * 0.58, h * 0.72);
  s.quadraticCurveTo(w * 0.55, h * 0.5, w * 0.72, h * 0.3);
  s.quadraticCurveTo(w * 0.95, h * 0.12, w, 0);
  s.lineTo(-w, 0);
  const crown = new THREE.Shape();
  crown.moveTo(-w * 0.18, h * 0.88);
  crown.lineTo(w * 0.18, h * 0.88);
  crown.lineTo(w * 0.14, h);
  crown.lineTo(-w * 0.14, h);
  crown.lineTo(-w * 0.18, h * 0.88);
  return [s, crown];
}
function tint(g, c) {
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const BRICK = [1, 1, 1],
  FIREBRICK = [1.6, 2.05, 1.95],
  PLINTH = [0.42, 0.46, 0.55],
  CROWN = [0.82, 0.78, 0.76];
const SHARE = { low: 0.45, medium: 0.7, high: 1, ultra: 1 };

export class Furnace {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.t = 0;
    this.look = look;
    const F = look,
      top = F.base + F.height,
      CW = F.centre / 2,
      W = F.width / 2,
      front = F.front,
      back = F.front - F.depth;
    const mw = F.mouth[0] / 2,
      mh = F.mouth[1],
      sillY = F.base + F.mouth[2],
      springY = F.base + mh - mw,
      crownY = F.base + mh;
    const T = F.lining,
      wingTop = top - F.wingDrop,
      wingFront = front - F.recess,
      plinthTop = sillY - 0.03;
    const tex = brickTextures(11);
    this.heatColour = new THREE.Color(...F.glow).multiplyScalar(F.heatStrength);
    const heatU = (this.heatU = {
      uFnMouth: { value: new THREE.Vector4(mw, springY, sillY, front) },
      uFnHeat: { value: this.heatColour.clone() },
      uFnK: { value: new THREE.Vector4(F.heatFalloff, F.ironGlow, 0, F.soot) },
      uFnTop: { value: new THREE.Vector2(top, crownY + T) },
      uFnOpen: { value: 0 },
    });
    const brick = (this.brick = applyHeatShader(
      new THREE.MeshStandardMaterial({
        map: tex.map,
        normalMap: tex.normal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        color: new THREE.Color(...F.brick),
        roughness: 0.92,
        metalness: 0,
        vertexColors: true,
      }),
      heatU,
      false,
    ));
    brick.name = 'look.furnace.brick';
    const iron = (this.iron = applyHeatShader(
      new THREE.MeshStandardMaterial({ color: new THREE.Color(...F.iron), roughness: 0.45, metalness: 0.6 }),
      heatU,
      true,
    ));
    iron.name = 'look.furnace.iron';
    const ember = (this.ember = new THREE.MeshStandardMaterial({
      color: 0x050302,
      emissive: new THREE.Color(...F.glow),
      emissiveIntensity: F.glowStrength,
      roughness: 0.8,
    }));
    ember.name = 'look.furnace.ember';
    const parts = { brick: [], iron: [], ember: [] },
      add = (k, g, c) => {
        parts[k].push(k === 'brick' ? tint(g, c || BRICK) : g);
        return g;
      };

    const s = new THREE.Shape();
    s.moveTo(-CW, 0);
    s.lineTo(CW, 0);
    s.lineTo(CW, F.height);
    s.lineTo(-CW, F.height);
    s.lineTo(-CW, 0);
    const hole = new THREE.Path(),
      ow = mw + T,
      sill = F.mouth[2];
    hole.moveTo(-ow, sill);
    hole.lineTo(ow, sill);
    hole.lineTo(ow, mh - mw);
    hole.absarc(0, mh - mw, ow, 0, Math.PI, false);
    hole.lineTo(-ow, sill);
    s.holes.push(hole);
    const wall = new THREE.ExtrudeGeometry(s, { depth: F.wall, bevelEnabled: false, curveSegments: 20 });
    wall.translate(0, F.base, front - F.wall);
    add('brick', wall);
    const fbW = F.mouth[0] + 0.4,
      fbH = mh + 0.3,
      depth = F.depth - F.wall,
      zMid = front - F.wall - depth / 2;
    add('brick', block(-CW, F.base, back, CW, top, back + 0.6));
    for (const sx of [-1, 1]) {
      add(
        'brick',
        block(
          Math.min((sx * fbW) / 2, sx * CW),
          F.base,
          back + 0.6,
          Math.max((sx * fbW) / 2, sx * CW),
          top,
          front - F.wall,
        ),
      );
      add('brick', block(Math.min(sx * CW, sx * W), F.base, back, Math.max(sx * CW, sx * W), wingTop, wingFront));
      add(
        'brick',
        block(
          Math.min(sx * CW, sx * (W + 0.12)),
          F.base,
          back - 0.12,
          Math.max(sx * CW, sx * (W + 0.12)),
          plinthTop,
          wingFront + 0.12,
        ),
        PLINTH,
      );
      add(
        'brick',
        block(
          Math.min(sx * CW, sx * (W + 0.1)),
          wingTop,
          back - 0.1,
          Math.max(sx * CW, sx * (W + 0.1)),
          wingTop + 0.2,
          wingFront + 0.1,
        ),
        CROWN,
      );
    }
    add('brick', block(-fbW / 2, F.base + fbH, back + 0.6, fbW / 2, top, front - F.wall));
    add('brick', block(-CW - 0.12, F.base, back - 0.12, CW + 0.12, plinthTop, front + 0.12), PLINTH);
    add('brick', block(-CW - 0.12, top, back - 0.12, CW + 0.12, top + 0.22, front + 0.12), CROWN);
    add('brick', block(-CW - 0.24, top + 0.22, back - 0.2, CW + 0.24, top + 0.47, front + 0.2), CROWN);
    add(
      'brick',
      block(-CW * 0.75, top + 0.47, front - F.depth * 0.9, CW * 0.75, top + 0.47 + F.tier, front - F.depth * 0.2),
    );
    add('brick', archBand(archPath(mw, sillY, springY), T, front + 0.1, front - F.wall, front), FIREBRICK);
    const framePath = archPath(mw - 0.03, sillY, springY);
    add('iron', archBand(framePath, 0.17, front + 0.17, front - 0.3, front + 0.1));
    for (let i = 0, next = 0.15; i < framePath.length - 1; i++) {
      const a = framePath[i],
        b = framePath[i + 1];
      while (next <= b.s) {
        const k = (next - a.s) / Math.max(1e-6, b.s - a.s),
          nx = a.nx + (b.nx - a.nx) * k,
          ny = a.ny + (b.ny - a.ny) * k;
        add('iron', rivet(a.x + (b.x - a.x) * k + nx * 0.09, a.y + (b.y - a.y) * k + ny * 0.09, front + 0.19));
        next += 0.3;
      }
    }
    for (const sx of [-1, 1]) {
      for (const g of ibeam(sx * (CW + 0.13), plinthTop, top + 0.1, front)) add('iron', g);
      for (const g of ibeam(sx * (W - 0.1), plinthTop, wingTop + 0.05, wingFront)) add('iron', g);
      for (const g of ibeam(sx * F.guideX, plinthTop, F.doorY + F.door[1] + 0.12, front, 0.36, 0.24)) add('iron', g);
      for (const g of ibeam(sx * F.postX, plinthTop, F.beamY, front, 0.38, 0.28)) add('iron', g);
      for (const y of [plinthTop + 0.04, springY]) {
        add(
          'iron',
          block(
            Math.min(sx * (F.guideX + 0.12), sx * CW),
            y - 0.07,
            front,
            Math.max(sx * (F.guideX + 0.12), sx * CW),
            y + 0.07,
            front + 0.04,
          ),
        );
        add(
          'iron',
          block(Math.min(sx * CW, sx * W), y - 0.07, wingFront, Math.max(sx * CW, sx * W), y + 0.07, wingFront + 0.04),
        );
      }
    }
    add('iron', block(-F.postX - 0.3, F.beamY, front + 0.12, F.postX + 0.3, F.beamY + 0.32, front + 0.42));
    const [dw, dh] = F.door,
      dy0 = F.doorY,
      dy1 = dy0 + dh,
      dz = front + 0.22,
      dz1 = dz + 0.12;
    // Door, chains and counterweights stay separate so phase two can blow them off.
    const moving = { door: [], chains: [], weights: [] },
      door = (g) => moving.door.push(g);
    door(block(-dw / 2, dy0, dz, dw / 2, dy1, dz1));
    const strap = 0.13,
      sz = dz1 + 0.035;
    door(block(-dw / 2, dy0, dz1, dw / 2, dy0 + strap, sz));
    door(block(-dw / 2, dy1 - strap, dz1, dw / 2, dy1, sz));
    for (const x of [-dw / 2, -dw / 6 - strap / 2, dw / 6 - strap / 2, dw / 2 - strap])
      door(block(x, dy0, dz1, x + strap, dy1, sz));
    for (let x = -dw / 2 + 0.12; x <= dw / 2 - 0.1; x += 0.28) {
      door(rivet(x, dy0 + strap / 2, sz + 0.01, 0.026));
      door(rivet(x, dy1 - strap / 2, sz + 0.01, 0.026));
    }
    const bell = new THREE.ExtrudeGeometry(bellShape(dh * 0.62), {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
      curveSegments: 8,
    });
    bell.translate(0, dy0 + dh * 0.17, dz1);
    door(bell);
    const sheaveY = F.beamY - 0.05 - F.sheaveR;
    for (const sx of [-1, 1]) {
      const cx = sx * F.sheaveX,
        cy = F.beamY - 0.05 - F.sheaveR,
        zc = dz + 0.06,
        inner = cx - sx * F.sheaveR,
        outer = cx + sx * F.sheaveR;
      const rim = new THREE.TorusGeometry(F.sheaveR, 0.06, 6, 32);
      rim.translate(cx, cy, zc);
      add('iron', rim);
      const hub = new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10);
      hub.rotateX(Math.PI / 2);
      hub.translate(cx, cy, zc);
      add('iron', hub);
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.BoxGeometry(0.06, F.sheaveR * 2, 0.05);
        sp.rotateZ((k * Math.PI) / 3);
        sp.translate(cx, cy, zc);
        add('iron', sp);
      }
      add('iron', block(cx - 0.06, cy, zc - 0.13, cx + 0.06, F.beamY, zc - 0.07));
      chain(inner, dy1, cy, zc, moving.chains);
      const cw0 = F.counterweight[0],
        cw1 = cw0 + F.counterweight[1];
      chain(outer, cw1, cy, zc, moving.weights);
      moving.weights.push(block(outer - 0.17, cw0, zc - 0.14, outer + 0.17, cw1, zc + 0.14));
      moving.weights.push(block(outer - 0.2, cw1 - 0.1, zc - 0.17, outer + 0.2, cw1, zc + 0.17));
      door(block(inner - 0.12, dy1, zc - 0.05, inner + 0.12, dy1 + 0.1, zc + 0.05));
    }
    for (const sx of [-1, 1]) {
      const x = sx * F.stackX,
        h = F.stackTop - wingTop,
        z = front - F.depth / 2;
      const c = cylinder(F.stackR * 0.75, F.stackR, h);
      c.translate(x, wingTop + h / 2, z);
      add('brick', c);
      for (let k = 1; k <= 4; k++) {
        const ring = new THREE.TorusGeometry(F.stackR * (1 - (0.25 * k) / 4.5) + 0.03, 0.07, 6, 28);
        ring.rotateX(Math.PI / 2);
        ring.translate(x, wingTop + (h * k) / 4.5, z);
        add('iron', ring);
      }
      const collar = new THREE.CylinderGeometry(F.stackR * 0.75 + 0.14, F.stackR * 0.75 + 0.08, 0.4, 24, 1, true);
      collar.translate(x, F.stackTop - 0.1, z);
      add('iron', collar);
      const slit = new THREE.BoxGeometry(0.5, 1.2, 0.1);
      slit.translate(x, F.stackTop - 1.6, z + F.stackR * 0.8);
      parts.ember.push(slit);
    }

    this.group = new THREE.Group();
    this.group.name = 'look:furnace';
    const mats = { brick, iron, ember };
    for (const k in parts) {
      const m = new THREE.Mesh(merge(parts[k], k === 'brick'), mats[k]);
      m.name = 'look:furnace-' + k;
      m.castShadow = k !== 'ember';
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.doorHeat = { value: this.heatColour.clone() };
    this.doorK = 1;
    const doorMat = (this.doorMat = applyHeatShader(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(...F.iron),
        roughness: 0.45,
        metalness: 0.6,
        emissive: new THREE.Color(...F.glow),
        emissiveIntensity: 0,
      }),
      { ...heatU, uFnHeat: this.doorHeat },
      true,
    ));
    doorMat.name = 'look.furnace.door';
    const piece = (list, mat, name, pivot) => {
      const g = merge(list, false);
      g.translate(-pivot[0], -pivot[1], -pivot[2]);
      const m = new THREE.Mesh(g, mat);
      m.name = name;
      m.position.fromArray(pivot);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    this.door = piece(moving.door, doorMat, 'look:furnace-door', [0, (dy0 + dy1) / 2, (dz + sz) / 2]);
    this.chains = piece(moving.chains, iron, 'look:furnace-chains', [0, sheaveY, 0]);
    this.weights = piece(moving.weights, iron, 'look:furnace-weights', [0, 0, 0]);
    this.doorRest = this.door.position.clone();
    this.doorSize = [dw, dh, sz - dz];
    this.weightY = F.counterweight[0] - F.base;

    const tU = (this.timeU = { value: 0 }),
      flareU = (this.flareU = { value: 0.5 }),
      fireK = (this.fireK = { value: F.fireStrength });
    const shader = (frag, uniforms, extra = {}) =>
      new THREE.ShaderMaterial({ vertexShader: PLAIN_VERT, fragmentShader: frag, uniforms, ...extra });
    // Lining sits just inside the brick faces so it never fights them for depth.
    const fb = new THREE.BoxGeometry(fbW - 0.06, fbH - 0.03, depth - 0.63);
    fb.translate(0, F.base + (fbH - 0.03) / 2, back + 0.63 + (depth - 0.63) / 2);
    const boxMat = shader(
      BOX_FRAG,
      {
        uTime: tU,
        uStrength: fireK,
        uBox: { value: new THREE.Vector2(sillY, fbH - F.mouth[2]) },
        uMap: { value: tex.map },
        uOpen: (this.boxOpen = { value: 0 }),
      },
      { side: THREE.BackSide },
    );
    boxMat.name = 'look.furnace.firebox';
    const fbMesh = new THREE.Mesh(fb, boxMat);
    fbMesh.name = 'look:furnace-firebox';
    this.group.add(fbMesh);
    const bed = new THREE.PlaneGeometry(fbW - 0.1, depth - 0.4, 40, 20);
    bed.rotateX(-Math.PI / 2);
    const bp = bed.attributes.position,
      buv = bed.attributes.uv,
      r = xorshift32(23);
    const lump = [];
    for (let k = 0; k < 40; k++)
      lump.push([(r() - 0.5) * fbW, (r() - 0.5) * depth, 0.15 + r() * 0.25, 0.25 + r() * 0.4]);
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i),
        z = bp.getZ(i),
        back01 = buv.getY(i);
      let y = F.mouth[2] + 0.12 + 0.45 * back01 - 0.25 * Math.pow(Math.abs(x) / (fbW / 2), 3);
      for (const [lx, lz, lh, lr] of lump) {
        const d = Math.hypot(x - lx, z - lz);
        if (d < lr) y += lh * 0.5 * (1 + Math.cos((Math.PI * d) / lr)) * 0.5;
      }
      const u = buv.getX(i),
        e = Math.min(1, Math.min(u, 1 - u) / 0.08, back01 / 0.12),
        foot = F.mouth[2] - 0.08;
      bp.setY(i, foot + (y - foot) * e * e * (3 - 2 * e));
    }
    bed.computeVertexNormals();
    bed.translate(0, F.base, zMid);
    const coalMat = shader(COAL_FRAG, { uTime: tU, uStrength: fireK });
    coalMat.name = 'look.furnace.coals';
    const coals = new THREE.Mesh(bed, coalMat);
    coals.name = 'look:furnace-coals';
    this.group.add(coals);
    const sheets = [],
      bedFront = zMid + (depth - 0.4) / 2,
      z0f = back + 0.75,
      z1f = front - F.wall - 0.15;
    for (let L = 0; L < 5; L++) {
      const z = z0f + ((z1f - z0f) * L) / 4,
        h = mh * (0.95 - 0.11 * L),
        y = sillY + 0.02 + 0.45 * Math.min(1, Math.max(0, (bedFront - z) / (depth - 0.4)));
      const g = new THREE.PlaneGeometry(fbW - 0.1, h);
      g.translate(0, y + h / 2, z);
      g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(4).fill(L), 1));
      sheets.push(g);
    }
    const lick = new THREE.PlaneGeometry(mw * 1.5, 1.9);
    lick.translate(0, crownY - 0.55 + 0.95, front + 0.2);
    lick.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(4).fill(9), 1));
    sheets.push(lick);
    this.liteU = { value: 0 };
    const fire = (this.fire = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: { uTime: tU, uFlare: flareU, uStrength: fireK, uLite: this.liteU },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    fire.name = 'look.furnace.fire';
    const flames = new THREE.Mesh(mergeLayers(sheets), fire);
    flames.name = 'look:furnace-fire';
    flames.renderOrder = 6;
    this.group.add(flames);

    const z0 = front - F.wall + 0.1,
      z1 = front + F.trough,
      y0 = sillY,
      cw = 0.5;
    addMergedMesh(
      this.group,
      iron,
      [
        block(-cw, y0 - 0.06, z0, cw, y0, z1),
        block(-cw, y0, z0, -cw + 0.06, y0 + 0.2, z1),
        block(cw - 0.06, y0, z0, cw, y0 + 0.2, z1),
        block(-0.35, F.base, z1 - 0.3, -0.25, y0 - 0.06, z1 - 0.2),
        block(0.25, F.base, z1 - 0.3, 0.35, y0 - 0.06, z1 - 0.2),
      ],
      'look:furnace-channel',
    );
    const flow = [];
    for (let k = 0; k <= 6; k++) flow.push([0, y0 + 0.11, z0 + ((z1 - z0) * k) / 6, cw - 0.07]);
    for (let k = 1; k <= 8; k++) {
      const a = k / 8;
      flow.push([
        0,
        y0 + 0.11 - (y0 + 0.11 - F.base) * a * a,
        z1 + 0.22 * Math.sin((a * Math.PI) / 2),
        (cw - 0.07) * (1 - 0.55 * a),
      ]);
    }
    const melt = (this.melt = new THREE.ShaderMaterial({
      vertexShader: PLAIN_VERT,
      fragmentShader: MELT_FRAG,
      uniforms: {
        uTime: tU,
        uStrength: { value: F.meltStrength },
        uGlow: { value: new THREE.Color(...F.melt) },
        uCrust: { value: new THREE.Color(...F.crust) },
      },
      side: THREE.DoubleSide,
    }));
    melt.name = 'look.furnace.melt';
    const meltMesh = new THREE.Mesh(ribbon(flow), melt);
    meltMesh.name = 'look:furnace-melt';
    this.group.add(meltMesh);

    const L = F.light,
      bx = [-L.width / 2, front + 0.05, L.width / 2, L.to];
    const card = new THREE.PlaneGeometry(bx[2] - bx[0], bx[3] - bx[1]);
    card.rotateX(-Math.PI / 2);
    card.translate(0, F.base + 0.01, (bx[1] + bx[3]) / 2);
    this.poolU = {
      uColour: { value: new THREE.Color(...F.glow).multiplyScalar(L.strength) },
      uSrc: { value: new THREE.Vector4(0, front, mw, L.reach) },
      uBounds: { value: new THREE.Vector4(...bx) },
    };
    const pool = shader(POOL_FRAG, this.poolU, {
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    pool.name = 'look.furnace.pool';
    this.poolColour = this.poolU.uColour.value.clone();
    const poolMesh = new THREE.Mesh(card, pool);
    poolMesh.name = 'look:furnace-light';
    poolMesh.renderOrder = 1;
    this.group.add(poolMesh);

    this.air = this._buildAirParticles(
      F,
      {
        bed: [0, sillY + 0.45, front - F.wall - 0.7],
        mouth: [0, F.base + F.mouth[2] + 0.6, front - 0.4],
        crown: [0, crownY + 0.2, front + 0.45],
        stacks: [-1, 1].map((sx) => [sx * F.stackX, F.stackTop + 0.1, front - F.depth / 2]),
      },
      tU,
      flareU,
    );
    this.group.add(this.air);

    ctx.scene.add(this.group);
    this.vent = { x: 0, y: crownY, z: front + 0.3 };
    this.emberT = 0;
    this.r = xorshift32(5);
    this.flareT = 4;
    this.flareAge = 9;
    const lights = ctx.gfx && ctx.gfx.lights;
    this.lights = lights || null;
    this.moonBase = lights ? lights.moonIntensity : 0;
    this.heatBase = FOUNDRY.uniforms.uFdHeatK.value;
    this.mouthAt = { x: 0, sill: sillY, crown: crownY, front, mw, mh };
    this.open = 0;
    this.flash = 0;
    this.white = null;
  }

  _buildAirParticles(F, at, tU, flareU) {
    const A = F.air,
      kinds = [
        [0, A.sparks, at.mouth, [3.4, 1.6, 0.6]],
        [1, A.stackSparks, null, [0.9, 0.2, 0.9]],
        [2, A.smoke, null, [0.8, 0.2, 0.8]],
        [3, A.fumes, at.crown, [2.6, 0.3, 0.2]],
        [4, A.embers || 0, at.bed, [3.6, 0.5, 1.2]],
      ];
    const list = [],
      r = xorshift32(77);
    for (const [kind, n, pos, spread] of kinds)
      for (let i = 0; i < n; i++) {
        const p = pos || at.stacks[i % 2];
        list.push({
          key: r(),
          kind,
          p: [p[0] + (r() - 0.5) * spread[0], p[1] + (r() - 0.5) * spread[1], p[2] + (r() - 0.5) * spread[2]],
          seed: [r(), r(), r(), r()],
        });
      }
    list.sort((a, b) => a.key - b.key);
    const n = list.length,
      pos = new Float32Array(n * 3),
      seed = new Float32Array(n * 4),
      kind = new Float32Array(n);
    list.forEach((o, i) => {
      pos.set(o.p, i * 3);
      seed.set(o.seed, i * 4);
      kind[i] = o.kind;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    this.airU = {
      uTime: tU,
      uFlare: flareU,
      uScale: { value: 900 },
      uSmoke: { value: new THREE.Color(...A.smokeColour) },
      uWarm: { value: new THREE.Color(...A.smokeWarm) },
    };
    const m = new THREE.ShaderMaterial({
      name: 'look.furnace.air',
      uniforms: this.airU,
      vertexShader: AIR_VERT,
      fragmentShader: AIR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'look:furnace-air';
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    this.airCount = n;
    return pts;
  }

  update(dt) {
    this.t += dt;
    const t = this.t,
      F = this.look,
      ctx = this.ctx;
    const calm = !!(ctx.ui && ctx.ui.settings && ctx.ui.settings.reducedMotion),
      amp = calm ? 0.3 : 1;
    if ((this.flareT -= dt) <= 0) {
      this.flareT = F.flare[0] + this.r() * (F.flare[1] - F.flare[0]);
      this.flareAge = 0;
      const vfx = ctx.vfx;
      if (vfx && vfx.embers && !calm) vfx.embers({ x: this.vent.x, y: this.vent.y - 1.5, z: this.vent.z }, 14);
    }
    this.flareAge += dt;
    const flare = this.flareAge < 0.5 ? this.flareAge / 0.5 : Math.exp(-(this.flareAge - 0.5) * 1.3);
    const flick = 0.06 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 5.9 + 1.3) + 0.03 * Math.sin(t * 11.7 + 0.4);
    const k = 1 + (flick + 0.3 * flare) * amp;
    const open = this.open,
      boost = 1 + 0.6 * open + 2.5 * this.flash;
    this.timeU.value = t;
    this.flareU.value = 0.45 + 0.55 * flare * amp + 0.45 * open + 0.6 * this.flash;
    this.fireK.value = F.fireStrength * (0.92 + 0.08 * k) * (1 + 0.5 * open + 1.5 * this.flash);
    this.heatU.uFnHeat.value.copy(this.heatColour);
    if (this.white) this.heatU.uFnHeat.value.lerp(this.white, 0.55 * open);
    this.heatU.uFnHeat.value.multiplyScalar(k * boost);
    this.heatU.uFnK.value.z = t;
    this.heatU.uFnOpen.value = open;
    this.doorHeat.value.copy(this.heatColour).multiplyScalar(k * this.doorK);
    this.melt.uniforms.uStrength.value = F.meltStrength * (1 + 1.2 * open + 2 * this.flash);
    this.poolU.uColour.value.copy(this.poolColour).multiplyScalar(k * boost);
    this.ember.emissiveIntensity = F.glowStrength * (0.85 + 0.1 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 5.7));
    FOUNDRY.uniforms.uFdHeatK.value = this.heatBase * (1 + (k - 1) * 0.6) * (1 + 0.7 * open + 2 * this.flash);
    if (this.lights && this.moonBase)
      this.lights.moonIntensity = this.moonBase * (1 + (k - 1) * F.lightFlicker) * (1 + 0.1 * open + 1.6 * this.flash);
    // Point size uses pixels per meter at 1 m.
    const gfx = ctx.gfx,
      rt = gfx && gfx.chain && gfx.chain.sceneRT,
      cam = ctx.camera;
    if (cam && cam.fov)
      this.airU.uScale.value = (rt ? rt.height : innerHeight) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.air.geometry.setDrawRange(0, Math.round(this.airCount * (SHARE[gfx && gfx.quality] || 1)));
    this.liteU.value = gfx && gfx.quality === 'low' ? 1 : 0;
    this.boxOpen.value = open;
    const vfx = ctx.vfx;
    if (vfx && vfx.embers && (this.emberT -= dt) <= 0) {
      this.emberT = 0.15 + this.r() * 0.3;
      vfx.embers({ x: this.vent.x + (this.r() - 0.5) * 3, y: this.vent.y, z: this.vent.z }, 2);
    }
  }
}

function addMergedMesh(group, mat, list, name) {
  const m = new THREE.Mesh(merge(list, false), mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
}
function ribbon(pts) {
  const S = new Soup();
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1],
      l = Math.hypot(b[1] - a[1], b[2] - a[2]);
    const n = [0, (b[2] - a[2]) / l, -(b[1] - a[1]) / l];
    S.quad(
      [a[0] - a[3], a[1], a[2]],
      [a[0] + a[3], a[1], a[2]],
      [b[0] + b[3], b[1], b[2]],
      [b[0] - b[3], b[1], b[2]],
      n,
      n,
      n,
      n,
      [0, s],
      [1, s],
      [1, s + l],
      [0, s + l],
    );
    s += l;
  }
  return S.geometry();
}
function mergeLayers(list) {
  const out = merge(list, false);
  let n = 0;
  for (const g of list) n += g.index ? g.index.count : g.attributes.position.count;
  const a = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    const L = g.attributes.aLayer.getX(0),
      c = g.index ? g.index.count : g.attributes.position.count;
    a.fill(L, o, o + c);
    o += c;
  }
  out.setAttribute('aLayer', new THREE.BufferAttribute(a, 1));
  return out;
}
function merge(list, colour) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of flat) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3),
    nor = new Float32Array(n * 3),
    uv = new Float32Array(n * 2),
    col = colour ? new Float32Array(n * 3).fill(1) : null;
  let o = 0;
  for (const g of flat) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col && g.attributes.color) col.set(g.attributes.color.array, o * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
