import * as THREE from 'three';
import { WATER_Y } from '../core/constants.js';
import { LIT_MAX } from './piece-builder.js';
import { FOUNDRY, foundryShaderChunks } from '../graphics/shaders/foundry.js';

function withFoundry(kind, frag, uniforms) {
  const f = foundryShaderChunks(kind);
  Object.assign(uniforms, FOUNDRY.uniforms);
  const o = { ...frag };
  for (const k of ['pars', 'afterMap', 'afterRoughness', 'afterMetalness', 'afterEmissive'])
    if (f[k]) o[k] = (frag[k] || '') + f[k];
  return o;
}

const T = 'assets/art/textures/';
const set = (name, file) => ({
  [`arena.${name}`]: { url: `${T}${file}.webp`, repeat: true, optional: true },
  [`arena.${name}_n`]: { url: `${T}${file}_n.webp`, srgb: false, repeat: true, optional: true },
  [`arena.${name}_orm`]: { url: `${T}${file}_orm.webp`, srgb: false, repeat: true, optional: true },
});
export const TEXTURES = {
  ...set('ashlar', 'limestone_ashlar'),
  ...set('plain', 'limestone_plain'),
  ...set('flag', 'flagstones'),
  ...set('oak', 'dark_oak'),
  'arena.inlay': { url: `${T}floor_inlay.webp`, optional: true },
  'arena.streak': { url: `${T}metal_streak.webp`, srgb: false, repeat: true, optional: true },
};

const WORLD_VARYING = `
varying vec3 vWdPos;
varying vec3 vWdNormal;
varying vec2 vWdLit;`;
const WORLD_VERTEX = `
#include <project_vertex>
{
	vec4 wdW = vec4( transformed, 1.0 );
	vec3 wdN = objectNormal;
	#ifdef USE_INSTANCING
		wdW = instanceMatrix * wdW;
		wdN = mat3( instanceMatrix ) * wdN;
	#endif
	vWdPos = ( modelMatrix * wdW ).xyz;
	vWdNormal = normalize( mat3( modelMatrix ) * wdN );
	vWdLit = wdLit * wdLit * ${LIT_MAX.toFixed(1)};
}`;
// Baked light channels: candles and organ pipes.
const LIT_PARS = `
uniform vec3 uWdLamp;
uniform vec3 uWdOrgan;`;
const LIT = `
	totalEmissiveRadiance += diffuseColor.rgb * ( vWdLit.x * uWdLamp + vWdLit.y * uWdOrgan ) * RECIPROCAL_PI;
`;

function extendMaterial(material, key, uniforms, frag) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 wdLit;' + WORLD_VARYING)
      .replace('#include <project_vertex>', WORLD_VERTEX);
    let f = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>' + WORLD_VARYING + LIT_PARS + (frag.pars || ''),
    );
    for (const chunk in frag.replace || {}) f = f.replace(`#include <${chunk}>`, frag.replace[chunk]);
    if (frag.afterMap) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + frag.afterMap);
    if (frag.afterRoughness)
      f = f
        .replace('// wd:roughness', frag.afterRoughness)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + frag.afterRoughness);
    if (frag.afterMetalness)
      f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + frag.afterMetalness);
    f = f.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n' + (frag.afterEmissive || '') + LIT,
    );
    shader.fragmentShader = f;
  };
  material.customProgramCacheKey = () => 'foundry-' + key;
  return material;
}

const TRI_PARS = `
uniform vec2 uWdTri;
vec3 wdTriW;
vec3 wdTriP;
`;
const TRI = {
  map_fragment: `
	wdTriP = vWdPos * uWdTri.x;
	wdTriW = pow( abs( normalize( vWdNormal ) ), vec3( 4.0 ) );
	wdTriW /= wdTriW.x + wdTriW.y + wdTriW.z;
	#ifdef USE_MAP
		diffuseColor *= texture2D( map, wdTriP.zy ) * wdTriW.x + texture2D( map, wdTriP.xz ) * wdTriW.y + texture2D( map, wdTriP.xy ) * wdTriW.z;
	#endif
`,
  roughnessmap_fragment: `
	float roughnessFactor = roughness;
	#ifdef USE_ROUGHNESSMAP
		roughnessFactor *= texture2D( roughnessMap, wdTriP.zy ).g * wdTriW.x + texture2D( roughnessMap, wdTriP.xz ).g * wdTriW.y + texture2D( roughnessMap, wdTriP.xy ).g * wdTriW.z;
	#endif
	// wd:roughness
`,
  normal_fragment_maps: `
	#ifdef USE_NORMALMAP
	{
		vec3 wdWn = normalize( vWdNormal ) * faceDirection;
		vec3 wdTx = texture2D( normalMap, wdTriP.zy ).xyz * 2.0 - 1.0;
		vec3 wdTy = texture2D( normalMap, wdTriP.xz ).xyz * 2.0 - 1.0;
		vec3 wdTz = texture2D( normalMap, wdTriP.xy ).xyz * 2.0 - 1.0;
		wdTx = vec3( wdTx.xy * uWdTri.y + wdWn.zy, abs( wdTx.z ) * wdWn.x );
		wdTy = vec3( wdTy.xy * uWdTri.y + wdWn.xz, abs( wdTy.z ) * wdWn.y );
		wdTz = vec3( wdTz.xy * uWdTri.y + wdWn.xy, abs( wdTz.z ) * wdWn.z );
		vec3 wdNw = normalize( wdTx.zyx * wdTriW.x + wdTy.xzy * wdTriW.y + wdTz.xyz * wdTriW.z );
		normal = normalize( ( viewMatrix * vec4( wdNw, 0.0 ) ).xyz );
	}
	#endif
`,
};

const WET_PARS = `
uniform vec4 uWdWet;      // water level, damp height, darkening, wet roughness
uniform vec2 uWdCloud;
uniform sampler2D tWdNoise;
vec4 wdNoise4( vec3 x ) { return texture2D( tWdNoise, ( x.xz + x.y * vec2( 0.37, 0.61 ) ) * 0.125 ); }
float wdNoise( vec3 x ) { return wdNoise4( x ).r; }
`;
const WET_ROUGH = `
{
	vec4 wdC4 = wdNoise4( vWdPos * uWdCloud.y );
	float wdC = clamp( 0.5 + ( wdC4.r * 0.65 + wdC4.a * 0.35 - 0.5 ) * 1.5, 0.0, 1.0 );
	diffuseColor.rgb *= 1.0 + ( wdC - 0.5 ) * uWdCloud.x;
	roughnessFactor = clamp( roughnessFactor + ( wdC - 0.5 ) * 0.12, 0.05, 1.0 );
	float wdH = vWdPos.y - uWdWet.x;
	float wdN = clamp( ( wdNoise4( vWdPos * vec3( 2.1, 0.7, 2.1 ) ).g - 0.5 ) * 1.5, - 0.5, 0.5 );
	float wdBand = 1.0 - smoothstep( 0.05, 0.42, wdH + wdN * 0.3 );
	float wdDamp = 1.0 - smoothstep( 0.2, uWdWet.y, wdH + wdN * 1.5 + ( wdC - 0.5 ) * 1.2 );
	float wdWet = clamp( max( wdBand, wdDamp * 0.4 ), 0.0, 1.0 );
	diffuseColor.rgb *= mix( 1.0, uWdWet.z, wdWet );
	roughnessFactor = mix( roughnessFactor, uWdWet.w, wdWet * wdWet );
}`;

export function makeMaterials(ctx) {
  const A = ctx.assets,
    list = [],
    owned = [];
  let noise = ctx.gfx && ctx.gfx.materials && ctx.gfx.materials.noise;
  if (!noise) {
    noise = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1);
    noise.needsUpdate = true;
    owned.push(noise);
  }
  const lit = {
    uWdLamp: { value: new THREE.Color(0, 0, 0) },
    uWdOrgan: { value: new THREE.Color(0, 0, 0) },
    tWdNoise: { value: noise },
  };
  const extend = (material, key, uniforms, frag) => extendMaterial(material, key, { ...uniforms, ...lit }, frag);
  const tex = (name, tile) => {
    if (!A.has(name)) return null;
    const t = A.texture(name).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (tile) t.repeat.set(1 / tile, 1 / tile);
    t.needsUpdate = true;
    owned.push(t);
    return t;
  };
  const keep = (m) => {
    list.push(m);
    return m;
  };

  const stone = (
    name,
    {
      tile = 4,
      color = 0xffffff,
      roughness = 0.9,
      normal = 1,
      wet = [2.4, 0.6, 0.22],
      ao = 0.7,
      triplanar = false,
      cloud = [0.34, 0.21],
    } = {},
  ) => {
    const map = tex(`arena.${name}`, tile),
      n = tex(`arena.${name}_n`, tile),
      orm = tex(`arena.${name}_orm`, tile);
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: orm ? 1 : roughness,
      metalness: 0,
      vertexColors: true,
      map,
      normalMap: n,
      roughnessMap: orm,
      aoMap: triplanar ? null : orm,
      aoMapIntensity: ao,
    });
    if (n) m.normalScale.set(normal, normal);
    m.name = 'arena.' + name;
    const uniforms = {
      uWdWet: { value: new THREE.Vector4(WATER_Y, wet[0], wet[1], wet[2]) },
      uWdCloud: { value: new THREE.Vector2(cloud[0], cloud[1]) },
    };
    const kind = name === 'flag' ? 'pave' : 'stone';
    if (!triplanar)
      return keep(
        extend(
          m,
          kind === 'pave' ? 'stone-pave-fd' : 'stone-fd',
          uniforms,
          withFoundry(kind, { pars: WET_PARS, afterRoughness: WET_ROUGH }, uniforms),
        ),
      );
    uniforms.uWdTri = { value: new THREE.Vector2(1 / tile, normal) };
    m.defines = { ...(m.defines || {}), WD_TRIPLANAR: '' };
    return keep(
      extend(
        m,
        'stone-tri-fd',
        uniforms,
        withFoundry('stone', { pars: WET_PARS + TRI_PARS, replace: TRI, afterRoughness: WET_ROUGH }, uniforms),
      ),
    );
  };

  const out = {};
  out.ashlar = stone('ashlar', { tile: 4, color: 0xe6e4df, normal: 0.8 });
  out.plain = stone('plain', { tile: 2, color: 0xeeebe5 });
  out.pave = stone('flag', { tile: 4, color: 0xd4d6dc, roughness: 0.7, wet: [1.0, 0.6, 0.2] });
  out.pave.name = 'arena.pave';
  out.marble = stone('plain', {
    tile: 1.6,
    color: 0xf4f1ea,
    roughness: 0.7,
    normal: 0.8,
    wet: [1.6, 0.62, 0.25],
    triplanar: true,
  });
  out.marble.name = 'arena.marble';

  {
    const map = tex('arena.flag', 4),
      n = tex('arena.flag_n', 4),
      orm = tex('arena.flag_orm', 4),
      inlay = A.has('arena.inlay') ? A.texture('arena.inlay') : null;
    const m = new THREE.MeshStandardMaterial({
      color: 0xb9bcc4,
      roughness: orm ? 1 : 0.55,
      metalness: 0,
      vertexColors: true,
      map,
      normalMap: n,
      roughnessMap: orm,
    });
    m.name = 'arena.floor';
    if (inlay) {
      inlay.wrapS = inlay.wrapT = THREE.ClampToEdgeWrapping;
    }
    out.floor = keep(
      extend(
        m,
        'floor' + (inlay ? '-inlay' : ''),
        {
          uWdInlay: { value: inlay },
          uWdInlayAt: { value: new THREE.Vector4(0, 1.5, 8.2, 0.9) },
          uWdInlayGain: { value: 2.1 },
        },
        {
          pars: `
uniform sampler2D uWdInlay;
uniform vec4 uWdInlayAt;
uniform float uWdInlayGain;
`,
          afterMap: inlay
            ? `
{
	vec2 wdP = ( vWdPos.xz - uWdInlayAt.xy ) / uWdInlayAt.z;
	float wdR = length( wdP );
	vec4 wdI = texture2D( uWdInlay, wdP * 0.5 + 0.5 );
	float wdM = ( 1.0 - smoothstep( 0.93, 1.0, wdR ) ) * uWdInlayAt.w;
	float wdPale = smoothstep( 0.055, 0.125, dot( wdI.rgb, vec3( 0.3333 ) ) );
	vec3 wdInlay = mix( wdI.rgb * 1.3, vec3( 1.0, 0.93, 0.8 ) * uWdInlayGain, wdPale );
	diffuseColor.rgb = mix( diffuseColor.rgb, wdInlay * vColor.rgb, wdM );
}`
            : '',
          afterRoughness: `
	roughnessFactor *= 0.62;
`,
        },
      ),
    );
  }

  {
    const map = tex('arena.oak', 2),
      n = tex('arena.oak_n', 2),
      orm = tex('arena.oak_orm', 2);
    const m = new THREE.MeshStandardMaterial({
      color: map ? 0xd9d6cc : 0x4a382a,
      roughness: orm ? 1 : 0.62,
      metalness: 0,
      vertexColors: true,
      map,
      normalMap: n,
      roughnessMap: orm,
    });
    m.name = 'arena.wood';
    const woodU = {
      uWdWet: { value: new THREE.Vector4(WATER_Y, 1.2, 0.6, 0.3) },
      uWdCloud: { value: new THREE.Vector2(0.3, 0.5) },
      uWdGilt: { value: new THREE.Color(0.86, 0.62, 0.3) },
    };
    out.wood = keep(
      extend(
        m,
        'wood-fd',
        woodU,
        withFoundry(
          'wood',
          {
            pars:
              WET_PARS +
              `
uniform vec3 uWdGilt;
float wdGilt;
`,
            afterMap: `
	wdGilt = 0.0;
	#ifdef USE_COLOR_ALPHA
		wdGilt = vColor.a;
	#endif
	{
		float wdWear = wdNoise( vWdPos * 9.0 ) * 0.6 + wdNoise( vWdPos * 31.0 ) * 0.4;
		wdGilt *= smoothstep( 0.18, 0.5, wdWear + wdGilt * 0.35 );
		diffuseColor.rgb = mix( diffuseColor.rgb, uWdGilt * ( 0.75 + 0.5 * wdWear ) * vColor.rgb, wdGilt );
	}
`,
            afterRoughness:
              WET_ROUGH +
              `
	roughnessFactor = mix( roughnessFactor, 0.36, wdGilt );
`,
            afterMetalness: `
	metalnessFactor = mix( metalnessFactor, 1.0, wdGilt );
`,
          },
          woodU,
        ),
      ),
    );
  }

  const pipe = (name, color, roughness, glow, env = 1) => {
    const streak = tex('arena.streak', 0);
    if (streak) streak.repeat.set(1 / 0.5, 1 / 3);
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 1,
      vertexColors: true,
      roughnessMap: streak,
      emissive: glow,
      emissiveIntensity: 0,
      envMapIntensity: env,
    });
    m.name = 'arena.' + name;
    return keep(
      extend(
        m,
        'pipe',
        {},
        {
          afterEmissive: `
	#ifdef USE_COLOR_ALPHA
		totalEmissiveRadiance *= vColor.a;
	#endif
`,
        },
      ),
    );
  };
  out.gold = pipe('gold', 0xf0d49a, 0.3, 0xffb450, 2.2);
  out.tin = pipe('tin', 0xc3cad2, 0.36, 0xffc070, 1.8);

  out.iron = keep(
    new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.62, metalness: 0.85, vertexColors: true }),
  );
  out.iron.name = 'arena.iron';
  const ironU = {};
  extend(out.iron, 'iron-fd', ironU, withFoundry('iron', { pars: WET_PARS }, ironU));
  out.brass = keep(
    new THREE.MeshStandardMaterial({ color: 0x8a6a34, roughness: 0.45, metalness: 1, vertexColors: true }),
  );
  out.brass.name = 'arena.brass';
  out.sea = keep(new THREE.MeshStandardMaterial({ color: 0x04070c, roughness: 0.16, metalness: 0 }));
  out.sea.name = 'arena.sea';
  out.blocker = keep(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  out.blocker.name = 'arena.blocker';
  out.foliage = keep(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
  );
  out.foliage.name = 'arena.foliage';
  out.glass = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0x1a2740,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      vertexColors: false,
    }),
  );
  out.glass.name = 'arena.glass';
  out.mist = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  out.mist.color.setRGB(0.062, 0.098, 0.168);
  out.mist.name = 'arena.mist';
  out.void = keep(new THREE.MeshBasicMaterial({ color: 0x020409 }));
  out.void.name = 'arena.void';
  out.all = list;
  out.textures = owned;
  out.lit = lit;
  return out;
}
