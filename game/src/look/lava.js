import * as THREE from 'three';
import { LavaSim } from './lava-simulation.js';
import { WATER_Y } from '../core/constants.js';
import { FOUNDRY } from '../graphics/shaders/foundry.js';
import { mulberry32 } from '../core/math.js';

const VERT_PARS = `
uniform sampler2D tLava;
uniform sampler2D tLavaBed;
uniform vec4 uLavaGrid;
uniform vec3 uLavaTexel;
varying vec4 vLava;
varying vec3 vLavaPos;
float lavaH( vec2 uv, out vec4 s ) {
	s = texture2D( tLava, uv );
	float bed = texture2D( tLavaBed, uv ).r;
	float lift = bed < ${(WATER_Y - 0.01).toFixed(3)} ? ${(WATER_Y + 0.012).toFixed(3)} * smoothstep( 0.0, 0.012, s.r ) : 0.004;
	return s.r > 0.0015 ? bed + s.r + lift : bed - 0.15;
}
`;
const VERT_BEGIN = `
	vec2 lUv = vec2( ( position.x - uLavaGrid.x ) * uLavaGrid.z, ( position.z - uLavaGrid.y ) * uLavaGrid.w );
	vec4 lS, lN;
	float lH = lavaH( lUv, lS );
	float hx = lavaH( lUv + vec2( uLavaTexel.x, 0.0 ), lN ) - lavaH( lUv - vec2( uLavaTexel.x, 0.0 ), lN );
	float hz = lavaH( lUv + vec2( 0.0, uLavaTexel.y ), lN ) - lavaH( lUv - vec2( 0.0, uLavaTexel.y ), lN );
	vLava = lS;
	vec3 objectNormal = normalize( vec3( - clamp( hx, -0.5, 0.5 ), 2.0 * uLavaTexel.z, - clamp( hz, -0.5, 0.5 ) ) );
	#ifdef USE_TANGENT
		vec3 objectTangent = vec3( 1.0, 0.0, 0.0 );
	#endif
`;
const VERT_POS = `
	vec3 transformed = vec3( position.x, lH, position.z );
	vLavaPos = transformed;
`;

const FRAG_PARS = `
uniform float uLavaTime;
uniform vec3 uLavaGlow;
uniform float uLavaCrust;
varying vec4 vLava;
varying vec3 vLavaPos;
float lHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float lNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( lHash( i ), lHash( i + vec2( 1, 0 ) ), f.x ), mix( lHash( i + vec2( 0, 1 ) ), lHash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float lCracks( vec2 p ) {
	float n = lNoise( p ) * 0.65 + lNoise( p * 2.3 + 7.1 ) * 0.35;
	float r = abs( n - 0.5 );
	float w = fwidth( r ) + 0.02;
	return 1.0 - smoothstep( 0.0, w + 0.025, r );
}
float lFlowing( vec2 p, vec2 v, float scale ) {
	float t = uLavaTime * 0.35, a = fract( t ), b = fract( t + 0.5 );
	float ca = lCracks( ( p - v * a * 1.6 ) * scale ), cb = lCracks( ( p - v * b * 1.6 ) * scale + 3.7 );
	float wa = 1.0 - abs( 2.0 * a - 1.0 );
	return mix( cb, ca, wa );
}
vec3 lBlackbody( float t ) {
	vec3 c = mix( vec3( 0.45, 0.012, 0.0 ), vec3( 1.0, 0.16, 0.01 ), smoothstep( 0.15, 0.6, t ) );
	return mix( c, vec3( 1.0, 0.42, 0.08 ), smoothstep( 0.7, 1.0, t ) );
}
float lMolten, lEdge;
`;
const FRAG_COLOR = `
	lMolten = smoothstep( 0.82, 0.97, vLava.g );
	float lFront = vLava.r + ( lNoise( vLavaPos.xz * 2.7 ) - 0.5 ) * 0.012 + ( lNoise( vLavaPos.xz * 9.0 ) - 0.5 ) * 0.004;
	if ( lFront < 0.004 ) discard;
	lEdge = smoothstep( 0.004, 0.02, lFront );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.02, 0.012, 0.008 ), lMolten );
`;
const FRAG_ROUGH = `
	roughnessFactor = mix( roughnessFactor, 0.3, lMolten );
`;
const FRAG_EMISSIVE = `
	{
		vec2 v = clamp( vLava.ba, vec2( -1.5 ), vec2( 1.5 ) );
		float plates = lFlowing( vLavaPos.xz, v, 1.1 );
		float fine = lFlowing( vLavaPos.xz * 1.9 + 11.0, v, 2.4 );
		float streak = lFlowing( vLavaPos.xz, v, 3.2 );
		float t = vLava.g;
		float open = smoothstep( uLavaCrust, 0.6, t );
		float crustGlow = ( plates + fine * 0.45 * smoothstep( 0.4, 0.8, t ) ) * open * uLavaGlow.y + 0.02 * open;
		float moltenGlow = ( 0.3 + uLavaGlow.z * streak ) * lMolten;
		float k = uLavaGlow.x * t * t * lEdge;
		totalEmissiveRadiance += k * ( lBlackbody( t ) * moltenGlow + lBlackbody( t * 0.85 ) * crustGlow * ( 1.0 - lMolten ) );
	}
`;

export class Lava {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.t = 0;
    this.burnT = 0;
    this.steamT = 0;
    this.burned = 0;
    this.rand = mulberry32(77);
    this.mode = 'normal';
    this.off = false;
    this.scale = 1;
    const arena = ctx.arena,
      g = look.grid,
      cell = g.cell;
    const nx = Math.round((g.x1 - g.x0) / cell),
      nz = Math.round((g.z1 - g.z0) / cell);
    const cols = arena.colliders || [];
    const bed = (x, z) => {
      let h = arena.ground ? arena.ground(x, z) : 0;
      for (const c of cols) {
        const dx = x - c.x,
          dz = z - c.z;
        if (dx * dx + dz * dz < c.r * c.r) h = Math.max(h, c.h || 2);
      }
      return h;
    };
    const sim = (this.sim = new LavaSim({ x0: g.x0, z0: g.z0, nx, nz, cell, bed, ...(look.sim || {}) }));
    for (const s of look.springs || []) sim.pour(s.x, s.z, s.r, s.rate);

    this.data = new Float32Array(nx * nz * 4);
    const tex = (this.tex = new THREE.DataTexture(this.data, nx, nz, THREE.RGBAFormat, THREE.FloatType));
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const bedTex = new THREE.DataTexture(sim.bed, nx, nz, THREE.RedFormat, THREE.FloatType);
    bedTex.minFilter = bedTex.magFilter = THREE.NearestFilter;
    bedTex.needsUpdate = true;

    const GS = 4,
      gw = Math.ceil(nx / GS),
      gh = Math.ceil(nz / GS);
    this.glow = {
      GS,
      gw,
      gh,
      sum: new Float32Array(gw * gh),
      tmp: new Float32Array(gw * gh),
      bytes: new Uint8Array(gw * gh),
      every: 0,
    };
    const glowTex = (this.glowTex = new THREE.DataTexture(
      this.glow.bytes,
      gw,
      gh,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    ));
    glowTex.minFilter = glowTex.magFilter = THREE.LinearFilter;
    glowTex.needsUpdate = true;
    const fu = FOUNDRY.uniforms;
    if (fu.tFdLava) {
      fu.tFdLava.value = glowTex;
      fu.uFdLavaGrid.value.set(g.x0, g.z0, 1 / (gw * GS * cell), 1 / (gh * GS * cell));
      fu.uFdLavaLight.value.setRGB(...look.light.map((v) => v * look.lightStrength));
    }

    const geo = new THREE.PlaneGeometry((nx - 1) * cell, (nz - 1) * cell, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((g.x0 + g.x1) / 2, 0, (g.z0 + g.z1) / 2);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(g.x0, -0.2, g.z0), new THREE.Vector3(g.x1, 3, g.z1));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());

    const u = (this.uniforms = {
      tLava: { value: tex },
      tLavaBed: { value: bedTex },
      uLavaGrid: { value: new THREE.Vector4(g.x0, g.z0, 1 / (nx * cell), 1 / (nz * cell)) },
      uLavaTexel: { value: new THREE.Vector3(1 / nx, 1 / nz, cell) },
      uLavaTime: { value: 0 },
      uLavaGlow: { value: new THREE.Vector3(...look.glow) },
      uLavaCrust: { value: sim.crust },
    });
    const mat = (this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...look.crust),
      roughness: 0.85,
      metalness: 0,
    }));
    mat.name = 'look.lava';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <beginnormal_vertex>', VERT_BEGIN)
        .replace('#include <begin_vertex>', VERT_POS);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
    };
    mat.customProgramCacheKey = () => 'look-lava';
    const mesh = (this.mesh = new THREE.Mesh(geo, mat));
    mesh.name = 'look:lava';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = -50;
    this.group = new THREE.Group();
    this.group.name = 'look:lava';
    this.group.add(mesh);
    ctx.scene.add(this.group);
    this.upload();

    this.offs = [ctx.bus.on('boss-slam', (e) => this.slam(e))];
    this.offs.push(
      ctx.bus.on('fight-reset', () => {
        this.sim.clear();
        this.upload();
      }),
    );
    if (ctx.dev && typeof window !== 'undefined') window.__lava = this;
    this.haze();
  }

  haze() {
    const H = this.look.haze,
      chain = this.ctx.gfx && this.ctx.gfx.chain,
      m = chain && chain.m && chain.m.composite;
    if (!H || !m) {
      if (H) console.warn('look: lava: no post chain, no heat shimmer');
      return;
    }
    const LINE = 'vec3 c = texture( tScene, vUv ).rgb;';
    if (!m.fragmentShader.includes(LINE)) {
      console.warn('look: lava: the composite has changed, no heat shimmer');
      return;
    }
    const g = this.glow,
      cell = this.sim.cell || this.look.grid.cell,
      gr = this.look.grid;
    Object.assign(m.uniforms, {
      tHeat: { value: this.glowTex },
      uHeatGrid: { value: new THREE.Vector4(gr.x0, gr.z0, 1 / (g.gw * g.GS * cell), 1 / (g.gh * g.GS * cell)) },
      uHeat: { value: new THREE.Vector4(H.strength, H.height, 0, 0) },
    });
    this.hazeU = m.uniforms.uHeat.value;
    m.fragmentShader = m.fragmentShader
      .replace(
        'void main() {\n\tvec3 c = texture( tScene, vUv )',
        'uniform sampler2D tHeat;\nuniform vec4 uHeatGrid;\nuniform vec4 uHeat;\nvoid main() {\n\tvec3 c = texture( tScene, vUv )',
      )
      .replace(
        LINE,
        `vec2 suv = vUv;
	if ( uHeat.w > 0.5 ) {
		float hd = textureLod( tDepth, vUv, 0.0 ).r;
		if ( hd < 0.99999 ) {
			float hz = bfZ( hd );
			vec3 hw = ( uCamWorld * vec4( bfViewPos( vUv, hz ), 1.0 ) ).xyz;
			vec2 hg = ( hw.xz - uHeatGrid.xy ) * uHeatGrid.zw;
			float inside = step( 0.0, hg.x ) * step( hg.x, 1.0 ) * step( 0.0, hg.y ) * step( hg.y, 1.0 );
			float k = texture( tHeat, hg ).r * inside * ( 1.0 - smoothstep( 0.0, uHeat.y, hw.y ) ) / ( 1.0 + hz * 0.06 );
			float t = uHeat.z;
			vec2 wob = vec2( sin( vUv.y * 160.0 + t * 6.1 + sin( vUv.x * 55.0 + t * 1.7 ) * 2.0 ), cos( vUv.x * 120.0 - t * 4.7 + vUv.y * 30.0 ) );
			suv += wob * uHeat.x * k;
		}
	}
	vec3 c = texture( tScene, suv ).rgb;`,
      );
    m.needsUpdate = true;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.off = mode === 'off';
    this.scale = mode === 'soft' ? 0.5 : 1;
    if (this.off) {
      this.sim.clear();
      this.upload();
      this.light();
      this.mesh.visible = false;
      this.burnT = 0;
    }
  }

  slam(e) {
    const s = this.look.slam,
      game = this.ctx.game;
    if (this.off || !s || !e.pos || (game && game.state !== 'fight')) return;
    const phase = this.ctx.boss && this.ctx.boss.phase === 2 ? 1 : 0,
      vol = s.volume[phase] * Math.min(1.5, e.power === undefined ? 1 : e.power);
    if (vol <= 0) return;
    this.sim.pour(e.pos.x, e.pos.z, s.radius, vol / s.seconds, s.seconds);
    const vfx = this.ctx.vfx;
    if (vfx && vfx.embers) vfx.embers({ x: e.pos.x, y: WATER_Y + 0.2, z: e.pos.z }, 18);
  }

  upload() {
    const s = this.sim,
      D = this.data,
      n = s.nx * s.nz;
    for (let k = 0, o = 0; k < n; k++, o += 4) {
      D[o] = s.d[k];
      D[o + 1] = s.T[k];
      D[o + 2] = s.vx[k];
      D[o + 3] = s.vz[k];
    }
    this.tex.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    this.uniforms.uLavaTime.value = this.t;
    if (this.hazeU) {
      const set = this.ctx.ui && this.ctx.ui.settings;
      this.hazeU.z = this.t;
      this.hazeU.w = this.off || (set && set.reducedMotion) || !this.mesh.visible ? 0 : 1;
    }
    if (this.off) return;
    const s = this.sim,
      was = s.active;
    if (s.active || s.sources.length) {
      const sub = this.look.substeps || 2;
      for (let i = 0; i < sub; i++) s.step(dt / sub);
    }
    if (s.active || was) this.upload();
    this.mesh.visible = s.active || s.volume > 0;
    if ((s.active || was) && ++this.glow.every >= 4) {
      this.glow.every = 0;
      this.light();
    }
    if (!this.mesh.visible) return;
    this.burn(dt);
    this.burnBoss(dt);
    this.steam(dt);
  }

  light() {
    const s = this.sim,
      G = this.glow,
      { GS, gw, gh, sum, tmp, bytes } = G;
    sum.fill(0);
    for (let j = 0; j < s.nz; j++)
      for (let i = 0; i < s.nx; i++) {
        const k = j * s.nx + i;
        if (s.d[k] > 0.002) sum[((j / GS) | 0) * gw + ((i / GS) | 0)] += s.T[k] * s.T[k] * Math.min(1, s.d[k] / 0.06);
      }
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          let a = 0,
            n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx,
                yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) {
                a += sum[yy * gw + xx];
                n++;
              }
            }
          tmp[y * gw + x] = a / n;
        }
      sum.set(tmp);
    }
    const k = 255 / (GS * GS * 0.35);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.min(255, sum[i] * k);
    this.glowTex.needsUpdate = true;
  }

  burnBoss(dt) {
    const b = this.ctx.boss,
      game = this.ctx.game,
      dps = (this.look.bossDps || 0) * this.scale;
    if (!dps || !b || !b.alive || b.puppet || b.changing || !game || game.state !== 'fight') return;
    const here = this.sim.at(b.pos.x, b.pos.z);
    if (here.depth < 0.012 || here.temp < 0.3) return;
    const floor = b.phase === 2 ? 1 : b.hpMax * 0.5 + 1;
    if (b.hp > floor) {
      b.hp = Math.max(floor, b.hp - dps * here.temp * dt);
      this.bossBurned = (this.bossBurned || 0) + dps * here.temp * dt;
    }
  }

  burn(dt) {
    const c = this.ctx,
      p = c.player,
      game = c.game;
    if (!p || !p.alive || p.god || p.puppet || !game || game.state !== 'fight') {
      this.burnT = 0;
      return;
    }
    if (p.air > 0.15) return;
    const here = this.sim.at(p.pos.x, p.pos.z);
    if (here.depth < 0.012 || here.temp < 0.3) {
      this.burnT = Math.max(0, this.burnT - dt);
      return;
    }
    this.burnT += dt;
    const tick = 0.25;
    if (this.burnT < tick) return;
    this.burnT -= tick;
    const dmg = this.look.dps * this.scale * here.temp * tick;
    if (p.hp - dmg <= 0)
      c.combat.strike({
        attacker: null,
        target: p,
        damage: dmg + 1,
        heavy: true,
        unblockable: true,
        kind: 'lava',
        dir: new THREE.Vector3(0, 0, 1),
      });
    else p.hp -= dmg;
    this.burned += dmg;
    if (c.cam) c.cam.flash = Math.max(c.cam.flash || 0, 0.32);
    if (c.input && c.input.rumble) c.input.rumble(0.45, 0.35, 0.12);
    if (c.audio) c.audio.play('candle_hiss', { pos: p.pos, volume: 1.4, rate: 0.6 });
    if (c.vfx && c.vfx.embers) c.vfx.embers({ x: p.pos.x, y: p.pos.y + 0.2, z: p.pos.z }, 4);
    c.bus.emit('lava-burn', { damage: dmg });
  }

  steam(dt) {
    const vfx = this.ctx.vfx;
    if (!vfx) return;
    if ((this.steamT -= dt) > 0) return;
    this.steamT = 0.08;
    const s = this.sim,
      r = this.rand;
    for (let tries = 0; tries < 40; tries++) {
      const k = (r() * s.nx * s.nz) | 0;
      if (s.d[k] < 0.01 || s.T[k] < 0.4) continue;
      const i = k % s.nx,
        j = (k / s.nx) | 0,
        x = s.x0 + (i + 0.5) * s.cell,
        z = s.z0 + (j + 0.5) * s.cell;
      if (s.bed[k] < s.wetBelow && vfx.dust) vfx.dust({ x, y: WATER_Y + 0.12, z }, 1);
      else if (vfx.embers && r() < 0.5) vfx.embers({ x, y: s.bed[k] + s.d[k] + 0.05, z }, 1);
      break;
    }
  }
}
