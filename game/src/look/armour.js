import { buildGreatsword, buildSheath } from '../characters/greatsword.js';

// The pilgrim's great sword and sheath on his sword and scabbard frames, and the silver trail of his swing.
export class Armour {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    this.t = 0;
    if (ctx.player && look.player) this.dressPlayer(ctx.player, look.player);
  }

  dressPlayer(P, L) {
    const fade = P.kit && P.kit.fadeU;
    if (L.greatsword && P.kit && P.kit.sword) this.greatsword(P, L.greatsword, fade);
    // the hero's swing leaves a silver light trail (the automatic trail of graphics/effects/visual-effects.js, its look made brighter)
    if (L.trail && P.kit && P.kit.sword && this.ctx.vfx && this.ctx.vfx.trail)
      this.ctx.vfx.trail(P.kit.sword, Object.assign({ look: 'pilgrim', auto: true }, L.trail));
  }

  greatsword(P, G, fade) {
    const sw = P.kit.sword;
    const { group, blade, iron, hot, tipY } = buildGreatsword(G, fade);
    this.glowsP = [hot];
    if (sw.cut) for (const m of [blade, hot, iron]) if (m.userData.kitCut) m.userData.kitCut.value = sw.cut;
    sw.object.add(group);
    const sc = P.kit.scabbard;
    if (G.sheath && sc && sc.object) sc.object.add(buildSheath(G, iron, fade));
    sw.tip.position.set(0, tipY, 0);
    sw.length = sw.tip.position.y - sw.base.position.y;
    if (P.weapon) P.weapon.radius = G.hitRadius;
  }

  update(dt) {
    this.t += dt;
    if (this.glowsP)
      for (const m of this.glowsP)
        m.emissiveIntensity = this.look.player.greatsword.glowStrength * (0.75 + 0.25 * Math.sin(this.t * 2.3));
  }
}
