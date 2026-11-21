import * as THREE from 'three';

export const AIR_VEC4_COUNT = 16;
export const AIR = new Float32Array(AIR_VEC4_COUNT * 4);

export const AIR_GLSL = /* glsl */ `
float bfAirG( float y, float k ) { return sign( y ) * ( 1.0 - exp( - k * abs( y ) ) ) / k; }
float bfAirLayer( float k, float y1, float y2, float dist ) {
	float dy = y2 - y1;
	float m = abs( dy ) > 1e-3 ? ( bfAirG( y2, k ) - bfAirG( y1, k ) ) / dy : exp( - k * abs( 0.5 * ( y1 + y2 ) ) );
	return dist * m;
}
vec2 bfAirDepth( vec3 from, vec3 to ) {
	float dist = distance( from, to );
	float y1 = from.y - bfAir[ 2 ].w, y2 = to.y - bfAir[ 2 ].w;
	float haze = bfAir[ 0 ].w * bfAirLayer( max( bfAir[ 4 ].x, 1e-4 ), y1, y2, dist ) + bfAir[ 3 ].w * dist;
	float mist = bfAir[ 1 ].w * bfAirLayer( max( bfAir[ 4 ].y, 1e-4 ), y1, y2, dist );
	return vec2( haze, mist );
}
vec4 bfAirBetween( vec3 cam, vec3 world ) {
	vec2 tau = bfAirDepth( cam, world );
	if ( bfAir[ 5 ].w > 0.0 ) tau *= smoothstep( bfAir[ 5 ].z, bfAir[ 5 ].w, distance( cam, world ) );
	float sum = tau.x + tau.y;
	float amount = ( 1.0 - exp( - sum ) ) * bfAir[ 4 ].z;
	vec3 col = ( bfAir[ 0 ].rgb * tau.x + bfAir[ 1 ].rgb * tau.y ) / max( sum, 1e-6 );
	vec3 dir = ( world - cam ) / max( distance( world, cam ), 1e-4 );
	float mu = max( dot( dir, bfAir[ 2 ].xyz ), 0.0 );
	float mu2 = mu * mu, mu8 = mu2 * mu2 * mu2 * mu2;
	col += bfAir[ 3 ].rgb * ( mu8 * 0.5 + mu8 * mu8 * mu8 * mu8 );
	return vec4( col * amount, 1.0 - amount );
}
`;

export const AIR_DECL = /* glsl */ `
#ifndef BF_AIR_DECLARED
	#define BF_AIR_DECLARED
	uniform vec4 bfAir[ ${AIR_VEC4_COUNT} ];
#endif
#ifndef BF_AIR_FUNCTIONS
	#define BF_AIR_FUNCTIONS
	${AIR_GLSL}
#endif
`;

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif`;

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
#endif`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	${AIR_DECL}
#endif`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
	vec4 bfAirHere = bfAirBetween( ( - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix ), vFogWorld );
	gl_FragColor.rgb = gl_FragColor.rgb * bfAirHere.a + bfAirHere.rgb;
#endif`;

const SHADOW_PCF = /* glsl */ `
		vec2 bfShadowSlope( vec3 sc ) {
			vec3 dx = dFdx( sc ), dy = dFdy( sc );
			float det = dx.x * dy.y - dx.y * dy.x;
			if ( abs( det ) < 1e-14 ) return vec2( 0.0 );
			return vec2( dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det;
		}
		float bfShadowTap( sampler2DShadow map, vec2 base, vec2 off, float z, vec2 slope ) {
			return texture( map, vec3( base + off, z + clamp( dot( off, slope ), - 0.0025, 0.0025 ) ) );
		}
		float bfShadowPCF( sampler2DShadow map, vec3 sc, vec2 size, float spread, vec2 slope ) {
			vec2 inv = 1.0 / size;
			vec2 uv = sc.xy * size;
			vec2 base = floor( uv + 0.5 );
			float s = uv.x + 0.5 - base.x, t = uv.y + 0.5 - base.y;
			base = ( base - 0.5 ) * inv;
			float uw0 = 4.0 - 3.0 * s, uw1 = 7.0, uw2 = 1.0 + 3.0 * s;
			float u0 = ( ( 3.0 - 2.0 * s ) / uw0 - 2.0 ) * spread, u1 = ( ( 3.0 + s ) / uw1 ) * spread, u2 = ( s / uw2 + 2.0 ) * spread;
			float vw0 = 4.0 - 3.0 * t, vw1 = 7.0, vw2 = 1.0 + 3.0 * t;
			float v0 = ( ( 3.0 - 2.0 * t ) / vw0 - 2.0 ) * spread, v1 = ( ( 3.0 + t ) / vw1 ) * spread, v2 = ( t / vw2 + 2.0 ) * spread;
			float sum = 0.0;
			sum += uw0 * vw0 * bfShadowTap( map, base, vec2( u0, v0 ) * inv, sc.z, slope );
			sum += uw1 * vw0 * bfShadowTap( map, base, vec2( u1, v0 ) * inv, sc.z, slope );
			sum += uw2 * vw0 * bfShadowTap( map, base, vec2( u2, v0 ) * inv, sc.z, slope );
			sum += uw0 * vw1 * bfShadowTap( map, base, vec2( u0, v1 ) * inv, sc.z, slope );
			sum += uw1 * vw1 * bfShadowTap( map, base, vec2( u1, v1 ) * inv, sc.z, slope );
			sum += uw2 * vw1 * bfShadowTap( map, base, vec2( u2, v1 ) * inv, sc.z, slope );
			sum += uw0 * vw2 * bfShadowTap( map, base, vec2( u0, v2 ) * inv, sc.z, slope );
			sum += uw1 * vw2 * bfShadowTap( map, base, vec2( u1, v2 ) * inv, sc.z, slope );
			sum += uw2 * vw2 * bfShadowTap( map, base, vec2( u2, v2 ) * inv, sc.z, slope );
			return sum / 144.0;
		}
`;

const LIGHTS_DECL = /* glsl */ `
#ifndef BF_AIR_DECLARED
	#define BF_AIR_DECLARED
	uniform vec4 bfAir[ ${AIR_VEC4_COUNT} ];
#endif
`;
const LIGHTS_PARS =
  LIGHTS_DECL +
  /* glsl */ `
float bfHeroWeight( vec3 p, vec4 a, vec4 b ) {
	vec2 d = p.xz - a.xy;
	float r = dot( d, d ) / max( b.x * b.x, 1e-4 );
	float y = p.y - a.z;
	return b.y * ( 1.0 - smoothstep( 0.56, 1.0, r ) ) * smoothstep( 0.1, 0.5, y ) * ( 1.0 - smoothstep( a.w * 1.12, a.w * 1.3 + 0.2, y ) );
}
`;
const HERO_KEY = /* glsl */ `
#if defined( RE_Direct )
	{
		vec3 bfHP = ( geometryPosition - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
		float bfHW1 = bfHeroWeight( bfHP, bfAir[ 8 ], bfAir[ 9 ] ), bfHW2 = bfHeroWeight( bfHP, bfAir[ 10 ], bfAir[ 11 ] );
		if ( bfHW1 + bfHW2 > 0.003 ) {
			directLight.color = bfAir[ 14 ].rgb * bfHW1 + bfAir[ 13 ].rgb * bfHW2;
			directLight.direction = normalize( mat3( viewMatrix ) * bfAir[ 12 ].xyz );
			directLight.visible = true;
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
	}
#endif
`;
const CANDLE_GLOW = /* glsl */ `
	{
		vec3 bfGP = ( geometryPosition - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
		vec2 bfGQ = max( abs( bfGP.xz ) - bfAir[ 7 ].xy, 0.0 );
		float bfGIn = 1.0 - smoothstep( 0.0, max( bfAir[ 7 ].z, 0.01 ), length( bfGQ ) );
		float bfGUp = dot( geometryNormal, viewMatrix[ 1 ].xyz );
		irradiance += bfAir[ 6 ].rgb * ( exp( - max( bfGP.y - bfAir[ 2 ].w, 0.0 ) * bfAir[ 6 ].w ) * bfGIn * ( 0.66 - 0.34 * bfGUp ) );
	}`;

export const POINT_SIZE2 = 0.2;
export const pointLightDecay = (size2) => 2 + Math.min(0.0995, Math.max(0, size2 - POINT_SIZE2) / 400);

let patched = false;
const problems = [];

function replaceInChunk(name, find, put) {
  const src = THREE.ShaderChunk[name];
  const out =
    typeof find === 'string'
      ? src.includes(find)
        ? src.replace(find, put)
        : null
      : find.test(src)
        ? src.replace(find, put)
        : null;
  if (out === null) {
    problems.push(name);
    return;
  }
  THREE.ShaderChunk[name] = out;
}

export function patchChunks() {
  if (patched) return problems;
  patched = true;
  const C = THREE.ShaderChunk;

  C.fog_pars_vertex = FOG_PARS_VERTEX;
  C.fog_vertex = FOG_VERTEX;
  C.fog_pars_fragment = FOG_PARS_FRAGMENT;
  C.fog_fragment = FOG_FRAGMENT;
  THREE.UniformsLib.fog.bfAir = { value: AIR };
  for (const k in THREE.ShaderLib) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) u.bfAir = { value: AIR };
  }

  replaceInChunk(
    'shadowmap_pars_fragment',
    'float getShadow( sampler2DShadow shadowMap,',
    SHADOW_PCF + '\t\tfloat getShadow( sampler2DShadow shadowMap,',
  );
  replaceInChunk(
    'shadowmap_pars_fragment',
    'shadowCoord.xyz /= shadowCoord.w;\n\t\t\tshadowCoord.z += shadowBias;',
    'shadowCoord.xyz /= shadowCoord.w;\n\t\t\tvec2 bfSlope = bfShadowSlope( shadowCoord.xyz );\n\t\t\tshadowCoord.z += shadowBias;',
  );
  replaceInChunk(
    'shadowmap_pars_fragment',
    /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample[\s\S]*?\) \* 0\.2;/,
    'shadow = bfShadowPCF( shadowMap, shadowCoord.xyz, shadowMapSize, max( shadowRadius, 1.0 ), bfSlope );',
  );

  replaceInChunk(
    'lights_pars_begin',
    'vec3 lVector = pointLight.position - geometryPosition;\n\t\tlight.direction = normalize( lVector );\n\t\tfloat lightDistance = length( lVector );\n\t\tlight.color = pointLight.color;\n\t\tlight.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );\n\t\tlight.visible = ( light.color != vec3( 0.0 ) );',
    `vec3 lVector = pointLight.position - geometryPosition;
		float bfD2 = dot( lVector, lVector );
		if ( pointLight.color.r + pointLight.color.g + pointLight.color.b <= 0.0 || ( pointLight.distance > 0.0 && bfD2 >= pointLight.distance * pointLight.distance ) ) {
			light.color = vec3( 0.0 ); light.direction = vec3( 0.0, 0.0, 1.0 ); light.visible = false;
		} else {
			float lightDistance = sqrt( bfD2 );
			light.direction = lVector / max( lightDistance, 1e-6 );
			light.color = pointLight.color * getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		}`,
  );
  replaceInChunk(
    'lights_fragment_begin',
    'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
    'if ( directLight.visible ) { RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight ); }',
  );

  C.lights_pars_begin = LIGHTS_PARS + C.lights_pars_begin;
  replaceInChunk(
    'lights_fragment_begin',
    'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );',
    'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );' + CANDLE_GLOW,
  );

  replaceInChunk(
    'lights_fragment_begin',
    '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )',
    HERO_KEY + '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )',
  );

  replaceInChunk(
    'lights_pars_begin',
    'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );',
    'float distanceFalloff = 1.0 / ( lightDistance * lightDistance + ' +
      POINT_SIZE2.toFixed(3) +
      ' + fract( decayExponent ) * 400.0 );',
  );

  replaceInChunk(
    'envmap_physical_pars_fragment',
    'return PI * envMapColor.rgb * envMapIntensity;',
    'return PI * envMapColor.rgb * envMapIntensity * ( 1.0 - bfAir[ 13 ].w );',
  );
  C.envmap_physical_pars_fragment = LIGHTS_DECL + C.envmap_physical_pars_fragment;

  if (problems.length)
    console.warn("gfx: three's shader chunks were not as expected, left unchanged: " + problems.join(', '));
  return problems;
}

patchChunks();
