import * as THREE from 'three';
import { Character } from '../characters/character.js';
import * as clipData from '../characters/clip-data.js';
import * as motionData from '../characters/motion-data.js';
import { chosenFigure } from '../characters/roster.js';

const GHOST = `
	{
		vec3 gV = normalize( vViewPosition );
		float gF = pow( 1.0 - clamp( abs( dot( gV, normal ) ), 0.0, 1.0 ), uGhost.w );
		totalEmissiveRadiance += uGhost.rgb * gF * ( 0.75 + 0.25 * sin( uGhostTime * 1.3 + vViewPosition.y * 2.0 ) );
	}
`;

export class Ghosts {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.list = [];
    this.t = 0;
    const u = (this.uniforms = {
      uGhost: { value: new THREE.Vector4(...look.edge, look.edgePower) },
      uGhostTime: { value: 0 },
    });
    const mat = (this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...look.body),
      roughness: 0.55,
      metalness: 0.4,
    }));
    mat.name = 'look.ghost';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uGhost;\nuniform float uGhostTime;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GHOST);
    };
    mat.customProgramCacheKey = () => 'look-ghost';
    this.group = new THREE.Group();
    this.group.name = 'look:ghosts';
    // the ghosts wear the chosen pilgrim's figure (loaded with the player), on the pilgrim's clips
    const data = { ...clipData.pilgrim, ...motionData.pilgrim },
      model = chosenFigure('player').asset;
    look.list.forEach((g, i) => {
      const c = new Character(ctx, { name: 'pilgrim', model, ref: 'pilgrim.clips', clips: 'pilgrim.clips', data });
      c.model.traverse((n) => {
        if (n.isMesh) {
          n.material = mat;
          n.castShadow = false;
          n.receiveShadow = true;
        }
      });
      const ground = ctx.arena && ctx.arena.ground ? ctx.arena.ground(g.x, g.z) : 0;
      c.root.position.set(g.x, ground, g.z);
      const lx = g.look ? g.look[0] : 0,
        lz = g.look ? g.look[1] : -4;
      c.root.rotation.y = Math.atan2(lx - g.x, lz - g.z);
      c.root.scale.setScalar(g.s || 1);
      c.play(g.clip, { fade: 0 });
      c.update((i * 1.37) % 4);
      this.group.add(c.root);
      this.list.push(c);
    });
    ctx.scene.add(this.group);
  }

  update(dt) {
    this.t += dt;
    this.uniforms.uGhostTime.value = this.t;
    for (const c of this.list) c.update(dt);
  }
}
