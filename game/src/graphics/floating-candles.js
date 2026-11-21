import * as THREE from 'three';

export const BOWL = {
  radius: 0.125,
  floor: 0.005,
  waxTop: 0.046,
  waxR: 0.021,
  wick: 0.0075,
};
export const wickY = (h) => BOWL.floor + (BOWL.waxTop + BOWL.wick * 0.6 - BOWL.floor) * h;

export const FLICKER_GLSL = /* glsl */ `
float flick( float t, float seed ) {
  float a = sin( t * 9.1 + seed * 31.0 ) * 0.5 + sin( t * 15.7 + seed * 57.0 ) * 0.3 + sin( t * 23.3 + seed * 91.0 ) * 0.2;
  float flutter = smoothstep( 0.55, 0.9, sin( t * 0.7 + seed * 12.0 ) * 0.5 + 0.5 );
  return 1.0 + a * ( 0.035 + 0.11 * flutter );
}
`;

function lathe(out, profile, segs, kind, pick = null) {
  const n = profile.length,
    rings = [];
  let len = 0;
  const along = [0];
  for (let i = 1; i < n; i++) {
    len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
    along.push(len);
  }
  for (let j = 0, m = pick ? pick.length : n; j < m; j++) {
    const i = pick ? pick[j] : j,
      a = profile[Math.max(0, i - 1)],
      b = profile[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nr = ty,
      ny = -tx;
    const axis = profile[i][0] < 1e-9;
    rings.push({ base: out.pos.length / 3, axis });
    if (axis) {
      out.pos.push(0, profile[i][1], 0);
      out.nor.push(0, ny < 0 ? -1 : 1, 0);
      out.uv.push(0.5, along[i] / (len || 1));
      out.kind.push(kind);
      continue;
    }
    for (let s = 0; s <= segs; s++) {
      const ang = (s / segs) * Math.PI * 2,
        c = Math.cos(ang),
        sn = Math.sin(ang);
      out.pos.push(profile[i][0] * c, profile[i][1], profile[i][0] * sn);
      out.nor.push(nr * c, ny, nr * sn);
      out.uv.push(s / segs, along[i] / (len || 1));
      out.kind.push(kind);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    const A = rings[j],
      B = rings[j + 1];
    if (A.axis && B.axis) continue;
    for (let s = 0; s < segs; s++) {
      const p0 = A.axis ? A.base : A.base + s,
        p1 = A.axis ? A.base : p0 + 1,
        p2 = B.axis ? B.base : B.base + s,
        p3 = B.axis ? B.base : p2 + 1;
      if (A.axis) out.idx.push(p1, p2, p3);
      else if (B.axis) out.idx.push(p0, p2, p1);
      else out.idx.push(p0, p2, p1, p1, p2, p3);
    }
  }
}

const B_ = BOWL,
  F_ = B_.floor,
  R_ = B_.waxR,
  T_ = B_.waxTop;
const PARTS = {
  hull: [
    0,
    [
      [0.045, -0.045],
      [0.08, -0.031],
      [0.102, -0.009],
      [0.118, 0.018],
      [0.1255, 0.0355],
    ],
  ],
  lip: [
    0,
    [
      [0.1255, 0.0355],
      [0.1245, 0.0382],
      [0.1205, 0.0392],
      [0.1168, 0.038],
      [0.116, 0.0355],
    ],
  ],
  inside: [
    1,
    [
      [0.116, 0.0355],
      [0.1085, 0.0255],
      [0.095, 0.0155],
      [0.072, 0.0085],
      [0.04, F_ + 0.0008],
      [0, F_],
    ],
  ],
  waxSide: [
    2,
    [
      [R_ * 1.04, F_],
      [R_, F_ + 0.004],
      [R_, T_ - 0.0012],
      [R_ * 0.93, T_],
    ],
  ],
  waxTop: [
    2,
    [
      [R_ * 0.93, T_],
      [R_ * 0.7, T_ - 0.0016],
      [R_ * 0.3, T_ - 0.0028],
      [0, T_ - 0.003],
    ],
  ],
  wick: [
    3,
    [
      [0.0012, T_ - 0.003],
      [0.0012, T_ + B_.wick],
      [0, T_ + B_.wick + 0.0006],
    ],
  ],
};
const LEVELS = {
  hero: [
    ['hull', 48],
    ['lip', 48],
    ['inside', 48],
    ['waxSide', 24],
    ['waxTop', 24],
    ['wick', 8],
  ],
  near: [
    ['hull', 16],
    ['lip', 16, [0, 2, 4]],
    ['inside', 16, [0, 1, 2, 3, 5]],
    ['waxSide', 8, [0, 2, 3]],
    ['waxTop', 8, [0, 2, 3]],
    ['wick', 4],
  ],
  mid: [
    ['hull', 12, [1, 3, 4]],
    ['lip', 12, [0, 2, 4]],
    ['inside', 12, [0, 2, 4, 5]],
    ['waxSide', 6, [0, 3]],
    ['waxTop', 6, [0, 3]],
  ],
  far: [
    ['hull', 6, [1, 4]],
    ['lip', 6, [0, 4]],
    ['inside', 6, [0, 3, 5]],
    ['waxSide', 4, [0, 3]],
    ['waxTop', 4, [0, 3]],
  ],
  'mirror-hero': [
    ['hull', 24],
    ['lip', 24, [0, 1, 2]],
    ['waxSide', 8, [1, 2, 3]],
    ['wick', 4, [0, 1]],
  ],
  'mirror-near': [
    ['hull', 12, [1, 2, 3, 4]],
    ['lip', 12, [0, 2]],
  ],
  'mirror-mid': [['hull', 8, [1, 3, 4]]],
};

export function makeBowlGeometry(level = 'near') {
  const o = { pos: [], nor: [], uv: [], kind: [], idx: [] };
  for (const [part, sides, pick] of LEVELS[level] || LEVELS.near)
    lathe(o, PARTS[part][1], sides, PARTS[part][0], pick || null);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(o.kind, 1));
  g.setIndex(o.idx);
  g.userData.triangles = o.idx.length / 3;
  return g;
}

export const LID_Y = 0.026;
export function makeLidGeometry(segs = 16) {
  const g = new THREE.CircleGeometry(0.1088, segs);
  g.rotateX(-Math.PI / 2);
  g.translate(0, LID_Y, 0);
  return g;
}
export function makeLidMaterial() {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, fog: false });
  m.name = 'candle-lid';
  return m;
}

export function makeBowlMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.35 });
  m.name = 'candle-bowl';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aKind;
attribute vec4 aState;      // burn, ember, height, seed
attribute vec4 aLook;       // brass tone, wick height in bowl space
varying float vKind;
varying vec4 vState;
varying vec4 vLook;
varying vec3 vLocalP;
varying vec3 vLocalN;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
	if ( aKind > 1.5 ) transformed.y = ${BOWL.floor.toFixed(4)} + ( transformed.y - ( ${BOWL.floor.toFixed(4)} ) ) * aState.z;
	vKind = aKind; vState = aState; vLook = aLook; vLocalP = transformed; vLocalN = objectNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform vec3 uGlow;
varying float vKind;
varying vec4 vState;
varying vec4 vLook;
varying vec3 vLocalP;
varying vec3 vLocalN;
${FLICKER_GLSL}
float cHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float cNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cHash( i ), cHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cHash( i + vec2( 0.0, 1.0 ) ), cHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float cRelief( vec3 p, float kind ) {
  float ang = atan( p.z, p.x ), rad = length( p.xz );
  vec2 q = vec2( ang * 9.0, rad * 110.0 + p.y * 140.0 );
  float hammer = cNoise( q * 1.7 + vState.w * 40.0 ) * 0.6 + cNoise( q * 4.3 ) * 0.4;
  float band = smoothstep( 0.012, 0.016, p.y ) * ( 1.0 - smoothstep( 0.026, 0.030, p.y ) ) * step( kind, 0.5 );
  float chase = abs( sin( ang * 14.0 ) ) * abs( sin( ang * 14.0 + ( p.y - 0.021 ) * 520.0 ) );
  return hammer * 0.00045 - band * ( 0.0004 + 0.0007 * chase );
}
vec3 cBump( vec3 n, vec3 vp, float h ) {
  vec3 dpdx = dFdx( vp ), dpdy = dFdy( vp );
  float dhdx = dFdx( h ), dhdy = dFdy( h );
  vec3 r1 = cross( dpdy, n ), r2 = cross( n, dpdx );
  float det = dot( dpdx, r1 );
  return normalize( abs( det ) * n - sign( det ) * ( dhdx * r1 + dhdy * r2 ) );
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
	float cBowl = step( vKind, 1.5 ), cWax = step( 1.5, vKind ) * step( vKind, 2.5 ), cWick = step( 2.5, vKind );
	float cTarnish = cNoise( vec2( atan( vLocalP.z, vLocalP.x ) * 3.0 + vState.w * 17.0, vLocalP.y * 90.0 + length( vLocalP.xz ) * 30.0 ) );
	vec3 cBrass = mix( vec3( 0.83, 0.61, 0.30 ), vec3( 0.55, 0.42, 0.24 ), clamp( vLook.x * 0.7 + cTarnish * 0.45, 0.0, 1.0 ) );
	diffuseColor.rgb = cBowl * cBrass + cWax * vec3( 0.84, 0.78, 0.64 ) + cWick * vec3( 0.03, 0.025, 0.02 );`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
	metalnessFactor = cBowl;
	roughnessFactor = cBowl * ( 0.26 + 0.3 * cTarnish ) + cWax * 0.48 + cWick * 0.95;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
	if ( cBowl > 0.5 ) normal = cBump( normal, - vViewPosition, cRelief( vLocalP, vKind ) );`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
	{
		vec3 cL = vec3( 0.0, vLook.y + 0.012, 0.0 ) - vLocalP;
		float cD2 = dot( cL, cL );
		float cNdl = max( dot( normalize( vLocalN ), cL * inversesqrt( cD2 ) ), 0.0 );
		float cBurn = vState.x * flick( uTime, vState.w );
		float cFall = 1.0 / ( 1.0 + cD2 * 420.0 );
		vec3 cWarm = vec3( 1.0, 0.55, 0.19 );
		totalEmissiveRadiance += cWarm * ( cBurn * cNdl * cFall * uGlow.x ) * ( cBowl * cBrass * 1.25 + cWax * vec3( 0.62, 0.52, 0.36 ) );
		totalEmissiveRadiance += cWax * vec3( 1.0, 0.5, 0.17 ) * ( cBurn * uGlow.y * ( exp( - max( vLook.y - 0.004 - vLocalP.y, 0.0 ) * 60.0 ) + 0.12 ) );
		totalEmissiveRadiance += cWick * ( vec3( 1.0, 0.62, 0.3 ) * cBurn * 2.5 + vec3( 1.0, 0.22, 0.03 ) * vState.y * uGlow.z );
	}`,
      );
  };
  m.customProgramCacheKey = () => 'foundry-candle-bowl-2';
  return m;
}

const AIR_THROUGH = /* glsl */ `
  vec3 airThrough = vec3( 1.0 );
  #ifdef USE_FOG
    gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
    {
      #include <fog_fragment>
    }
    vec3 airAdds = gl_FragColor.rgb;
    gl_FragColor = vec4( 1.0 );
    {
      #include <fog_fragment>
    }
    airThrough = clamp( gl_FragColor.rgb - airAdds, 0.0, 1.0 );
  #endif
`;

const FLAME_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aFlame;
attribute vec4 aLean;
uniform float uTime;
uniform float uViewH;
uniform vec2 uSize;
uniform float uGlowR;
varying vec2 vP;
varying vec4 vDim;
varying vec4 vF;
#include <fog_pars_vertex>
${FLICKER_GLSL}
void main() {
  float burn = aFlame.x, seed = aFlame.w;
  float f = flick( uTime, seed );
  float gust = aLean.w;
  float shake = gust * ( sin( uTime * 47.0 + seed * 80.0 ) * 0.5 + sin( uTime * 71.0 + seed * 33.0 ) * 0.5 );
  float h = uSize.y * aLean.z * ( 0.3 + 0.7 * burn ) * ( 1.0 + 0.55 * aFlame.y ) * ( 1.0 + ( f - 1.0 ) * 1.6 ) * ( 1.0 - 0.3 * gust );
  float w = uSize.x * aLean.z * ( 0.55 + 0.45 * burn ) * ( 1.0 + 0.3 * aFlame.y ) * ( 1.0 + 0.25 * gust );
  float glow = uGlowR * aLean.z * ( 1.0 + 0.4 * aFlame.y );
  vec3 toCam = normalize( cameraPosition - aPos );
  vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) + vec3( 1e-5, 0.0, 0.0 ) );
  vec3 up = normalize( mix( vec3( 0.0, 1.0, 0.0 ), cross( toCam, right ), smoothstep( 0.55, 0.95, abs( toCam.y ) ) ) );
  vec4 clipC = projectionMatrix * viewMatrix * vec4( aPos, 1.0 );
  float px = h * projectionMatrix[1][1] * 0.5 * uViewH / max( clipC.w, 1e-3 );
  float boost = clamp( 2.6 / max( px, 1e-3 ), 1.0, 8.0 );
  h *= boost; w *= boost; glow *= mix( 1.0, boost, 0.5 );
  float lean = dot( vec3( aLean.x, 0.0, aLean.y ), right ) * h + shake * 0.25 * h;
  float reach = max( glow, max( h, abs( lean ) + w ) ) * 1.05;
  vec2 q = position.xy * reach + vec2( 0.0, h * 0.4 );
  vP = q;
  vDim = vec4( w, h, lean, ( 0.75 + 0.25 * f ) / ( boost * boost ) );
  vF = aFlame;
  vec4 mvPosition = viewMatrix * vec4( aPos + right * q.x + up * q.y, 1.0 );
  #include <fog_vertex>
  float show = step( 0.004, burn ) + step( 0.004, aFlame.z );
  gl_Position = show > 0.0 ? projectionMatrix * mvPosition : vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;

const FLAME_FRAG = /* glsl */ `
uniform vec3 uPower;
uniform float uGlowR;
varying vec2 vP;
varying vec4 vDim;
varying vec4 vF;
#include <fog_pars_fragment>
void main() {
  float w = vDim.x, h = vDim.y, burn = vF.x;
  float y = vP.y / max( h, 1e-4 );
  float yy = clamp( y, 0.0, 1.0 );
  float x = ( vP.x - vDim.z * yy * yy ) / ( w * 0.5 );
  float r = 1.92 * pow( yy, 0.42 ) * pow( 1.0 - yy, 0.78 ) + 1e-4;
  float d = abs( x ) / r;
  float inside = step( 0.0, y ) * step( y, 1.0 );
  float body = ( 1.0 - smoothstep( 0.5, 1.0, d ) ) * inside;
  float core = ( 1.0 - smoothstep( 0.0, 0.8, d ) ) * inside;
  vec3 col = mix( vec3( 1.0, 0.42, 0.09 ), vec3( 1.0, 0.80, 0.50 ), core * ( 1.0 - 0.55 * yy ) );
  float cup = 1.0 - smoothstep( 0.02, 0.24, yy );
  col = mix( col, vec3( 0.10, 0.22, 0.85 ), cup * 0.9 );
  float lum = body * mix( 0.45, 1.0, core ) * mix( 1.0, 0.16, cup ) * ( 1.0 - 0.35 * smoothstep( 0.6, 1.0, yy ) );
  vec3 c = col * ( lum * uPower.x * burn );
  vec2 g = vP - vec2( vDim.z * 0.3, h * 0.42 );
  float halo = exp( - dot( g, g ) / ( uGlowR * uGlowR * 0.16 ) );
  c += vec3( 1.0, 0.52, 0.2 ) * ( halo * uPower.y * burn );
  float e = exp( - dot( vP, vP ) / ( 0.0035 * 0.0035 * 4.0 ) );
  c += vec3( 1.0, 0.24, 0.04 ) * ( e * uPower.z * vF.z * ( 1.0 - burn ) );
${AIR_THROUGH}
  gl_FragColor = vec4( c * vDim.w * airThrough, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const withFog = (u) => Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), u);

export function makeFlameMaterial(u) {
  return new THREE.ShaderMaterial({
    name: 'candle-flame',
    uniforms: withFog(u),
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    fog: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
}

export function makeQuads(count) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.instanceCount = count;
  return g;
}

export function makeStrips(count, parts = 4) {
  const g = new THREE.InstancedBufferGeometry(),
    pos = [],
    idx = [];
  for (let k = 0; k <= parts; k++) {
    const y = -1 + (2 * k) / parts;
    pos.push(-1, y, 0, 1, y, 0);
  }
  for (let k = 0; k < parts; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.instanceCount = count;
  return g;
}

const GLITTER_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aFlame;
attribute vec4 aLean;
uniform float uTime;
uniform float uWaterY;
uniform vec4 uGlitter;
varying vec3 vWorld;
varying vec4 vSrc;
varying vec4 vWin;
#include <fog_pars_vertex>
${FLICKER_GLSL}
void main() {
  float burn = aFlame.x, size = aLean.z;
  vec3 S = aPos + vec3( 0.0, 0.03 * size, 0.0 );
  float hs = max( S.y - uWaterY, 0.01 ), H = cameraPosition.y - uWaterY;
  vec2 d = cameraPosition.xz - S.xz;
  float L = max( length( d ), 1e-3 );
  vec2 dir = d / L;
  float xs = L * hs / ( max( H, 0.05 ) + hs );
  float t0 = max( 0.1 * size, xs * 0.3 ), t1 = min( xs * 5.0 + 0.4, L * 0.9 );
  float along = position.y * 0.5 + 0.5;
  float t = mix( t0, t1, along );
  float ds = length( vec2( t, hs ) ), dc = length( vec2( L - t, H ) );
  float lat = ( hs * dc + max( H, 0.05 ) * ds ) / ( dc + ds );
  float wide = 0.02 + ( 3.6 * uGlitter.y + 0.2 ) * lat;
  if ( uGlitter.w > 0.5 ) wide = 0.03 + 4.5 * uGlitter.y * t;
  vec3 world = vec3( S.x + dir.x * t - dir.y * position.x * wide, uWaterY + 0.004, S.z + dir.y * t + dir.x * position.x * wide );
  vWorld = world;
  vSrc = vec4( S, burn * flick( uTime, aFlame.w ) * uGlitter.z * size * size );
  vWin = vec4( position.x, along, size, 1.0 - ( 0.03 + 4.5 * uGlitter.y * t0 ) / ( 0.03 + 4.5 * uGlitter.y * t1 ) );
  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  #include <fog_vertex>
  gl_Position = ( burn > 0.004 && H > 0.05 && t1 > t0 ) ? projectionMatrix * mvPosition : vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;
const GLITTER_FRAG = /* glsl */ `
uniform sampler2D tRipple;
uniform vec4 uField;
uniform vec4 uOptics;
uniform vec4 uGlitter;
uniform float uRings;
varying vec3 vWorld;
varying vec4 vSrc;
varying vec4 vWin;
#include <fog_pars_fragment>
void main() {
  vec3 toS = vSrc.xyz - vWorld, toC = cameraPosition - vWorld;
  float ds = length( toS ), dc = length( toC );
  vec3 hv = normalize( toS / ds + toC / dc );
  vec2 need = - hv.xz / max( hv.y, 1e-3 );
  vec2 uv = ( vWorld.xz - uField.xy ) * uField.zw;
  vec2 inField = step( vec2( 0.0 ), uv ) * step( uv, vec2( 1.0 ) );
  vec2 have = texture2D( tRipple, uv ).xy * ( inField.x * inField.y * uRings );
  vec2 e = need - have;
  float r = uGlitter.y;
  float facets = exp( - dot( e, e ) / ( 2.0 * r * r ) ) / ( 6.2832 * r * r );
  float cosV = clamp( dot( hv, toC / dc ), 0.0, 1.0 );
  float fres = uOptics.x + ( 1.0 - uOptics.x ) * pow( 1.0 - cosV, uOptics.y );
  float rim = smoothstep( 0.15, 0.27, length( toS.xz ) / vWin.z );
  float fadeIn = vWin.w * ( 1.0 - vWin.y );
  float window = ( 1.0 - vWin.x * vWin.x * vWin.x * vWin.x ) * ( 1.0 - fadeIn * fadeIn ) * smoothstep( 0.0, 0.08, vWin.y ) * ( 1.0 - smoothstep( 0.75, 1.0, vWin.y ) );
  float radiance = fres * facets * vSrc.w / ( 4.0 * max( toC.y / dc, 0.04 ) * ds * ds ) * rim * window * uGlitter.x;
${AIR_THROUGH}
  gl_FragColor = vec4( vec3( 1.0, 0.62, 0.28 ) * min( radiance, 6.0 ) * airThrough, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeGlitterMaterial(u) {
  return new THREE.ShaderMaterial({
    name: 'candle-glitter',
    uniforms: withFog(u),
    vertexShader: GLITTER_VERT,
    fragmentShader: GLITTER_FRAG,
    fog: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
}

const SMOKE_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aSmoke;
uniform vec2 uSmokeSize;
varying vec2 vUv;
varying vec2 vAge;
#include <fog_pars_vertex>
void main() {
  float age = aSmoke.x;
  vec3 toCam = normalize( cameraPosition - aPos );
  vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) + vec3( 1e-5, 0.0, 0.0 ) );
  vec2 q = vec2( position.x, position.y * 0.5 + 0.5 );
  float tall = uSmokeSize.y * ( 0.75 + 0.5 * aSmoke.y );
  vec3 world = aPos + right * ( q.x * uSmokeSize.x ) + vec3( 0.0, q.y * tall, 0.0 ) + vec3( aSmoke.z, 0.0, aSmoke.w ) * ( q.y * q.y );
  vUv = q; vAge = vec2( age, aSmoke.y );
  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  #include <fog_vertex>
  gl_Position = age >= 0.0 ? projectionMatrix * mvPosition : vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;
const SMOKE_FRAG = /* glsl */ `
uniform vec3 uSmokeColor;
uniform float uSmokeLife;
varying vec2 vUv;
varying vec2 vAge;
#include <fog_pars_fragment>
void main() {
  float age = vAge.x, seed = vAge.y, y = vUv.y;
  float rise = age * ( 0.34 + 0.2 * seed );
  float wav = sin( y * 7.0 - age * 2.6 + seed * 40.0 ) * 0.34 + sin( y * 17.0 - age * 4.7 + seed * 13.0 ) * 0.13 + sin( y * 2.9 + age * 1.3 + seed * 7.0 ) * 0.3;
  float cx = wav * y * ( 0.35 + y );
  float width = 0.018 + 0.2 * y * y + 0.04 * age * y;
  float thread = 1.0 - smoothstep( width * 0.2, width, abs( vUv.x - cx ) );
  float head = 1.0 - smoothstep( rise - 0.25, rise, y );
  float tail = smoothstep( 0.0, 0.04, y ) * ( 1.0 - 0.8 * y );
  float fade = ( 1.0 - smoothstep( uSmokeLife * 0.35, uSmokeLife, age ) ) * smoothstep( 0.0, 0.15, age );
  float a = thread * thread * head * tail * fade * 0.4;
  gl_FragColor = vec4( uSmokeColor, a );
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeSmokeMaterial(u) {
  return new THREE.ShaderMaterial({
    name: 'candle-smoke',
    uniforms: withFog(u),
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    fog: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
}
