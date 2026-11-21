// The pilgrim's tints and colours in the foundry (FOUNDRY_LOOK.figures.player).

function materialLookup(root) {
  const out = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.name) out.set(m.name, m);
  });
  return (prefix) => {
    for (const [n, m] of out) if (n === prefix || n.startsWith(prefix)) return m;
    return null;
  };
}

export class Figures {
  constructor(ctx, look) {
    this.ctx = ctx;
    this.look = look;
    const P = ctx.player;
    if (P) this.dress(P.root, look.player, 'player', !!(P.char && P.char.retarget));
  }

  dress(root, L, who, alt) {
    const get = materialLookup(root);
    for (const name in L.tint || {}) {
      const m = get(name);
      if (!m) {
        if (!alt) console.warn(`look: figures: ${who} has no material "${name}"`);
        continue;
      }
      const [r, g, b] = L.tint[name];
      m.color.r *= r;
      m.color.g *= g;
      m.color.b *= b;
    }
    for (const name in L.emissive || {}) {
      const m = get(name);
      if (!m || !m.emissive) {
        if (!alt) console.warn(`look: figures: ${who} has no material "${name}"`);
        continue;
      }
      m.emissive.setRGB(...L.emissive[name]);
    }
    for (const name in L.colour || {}) {
      const m = get(name);
      if (!m) {
        if (!alt) console.warn(`look: figures: ${who} has no material "${name}"`);
        continue;
      }
      m.color.setRGB(...L.colour[name]);
    }
  }

  update() {}
}
