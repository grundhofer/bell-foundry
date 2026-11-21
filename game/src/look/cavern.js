import * as THREE from 'three';

const ROCK_PARS = `
uniform float uCavTime;
uniform vec3 uCavVein;
uniform vec4 uCavK;
varying vec3 vCavPos;
float cvH( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float cvN( vec3 p ) {
	vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( cvH( i ), cvH( i + vec3( 1, 0, 0 ) ), f.x ), mix( cvH( i + vec3( 0, 1, 0 ) ), cvH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( cvH( i + vec3( 0, 0, 1 ) ), cvH( i + vec3( 1, 0, 1 ) ), f.x ), mix( cvH( i + vec3( 0, 1, 1 ) ), cvH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;
const ROCK_COLOUR = `
	{
		float v = cvN( vCavPos * 0.08 ) * 0.6 + cvN( vCavPos * 0.31 ) * 0.4;
		diffuseColor.rgb *= 1.0 + ( v - 0.5 ) * uCavK.w;
	}
`;
const ROCK_GLOW = `
	{
		vec3 p = vCavPos * uCavK.x;
		float n = cvN( p ) * 0.7 + cvN( p * 2.7 + 3.0 ) * 0.3;
		float r = abs( n - 0.5 );
		float line = 1.0 - smoothstep( 0.0, fwidth( r ) + 0.025, r );
		float where = smoothstep( 1.0 - uCavK.y, 1.0 - uCavK.y + 0.2, cvN( p * 0.23 + 7.0 ) );
		float breathe = 0.65 + 0.35 * sin( uCavTime * 0.7 + n * 9.0 );
		totalEmissiveRadiance += uCavVein * line * where * breathe * uCavK.z;
	}
`;

export class Cavern {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.t = 0;
    const C = look;
    this.group = new THREE.Group();
    this.group.name = 'look:cavern';
    const R = C.radius,
      geo = new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, 0, C.reach);
    const p = geo.attributes.position,
      h = (x, y, z) =>
        Math.sin(x * 0.11) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.23) * 0.5 + Math.sin(y * 0.3 + x * 0.05) * 0.4;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        k = 1 - (C.rough * (0.5 + 0.5 * h(x, y, z))) / R;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    const u = (this.uniforms = {
      uCavTime: { value: 0 },
      uCavVein: { value: new THREE.Color(...C.vein) },
      uCavK: { value: new THREE.Vector4(C.veinSize, C.veinShare, C.veinStrength, 0.7) },
    });
    const rock = (this.rock = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...C.rock),
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
      fog: !C.clearAir,
    }));
    rock.name = 'look.cavern.rock';
    rock.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCavPos;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n\tvCavPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + ROCK_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + ROCK_COLOUR)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + ROCK_GLOW);
    };
    rock.customProgramCacheKey = () => 'look-cavern-rock';
    const dome = new THREE.Mesh(geo, rock);
    dome.name = 'look:cavern-dome';
    dome.position.set(0, C.centreY, 0);
    dome.castShadow = false;
    dome.receiveShadow = false;
    dome.frustumCulled = false;
    this.group.add(dome);
    const heart = new THREE.Mesh(
      new THREE.CircleGeometry(C.heart[3], 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(...C.heartColour).multiplyScalar(C.heartStrength),
        fog: false,
        toneMapped: true,
      }),
    );
    heart.material.name = 'look.cavern.heart';
    heart.name = 'look:cavern-heart';
    heart.position.set(C.heart[0], C.heart[1], C.heart[2]);
    this.group.add(heart);
    ctx.scene.add(this.group);
    const cn = ctx.candles;
    if (C.embers && cn) {
      if (cn.bowlMat) cn.bowlMat.color.setRGB(...C.embers.dish);
      const us = cn.uniforms && cn.uniforms.uSize;
      if (us) {
        us.value.x *= C.embers.flame[0];
        us.value.y *= C.embers.flame[1];
      }
    }
    const wu = ctx.water && ctx.water.uniforms;
    if (C.waterDeep && wu && wu.uDeep) wu.uDeep.value.setRGB(...C.waterDeep);
    this.ash = C.ash ? new Ash(ctx, C.ash) : null;
    if (this.ash) this.group.add(this.ash.points);
  }

  update(dt) {
    this.t += dt;
    this.uniforms.uCavTime.value = this.t;
    if (this.ash) this.ash.update(dt);
  }
}

const ASH_VERT = `
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uSize;
attribute vec4 aSeed;
varying float vA;
varying float vHot;
void main() {
	vec3 p = position;
	p.y -= uTime * ( 0.25 + 0.35 * aSeed.x );
	p.x += sin( uTime * ( 0.3 + aSeed.y ) + aSeed.z * 6.28 ) * 0.6 + uTime * 0.12;
	p.z += cos( uTime * ( 0.25 + aSeed.x ) + aSeed.w * 6.28 ) * 0.5;
	p = mod( p - uCam + uBox * 0.5, uBox ) + uCam - uBox * 0.5;
	p.y = max( p.y, 0.1 );
	vec4 mv = viewMatrix * vec4( p, 1.0 );
	gl_Position = projectionMatrix * mv;
	float d = -mv.z;
	gl_PointSize = uSize * ( 0.5 + aSeed.y ) * 300.0 / max( d, 0.5 );
	vA = smoothstep( 0.4, 2.0, d ) * ( 1.0 - smoothstep( uBox.z * 0.35, uBox.z * 0.5, d ) );
	vHot = step( 0.93, aSeed.w );
}
`;
const ASH_FRAG = `
uniform vec3 uAsh;
uniform vec3 uHot;
varying float vA;
varying float vHot;
void main() {
	vec2 q = gl_PointCoord - 0.5;
	float r = length( q );
	float a = ( 1.0 - smoothstep( 0.25, 0.5, r ) ) * vA;
	if ( a < 0.01 ) discard;
	vec3 c = mix( uAsh, uHot, vHot );
	gl_FragColor = vec4( c * a, a * ( 1.0 - vHot * 0.5 ) );
}
`;
class Ash {
  constructor(ctx, A) {
    this.ctx = ctx;
    this.t = 0;
    const n = A.count,
      box = new THREE.Vector3(...A.box),
      pos = new Float32Array(n * 3),
      seed = new Float32Array(n * 4);
    let s = 1234567;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * box.x;
      pos[i * 3 + 1] = r() * box.y;
      pos[i * 3 + 2] = (r() - 0.5) * box.z;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.u = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: box },
      uSize: { value: A.size },
      uAsh: { value: new THREE.Color(...A.colour) },
      uHot: { value: new THREE.Color(...A.hot) },
    };
    const m = new THREE.ShaderMaterial({
      name: 'look.ash',
      uniforms: this.u,
      vertexShader: ASH_VERT,
      fragmentShader: ASH_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, m);
    this.points.name = 'look:ash';
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.layers.set(2);
  }
  update(dt) {
    this.t += dt;
    this.u.uTime.value = this.t;
    const cam = this.ctx.camera;
    if (cam) this.u.uCam.value.copy(cam.position);
  }
}
