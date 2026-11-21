// The duel's state machine (game/src/app/flow.js) with stand-ins for the systems: no renderer, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Flow } from '../game/src/app/flow.js';
import { EventBus } from '../game/src/core/event-bus.js';
import { Options } from '../game/src/config/options.js';

const DT = 1 / 60;

function stage() {
  const calls = [];
  const note = (name) => (arg) => calls.push(arg === undefined ? name : `${name}:${arg}`);
  const fighter = (hpMax) => ({
    hp: hpMax,
    hpMax,
    alive: true,
    phase: 1,
    pos: { x: 0, z: 0 },
    rules: {},
    reset() {
      this.hp = this.hpMax;
      this.alive = true;
      this.phase = 1;
    },
    enterPhase(n) {
      this.phase = n;
    },
  });
  const cine = {
    playing: false,
    play(name) {
      this.playing = true;
      calls.push('cine:' + name);
    },
    skip() {
      this.playing = false;
    },
    title() {},
  };
  const pressed = new Set();
  const ctx = {
    params: new Options(''),
    bus: new EventBus(),
    input: { wantLock: false, held: () => false, pressed: (a) => pressed.has(a) },
    ui: { showScreen: note('screen'), fade() {}, letterbox() {}, banner() {}, prompt() {}, skip() {} },
    audio: { music: note('music') },
    cine,
    cam: { mode: 'free', snapBehind() {} },
    candles: { lit: 1, relight() {}, snuffAll() {} },
    gfx: { mood: { candle: 1, gold: 0 }, post: {} },
    combat: { strike: ({ target }) => (target.alive = false) },
    player: fighter(100),
    boss: fighter(800),
  };
  const game = { ctx, pause: note('pause'), slow: note('slow') };
  const flow = new Flow(game);
  flow.wire();
  const events = [];
  ctx.bus.on('*', (name, d) => events.push(name === 'state' ? `state:${d.to}` : name));
  const run = (seconds) => {
    for (let t = 0; t < seconds; t += DT) flow.update(DT);
  };
  return { flow, ctx, calls, events, pressed, run };
}

test('title -> intro -> fight once the intro is over', () => {
  const { flow, ctx, calls, run } = stage();
  flow.begin('title');
  assert.equal(flow.state, 'title');
  flow.begin('intro');
  assert.equal(flow.state, 'intro');
  assert.ok(calls.includes('cine:intro'));
  run(1);
  assert.equal(flow.state, 'intro', 'waits for the cutscene');
  ctx.cine.playing = false;
  run(DT);
  assert.equal(flow.state, 'fight');
  assert.equal(ctx.input.wantLock, true);
  assert.ok(calls.includes('screen:hud'));
});

test('every begin resets the fight and says so on the bus', () => {
  const { flow, ctx, events } = stage();
  ctx.player.hp = 3;
  flow.rescues = 2;
  flow.begin('fight');
  assert.equal(ctx.player.hp, 100);
  assert.equal(flow.rescues, 0);
  assert.deepEqual(events.slice(0, 2), ['fight-reset', 'state:fight']);
});

test('the player falls: rescue, then back to the fight', () => {
  const { flow, ctx, events, run } = stage();
  flow.begin('fight');
  ctx.player.alive = false;
  run(DT);
  assert.equal(flow.state, 'rescue');
  assert.ok(events.includes('player-died'));
  run(1);
  assert.equal(ctx.cine.playing, true, 'the rescue scene starts after a short wait');
  ctx.cine.playing = false;
  run(DT);
  assert.equal(flow.state, 'fight');
  assert.ok(events.includes('player-rescued'));
});

test('the boss turns at half health: phase cutscene, then the second fight', () => {
  const { flow, ctx, calls, run } = stage();
  flow.begin('fight');
  ctx.bus.emit('boss-phase', { phase: 2 });
  run(DT);
  assert.equal(flow.state, 'phase');
  assert.ok(calls.includes('cine:phase2'));
  ctx.cine.playing = false;
  run(DT);
  assert.equal(flow.state, 'fight');
  assert.equal(ctx.boss.phase, 2);
  assert.equal(ctx.gfx.mood.gold, 1);
  assert.ok(calls.includes('music:phase2'));
});

test('the boss falls: slow motion, ending, end screen', () => {
  const { flow, ctx, calls, run } = stage();
  flow.begin('fight');
  ctx.boss.alive = false;
  run(DT);
  assert.ok(calls.includes('slow:0.3'));
  run(0.6);
  assert.equal(flow.state, 'won');
  assert.ok(calls.includes('cine:ending'));
  ctx.cine.playing = false;
  run(DT);
  assert.equal(flow.wonStage, 1);
  assert.ok(calls.includes('screen:end'));
});

test('pause only from the fight', () => {
  const { flow, pressed, calls, run } = stage();
  flow.begin('title');
  pressed.add('pause');
  run(DT);
  assert.ok(!calls.includes('pause:true'));
  flow.begin('fight');
  run(DT);
  assert.ok(calls.includes('pause:true'));
});
