import { AIR_VEC4_COUNT, AIR_GLSL } from './chunks.js';

export const VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const HEAD = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
in vec2 vUv;
layout( location = 0 ) out vec4 outColor;
#define PI 3.141592653589793
#define PI_HALF 1.5707963267948966
`;

const DEPTH = /* glsl */ `
uniform sampler2D tDepth;
uniform vec4 uProj;
float bfZ( float depth ) { return uProj.x * uProj.y / ( uProj.y - depth * ( uProj.y - uProj.x ) ); }
float bfZAt( vec2 uv ) { return bfZ( textureLod( tDepth, uv, 0.0 ).r ); }
vec3 bfViewPos( vec2 uv, float z ) { return vec3( ( uv * 2.0 - 1.0 ) * uProj.zw * z, - z ); }
`;

const BAYER = /* glsl */ `
const float bfB[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
float bfBayer( ivec2 p ) { return ( bfB[ ( p.x & 3 ) + ( p.y & 3 ) * 4 ] + 0.5 ) / 16.0; }
`;

export const AIR_AO_FRAG =
  HEAD +
  DEPTH +
  BAYER +
  /* glsl */ `
uniform vec2 uTexel;
uniform vec2 uHalf;
uniform vec4 uAO;
uniform vec4 uShaft;
#define LAMPS 12
uniform vec4 uLamp[ LAMPS ];
uniform vec4 uLampPower[ LAMPS ];
uniform mat4 uCamWorld;
uniform mat4 uShadowMatrix;
uniform sampler2DShadow tShadow;
uniform float uHasShadow;
uniform vec4 bfAir[ ${AIR_VEC4_COUNT} ];
float bfAirG( float y, float k ) { return sign( y ) * ( 1.0 - exp( - k * abs( y ) ) ) / k; }

void main() {
	ivec2 px = ivec2( gl_FragCoord.xy );
	vec2 uv = vUv + uTexel * 0.25;
	float d = textureLod( tDepth, uv, 0.0 ).r;
	float z = bfZ( d );
	vec3 P = bfViewPos( uv, z );
	float n1 = bfBayer( px ), n2 = bfBayer( px.yx + ivec2( 1, 2 ) ), n3 = bfBayer( px + ivec2( 2, 3 ) );

	float ao = 1.0;
	float rPix = uAO.x * uHalf.y * 0.5 / ( uProj.w * z );
	if ( d < 0.99999 && uAO.z > 0.5 && rPix > 1.5 ) {
		rPix = min( rPix, uHalf.y * 0.22 );
		vec2 ex = vec2( uTexel.x, 0.0 ), ey = vec2( 0.0, uTexel.y );
		float zl = bfZAt( uv - ex ), zr = bfZAt( uv + ex ), zb = bfZAt( uv - ey ), zt = bfZAt( uv + ey );
		vec3 dx = abs( zl - z ) < abs( zr - z ) ? P - bfViewPos( uv - ex, zl ) : bfViewPos( uv + ex, zr ) - P;
		vec3 dy = abs( zb - z ) < abs( zt - z ) ? P - bfViewPos( uv - ey, zb ) : bfViewPos( uv + ey, zt ) - P;
		vec3 N = normalize( cross( dx, dy ) );
		vec3 V = normalize( - P );
		float range = uAO.x * 0.62, mul = - 1.0 / range, add = ( uAO.x - range ) / range + 1.0;
		int S = int( uAO.z ), K = int( uAO.w );
		float vis = 0.0;
		for ( int s = 0; s < S; s ++ ) {
			float phi = ( float( s ) + n1 ) / float( S ) * PI;
			vec2 om = vec2( cos( phi ), sin( phi ) );
			vec3 dirV = vec3( om, 0.0 );
			vec3 ortho = dirV - dot( dirV, V ) * V;
			vec3 axis = normalize( cross( ortho, V ) );
			vec3 projN = N - axis * dot( N, axis );
			float projLen = length( projN );
			float sgn = sign( dot( ortho, projN ) );
			float cosN = clamp( dot( projN, V ) / max( projLen, 1e-4 ), 0.0, 1.0 );
			float n = sgn * acos( cosN );
			float low0 = cos( n + PI_HALF ), low1 = cos( n - PI_HALF );
			float hc0 = low0, hc1 = low1;
			for ( int k = 0; k < K; k ++ ) {
				float sn = ( float( k ) + n2 ) / float( K ); sn *= sn;
				vec2 off = om * ( sn * rPix + 1.0 ) / uHalf;
				vec2 u0 = uv + off, u1 = uv - off;
				vec3 d0 = bfViewPos( u0, bfZAt( u0 ) ) - P, d1 = bfViewPos( u1, bfZAt( u1 ) ) - P;
				float l0 = length( d0 ), l1 = length( d1 );
				float c0 = mix( low0, dot( d0 / l0, V ), clamp( l0 * mul + add, 0.0, 1.0 ) );
				float c1 = mix( low1, dot( d1 / l1, V ), clamp( l1 * mul + add, 0.0, 1.0 ) );
				hc0 = max( hc0, c0 ); hc1 = max( hc1, c1 );
			}
			float h0 = - acos( clamp( hc1, - 1.0, 1.0 ) ), h1 = acos( clamp( hc0, - 1.0, 1.0 ) );
			h0 = n + clamp( h0 - n, - PI_HALF, PI_HALF ); h1 = n + clamp( h1 - n, - PI_HALF, PI_HALF );
			float i0 = ( cosN + 2.0 * h0 * sin( n ) - cos( 2.0 * h0 - n ) ) * 0.25;
			float i1 = ( cosN + 2.0 * h1 * sin( n ) - cos( 2.0 * h1 - n ) ) * 0.25;
			vis += mix( projLen, 1.0, 0.05 ) * ( i0 + i1 );
		}
		ao = pow( clamp( vis / float( S ), 0.0, 1.0 ), uAO.y );
	}

	float shaft = 0.0;
	int M = int( uShaft.x );
	vec3 cam = uCamWorld[ 3 ].xyz;
	vec3 ray = ( uCamWorld * vec4( P, 1.0 ) ).xyz - cam;
	float len = length( ray );
	vec3 dir = ray / len;

	vec2 lamp = vec2( 0.0 );
	if ( uShaft.z > 0.5 ) {
		float T = min( len, 150.0 );
		for ( int i = 0; i < LAMPS; i ++ ) {
			vec2 pw = uLampPower[ i ].xy;
			if ( pw.x + pw.y <= 0.0 ) continue;
			vec3 q = uLamp[ i ].xyz - cam;
			float b = dot( q, dir );
			float h2 = max( dot( q, q ) - b * b, 0.0 );
			float near = 1.0 - min( h2 * uLampPower[ i ].z, 1.0 );
			if ( near <= 0.0 ) continue;
			pw *= near * near;
			float h = sqrt( h2 + uLamp[ i ].w );
			float along = ( atan( ( T - b ) / h ) + atan( b / h ) ) / h;
			float yc = max( cam.y + dir.y * clamp( b, 0.0, T ) - bfAir[ 2 ].w, 0.0 );
			float dens = bfAir[ 3 ].w + bfAir[ 0 ].w * exp( - yc * bfAir[ 4 ].x ) + bfAir[ 1 ].w * exp( - yc * bfAir[ 4 ].y );
			lamp += pw * ( along * dens );
		}
	}

	if ( M > 0 ) {
		len = min( len, uShaft.y );
		float stepLen = len / float( M );
		float y0 = bfAir[ 2 ].w, kH = max( bfAir[ 4 ].x, 1e-4 ), kM = max( bfAir[ 4 ].y, 1e-4 );
		float ya = cam.y - y0, gHa = bfAirG( ya, kH ), gMa = bfAirG( ya, kM );
		float dyStep = dir.y * stepLen;
		float tr = 1.0;
		for ( int i = 0; i < M; i ++ ) {
			float yb = ya + dyStep, gHb = bfAirG( yb, kH ), gMb = bfAirG( yb, kM );
			float mH, mM;
			if ( abs( dyStep ) > 1e-3 ) { mH = ( gHb - gHa ) / dyStep; mM = ( gMb - gMa ) / dyStep; }
			else { float ym = abs( 0.5 * ( ya + yb ) ); mH = exp( - kH * ym ); mM = exp( - kM * ym ); }
			float tau = stepLen * ( bfAir[ 0 ].w * mH + bfAir[ 3 ].w + bfAir[ 1 ].w * mM );
			vec3 p = cam + dir * ( ( float( i ) + n3 ) * stepLen );
			float lit = 1.0;
			if ( uHasShadow > 0.5 ) {
				vec4 sc = uShadowMatrix * vec4( p, 1.0 );
				if ( sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z > 0.0 && sc.z < 1.0 ) lit = texture( tShadow, vec3( sc.xy, sc.z - 0.0004 ) );
			}
			float seg = exp( - tau );
			if ( bfAir[ 5 ].w > 0.0 ) lit *= smoothstep( bfAir[ 5 ].z * 0.35, bfAir[ 5 ].w * 0.45, ( float( i ) + 0.5 ) * stepLen );
			shaft += tr * ( 1.0 - seg ) * lit;
			tr *= seg;
			ya = yb; gHa = gHb; gMa = gMb;
		}
		float mu = dot( dir, bfAir[ 2 ].xyz ), g = uShaft.w;
		float hg = ( 1.0 - g * g ) / pow( 1.0 + g * g - 2.0 * g * mu, 1.5 );
		shaft *= mix( 1.0, hg, 0.8 );
	}
	outColor = vec4( ao, shaft, lamp );
}`;

export const AIR_AO_BLUR_FRAG =
  HEAD +
  DEPTH +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
uniform vec2 uHalfTexel;
void main() {
	vec2 q = uTexel * 0.25;
	float zc = bfZAt( vUv + q );
	float zl = bfZAt( vUv + q - vec2( uHalfTexel.x, 0.0 ) ), zr = bfZAt( vUv + q + vec2( uHalfTexel.x, 0.0 ) );
	float zb = bfZAt( vUv + q - vec2( 0.0, uHalfTexel.y ) ), zt = bfZAt( vUv + q + vec2( 0.0, uHalfTexel.y ) );
	float gx = abs( zl - zc ) < abs( zr - zc ) ? zc - zl : zr - zc;
	float gy = abs( zb - zc ) < abs( zt - zc ) ? zc - zb : zt - zc;
	float tol = 1.0 / ( 0.012 * zc + 0.04 );
	vec4 sum = vec4( 0.0 ); float wsum = 0.0;
	for ( int j = - 2; j < 2; j ++ ) for ( int i = - 2; i < 2; i ++ ) {
		vec2 o = vec2( float( i ), float( j ) );
		vec2 uv = vUv + o * uHalfTexel;
		float zi = bfZAt( uv + q );
		float w = max( 0.0, 1.0 - abs( zi - ( zc + gx * o.x + gy * o.y ) ) * tol ) + 1e-4;
		sum += texture( tIn, uv ) * w; wsum += w;
	}
	outColor = sum / wsum;
}`;

export const COMPOSITE_FRAG =
  HEAD +
  DEPTH +
  /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tHalf;
uniform vec2 uTexel;
uniform vec2 uHalf;
uniform vec4 uMix;
uniform vec3 uShaftColor;
uniform vec3 uLampWarm;
uniform vec3 uLampOther;
uniform mat4 uCamWorld;
uniform vec4 bfAir[ ${AIR_VEC4_COUNT} ];
${AIR_GLSL}
void main() {
	vec3 c = texture( tScene, vUv ).rgb;
	c = mix( min( c, vec3( 512.0 ) ), vec3( 0.0 ), isnan( c ) );
	float d = textureLod( tDepth, vUv, 0.0 ).r;
	float zc = bfZ( d );
	vec2 hp = vUv * uHalf - 0.5, f = fract( hp ), base = ( floor( hp ) + 0.5 ) / uHalf, ht = 1.0 / uHalf, q = uTexel * 0.25;
	float tol = 1.0 / ( 0.012 * zc + 0.04 );
	vec4 sum = vec4( 0.0 ); float wsum = 0.0;
	for ( int j = 0; j < 2; j ++ ) for ( int i = 0; i < 2; i ++ ) {
		vec2 uv = base + vec2( float( i ), float( j ) ) * ht;
		float w = ( i == 0 ? 1.0 - f.x : f.x ) * ( j == 0 ? 1.0 - f.y : f.y );
		w *= max( 0.0, 1.0 - abs( bfZAt( uv + q ) - zc ) * tol ) + 1e-3;
		sum += texture( tHalf, uv ) * w; wsum += w;
	}
	vec4 h = sum / wsum;
	float ao = mix( 1.0, h.r, uMix.x );
	float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	ao = mix( ao, 1.0, smoothstep( 0.7, 2.6, lum ) );
	if ( d < 0.99999 ) {
		vec3 cam = uCamWorld[ 3 ].xyz, world = ( uCamWorld * vec4( bfViewPos( vUv, zc ), 1.0 ) ).xyz;
		vec2 tau = bfAirDepth( cam, world );
		ao = mix( 1.0, ao, exp( - ( tau.x + tau.y ) ) );
	} else ao = 1.0;
	outColor = vec4( c * ao + uShaftColor * h.g + uLampWarm * h.b + uLampOther * h.a, 1.0 );
}`;

export const BLOOM_PRE_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
uniform vec4 uBloom;
vec3 S( float x, float y ) { vec3 c = texture( tIn, vUv + vec2( x, y ) * uTexel ).rgb; return min( c, vec3( 256.0 ) ); }
float K( vec3 c ) { return 1.0 / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
void main() {
	vec3 a = S( - 2.0, - 2.0 ), b = S( 0.0, - 2.0 ), c = S( 2.0, - 2.0 ), d = S( - 2.0, 0.0 ), e = S( 0.0, 0.0 ), f = S( 2.0, 0.0 );
	vec3 g = S( - 2.0, 2.0 ), h = S( 0.0, 2.0 ), i = S( 2.0, 2.0 ), j = S( - 1.0, - 1.0 ), k = S( 1.0, - 1.0 ), l = S( - 1.0, 1.0 ), m = S( 1.0, 1.0 );
	vec3 g0 = ( j + k + l + m ) * 0.25, g1 = ( a + b + d + e ) * 0.25, g2 = ( b + c + e + f ) * 0.25, g3 = ( d + e + g + h ) * 0.25, g4 = ( e + f + h + i ) * 0.25;
	float w0 = 0.5 * K( g0 ), w1 = 0.125 * K( g1 ), w2 = 0.125 * K( g2 ), w3 = 0.125 * K( g3 ), w4 = 0.125 * K( g4 );
	vec3 col = ( g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4 ) / ( w0 + w1 + w2 + w3 + w4 );
	float br = max( col.r, max( col.g, col.b ) );
	float soft = clamp( br - uBloom.x + uBloom.y, 0.0, 2.0 * uBloom.y );
	soft = soft * soft / ( 4.0 * uBloom.y + 1e-4 );
	col *= max( soft, br - uBloom.x ) / max( br, 1e-4 );
	outColor = vec4( col, 1.0 );
}`;

export const BLOOM_DOWN_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
vec3 S( float x, float y ) { return texture( tIn, vUv + vec2( x, y ) * uTexel ).rgb; }
void main() {
	vec3 a = S( - 2.0, - 2.0 ), b = S( 0.0, - 2.0 ), c = S( 2.0, - 2.0 ), d = S( - 2.0, 0.0 ), e = S( 0.0, 0.0 ), f = S( 2.0, 0.0 );
	vec3 g = S( - 2.0, 2.0 ), h = S( 0.0, 2.0 ), i = S( 2.0, 2.0 ), j = S( - 1.0, - 1.0 ), k = S( 1.0, - 1.0 ), l = S( - 1.0, 1.0 ), m = S( 1.0, 1.0 );
	vec3 col = ( j + k + l + m ) * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + e * 0.125;
	outColor = vec4( col, 1.0 );
}`;

export const BLOOM_UP_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel;
uniform float uSpread;
void main() {
	vec2 o = uTexel;
	vec3 t = texture( tLow, vUv ).rgb * 4.0;
	t += ( texture( tLow, vUv + vec2( o.x, 0.0 ) ).rgb + texture( tLow, vUv - vec2( o.x, 0.0 ) ).rgb + texture( tLow, vUv + vec2( 0.0, o.y ) ).rgb + texture( tLow, vUv - vec2( 0.0, o.y ) ).rgb ) * 2.0;
	t += texture( tLow, vUv + o ).rgb + texture( tLow, vUv - o ).rgb + texture( tLow, vUv + vec2( o.x, - o.y ) ).rgb + texture( tLow, vUv + vec2( - o.x, o.y ) ).rgb;
	outColor = vec4( texture( tHigh, vUv ).rgb + t * ( 0.0625 * uSpread ), 1.0 );
}`;

const COC = /* glsl */ `
uniform vec4 uDof;
float bfCoc( float z ) { return clamp( uDof.y * uDof.w * ( z - uDof.x ) / max( z, 0.05 ), - uDof.z, uDof.z ); }
`;

export const DOF_PREP_FRAG =
  HEAD +
  DEPTH +
  COC +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
void main() {
	vec4 o = uTexel.xyxy * vec4( - 0.5, - 0.5, 0.5, 0.5 );
	vec3 c1 = texture( tIn, vUv + o.xy ).rgb, c2 = texture( tIn, vUv + o.zy ).rgb, c3 = texture( tIn, vUv + o.xw ).rgb, c4 = texture( tIn, vUv + o.zw ).rgb;
	float z = min( min( bfZAt( vUv + o.xy ), bfZAt( vUv + o.zy ) ), min( bfZAt( vUv + o.xw ), bfZAt( vUv + o.zw ) ) );
	float w1 = 1.0 / ( 1.0 + max( c1.r, max( c1.g, c1.b ) ) ), w2 = 1.0 / ( 1.0 + max( c2.r, max( c2.g, c2.b ) ) );
	float w3 = 1.0 / ( 1.0 + max( c3.r, max( c3.g, c3.b ) ) ), w4 = 1.0 / ( 1.0 + max( c4.r, max( c4.g, c4.b ) ) );
	outColor = vec4( ( c1 * w1 + c2 * w2 + c3 * w3 + c4 * w4 ) / ( w1 + w2 + w3 + w4 ), bfCoc( z ) );
}`;

export const DOF_TILE_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
void main() {
	float m = 0.0;
	for ( int j = 0; j < 4; j ++ ) for ( int i = 0; i < 4; i ++ ) {
		vec2 o = ( vec2( float( i ), float( j ) ) - 1.5 ) * 2.0 * uTexel;
		m = max( m, - texture( tIn, vUv + o ).a );
	}
	outColor = vec4( m, 0.0, 0.0, 1.0 );
}`;
export const DOF_TILE_MAX_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
void main() {
	float m = 0.0;
	for ( int j = - 1; j <= 1; j ++ ) for ( int i = - 1; i <= 1; i ++ ) m = max( m, texture( tIn, vUv + vec2( float( i ), float( j ) ) * uTexel ).r );
	outColor = vec4( m, 0.0, 0.0, 1.0 );
}`;

export const DOF_BLUR_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout( location = 0 ) out vec4 outFar;
layout( location = 1 ) out vec4 outNear;
uniform sampler2D tIn;
uniform sampler2D tTile;
uniform vec2 uTexel;
#define TAPS 72
void main() {
	vec4 c0 = texture( tIn, vUv );
	float farR = max( c0.a, 0.0 ), nearR = texture( tTile, vUv ).r, R = max( farR, nearR );
	if ( R < 0.6 ) { outFar = vec4( c0.rgb, 0.0 ); outNear = vec4( 0.0, 0.0, 0.0, 0.0 ); return; }
	float rot = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) * 6.2831853;
	vec4 far = vec4( 0.0 ), near = vec4( 0.0 );
	for ( int i = 0; i < TAPS; i ++ ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( TAPS ) ), th = float( i ) * 2.399963229728653 + rot;
		float dist = r * R;
		vec4 s = texture( tIn, vUv + vec2( cos( th ), sin( th ) ) * dist * uTexel );
		float wf = clamp( s.a - dist + 1.0, 0.0, 1.0 ) * step( dist, farR + 0.5 );
		float wn = clamp( - s.a - dist + 1.0, 0.0, 1.0 );
		far += vec4( s.rgb, 1.0 ) * wf; near += vec4( s.rgb, 1.0 ) * wn;
	}
	float fw = clamp( c0.a, 0.0, 1.0 );
	far += vec4( c0.rgb, 1.0 ) * fw;
	outFar = far.a > 1e-3 ? vec4( far.rgb / far.a, max( farR, 0.5 ) / 32.0 ) : vec4( c0.rgb, 0.0 );
	float cover = clamp( near.a / float( TAPS ) * 2.0, 0.0, 1.0 );
	outNear = near.a > 1e-3 ? vec4( near.rgb / near.a * cover, cover ) : vec4( 0.0 );
}`;

export const DOF_FILL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout( location = 0 ) out vec4 outFar;
layout( location = 1 ) out vec4 outNear;
uniform sampler2D tFar;
uniform sampler2D tNear;
uniform sampler2D tTile;
uniform vec2 uTexel;
void main() {
	float rf = max( texture( tFar, vUv ).a * 32.0 * 0.3, 0.8 ), rn = max( texture( tTile, vUv ).r * 0.3, 0.8 );
	vec4 c = texture( tFar, vUv );
	vec4 far = vec4( c.rgb, 1.0 ) * ( step( 1e-4, c.a ) + 1e-3 ), near = texture( tNear, vUv );
	for ( int i = 0; i < 16; i ++ ) {
		float r = sqrt( ( float( i ) + 0.5 ) / 16.0 ), th = float( i ) * 2.399963229728653 + 0.7;
		vec2 o = vec2( cos( th ), sin( th ) ) * r * uTexel;
		vec4 f = texture( tFar, vUv + o * rf );
		far += vec4( f.rgb, 1.0 ) * ( step( 1e-4, f.a ) + 1e-3 );
		near += texture( tNear, vUv + o * rn );
	}
	outFar = vec4( far.rgb / far.a, 1.0 );
	outNear = near / 17.0;
}`;

export const DOF_COMPOSITE_FRAG =
  HEAD +
  DEPTH +
  COC +
  /* glsl */ `
uniform sampler2D tIn;
uniform sampler2D tFar;
uniform sampler2D tNear;
void main() {
	vec3 c = texture( tIn, vUv ).rgb;
	float coc = bfCoc( bfZAt( vUv ) );
	vec4 far = texture( tFar, vUv ), near = texture( tNear, vUv );
	c = mix( c, far.rgb, smoothstep( 0.45, 1.6, coc ) );
	c = c * ( 1.0 - near.a ) + near.rgb;
	outColor = vec4( c, 1.0 );
}`;

export const GRADE_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform sampler2D tBloom;
uniform vec4 uTone;
uniform vec3 uShadowTint;
uniform vec3 uLightTint;
uniform vec4 uFrame;
uniform vec4 uAspect;
uniform vec4 uGold;
vec3 agxCurve( vec3 x ) {
	vec3 x2 = x * x, x4 = x2 * x2;
	return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx( vec3 color ) {
	const mat3 toRec2020 = mat3( vec3( 0.6274, 0.0691, 0.0164 ), vec3( 0.3293, 0.9195, 0.0880 ), vec3( 0.0433, 0.0113, 0.8956 ) );
	const mat3 fromRec2020 = mat3( vec3( 1.6605, - 0.1246, - 0.0182 ), vec3( - 0.5876, 1.1329, - 0.1006 ), vec3( - 0.0728, - 0.0083, 1.1187 ) );
	const mat3 inset = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
	const mat3 outset = mat3( vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ), vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ), vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 ) );
	color = inset * ( toRec2020 * color );
	color = clamp( ( log2( max( color, 1e-10 ) ) + 12.47393 ) / 16.5, 0.0, 1.0 );
	color = agxCurve( color );
	color = pow( max( color, 0.0 ), vec3( uTone.z ) );
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = l + uTone.w * ( color - l );
	color = outset * color;
	color = pow( max( color, 0.0 ), vec3( 2.2 ) );
	return clamp( fromRec2020 * color, 0.0, 1.0 );
}
void main() {
	vec3 c = texture( tIn, vUv ).rgb;
	if ( uAspect.y > 0.002 ) {
		vec2 d = vUv - 0.5;
		float amt = uAspect.y * 0.075 * smoothstep( 0.08, 0.75, length( d * vec2( 1.0, 0.8 ) ) );
		float w = 1.0;
		for ( int i = 1; i < 8; i ++ ) { float k = float( i ) / 8.0, wi = 1.0 - 0.6 * k; c += texture( tIn, vUv - d * amt * k ).rgb * wi; w += wi; }
		c /= w;
	}
	c += texture( tBloom, vUv ).rgb * uTone.y;
	float rich = 1.0 - min( c.r, min( c.g, c.b ) ) / max( max( c.r, max( c.g, c.b ) ), 1e-4 );
	c = agx( max( c, 0.0 ) * uTone.x );
	float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	float warmth = smoothstep( 0.18, 0.55, ( c.r - c.b ) / max( lum, 0.03 ) );
	c *= mix( uShadowTint, uLightTint, max( smoothstep( 0.0, 0.55, lum ), warmth ) );
	if ( uGold.x > 0.001 ) {
		float gl = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		float gw = smoothstep( 0.02, 0.22, c.r - c.b ) * smoothstep( 0.3, 0.7, gl ) * ( 1.0 - 0.5 * smoothstep( 0.9, 1.0, gl ) ) * smoothstep( 0.36, 0.6, rich );
		c *= mix( vec3( 1.0 ), vec3( 1.03, 0.9, 0.64 ), uGold.x * gw );
	}
	vec2 p = ( vUv - 0.5 ) * vec2( min( uAspect.x, 2.0 ) / 1.78, 1.0 );
	float r = length( p ) * 1.42;
	c *= 1.0 - uFrame.x * smoothstep( 0.35, 1.25, r );
	float hurt = 1.0 - pow( 1.0 - uFrame.y, 2.6 );
	float hurtEdge = smoothstep( 0.42 - 0.12 * uFrame.y, 1.12 - 0.14 * uFrame.y, r );
	c = mix( c, c * vec3( 0.62, 0.10, 0.10 ) + vec3( 0.05, 0.0, 0.002 ), hurtEdge * hurt );
	c = mix( c, vec3( 1.0, 0.95, 0.86 ), uAspect.z * 0.85 );
	c *= 1.0 - uFrame.w;
	float bar = uFrame.z;
	if ( bar > 0.0 ) c *= smoothstep( bar - 0.0012, bar + 0.0012, vUv.y ) * smoothstep( bar - 0.0012, bar + 0.0012, 1.0 - vUv.y );
	c = clamp( c, 0.0, 1.0 );
	c = mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
	outColor = vec4( c, dot( c, vec3( 0.299, 0.587, 0.114 ) ) );
}`;

export const FXAA_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
const float STEP[ 8 ] = float[ 8 ]( 1.0, 1.5, 2.0, 2.0, 2.0, 2.0, 4.0, 8.0 );
float L( vec2 uv ) { return textureLod( tIn, uv, 0.0 ).a; }
void main() {
	vec2 uv = vUv, t = uTexel;
	vec4 m = textureLod( tIn, uv, 0.0 );
	float lM = m.a, lS = L( uv + vec2( 0.0, - t.y ) ), lE = L( uv + vec2( t.x, 0.0 ) ), lN = L( uv + vec2( 0.0, t.y ) ), lW = L( uv + vec2( - t.x, 0.0 ) );
	float mx = max( max( lN, lW ), max( lE, max( lS, lM ) ) ), mn = min( min( lN, lW ), min( lE, min( lS, lM ) ) ), range = mx - mn;
	if ( range < max( 0.04, mx * 0.14 ) ) { outColor = m; return; }
	float lNW = L( uv + vec2( - t.x, t.y ) ), lSE = L( uv + vec2( t.x, - t.y ) ), lNE = L( uv + t ), lSW = L( uv - t );
	float lNS = lN + lS, lWE = lW + lE;
	float eH = abs( - 2.0 * lW + lNW + lSW ) + abs( - 2.0 * lM + lNS ) * 2.0 + abs( - 2.0 * lE + lNE + lSE );
	float eV = abs( - 2.0 * lS + lSW + lSE ) + abs( - 2.0 * lM + lWE ) * 2.0 + abs( - 2.0 * lN + lNW + lNE );
	bool horz = eH >= eV;
	float subA = ( lNS + lWE ) * 2.0 + lNW + lSW + lNE + lSE;
	float subC = clamp( abs( subA / 12.0 - lM ) / range, 0.0, 1.0 );
	float l1 = horz ? lN : lE, l2 = horz ? lS : lW;
	float g1 = l1 - lM, g2 = l2 - lM;
	bool first = abs( g1 ) >= abs( g2 );
	float lengthSign = horz ? t.y : t.x;
	if ( ! first ) lengthSign = - lengthSign;
	float grad = max( abs( g1 ), abs( g2 ) ) * 0.25;
	float lAvg = 0.5 * ( ( first ? l1 : l2 ) + lM );
	vec2 posB = uv;
	if ( horz ) posB.y += lengthSign * 0.5; else posB.x += lengthSign * 0.5;
	vec2 off = horz ? vec2( t.x, 0.0 ) : vec2( 0.0, t.y );
	vec2 posN = posB - off, posP = posB + off;
	float endN = L( posN ) - lAvg, endP = L( posP ) - lAvg;
	bool doneN = abs( endN ) >= grad, doneP = abs( endP ) >= grad;
	for ( int i = 1; i < 8; i ++ ) {
		if ( doneN && doneP ) break;
		if ( ! doneN ) { posN -= off * STEP[ i ]; endN = L( posN ) - lAvg; doneN = abs( endN ) >= grad; }
		if ( ! doneP ) { posP += off * STEP[ i ]; endP = L( posP ) - lAvg; doneP = abs( endP ) >= grad; }
	}
	float dstN = horz ? uv.x - posN.x : uv.y - posN.y, dstP = horz ? posP.x - uv.x : posP.y - uv.y;
	bool ltz = lM - lAvg < 0.0;
	bool good = dstN < dstP ? ( ( endN < 0.0 ) != ltz ) : ( ( endP < 0.0 ) != ltz );
	float pixOff = good ? 0.5 - min( dstN, dstP ) / ( dstN + dstP ) : 0.0;
	float subF = ( - 2.0 * subC + 3.0 ) * subC * subC;
	pixOff = max( pixOff, subF * subF * 0.5 );
	if ( horz ) uv.y += pixOff * lengthSign; else uv.x += pixOff * lengthSign;
	outColor = vec4( textureLod( tIn, uv, 0.0 ).rgb, lM );
}`;

export const OUTPUT_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uTexel;
uniform vec4 uOut;
float hash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
void main() {
	vec3 c = texture( tIn, vUv ).rgb;
	if ( uOut.x > 0.001 ) {
		vec3 n = texture( tIn, vUv + vec2( 0.0, uTexel.y ) ).rgb, s = texture( tIn, vUv - vec2( 0.0, uTexel.y ) ).rgb;
		vec3 e = texture( tIn, vUv + vec2( uTexel.x, 0.0 ) ).rgb, w = texture( tIn, vUv - vec2( uTexel.x, 0.0 ) ).rgb;
		vec3 mn = min( c, min( min( n, s ), min( e, w ) ) ), mx = max( c, max( max( n, s ), max( e, w ) ) );
		vec3 amp = sqrt( clamp( min( mn, 1.0 - mx ) / max( mx, vec3( 1e-4 ) ), 0.0, 1.0 ) );
		vec3 wgt = amp * ( - 1.0 / mix( 8.0, 5.0, uOut.x ) );
		c = clamp( ( ( n + s + e + w ) * wgt + c ) / ( 1.0 + 4.0 * wgt ), 0.0, 1.0 );
	}
	float inside = uOut.w <= 0.0 ? 1.0 : step( uOut.w, vUv.y ) * step( uOut.w, 1.0 - vUv.y );
	vec2 q = gl_FragCoord.xy + uOut.z * vec2( 37.0, 17.0 );
	float g1 = hash( q ), g2 = hash( q + 61.7 );
	float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
	float amp = uOut.y * ( 0.35 + 0.65 * ( 1.0 - lum ) ) * smoothstep( 0.0, 0.02, lum ) + 1.0 / 255.0;
	c += ( g1 + g2 - 1.0 ) * amp * inside;
	outColor = vec4( c, 1.0 );
}`;

export const COPY_FRAG =
  HEAD +
  /* glsl */ `
uniform sampler2D tIn;
uniform vec4 uScale;
void main() { outColor = vec4( texture( tIn, vUv ).rgb * uScale.rgb, 1.0 ); }`;
