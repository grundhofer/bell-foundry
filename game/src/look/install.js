import { PALETTE } from '../graphics/environment.js';
import { LIGHT_COLORS } from '../graphics/lights.js';
import { GRADE } from '../graphics/post-processing.js';
import { Bells } from './bells.js';
import { Moulds } from './moulds.js';
import { Lava } from './lava.js';
import { Furnace } from './hall.js';
import { Ghosts } from './ghosts.js';
import { FoundryProps } from './props.js';
import { Figures } from './figures.js';
import { Recast } from './recast.js';
import { CHOSEN, entryOf } from '../characters/roster.js';
import { skinCss } from './skin.js';
import { Cavern } from './cavern.js';
import { Armour } from './armour.js';
import { FOUNDRY } from '../graphics/shaders/foundry.js';
import { Rupture } from './rupture.js';
import { FOUNDRY_LOOK } from '../config/foundry-look.js';

function setColours(table, values, where) {
  for (const k in values || {}) {
    if (!table[k]) {
      console.warn(`look: ${where} has no "${k}"`);
      continue;
    }
    table[k].setRGB(...values[k]);
  }
}
/**
 * First half of a look, before the game is built: the menus' skin, and the colour tables the
 * renderer reads (sky, lights, grade).
 */
export function applyEarly() {
  document.documentElement.dataset.look = FOUNDRY_LOOK.name;
  if (FOUNDRY_LOOK.skin) {
    const st = document.createElement('style');
    st.id = 'look-skin';
    st.textContent = skinCss(FOUNDRY_LOOK.name);
    document.head.appendChild(st);
  }
  setColours(PALETTE, FOUNDRY_LOOK.palette, 'PALETTE');
  setColours(LIGHT_COLORS, FOUNDRY_LOOK.lights, 'lights');
  setColours(GRADE, FOUNDRY_LOOK.grade, 'GRADE');
}

/**
 * Second half, once the game is loaded: tints post and materials, builds the look's own pieces (furnace, lava, bells,
 * ghosts …) and adds them to the fixed step right after the arena.
 * @param {import('../app/game.js').Game} game
 */
export async function install(game) {
  const ctx = game.ctx,
    post = ctx.gfx && ctx.gfx.chain;
  if (post && FOUNDRY_LOOK.post)
    for (const k in FOUNDRY_LOOK.post) {
      if (k in post.look) post.look[k] = FOUNDRY_LOOK.post[k];
      else console.warn(`look: post has no "${k}"`);
    }
  const mats = ctx.arena && ctx.arena.materials;
  if (mats && FOUNDRY_LOOK.materials)
    for (const k in FOUNDRY_LOOK.materials) {
      const m = mats[k];
      if (!m || !m.color) {
        console.warn(`look: no material "${k}"`);
        continue;
      }
      const [r, g, b] = FOUNDRY_LOOK.materials[k];
      m.color.r *= r;
      m.color.g *= g;
      m.color.b *= b;
    }
  const cu = ctx.candles && ctx.candles.uniforms;
  if (FOUNDRY_LOOK.smoke && cu && cu.uSmokeColor) cu.uSmokeColor.value.setRGB(...FOUNDRY_LOOK.smoke);
  document.documentElement.dataset.look = FOUNDRY_LOOK.name;
  if (!ctx.arena) return;
  const added = (ctx.look = {});
  if (FOUNDRY_LOOK.bells) added.bells = new Bells(ctx, FOUNDRY_LOOK.bells);
  if (FOUNDRY_LOOK.moulds) added.moulds = new Moulds(ctx, FOUNDRY_LOOK.moulds);
  if (FOUNDRY_LOOK.lava) added.lava = new Lava(ctx, FOUNDRY_LOOK.lava);
  if (FOUNDRY_LOOK.hall && FOUNDRY_LOOK.hall.furnace) added.furnace = new Furnace(ctx, FOUNDRY_LOOK.hall.furnace);
  if (FOUNDRY_LOOK.rupture && added.furnace) added.rupture = new Rupture(ctx, FOUNDRY_LOOK.rupture, added.furnace);
  if (FOUNDRY_LOOK.ghosts) added.ghosts = new Ghosts(ctx, FOUNDRY_LOOK.ghosts);
  if (FOUNDRY_LOOK.deco) {
    added.deco = new FoundryProps(ctx, FOUNDRY_LOOK.deco);
    await added.deco.load();
  }
  if (FOUNDRY_LOOK.figures) added.figures = new Figures(ctx, FOUNDRY_LOOK.figures);
  if (FOUNDRY_LOOK.cavern) added.cavern = new Cavern(ctx, FOUNDRY_LOOK.cavern);
  if (FOUNDRY_LOOK.armour) added.armour = new Armour(ctx, FOUNDRY_LOOK.armour);
  if (FOUNDRY_LOOK.recast) added.recast = new Recast(ctx, FOUNDRY_LOOK.recast);
  game.addSystem(
    'look',
    {
      update(dt) {
        FOUNDRY.uniforms.uFdTime.value += dt;
        for (const k in added) added[k].update(dt);
      },
    },
    { after: 'arena' },
  );
  followSettings(ctx, added);
  await warmAdded(ctx, Object.values(added));
}

function followSettings(ctx, added) {
  const boss = ctx.boss,
    ui = ctx.ui;
  const apply = (key) => {
    const s = (ui && ui.settings) || {};
    if ((!key || key === 'lava') && added.lava) added.lava.setMode(s.lava || 'normal');
    if ((!key || key === 'ghosts') && added.ghosts) added.ghosts.group.visible = s.ghosts !== false;
    if ((!key || key === 'ash') && added.cavern && added.cavern.ash) added.cavern.ash.points.visible = s.ash !== false;
    const fig = entryOf(CHOSEN.boss),
      names = fig && fig.voice === 'female' && FOUNDRY_LOOK.womanName ? FOUNDRY_LOOK.womanName : FOUNDRY_LOOK.bossName;
    if ((!key || key === 'lang') && names && boss) boss.name = names[s.lang] || names.en;
  };
  apply();
  if (ctx.bus) ctx.bus.on('setting', (e) => apply(e && e.key));
}

async function warmAdded(ctx, list) {
  const g = ctx.gfx,
    r = g && g.renderer;
  if (r && r.compileAsync) {
    r.setRenderTarget(g.chain.sceneRT);
    for (const a of list)
      for (const g of [a.group, ...(a.roots || [])])
        if (g) {
          try {
            await r.compileAsync(g, ctx.camera, ctx.scene);
          } catch (e) {
            console.warn('look: ' + (e && e.message));
          }
        }
    r.setRenderTarget(null);
  }
  for (const a of list) if (a.warm) await a.warm();
}
