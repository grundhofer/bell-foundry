import * as THREE from 'three';
import { NOISE } from './hall.js';
import { FOUNDRY } from '../graphics/shaders/foundry.js';
import { WATER_Y } from '../core/constants.js';
import { DAIS } from '../world/layout.js';
import { seededRandom, clamp, lerp, smooth } from '../core/math.js';
import { updatePassUniforms, blankTexture } from '../graphics/effects/common.js';

// Phase-two set piece: the furnace bursts, the floor cracks, a beam falls, sparks rain.
// Everything is a function of the set-piece clock T (seconds from the burst), null = intact hall.

const SHARE = { low: 0.45, medium: 0.7, high: 1, ultra: 1 };
const HALO = 2.6;
const GOUT = { burst: 34, lick: 46, sparks: 80, sparkLick: 30 };
const G = 9.81;

const CRACK_VERT = `
attribute vec3 aCrack;
varying vec3 vC;
varying vec3 vP;
void main() { vC = aCrack; vec4 w = modelMatrix * vec4( position, 1.0 ); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const CRACK_FRAG = `
uniform float uFront;
uniform float uTime;
uniform float uGlow;
uniform float uHot;
varying vec3 vC;
varying vec3 vP;
${NOISE}
void main() {
	float age = uFront - vC.y;
	if ( age <= 0.0 ) discard;
	float open = smoothstep( 0.0, 1.2, age );
	float wob = fnN( vP.xz * 3.0 ) - 0.5;
	float e = abs( vC.x ) * ${HALO.toFixed(1)};
	float core = 1.0 - smoothstep( 0.3, 1.0, e / max( open, 0.05 ) + wob * 0.5 );
	float rim = 1.0 - smoothstep( 0.9, ${HALO.toFixed(1)}, e + wob );
	float flow = fnN( vec2( vC.y * 1.3 - uTime * 0.9, vP.x * 0.7 + vP.z * 0.3 ) );
	float pulse = 0.82 + 0.18 * sin( uTime * 1.7 + vC.y * 0.6 );
	float hot = exp( - age / 2.5 );
	float k = clamp( ( 0.5 + 0.22 * flow ) * pulse + 0.45 * hot, 0.0, 1.0 ) * uHot;
	gl_FragColor = vec4( fnFire( k ) * core * uGlow, rim * 0.7 * open );
}
`;
// Gout: camera-facing billows thrown from the mouth (slot 0 = core flash, then burst and steady licks).
// Each slot is a function of the fire clock; steady slots loop and take their strength from the envelope at birth.
const GOUT_SLOTS = `
attribute vec2 aCorner;
attribute vec4 aSeed;
attribute vec4 aSeed2;
attribute float aKind;
uniform float uClock;
uniform vec4 uMouth;
float fnEnv( float b ) {
	if ( b < 0.0 ) return 0.0;
	float s = smoothstep( 2.5, 6.0, b ), g = 0.5 + 0.5 * sin( b * 0.9 ) * sin( b * 2.3 + 1.1 );
	return min( 1.0, b / 0.08 ) * mix( 1.0, 0.3, smoothstep( 0.5, 2.4, b ) ) * ( 1.0 - s ) + s * ( 0.2 + 0.12 * g );
}
void fnSlot( float burst, float spread, float lick, out float age, out float life, out float e ) {
	if ( aKind < 1.5 ) { life = burst + 1.6 * aSeed.y; float b = spread * aSeed.x * aSeed.x; age = uClock - b; e = 1.0; }
	else { life = lick + 0.8 * aSeed.y; age = fract( uClock / life + aSeed.x ) * life; e = fnEnv( uClock - age ); }
}
`;
const HOT = `
vec3 fnHot( float k ) {
	vec3 c = mix( vec3( 0.0 ), vec3( 0.5, 0.05, 0.005 ), smoothstep( 0.12, 0.32, k ) );
	c = mix( c, vec3( 1.9, 0.42, 0.04 ), smoothstep( 0.3, 0.52, k ) );
	c = mix( c, vec3( 3.4, 1.45, 0.25 ), smoothstep( 0.5, 0.74, k ) );
	return mix( c, vec3( 5.2, 3.5, 1.5 ), smoothstep( 0.82, 1.0, k ) );
}
`;
const GOUT_VERT = `
uniform float uFill;
uniform float uFlash;
varying vec2 vQ;
varying vec2 vN;
varying vec4 vS;
varying float vKind;
varying vec2 vZ;
${GOUT_SLOTS}
void main() {
	vec4 s = aSeed, s2 = aSeed2;
	float mw = uMouth.x, sill = uMouth.y, crown = uMouth.z, front = uMouth.w;
	vQ = aCorner; vKind = aKind; vN = aCorner;
	if ( aKind < 0.5 ) {
		vec4 c = viewMatrix * vec4( 0.0, sill + 1.9, front + 1.3, 1.0 );
		float sz = 2.0 + 1.2 * ( 1.0 - uFlash );
		vS = vec4( 0.0, uFlash, 0.0, 1.0 ); vZ = vec2( - c.z, 1.0 );
		gl_Position = uFlash > 0.003 ? projectionMatrix * ( c + vec4( aCorner * sz, 0.0, 0.0 ) ) : vec4( 2.0, 2.0, 2.0, 1.0 );
		return;
	}
	float age, life, e; fnSlot( 1.4, 0.25, 0.9, age, life, e );
	float burst = aKind < 1.5 ? 1.0 : 0.0, l = age / life;
	if ( age < 0.0 || l >= 1.0 || e < 0.01 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
	vec3 o = vec3( ( s.z - 0.5 ) * 1.5 * mw, sill + 0.5 + s.w * ( crown - sill - 1.2 ), front - 0.7 );
	float v0 = mix( 5.0 + 5.0 * s2.x, 15.0 + 10.0 * s2.x, burst ) * mix( 0.45, 1.0, e ), k = mix( 2.8, 4.5, burst ) + 1.6 * s2.y;
	vec3 dir = normalize( vec3( ( s.z - 0.5 ) * 0.5 + ( s2.w - 0.5 ) * 0.35, 0.1 + 0.4 * ( s2.z - 0.35 ), 1.0 ) );
	float up = ( 1.3 + 1.0 * s2.z ) * mix( 0.6, 1.0, e ), fall = exp( - k * age );
	vec3 c = o + dir * v0 * ( 1.0 - fall ) / k + vec3( sin( age * 2.1 + s.y * 20.0 ) * 0.25 * age, up * age * age, 0.0 );
	float sz = ( mix( 0.55, 1.0, s.w ) * mix( 0.6, 1.0, e ) * mix( 1.0, 1.5, burst ) + pow( age, 0.8 ) * mix( 0.9, 1.4, burst ) * mix( 0.5, 1.0, e ) ) * uFill;
	c.y = max( c.y, 0.55 + sz * 0.3 ); c.z = max( c.z, front + 0.1 + 0.25 * sz );
	vec3 vel = dir * v0 * fall + vec3( 0.0, 2.0 * up * age, 0.0 );
	vec2 vv = ( viewMatrix * vec4( vel, 0.0 ) ).xy; float sp = length( vv );
	vec2 ax = sp > 1e-3 ? vv / sp : vec2( 1.0, 0.0 ), px = vec2( - ax.y, ax.x );
	float stretch = 1.0 + min( length( vel ) * 0.07, 1.4 );
	vec4 cv = viewMatrix * vec4( c, 1.0 );
	cv.xy += ( ax * aCorner.x * stretch + px * aCorner.y ) * sz * 0.5;
	float zc = - cv.z, zq = max( zc - sz * 0.5, 0.3 );
	if ( zc > zq ) cv.xyz *= zq / zc;
	float ang = s.y * 6.2832 + ( s2.x - 0.5 ) * 2.4 * age, ca = cos( ang ), sa = sin( ang );
	vN = mat2( ca, sa, - sa, ca ) * ( aCorner * vec2( 1.0, 1.0 / stretch ) * ( 0.9 + 0.3 * s.w ) * sqrt( stretch ) - vec2( age * 1.1, 0.0 ) ) + s.zw * 17.0;
	float heat = mix( 0.7, 1.15, e ) * exp( - age * ( 1.1 + 0.35 * age ) );
	vS = vec4( l, heat, s2.y, smoothstep( 0.0, 0.04, age ) * ( 1.0 - smoothstep( 0.65, 1.0, l ) ) * mix( 0.45, 1.0, e ) );
	vZ = vec2( zc, sz * 0.5 );
	gl_Position = projectionMatrix * cv;
}
`;
const GOUT_FRAG = `
uniform float uClock;
uniform sampler2D tDepth;
uniform float uSoft;
uniform vec2 uRes;
uniform vec2 uNearFar;
varying vec2 vQ;
varying vec2 vN;
varying vec4 vS;
varying float vKind;
varying vec2 vZ;
${NOISE}
${HOT}
#include <packing>
void main() {
	vec2 q = vQ; float r2 = dot( q, q );
	if ( r2 > 1.0 ) discard;
	float soft = 1.0;
	if ( uSoft > 0.5 ) {
		float h = sqrt( 1.0 - r2 ) * vZ.y;
		soft = clamp( ( - perspectiveDepthToViewZ( texture2D( tDepth, gl_FragCoord.xy / uRes ).x, uNearFar.x, uNearFar.y ) - vZ.x + h ) / ( 2.0 * h + 0.1 ), 0.0, 1.0 );
	}
	if ( vKind < 0.5 ) {
		float ray = 0.75 + 0.5 * fnN( vec2( atan( q.y, q.x ) * 4.0 + 9.0, uClock * 3.0 ) );
		float g = exp( - r2 * 9.0 ) + 0.35 * exp( - r2 * 3.0 ) * ray;
		gl_FragColor = vec4( vec3( 3.0, 2.2, 1.25 ) * g * vS.y * ( 1.0 - r2 ) * soft, 0.0 );
		return;
	}
	float l = vS.x, sd = vS.z;
	vec2 p = vN;
	vec2 w = vec2( fnN( p * 1.3 + vec2( sd * 7.0, l * 2.6 ) ), fnN( p * 1.3 + vec2( 4.1 - l * 2.2, sd * 3.0 ) ) ) - 0.5;
	float n = fnF( p * 2.4 + w * 1.1 - vec2( 0.0, l * 1.8 ) );
	float edge = 1.0 - sqrt( r2 );
	float d = smoothstep( 0.0, 0.2, edge * ( 1.25 - 0.4 * l ) + ( n - 0.5 ) * 1.3 - 0.12 - 0.25 * l * l );
	d *= 1.0 - smoothstep( 0.7, 1.0, 1.0 - edge );
	if ( d < 0.003 ) discard;
	float k = clamp( vS.y * ( 0.3 + 0.9 * edge ) * ( 0.35 + 0.9 * smoothstep( 0.3, 0.8, n ) ), 0.0, 1.0 );
	float smoke = ( 1.0 - smoothstep( 0.22, 0.5, k ) ) * smoothstep( 0.0, 0.25, l );
	vec3 soot = vec3( 0.02, 0.016, 0.014 ) + vec3( 0.12, 0.035, 0.008 ) * smoothstep( 0.08, 0.3, k );
	float m = d * vS.w * soft;
	gl_FragColor = vec4( ( fnHot( k ) * smoothstep( 0.08, 0.3, k ) * 0.8 + soot * smoke ) * m, m * mix( 0.8, 0.85, smoke ) );
}
`;
// Heat-coloured streaks thrown with the gout, stretched along their path.
const STREAK_VERT = `
uniform float uWidth;
varying vec2 vQ;
varying float vHeat;
${GOUT_SLOTS}
vec3 fnAt( vec3 o, vec3 dir, float v0, float k, float a ) { return o + dir * v0 * ( 1.0 - exp( - k * a ) ) / k - vec3( 0.0, 3.0 * a * a, 0.0 ); }
void main() {
	vec4 s = aSeed, s2 = aSeed2;
	float mw = uMouth.x, sill = uMouth.y, crown = uMouth.z, front = uMouth.w;
	float age, life, e; fnSlot( 0.7, 0.35, 0.6, age, life, e );
	float burst = aKind < 1.5 ? 1.0 : 0.0, l = age / life;
	vQ = aCorner;
	if ( age < 0.0 || l >= 1.0 || e < 0.05 ) { vHeat = 0.0; gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
	vec3 o = vec3( ( s.z - 0.5 ) * 1.6 * mw, sill + 0.4 + s.w * ( crown - sill - 0.8 ), front - 0.3 );
	vec3 dir = normalize( vec3( ( s.z - 0.5 ) * 1.4 + ( s2.w - 0.5 ) * 0.9, 0.05 + 0.85 * s2.z, 1.0 ) );
	float v0 = mix( 4.0 + 5.0 * s2.x, 7.0 + 15.0 * s2.x * s2.x, burst ) * mix( 0.5, 1.0, e ), k = 0.6 + 1.2 * s2.y;
	vec3 h = fnAt( o, dir, v0, k, age ), t = fnAt( o, dir, v0, k, max( age - 0.018 - 0.022 * s.y, 0.0 ) );
	float fl = h.z < ${(DAIS.z - 2 * DAIS.step).toFixed(2)} ? ${(DAIS.top + 0.03).toFixed(2)} : ( h.z < ${DAIS.z.toFixed(2)} ? 0.28 : ${(WATER_Y + 0.02).toFixed(2)} );
	float land = smoothstep( fl - 0.5, fl, h.y );
	h.y = max( h.y, fl ); t.y = max( t.y, fl );
	vec4 hv = viewMatrix * vec4( h, 1.0 ), tv = viewMatrix * vec4( t, 1.0 );
	vec2 d = hv.xy - tv.xy; float len = length( d );
	vec2 ax = len > 1e-4 ? d / len : vec2( 0.0, 1.0 ), px = vec2( - ax.y, ax.x );
	float wd = uWidth * ( 0.7 + 0.6 * s.w );
	vec4 pv = mix( tv, hv, aCorner.x );
	pv.xy += px * aCorner.y * wd + ax * ( aCorner.x * 2.0 - 1.0 ) * wd;
	vHeat = ( 1.0 - l ) * ( 1.0 - l ) * land * mix( 0.6, 1.0, e ) * smoothstep( 0.0, 0.03, age );
	gl_Position = projectionMatrix * pv;
}
`;
const STREAK_FRAG = `
varying vec2 vQ;
varying float vHeat;
void main() {
	float h = vHeat, f = 1.0 - abs( vQ.y ); f *= f;
	if ( h <= 0.0 || f < 0.01 ) discard;
	vec3 c = mix( vec3( 0.9, 0.12, 0.0 ), mix( vec3( 3.5, 1.4, 0.3 ), vec3( 7.0, 5.5, 3.2 ), smoothstep( 0.7, 1.0, h ) ), smoothstep( 0.15, 0.55, h ) );
	gl_FragColor = vec4( c * f * mix( 0.2, 1.0, vQ.x ) * smoothstep( 0.0, 0.1, h ), 1.0 );
}
`;
// Upright camera-facing flame cards along the beam, placed from its two ends.
const FLAME_VERT = `
attribute vec4 aCard;
uniform vec3 uA;
uniform vec3 uB;
uniform float uFlame;
varying vec2 vUv;
varying float vSeed;
void main() {
	vec3 c = mix( uA, uB, aCard.x );
	vec3 view = c - cameraPosition; view.y = 0.0;
	vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), normalize( view + vec3( 1e-4 ) ) ) );
	float h = aCard.z * uFlame;
	vec3 p = c + right * ( uv.x - 0.5 ) * aCard.z * 0.8 + vec3( 0.0, uv.y * h - 0.1, 0.0 );
	vUv = uv; vSeed = aCard.w;
	gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;
const FLAME_FRAG = `
uniform float uTime;
uniform float uFlame;
varying vec2 vUv;
varying float vSeed;
${NOISE}
void main() {
	vec2 uv = vUv; float t = uTime * ( 1.0 + 0.2 * vSeed );
	float f = fnF( vec2( uv.x * 3.5 + vSeed * 9.0, uv.y * 1.6 - t * 1.7 ) );
	float body = ( f - 0.45 ) * 2.4 + 0.55 - uv.y * 1.1 - 0.9 * pow( abs( uv.x - 0.5 ) * 2.0, 2.0 );
	float k = clamp( body * 1.8, 0.0, 1.0 ) * smoothstep( 0.0, 0.12, uv.y );
	gl_FragColor = vec4( fnFire( k ) * smoothstep( 0.03, 0.3, k ) * 0.9 * min( uFlame * 1.5, 1.0 ), 1.0 );
}
`;
const SPARK_VERT = `
attribute vec4 aSeed;
attribute float aKind;
uniform float uTime;
uniform float uT;
uniform float uRain;
uniform float uScale;
uniform vec4 uB[ 4 ];
uniform vec4 uBP[ 4 ];
varying vec3 vCol;
void main() {
	vec3 p, c; float size;
	if ( aKind < 0.5 ) {
		float top = 13.0 + 6.0 * aSeed.z, v = 0.7 + 1.6 * aSeed.w, life = top / v;
		float ph = fract( uTime / life + aSeed.x * 7.31 ), age = ph * life;
		p = vec3( mix( -13.0, 13.0, aSeed.x ), top - v * age, mix( -21.0, 19.0, aSeed.y ) );
		p.x += sin( age * 1.3 + aSeed.z * 40.0 ) * 0.6; p.z += cos( age * 1.1 + aSeed.y * 30.0 ) * 0.6;
		float on = step( fract( aSeed.x * 13.7 + aSeed.y * 7.1 ), uRain );
		c = mix( vec3( 0.6, 0.06, 0.0 ), vec3( 3.0, 1.2, 0.25 ), 1.0 - ph ) * ( 0.6 + 0.4 * sin( age * 23.0 + aSeed.w * 60.0 ) ) * smoothstep( 0.0, 0.05, ph ) * ( 1.0 - smoothstep( 0.85, 1.0, ph ) ) * on;
		size = mix( 0.035, 0.07, aSeed.z ) * on;
	} else {
		int i = int( aKind - 0.5 );
		vec4 B = uB[ i ], P = uBP[ i ];
		float age = uT - B.w, life = P.z * ( 0.45 + 0.55 * aSeed.y );
		float on = step( 0.0, age ) * step( age, life );
		float a = clamp( age, 0.0, life ), th = aSeed.x * 6.2832, up = aSeed.z;
		vec3 dir = normalize( vec3( cos( th ) * ( 1.0 - up * 0.6 ), 0.25 + up * P.y, sin( th ) * ( 1.0 - up * 0.6 ) + P.w ) );
		p = B.xyz + dir * P.x * ( 0.35 + 0.65 * fract( aSeed.y * 5.3 + aSeed.w ) ) * a + vec3( 0.0, -4.9, 0.0 ) * a * a;
		p.y = max( p.y, p.z < ${(DAIS.z - 2 * DAIS.step).toFixed(2)} ? ${(DAIS.top + 0.03).toFixed(2)} : ( p.z < ${DAIS.z.toFixed(2)} ? 0.28 : ${(WATER_Y + 0.02).toFixed(2)} ) );
		float k = 1.0 - a / max( life, 0.01 );
		c = mix( vec3( 0.8, 0.08, 0.0 ), mix( vec3( 3.5, 1.3, 0.25 ), vec3( 6.0, 4.5, 2.4 ), smoothstep( 0.7, 1.0, k ) ), smoothstep( 0.1, 0.5, k ) ) * on * ( 0.7 + 0.3 * sin( a * 40.0 + aSeed.x * 50.0 ) );
		size = mix( 0.03, 0.06, aSeed.z ) * on;
	}
	vCol = c;
	vec4 mv = modelViewMatrix * vec4( p, 1.0 );
	gl_Position = size > 0.0 ? projectionMatrix * mv : vec4( 2.0, 2.0, 2.0, 1.0 );
	gl_PointSize = clamp( size * uScale / max( - mv.z, 0.3 ), 1.5, 64.0 );
}
`;
const SPARK_FRAG = `
varying vec3 vCol;
void main() {
	float k = 1.0 - smoothstep( 0.0, 0.5, length( gl_PointCoord - 0.5 ) ); k *= k;
	if ( k < 0.01 ) discard;
	gl_FragColor = vec4( vCol * k, 1.0 );
}
`;
const BEAM_PARS = `
uniform float uRbEmber;
uniform float uRbTime;
varying vec3 vRbP;
${NOISE}
`;
const BEAM_EMBER = `
	{
		float n = fnF( vec2( vRbP.z * 1.3 + vRbP.x * 3.0, vRbP.y * 3.0 + vRbP.x * 1.7 ) );
		float c = 1.0 - smoothstep( 0.0, 0.07, abs( n - 0.5 ) );
		float g = fnN( vRbP.zy * 2.0 + vec2( uRbTime * 0.3, 0.0 ) );
		totalEmissiveRadiance += fnFire( clamp( 0.35 + 0.45 * c + 0.2 * g, 0.0, 1.0 ) ) * ( c * 0.8 + 0.12 * g ) * uRbEmber;
	}
`;

const ease = (a, b, t) => smooth((t - a) / (b - a));

export class Rupture {
  constructor(ctx, look, furnace) {
    this.ctx = ctx;
    this.look = look;
    this.furnace = furnace;
    this.t = 0;
    this.T = null;
    this.live = false;
    this.poured = false;
    this.group = new THREE.Group();
    this.group.name = 'look:rupture';
    const M = furnace.mouthAt;
    this.mouth = M;
    this.times = {
      door: look.door.land,
      weights: look.weights.from + Math.sqrt((2 * furnace.weightY) / G),
      beam: look.beam.from + look.beam.fall,
    };
    this._buildCracks(look.cracks);
    this._buildGout(M);
    this._buildBeam(look.beam);
    this._sparks(look);
    const doorQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((3 * Math.PI) / 2 + look.door.tilt, look.door.yaw, 0, 'YXZ'),
    );
    this.doorLand = { pos: new THREE.Vector3(...look.door.at), q: doorQ };
    this.crackBase = FOUNDRY.uniforms.uFdCrack.value.clone();
    furnace.white = new THREE.Color(...look.white);
    furnace.doorMat.emissive.setRGB(1.0, 0.2, 0.03);
    ctx.scene.add(this.group);
    this.apply(null);
  }

  _buildCracks(o) {
    const r = seededRandom(o.seed),
      arena = this.ctx.arena,
      lines = [],
      STEP = 0.35;
    const grow = (x, z, h, d0, len, w0, depth) => {
      const pts = [[x, z, d0, w0]];
      let d = d0;
      for (let s = 0; s < len; s += STEP) {
        h = clamp(h + (r() - 0.5) * 0.36, -1.35, 1.35);
        x += Math.sin(h) * STEP;
        z += Math.cos(h) * STEP;
        d += STEP;
        if (Math.abs(x) > 12.6 || z > 18.5) break;
        const w = w0 * Math.pow(1 - s / len, 0.7) + 0.015;
        pts.push([x, z, d, w]);
        if (depth < 2 && r() < 0.07 && len - s > 3)
          grow(
            x,
            z,
            h + (r() < 0.5 ? -1 : 1) * (0.45 + 0.5 * r()),
            d,
            (len - s) * (0.35 + 0.3 * r()),
            w * 0.75,
            depth + 1,
          );
      }
      if (pts.length > 1) lines.push({ pts, depth });
    };
    for (let i = 0; i < o.trunks; i++) {
      const x = lerp(-7, 7, (i + 0.5) / o.trunks) + (r() - 0.5) * 1.2;
      grow(x, DAIS.z + 0.15, (x / 7) * 0.85 + (r() - 0.5) * 0.3, 0, o.reach * (0.45 + 0.55 * r()), 0.2 + 0.14 * r(), 0);
    }
    const pos = [],
      att = [],
      idx = [];
    for (const { pts, depth } of lines) {
      const base = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)],
          b = pts[Math.min(pts.length - 1, i + 1)],
          p = pts[i];
        let tx = b[0] - a[0],
          tz = b[1] - a[1];
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        const half = p[3] * HALO,
          y = (p[1] > DAIS.z ? WATER_Y : arena.ground ? arena.ground(p[0], p[1]) : 0) + 0.012 + depth * 0.001;
        pos.push(p[0] + tz * half, y, p[1] - tx * half, p[0] - tz * half, y, p[1] + tx * half);
        att.push(-1, p[2], p[3], 1, p[2], p[3]);
        if (i) {
          const k = base + 2 * i;
          idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCrack', new THREE.Float32BufferAttribute(att, 3));
    g.setIndex(idx);
    this.crackU = { uFront: { value: -1 }, uTime: { value: 0 }, uGlow: { value: o.glow }, uHot: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      name: 'look.rupture.cracks',
      vertexShader: CRACK_VERT,
      fragmentShader: CRACK_FRAG,
      uniforms: this.crackU,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    const mesh = (this.cracks = new THREE.Mesh(g, m));
    mesh.name = 'look:rupture-cracks';
    mesh.renderOrder = -40;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  _buildGout(M) {
    const r = seededRandom(this.look.cracks.seed + 202),
      mouth = new THREE.Vector4(M.mw, M.sill, M.crown, M.front);
    const quads = (kinds, x0) => {
      const n = kinds.length,
        corner = [],
        seed = [],
        seed2 = [],
        kind = [],
        idx = [];
      kinds.forEach((k, i) => {
        const s = [r(), r(), r(), r()],
          s2 = [r(), r(), r(), r()];
        for (const [u, v] of [
          [x0, -1],
          [1, -1],
          [1, 1],
          [x0, 1],
        ]) {
          corner.push(u, v);
          seed.push(...s);
          seed2.push(...s2);
          kind.push(k);
        }
        idx.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
      g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
      g.setAttribute('aSeed2', new THREE.Float32BufferAttribute(seed2, 4));
      g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
      g.setIndex(idx);
      return g;
    };
    const deal = (a, b) =>
      [...Array(a).fill(1), ...Array(b).fill(2)]
        .map((k) => [r(), k])
        .sort((x, y) => x[0] - y[0])
        .map((x) => x[1]);
    this.goutU = {
      uClock: { value: -99 },
      uMouth: { value: mouth },
      uFill: { value: 1 },
      uFlash: { value: 0 },
      tDepth: { value: blankTexture() },
      uSoft: { value: 0 },
      uRes: { value: new THREE.Vector2(1600, 900) },
      uNearFar: { value: new THREE.Vector2(0.1, 400) },
    };
    const m = new THREE.ShaderMaterial({
      name: 'look.rupture.gout',
      vertexShader: GOUT_VERT,
      fragmentShader: GOUT_FRAG,
      uniforms: this.goutU,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = (this.gout = new THREE.Mesh(quads([0, ...deal(GOUT.burst, GOUT.lick)], -1), m));
    mesh.name = 'look:rupture-gout';
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      updatePassUniforms(renderer, camera, this.ctx, this.goutU);
      m.uniformsNeedUpdate = true;
    };
    this.streakU = { uClock: this.goutU.uClock, uMouth: this.goutU.uMouth, uWidth: { value: 0.024 } };
    const sm = new THREE.ShaderMaterial({
      name: 'look.rupture.streaks',
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      uniforms: this.streakU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const st = (this.streaks = new THREE.Mesh(quads(deal(GOUT.sparks, GOUT.sparkLick), 0), sm));
    st.name = 'look:rupture-streaks';
    st.renderOrder = 7;
    st.frustumCulled = false;
    this.fireT = -99;
    this.group.add(mesh, st);
  }

  _buildBeam(o) {
    const A = new THREE.Vector3(...o.a),
      B = new THREE.Vector3(...o.b),
      len = A.distanceTo(B) + 0.2,
      r = seededRandom(o.seed || 3);
    const g = new THREE.BoxGeometry(o.size, o.size * 0.9, len, 1, 1, 14),
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (Math.abs(z) > len / 2 - 1e-3) {
        p.setZ(i, z - Math.sign(z) * r() * 0.4);
        p.setX(i, p.getX(i) * (0.6 + 0.4 * r()));
        p.setY(i, p.getY(i) * (0.6 + 0.4 * r()));
      } else {
        p.setX(i, p.getX(i) * (0.92 + 0.12 * r()));
        p.setY(i, p.getY(i) * (0.92 + 0.12 * r()));
      }
    }
    g.computeVertexNormals();
    this.beamU = { uRbEmber: { value: 1 }, uRbTime: { value: 0 } };
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...o.char), roughness: 0.95, metalness: 0 });
    m.name = 'look.rupture.beam';
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.beamU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRbP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRbP = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + BEAM_PARS)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + BEAM_EMBER);
    };
    m.customProgramCacheKey = () => 'look-rupture-beam';
    const mesh = (this.beam = new THREE.Mesh(g, m));
    mesh.name = 'look:rupture-beam';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.beamLen = len;
    const dir = B.clone().sub(A).normalize();
    this.beamLand = {
      pos: A.clone().add(B).multiplyScalar(0.5),
      q: new THREE.Quaternion()
        .setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.35)),
    };
    const d0 = new THREE.Vector3(...o.tumble).normalize();
    this.beamStart = {
      pos: new THREE.Vector3(o.start[0], o.top, o.start[1]),
      q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d0),
    };
    const cards = o.flames,
      cg = new THREE.BufferGeometry(),
      cp = [],
      cuv = [],
      ca = [],
      ci = [];
    for (let i = 0; i < cards; i++) {
      const along = 0.06 + (0.88 * (i + 0.5)) / cards + (r() - 0.5) * 0.06,
        h = 1.0 + 1.0 * r(),
        s = r();
      const b = cp.length / 3;
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        cp.push(0, 0, 0);
        cuv.push(u, v);
        ca.push(along, 0, h, s);
      }
      ci.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
    cg.setAttribute('aCard', new THREE.Float32BufferAttribute(ca, 4));
    cg.setIndex(ci);
    this.flameU = {
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uFlame: { value: 1 },
      uTime: { value: 0 },
    };
    const fm = new THREE.ShaderMaterial({
      name: 'look.rupture.flames',
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: this.flameU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const fl = (this.flames = new THREE.Mesh(cg, fm));
    fl.name = 'look:rupture-flames';
    fl.frustumCulled = false;
    fl.renderOrder = 6;
    this.group.add(fl);
  }

  _sparks(look) {
    const r = seededRandom(look.cracks.seed + 101),
      list = [];
    for (let i = 0; i < look.rain; i++) list.push({ key: r(), kind: 0, seed: [r(), r(), r(), r()] });
    for (let s = 0; s < 4; s++)
      for (let i = 0; i < look.sparks; i++) list.push({ key: r(), kind: s + 1, seed: [r(), r(), r(), r()] });
    list.sort((a, b) => a.key - b.key);
    const n = list.length,
      seed = new Float32Array(n * 4),
      kind = new Float32Array(n);
    list.forEach((o, i) => {
      seed.set(o.seed, i * 4);
      kind[i] = o.kind;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    this.sparkU = {
      uTime: { value: 0 },
      uT: { value: -99 },
      uRain: { value: 0 },
      uScale: { value: 900 },
      uB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, -99)) },
      uBP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(1, 0, 1, 0)) },
    };
    const m = new THREE.ShaderMaterial({
      name: 'look.rupture.sparks',
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      uniforms: this.sparkU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = (this.sparks = new THREE.Points(g, m));
    pts.name = 'look:rupture-sparks';
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    this.sparkCount = n;
    this.group.add(pts);
  }

  async warm() {
    const g = this.ctx.gfx,
      r = g && g.renderer;
    if (!r || !r.compileAsync) return;
    const hidden = this.group.children.filter((o) => !o.visible);
    for (const o of hidden) o.visible = true;
    try {
      r.setRenderTarget(g.chain.sceneRT);
      await r.compileAsync(this.group, this.ctx.camera, this.ctx.scene);
    } catch (e) {
      console.warn('look: ' + (e && e.message));
    } finally {
      r.setRenderTarget(null);
      this.apply(this.T);
    }
  }

  // Cutscene drives the clock while it plays.
  play(T) {
    const prev = this.T;
    if (prev === null || T < prev - 1e-6) this.poured = false;
    this.T = T;
    this.fireT = T;
    this.live = true;
    this.cross(prev, T);
  }

  done(skipped) {
    this.live = false;
    if (skipped || this.T === null) this.T = Math.max(this.T === null ? 0 : this.T, this.look.settle);
    if (!this.poured) this.pour();
  }

  pour() {
    this.poured = true;
    const lava = this.ctx.look && this.ctx.look.lava,
      s = this.look.surge;
    if (lava && !lava.off && s) lava.sim.pour(s.x, s.z, s.r, s.rate, s.seconds);
  }

  cross(prev, T) {
    if (prev === null || T === null || T - prev > 0.5 || T <= prev) return;
    const hit = (t) => prev < t && T >= t,
      au = this.ctx.audio,
      M = this.mouth;
    const sound = (name, pos, volume, rate) => {
      if (au && au.play) au.play(name, { pos, volume, rate });
    };
    for (const j of this.look.jolts) if (hit(j)) sound('hammer', { x: 0, y: M.crown, z: M.front }, 0.7, 0.45);
    if (hit(0)) {
      if (!this.poured) this.pour();
      sound('slam', { x: 0, y: M.sill + 1.5, z: M.front + 1 }, 1.6, 0.55);
    }
    if (hit(this.times.door)) sound('guard_break', this.doorLand.pos, 1.3, 0.6);
    if (hit(this.times.weights)) sound('hammer', { x: 0, y: 1, z: M.front }, 1.0, 0.5);
    if (hit(this.times.beam)) sound('slam', this.beamLand.pos, 1.3, 0.75);
  }

  update(dt) {
    this.t += dt;
    const b = this.ctx.boss,
      two = !!(b && b.phase === 2),
      turning = !!(b && b.changing);
    if (!this.live) {
      if (this.T !== null && this.T < this.look.settle) {
        const prev = this.T;
        this.T = Math.min(this.look.settle, this.T + dt);
        this.cross(prev, this.T);
      }
      if (two && this.T === null) {
        this.T = this.look.settle;
        this.poured = true;
      }
      if (!two && !turning && this.T !== null) {
        this.T = null;
        this.poured = false;
      }
      this.fireT = Math.max(this.fireT + dt, this.T === null ? -99 : this.T);
    }
    this.apply(this.T);
  }

  apply(T) {
    const ctx = this.ctx,
      F = this.furnace,
      L = this.look,
      set = ctx.ui && ctx.ui.settings,
      calm = !!(set && set.reducedMotion);
    const lava = ctx.look && ctx.look.lava,
      cold = !!(lava && lava.off),
      t = this.t;
    const on = T !== null,
      Tn = on ? Math.min(T, L.settle) : -99,
      after = on && T >= 0;
    let flash = 0;
    if (on) {
      for (const j of L.jolts) if (T >= j) flash += 0.25 * Math.exp(-(T - j) / 0.25);
      if (after)
        flash += Math.exp(-T / 0.35) + 0.25 * (T >= this.times.door ? Math.exp(-(T - this.times.door) / 0.3) : 0);
    }
    F.flash = flash * (calm ? 0.4 : 1);
    F.open = !on ? 0 : !after ? 0.3 * ease(-5, 0, T) : 0.6 + 0.4 * ease(0, 2.5, T);
    const cu = FOUNDRY.uniforms.uFdCrack.value,
      cb = this.crackBase,
      ck = after ? ease(0, 3, Tn) : 0;
    cu.set(cb.x + (L.paveCracks[0] - cb.x) * ck, cb.y, cb.z + (L.paveCracks[1] - cb.z) * ck);

    this._door(Tn, on, calm);
    const wf = Tn - L.weights.from,
      drop = Math.min(F.weightY, after && wf > 0 ? 0.5 * G * wf * wf : 0);
    F.weights.position.y =
      -drop +
      (drop >= F.weightY
        ? 0.06 * Math.abs(Math.sin((Tn - this.times.weights) * 14)) * Math.exp(-(Tn - this.times.weights) * 8)
        : 0);
    F.chains.scale.y = after ? 1 - 0.88 * ease(0, 0.4, Tn) : 1;

    const c = this.crackU,
      cr = L.cracks;
    this.cracks.visible = after && Tn > cr.from;
    c.uFront.value = !after ? -1 : T >= L.settle ? 999 : cr.reach * (1 - Math.exp(-Math.max(0, Tn - cr.from) / cr.tau));
    c.uTime.value = t;
    c.uGlow.value = cr.glow * (cold ? 0.35 : 1) * (1 - 0.25 * ease(3, 8, Tn));
    c.uHot.value = cold ? 0.6 : 1;

    const gfx = ctx.gfx,
      share = SHARE[gfx && gfx.quality] || 1,
      fc = after ? this.fireT : -99,
      gu = this.goutU;
    gu.uClock.value = fc;
    gu.uFlash.value = after ? Math.exp(-fc / 0.09) * (calm ? 0.35 : 1) : 0;
    gu.uFill.value = Math.pow(share, -0.3);
    this.gout.geometry.setDrawRange(0, 6 * (1 + Math.round((GOUT.burst + GOUT.lick) * share)));
    this.streaks.geometry.setDrawRange(0, 6 * Math.round((GOUT.sparks + GOUT.sparkLick) * share * (calm ? 0.5 : 1)));
    this.gout.visible = this.streaks.visible = after;

    this._beamPose(Tn, after, t);

    const rain = !after ? 0 : ease(0, 0.3, Tn) * (1 - ease(3, 7, Tn)) + L.rainAfter * ease(3, 7, Tn);
    const s = this.sparkU,
      M = this.mouth,
      dl = this.doorLand.pos,
      bl = this.beamLand.pos;
    s.uTime.value = t;
    s.uT.value = on ? Tn : -99;
    s.uRain.value = rain * (calm ? 0.6 : 1);
    const lastJolt = on ? L.jolts.filter((j) => T >= j).pop() : undefined;
    s.uB.value[0].set(0, M.sill + 0.6, M.front + 0.3, 0);
    s.uBP.value[0].set(11, 1.1, 2.4, 1.4);
    if (Tn >= this.times.door) {
      s.uB.value[1].set(dl.x, dl.y + 0.1, dl.z, this.times.door);
      s.uBP.value[1].set(6, 0.6, 1.6, 0.3);
    } else {
      s.uB.value[1].set(0, M.crown, M.front + 0.3, lastJolt === undefined ? -99 : lastJolt);
      s.uBP.value[1].set(3, 0.3, 1.2, 0.5);
    }
    s.uB.value[2].set(bl.x, bl.y, bl.z, this.times.beam);
    s.uBP.value[2].set(6, 0.8, 1.8, 0);
    s.uB.value[3].set(0, M.crown + 1.5, M.front + 0.5, 0.02);
    s.uBP.value[3].set(14, 2.2, 3.0, 0.5);
    const rt = gfx && gfx.chain && gfx.chain.sceneRT,
      cam = ctx.camera;
    if (cam && cam.fov) s.uScale.value = (rt ? rt.height : innerHeight) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.sparks.geometry.setDrawRange(0, Math.round(this.sparkCount * share));
    this.sparks.visible = on && T > -8;
  }

  _door(T, on, calm) {
    const F = this.furnace,
      d = F.door,
      R = F.doorRest,
      L = this.look,
      tl = L.door.land;
    if (!on || T < 0) {
      d.position.copy(R);
      d.quaternion.identity();
      let dy = 0;
      if (on)
        for (const j of L.jolts) {
          const a = T - j;
          if (a >= 0 && a < 0.6) dy += 0.09 * Math.sin(a * 30) * Math.exp(-a * 7);
        }
      d.position.y += dy * (calm ? 0.3 : 1);
      F.doorMat.emissiveIntensity = 0;
      F.doorK = 1;
      return;
    }
    const P = this.doorLand.pos,
      a = Math.min(T, tl),
      s = a / tl;
    const vy = (P.y - R.y + 0.5 * G * tl * tl) / tl;
    d.position.set(lerp(R.x, P.x, s), R.y + vy * a - 0.5 * G * a * a, lerp(R.z, P.z, s));
    const th = ((3 * Math.PI) / 2 + L.door.tilt) * s,
      yaw = L.door.yaw * s;
    let wob = 0;
    if (T > tl) {
      const b = T - tl;
      wob = 0.07 * Math.sin(b * 25) * Math.exp(-b * 9);
    }
    _e.set(th + wob, yaw, 0.12 * Math.sin(s * Math.PI), 'YXZ');
    d.quaternion.setFromEuler(_e);
    F.doorMat.emissiveIntensity = 0.06 + 0.3 * Math.exp(-T / 2);
    F.doorK = Math.max(0, 1 - T / 0.3);
  }

  _beamPose(T, after, t) {
    const L = this.look.beam,
      m = this.beam,
      from = L.from,
      tf = L.fall;
    const vis = after && T >= from;
    m.visible = vis;
    this.flames.visible = vis;
    if (!vis) return;
    const s = Math.min(1, (T - from) / tf),
      S = this.beamStart,
      E = this.beamLand;
    m.position.set(lerp(S.pos.x, E.pos.x, s), lerp(S.pos.y, E.pos.y, s * s), lerp(S.pos.z, E.pos.z, s));
    m.quaternion.slerpQuaternions(S.q, E.q, smooth(s * 1.1));
    if (s >= 1) {
      const b = T - from - tf;
      m.position.y += 0.22 * Math.abs(Math.sin(b * 9)) * Math.exp(-b * 6);
    }
    m.updateMatrixWorld();
    const h = this.beamLen / 2 - 0.25;
    this.flameU.uA.value.set(0, 0.1, -h).applyMatrix4(m.matrixWorld);
    this.flameU.uB.value.set(0, 0.1, h).applyMatrix4(m.matrixWorld);
    const land = T - from - tf,
      flame = s < 1 ? 0.9 : 0.55 + 0.6 * Math.exp(-Math.max(0, land) / 0.8) + 0.08 * Math.sin(t * 3.1);
    this.flameU.uFlame.value = flame;
    this.flameU.uTime.value = t;
    this.beamU.uRbEmber.value = 1.8 + 0.3 * Math.sin(t * 1.3);
    this.beamU.uRbTime.value = t;
  }
}

const _e = new THREE.Euler();
