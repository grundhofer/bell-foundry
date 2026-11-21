export const NOISE_GLSL = /* glsl */ `
float bfHash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float bfHash13( vec3 p3 ) { p3 = fract( p3 * 0.1031 ); p3 += dot( p3, p3.zyx + 31.32 ); return fract( ( p3.x + p3.y ) * p3.z ); }
vec3 bfHash33( vec3 p3 ) { p3 = fract( p3 * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yxx ) * p3.zyx ); }
float bfNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( bfHash12( i ), bfHash12( i + vec2( 1.0, 0.0 ) ), f.x ), mix( bfHash12( i + vec2( 0.0, 1.0 ) ), bfHash12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float bfFbm( vec2 p ) {
	float a = 0.5, s = 0.0;
	for ( int i = 0; i < 5; i ++ ) { s += a * bfNoise( p ); p = mat2( 1.6, 1.2, - 1.2, 1.6 ) * p + 7.3; a *= 0.5; }
	return s;
}
`;

export const SKY_PARS = /* glsl */ `
uniform vec4 uMoon;
uniform vec3 uMoonColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyLow;
uniform vec3 uCloudColor;
uniform vec4 uSkyParams;
uniform sampler2D tSkyCloud;
uniform vec4 uSkyCloud;
${NOISE_GLSL}

float bfSea( vec2 p, vec2 c, vec2 r ) { vec2 d = ( p - c ) / r; return exp( - dot( d, d ) * 1.25 ); }
vec3 bfMoonFace( vec2 p, float z ) {
	float seas = bfSea( p, vec2( - 0.46, 0.30 ), vec2( 0.26, 0.40 ) ) + bfSea( p, vec2( - 0.14, 0.50 ), vec2( 0.24, 0.20 ) )
		+ bfSea( p, vec2( 0.20, 0.42 ), vec2( 0.16, 0.15 ) ) + bfSea( p, vec2( 0.40, 0.18 ), vec2( 0.20, 0.17 ) )
		+ bfSea( p, vec2( 0.63, 0.36 ), vec2( 0.09, 0.11 ) ) + bfSea( p, vec2( 0.52, - 0.12 ), vec2( 0.13, 0.13 ) )
		+ bfSea( p, vec2( - 0.20, - 0.30 ), vec2( 0.21, 0.14 ) ) + bfSea( p, vec2( - 0.53, - 0.20 ), vec2( 0.12, 0.12 ) );
	float edge = bfFbm( p * 4.3 + 11.0 );
	float maria = smoothstep( 0.42, 0.78, seas + ( edge - 0.5 ) * 0.55 );
	float fine = bfFbm( p * 9.0 + 3.0 ), speck = bfNoise( p * 34.0 );
	vec2 q = p - vec2( - 0.08, - 0.70 );
	float rq = length( q ), ray = pow( max( sin( atan( q.y, q.x ) * 11.0 + edge * 5.0 ), 0.0 ), 5.0 ) * exp( - rq * 2.2 ) * smoothstep( 0.03, 0.1, rq );
	float crater = exp( - rq * rq * 420.0 ) * 0.5 + ray * 0.32;
	float shade = ( 0.70 + 0.30 * pow( z, 0.5 ) ) * ( 1.0 - 0.36 * maria ) * ( 0.88 + 0.22 * fine ) * ( 0.96 + 0.08 * speck ) + crater * ( 1.0 - 0.6 * maria );
	return vec3( shade ) * mix( vec3( 1.0 ), vec3( 0.93, 0.97, 1.05 ), maria );
}

float bfCloudField( vec2 p ) { return smoothstep( 0.46, 0.86, bfFbm( p * vec2( 0.8, 1.9 ) + 0.6 * bfFbm( p * 0.7 + 3.1 ) ) ); }
float bfCloud( vec3 d, float t ) {
	vec2 p = d.xz / max( d.y + 0.32, 0.05 ) * 1.35 + vec2( t * 0.004, t * 0.0017 );
	return texture2D( tSkyCloud, ( p - uSkyCloud.xy ) * uSkyCloud.z + 0.5 ).r * smoothstep( 0.02, 0.2, d.y );
}

vec3 bfSky( vec3 d ) {
	float t = uSkyParams.y;
	float up = clamp( d.y, - 1.0, 1.0 );
	vec3 col = mix( uSkyLow, uSkyTop, smoothstep( - 0.08, 0.7, up ) );
	vec3 toMoon = uMoon.xyz - cameraPosition;
	float moonDist = max( length( toMoon ), 1.0 );
	vec3 moonDir = toMoon / moonDist;
	float mu = clamp( dot( d, moonDir ), - 1.0, 1.0 );
	float ang = acos( mu );
	float r = asin( clamp( uMoon.w / moonDist, 0.0, 0.9 ) );
	float cloud = bfCloud( d, t ) * uSkyParams.w;

	vec3 q = d * 150.0, cell = floor( q );
	vec3 rnd = bfHash33( cell );
	float star = step( 0.985, rnd.x ) * smoothstep( 0.2, 0.0, length( fract( q ) - 0.5 - ( rnd.yzx - 0.5 ) * 0.5 ) );
	star *= ( 0.4 + 0.6 * rnd.z ) * ( 0.75 + 0.25 * sin( t * ( 0.7 + rnd.y * 1.6 ) + rnd.z * 40.0 ) );
	col += vec3( 0.75, 0.85, 1.0 ) * star * uSkyParams.z * smoothstep( 0.05, 0.35, up ) * smoothstep( r * 1.6, r * 4.5, ang ) * ( 1.0 - cloud );

	vec3 moonTint = uMoonColor / max( max( uMoonColor.r, uMoonColor.g ), max( uMoonColor.b, 1e-4 ) );
	float halo = exp( - max( ang - r, 0.0 ) * 9.0 ) * 0.09 + exp( - ang * 2.4 ) * 0.022;
	col += moonTint * halo;

	vec3 cl = uCloudColor * ( 0.35 + 1.9 * exp( - ang * 2.6 ) ) + moonTint * 0.42 * exp( - max( ang - r, 0.0 ) * 6.0 );
	col = mix( col, cl, cloud * 0.72 );

	if ( ang < r * 1.05 ) {
		vec3 ax = normalize( cross( abs( moonDir.y ) < 0.95 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ), moonDir ) );
		vec3 ay = cross( moonDir, ax );
		vec2 p = vec2( dot( d, ax ), dot( d, ay ) ) / sin( r );
		float z = sqrt( max( 1.0 - dot( p, p ), 0.0 ) );
		vec2 sp = p * ( 1.0 + 0.22 * ( 1.0 - z ) );
		vec3 disc = uMoonColor * bfMoonFace( sp, z ) * ( 1.0 - 0.3 * cloud );
		col = mix( col, disc, smoothstep( r, r * 0.988, ang ) );
	}
	return col;
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
	gl_Position = p.xyww;
}`;

export const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
export const CLOUD_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec4 uSkyCloud;
${NOISE_GLSL}
float bfCloudField( vec2 p ) { return smoothstep( 0.46, 0.86, bfFbm( p * vec2( 0.8, 1.9 ) + 0.6 * bfFbm( p * 0.7 + 3.1 ) ) ); }
void main() { gl_FragColor = vec4( bfCloudField( uSkyCloud.xy + ( vUv - 0.5 ) / uSkyCloud.z ), 0.0, 0.0, 1.0 ); }`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
${SKY_PARS}
void main() {
	gl_FragColor = vec4( bfSky( normalize( vDir ) ), 1.0 );
}`;

export const HALL_FRAG = /* glsl */ `
varying vec3 vDir;
${SKY_PARS}
uniform vec2 uMood;
uniform vec3 uWarm;
uniform vec3 uGold;
uniform vec3 uStone;
uniform vec4 uHall;
uniform vec4 uWindow;
uniform vec3 uProbe;

vec3 bfHall( vec3 d ) {
	vec3 o = uProbe;
	float tFloor = d.y < - 1e-4 ? - o.y / d.y : 1e9;
	float tSide = abs( d.x ) > 1e-4 ? ( sign( d.x ) * uHall.x - o.x ) / d.x : 1e9;
	float tEnd = abs( d.z ) > 1e-4 ? ( ( d.z < 0.0 ? uHall.y : uHall.z ) - o.z ) / d.z : 1e9;
	float t = min( tFloor, min( tSide, tEnd ) );
	vec3 p = o + d * t;
	vec3 sky = bfSky( d );
	float glow = uMood.x;
	vec3 low = uWarm * glow * exp( - max( p.y, 0.0 ) * 0.28 );
	if ( t == tFloor ) {
		vec3 rd = vec3( d.x, - d.y, d.z );
		float fres = 0.04 + 0.96 * pow( 1.0 - clamp( - d.y, 0.0, 1.0 ), 5.0 );
		vec3 col = bfSky( rd ) * fres * 0.7 + uStone * 0.06;
		float sparkle = step( 0.93, bfHash12( floor( p.xz * 0.9 ) ) );
		col += uWarm * glow * ( 0.2 + 2.2 * sparkle ) * smoothstep( 22.0, 2.0, length( p.xz ) );
		col += uGold * uMood.y * 0.5 * exp( - length( p.xz - vec2( 0.0, - 9.0 ) ) * 0.12 );
		return col;
	}
	if ( p.y > uHall.w ) return sky;
	if ( t == tSide ) {
		float bay = abs( fract( p.z / 4.0 + 0.5 ) - 0.5 ) * 2.0;
		float arch = 9.5 - 5.0 * pow( max( 1.0 - bay, 0.0 ) * 1.6, 2.0 );
		float open = smoothstep( 0.3, 0.42, bay ) * ( 1.0 - smoothstep( arch - 0.4, arch, p.y ) );
		vec3 col = uStone * ( 0.25 + 0.75 * smoothstep( 0.0, 12.0, p.y ) ) + low;
		col *= mix( 1.0, 0.22, open );
		col += uGold * uMood.y * 0.25 * exp( - abs( p.z + 9.0 ) * 0.1 ) * exp( - p.y * 0.12 );
		return col;
	}
	if ( d.z < 0.0 ) {
		vec2 w = p.xy - uWindow.xy; float wr = length( w ) / uWindow.w;
		float ang = atan( w.y, w.x );
		float petals = smoothstep( 0.0, 0.14, abs( sin( ang * 6.0 ) ) * wr + ( 1.0 - wr ) * 0.5 - 0.12 );
		float ring = smoothstep( 0.05, 0.0, abs( wr - 0.45 ) - 0.03 );
		float glass = ( 1.0 - smoothstep( 0.94, 1.0, wr ) ) * petals * ( 1.0 - ring );
		float pipes = smoothstep( 0.2, 0.8, sin( p.x * 5.5 ) ) * smoothstep( 13.0, 3.0, p.y ) * smoothstep( 9.0, 4.0, abs( p.x ) );
		vec3 col = uStone * 0.55 + low + uStone * 1.6 * pipes;
		col += uGold * uMood.y * 1.4 * exp( - length( p.xy - vec2( 0.0, 3.0 ) ) * 0.22 );
		return mix( col, sky, glass );
	}
	float door = ( 1.0 - smoothstep( 2.4, 2.8, abs( p.x ) ) ) * ( 1.0 - smoothstep( 6.5, 7.5, p.y ) );
	vec3 moonTint = uMoonColor / max( max( uMoonColor.r, uMoonColor.g ), max( uMoonColor.b, 1e-4 ) );
	return uStone * ( 0.5 + 0.5 * door ) + low * 0.7 + moonTint * uHall.w * 0.0085 * smoothstep( 3.5, 8.0, p.y ) * ( 1.0 - 0.6 * door );
}
void main() {
	gl_FragColor = vec4( bfHall( normalize( vDir ) ), 1.0 );
}`;
