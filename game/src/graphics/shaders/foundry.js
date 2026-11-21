import * as THREE from 'three';
import { WATER_Y } from '../../core/constants.js';
import { FOUNDRY_LOOK } from '../../config/foundry-look.js';

const F = FOUNDRY_LOOK.foundry;
export const FOUNDRY = {
  uniforms: {
    uFdTime: { value: 0 },
    uFdFurnace: { value: new THREE.Vector4(...F.furnace) },
    uFdSoot: { value: new THREE.Vector4(...F.soot) },
    uFdHeat: { value: new THREE.Color(...F.heat) },
    uFdHeatK: { value: F.heatStrength },
    uFdCrack: { value: new THREE.Vector3(...F.cracks) },
    uFdRust: { value: new THREE.Color(...F.rust) },
    tFdLava: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) },
    uFdLavaGrid: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFdLavaLight: { value: new THREE.Color(0, 0, 0) },
  },
};

const PARS = `
uniform float uFdTime;
uniform vec4 uFdFurnace;
uniform vec4 uFdSoot;
uniform vec3 uFdHeat;
uniform float uFdHeatK;
uniform vec3 uFdCrack;
uniform vec3 uFdRust;
uniform sampler2D tFdLava;
uniform vec4 uFdLavaGrid;
uniform vec3 uFdLavaLight;
float fdHeat;
float fdLava( vec3 p, vec3 n ) {
	vec2 uv = ( p.xz - uFdLavaGrid.xy ) * uFdLavaGrid.zw;
	vec2 e = smoothstep( vec2( 0.0 ), vec2( 0.04 ), uv ) * smoothstep( vec2( 0.0 ), vec2( 0.04 ), 1.0 - uv );
	return texture2D( tFdLava, clamp( uv, 0.0, 1.0 ) ).r * e.x * e.y * ( 1.0 - smoothstep( 0.0, 3.5, p.y ) ) * ( 0.55 + 0.45 * max( n.y, 0.0 ) );
}
`;

const SOOT = `
{
	float fdH = vWdPos.y - ${WATER_Y.toFixed(3)};
	vec4 fdN = wdNoise4( vWdPos * vec3( 0.35, 0.12, 0.35 ) );
	float fdD = distance( vWdPos, uFdFurnace.xyz );
	float fdNear = 1.0 - smoothstep( 2.0, uFdFurnace.w, fdD );
	float fdSoot = smoothstep( uFdSoot.y, uFdSoot.z, fdH + ( fdN.r - 0.5 ) * 5.0 ) * ( 0.55 + 0.45 * fdN.b );
	fdSoot = clamp( fdSoot + fdNear * 0.6 * fdN.g, 0.0, 1.0 ) * uFdSoot.x;
	diffuseColor.rgb *= 1.0 - fdSoot;
	roughnessFactor = clamp( roughnessFactor + fdSoot * uFdSoot.w, 0.05, 1.0 );
	float fdBreath = 0.8 + 0.2 * sin( uFdTime * 0.9 + fdN.a * 6.0 );
	fdHeat = pow( fdNear, 2.2 ) * smoothstep( 0.35, 0.75, fdN.g + fdNear * 0.3 ) * fdBreath;
}`;
const HEAT = `
	totalEmissiveRadiance += uFdHeat * fdHeat * uFdHeatK;
	totalEmissiveRadiance += diffuseColor.rgb * uFdLavaLight * fdLava( vWdPos, normalize( vWdNormal ) );
`;

const CRACKS = `
{
	vec4 fdA = wdNoise4( vec3( vWdPos.x, 0.0, vWdPos.z ) * uFdCrack.y );
	vec4 fdB = wdNoise4( vec3( vWdPos.x, 0.0, vWdPos.z ) * uFdCrack.y * 2.3 + 0.37 );
	float fdR = abs( fdA.r - 0.5 ) * 2.0 + abs( fdB.g - 0.5 ) * 0.6;
	float fdW = fwidth( fdR ) * 1.2 + 0.015;
	float fdLine = 1.0 - smoothstep( 0.0, fdW + 0.03, fdR );
	float fdWhere = smoothstep( 1.0 - uFdCrack.z, 1.0 - uFdCrack.z + 0.2, fdA.b );
	float fdPulse = 0.65 + 0.35 * sin( uFdTime * 1.7 + fdA.a * 9.0 );
	float fdC = fdLine * fdWhere * fdPulse * smoothstep( 0.6, 0.9, vWdNormal.y );
	float fdHalo = ( 1.0 - smoothstep( 0.0, 0.16, fdR ) ) * fdWhere * fdPulse * smoothstep( 0.6, 0.9, vWdNormal.y );
	diffuseColor.rgb *= 1.0 - 0.5 * fdHalo;
	totalEmissiveRadiance += uFdHeat * ( fdC * ( 1.0 + 2.0 * fdLine ) + fdHalo * 0.12 ) * uFdCrack.x;
}`;

const RUST_COLOUR = `
float fdRust;
{
	vec4 fdN = wdNoise4( vWdPos * 1.7 );
	float fdLow = 1.0 - smoothstep( 0.0, 3.0, vWdPos.y );
	fdRust = smoothstep( 0.45, 0.7, fdN.r * 0.7 + fdN.a * 0.3 + fdLow * 0.25 );
	diffuseColor.rgb = mix( diffuseColor.rgb, uFdRust * ( 0.7 + 0.6 * fdN.g ), fdRust );
}`;
const RUST_ROUGH = `
	roughnessFactor = mix( roughnessFactor, 0.92, fdRust );
`;
const RUST_METAL = `
	metalnessFactor = mix( metalnessFactor, 0.15, fdRust );
`;

export function foundryShaderChunks(kind) {
  if (kind === 'iron')
    return { pars: PARS, afterMap: RUST_COLOUR, afterRoughness: RUST_ROUGH, afterMetalness: RUST_METAL };
  const p = { pars: PARS, afterRoughness: SOOT, afterEmissive: HEAT };
  if (kind === 'pave') p.afterEmissive = HEAT + CRACKS;
  return p;
}
