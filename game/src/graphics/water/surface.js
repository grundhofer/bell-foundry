import * as THREE from 'three';

const SWELL = [
  [37, 6.8, 19, 1.0],
  [118, 4.6, 15, 0.85],
  [163, 3.1, 12, 0.7],
  [74, 2.15, 9.5, 0.55],
];
const FINE = [
  [21, 1.31, 7.1, 0.9],
  [97, 0.83, 5.6, 0.8],
  [149, 0.52, 4.3, 0.6],
  [58, 0.33, 3.4, 0.35],
  [128, 0.21, 2.7, 0.2],
];
const f = (x) => {
  const s = (+x).toFixed(5);
  return s.includes('.') ? s : s + '.0';
};
function waveLines(list, amp, fade) {
  return list
    .map(([deg, len, period, weight], i) => {
      const a = (deg * Math.PI) / 180,
        k = (2 * Math.PI) / len,
        dx = Math.cos(a),
        dz = Math.sin(a);
      const fadeBy = fade ? ` * (1.0 - smoothstep(0.18, 0.6, fp / ${f(len)}))` : '';
      return `  s += vec2(${f(dx)}, ${f(dz)}) * (${amp} * ${f(weight)}${fadeBy}) * cos(dot(q, vec2(${f(dx * k)}, ${f(dz * k)})) - t * ${f((2 * Math.PI) / period)} + ${f(i * 1.7 + (fade ? 0.6 : 0))});`;
    })
    .join('\n');
}

const PARS = /* glsl */ `
uniform sampler2D tMirror;
uniform highp sampler2D tMirrorDepth;
uniform sampler2D tRipple;
uniform mat4 uMirrorVP;
uniform mat4 uMirrorInvVP;
uniform vec2 uDepthMap;
uniform vec4 uField;
uniform float uTime;
uniform vec4 uOptics;
uniform vec4 uStill;
uniform vec4 uGloss;
uniform vec3 uDeep;
uniform vec2 uContact;
uniform vec4 uRing;
varying vec3 vWaterPos;
vec3 wSheen;
vec3 wFlatNV;

vec2 wStill( vec2 p, float t, float fp ) {
  vec2 q = p + 0.55 * vec2( sin( 0.19 * p.y + 0.043 * t ), sin( 0.16 * p.x - 0.037 * t + 1.7 ) );
  vec2 s = vec2( 0.0 );
${waveLines(SWELL, 'uStill.x', false)}
  float patches = 0.35 + 0.65 * smoothstep( -0.3, 0.6, sin( 0.131 * p.x + 0.07 * t ) * sin( 0.113 * p.y - 0.05 * t + 1.3 ) + 0.4 * sin( 0.047 * ( p.x + p.y ) + 0.021 * t ) );
  float fine = uStill.y * patches;
${waveLines(FINE, 'fine', true)}
  return s;
}

void RE_Direct_Water( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 wH = normalize( directLight.direction + geometryViewDir );
  float a = max( dot( geometryNormal, wH ), 0.0 ), b = max( dot( wFlatNV, wH ), 0.0 );
  wSheen += directLight.color * ( max( pow( a, uGloss.x ) - pow( b, uGloss.x ), 0.0 ) * uGloss.y + max( pow( a, uGloss.z ) - pow( b, uGloss.z ), 0.0 ) * uGloss.w );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Water
#undef RE_IndirectDiffuse
#undef RE_IndirectSpecular
`;

const SURFACE = /* glsl */ `
  wFlatNV = normal;
  wSheen = vec3( 0.0 );
  vec3 wPos = vWaterPos;
  vec3 wToCam = cameraPosition - wPos;
  float wDist = length( wToCam );
  vec3 wV = wToCam / wDist;
  float wFoot = max( length( dFdx( wPos.xz ) ), length( dFdy( wPos.xz ) ) );
  vec2 wUv = ( wPos.xz - uField.xy ) * uField.zw;
  vec2 wIn = smoothstep( vec2( 0.0 ), vec2( 0.015 ), wUv ) * smoothstep( vec2( 0.0 ), vec2( 0.015 ), 1.0 - wUv );
  vec2 wSlope = texture2D( tRipple, wUv ).xy * ( wIn.x * wIn.y * uStill.w ) + wStill( wPos.xz, uTime, wFoot );
  vec3 wN = normalize( vec3( - wSlope.x, 1.0, - wSlope.y ) );
  normal = normalize( ( viewMatrix * vec4( wN, 0.0 ) ).xyz );

  vec4 wClip = uMirrorVP * vec4( wPos, 1.0 );
  vec2 wUv0 = wClip.xy / wClip.w * 0.5 + 0.5;
  float wDepth = texture2D( tMirrorDepth, wUv0 ).r;
  vec4 wHit = uMirrorInvVP * vec4( wUv0 * 2.0 - 1.0, wDepth * uDepthMap.x + uDepthMap.y, 1.0 );
  float wReach = min( distance( wHit.xyz / max( wHit.w, 1e-6 ), wPos ), 400.0 );
  vec3 wR = reflect( - wV, wN );
  wR.y = max( wR.y, 0.012 );
  vec4 wClip1 = uMirrorVP * vec4( wPos + normalize( wR ) * wReach, 1.0 );
  vec2 wUv1 = clamp( wClip1.xy / max( wClip1.w, 1e-6 ) * 0.5 + 0.5, vec2( 0.002 ), vec2( 0.998 ) );
  float wRough = min( length( wSlope ) * 9.0, 2.5 );
  vec3 wMirror = textureLod( tMirror, wUv1, 0.6 + wRough ).rgb;
  vec2 wAway = - normalize( wV.xz );
  vec4 wClipL = uMirrorVP * vec4( wPos + vec3( wAway.x, 0.025, wAway.y ) * 40.0, 1.0 );
  vec3 wLow = textureLod( tMirror, clamp( wClipL.xy / max( wClipL.w, 1e-6 ) * 0.5 + 0.5, vec2( 0.02 ), vec2( 0.98 ) ), 5.0 ).rgb;
  #ifdef USE_FOG
    wLow = max( wLow, fogColor * uRing.w );
  #else
    wLow = max( wLow, vec3( 0.02, 0.03, 0.055 ) * uRing.w );
  #endif
  float wLean = clamp( ( dot( wSlope, wAway ) - 0.012 ) * uRing.x, 0.0, 1.0 );
`;

const COMPOSE = /* glsl */ `
  float wCos = clamp( dot( wN, wV ), 0.0, 1.0 );
  float wF = uOptics.x + ( 1.0 - uOptics.x ) * pow( 1.0 - wCos, uOptics.y );
  float wShade = 1.0 - uOptics.w * ( 0.65 * ( 1.0 - smoothstep( 0.0, uContact.x, wReach ) ) + 0.35 * ( 1.0 - smoothstep( 0.0, uContact.y, wReach ) ) );
  vec3 wOut = max( mix( wMirror, max( wMirror, wLow * uRing.y ), wLean ) * wF * wShade + wSheen * ( uStill.z * mix( 0.3, 1.0, wF ) ) + wLow * ( wLean * uRing.z ) + uDeep * ( 1.0 - wF ), vec3( 0.0 ) );
  float wAlpha = 1.0 - uOptics.z * ( 1.0 - wF ) * ( 1.0 - wF ) * wShade;
  outgoingLight = wOut / wAlpha;
  diffuseColor.a = wAlpha;
`;

/** Update the shared uniform values to change the water. */
export function makeWaterMaterial(u) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.2,
    metalness: 0,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  m.envMapIntensity = 0;
  m.name = 'water';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\n\tvWaterPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + PARS)
      .replace('#include <normal_fragment_maps>', SURFACE)
      .replace('#include <opaque_fragment>', COMPOSE + '\n\t#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'foundry-water-6';
  return m;
}

export function waterUniforms() {
  return {
    tMirror: { value: null },
    tMirrorDepth: { value: null },
    tRipple: { value: null },
    uMirrorVP: { value: new THREE.Matrix4() },
    uMirrorInvVP: { value: new THREE.Matrix4() },
    uDepthMap: { value: new THREE.Vector2(2, -1) },
    uField: { value: new THREE.Vector4(0, 0, 1, 1) },
    uTime: { value: 0 },
    uOptics: { value: new THREE.Vector4(0.12, 3.5, 0.07, 0.6) },
    uStill: { value: new THREE.Vector4(0.006, 0.004, 1.0, 1.0) },
    uGloss: { value: new THREE.Vector4(260, 0.9, 24, 0.12) },
    uDeep: { value: new THREE.Color(0.0028, 0.0046, 0.0085) },
    uContact: { value: new THREE.Vector2(0.05, 0.35) },
    uRing: { value: new THREE.Vector4(9, 1.6, 0.5, 2.0) },
  };
}
