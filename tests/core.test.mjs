// Engine basics that run without a browser: address options, event bus, fixed-step loop, rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Options } from '../game/src/config/options.js';
import { EventBus } from '../game/src/core/event-bus.js';
import { Loop } from '../game/src/core/loop.js';
import { rulesFor, applyDifficulty, NORMAL_RULES, FILM_RULES, EASY_RULES } from '../game/src/core/rules.js';

test('Options: has/get like URLSearchParams', () => {
  const o = new Options('?q=low&novfx&seed=7');
  assert.equal(o.get('q'), 'low');
  assert.equal(o.has('novfx'), true);
  assert.equal(o.get('missing'), null);
});

test('Options.flag: present is on, =0 is off, absent is the fallback', () => {
  const o = new Options('a&b=1&c=0');
  assert.equal(o.flag('a'), true);
  assert.equal(o.flag('b'), true);
  assert.equal(o.flag('c', true), false);
  assert.equal(o.flag('d'), false);
  assert.equal(o.flag('d', true), true);
});

test('Options.num: numbers only, otherwise the fallback', () => {
  const o = new Options('x=2.5&y=&z=abc&n=-3');
  assert.equal(o.num('x', 0), 2.5);
  assert.equal(o.num('y', 9), 9);
  assert.equal(o.num('z', 9), 9);
  assert.equal(o.num('n', 0), -3);
  assert.equal(o.num('none', null), null);
});

test('Options.tune: only known names, only numbers', () => {
  const table = { speed: 1, depth: 2 };
  const out = new Options('water=speed:3,depth:x,colour:5,depth').tune('water', table);
  assert.equal(out, table);
  assert.deepEqual(table, { speed: 3, depth: 2 });
});

test('Bus: on/off/emit, a failing listener does not stop the others', (t) => {
  t.mock.method(console, 'error', () => {});
  const bus = new EventBus(),
    got = [];
  const off = bus.on('hit', (d) => got.push(['a', d]));
  bus.on('hit', () => {
    throw new Error('boom');
  });
  bus.on('hit', (d) => got.push(['c', d]));
  bus.on('*', (name, d) => got.push(['*', name, d]));
  bus.emit('hit', 1);
  off();
  bus.emit('hit', 2);
  assert.deepEqual(got, [
    ['a', 1],
    ['c', 1],
    ['*', 'hit', 1],
    ['c', 2],
    ['*', 'hit', 2],
  ]);
});

test('Loop: fixed steps, interpolation, scale, freeze and capped catch-up', () => {
  const steps = [],
    frames = [];
  const loop = new Loop({ step: (dt) => steps.push(dt), frame: (dt, a) => frames.push(a) });
  loop.advance(1 / 30 + 1e-9);
  assert.equal(steps.length, 2);
  assert.ok(Math.abs(frames.at(-1)) < 1e-6);
  loop.advance(1 / 120);
  assert.equal(steps.length, 2);
  assert.ok(Math.abs(frames.at(-1) - 0.5) < 1e-6);
  loop.scale = 0;
  loop.advance(1);
  assert.equal(steps.length, 2, 'paused: no steps');
  loop.scale = 1;
  loop.freeze = 0.05;
  loop.advance(0.04);
  assert.equal(steps.length, 2, 'frozen: no steps');
  loop.freeze = 0;
  loop.acc = 0;
  loop.advance(10);
  assert.equal(steps.length, 8, 'at most 6 steps per frame');
  assert.equal(loop.acc, 0, 'catch-up dropped');
});

test('rulesFor: play rules by default, film rules and single overrides from the address', () => {
  assert.deepEqual(rulesFor(new Options('')), { ...NORMAL_RULES });
  assert.deepEqual(rulesFor(new Options('rules=film')), { ...FILM_RULES });
  const r = rulesFor(new Options('rule=health:99,heal:x,nope:3'));
  assert.equal(r.health, 99);
  assert.equal(r.heal, NORMAL_RULES.heal);
  assert.equal('nope' in r, false);
});

test('applyLevel: sets both fighters, unless the address fixes the rules', () => {
  const fighters = () => ({ player: { rules: { ...NORMAL_RULES } }, boss: { rules: { ...NORMAL_RULES } } });
  const ctx = { params: new Options(''), ...fighters() };
  assert.equal(applyDifficulty(ctx, 'easy'), true);
  assert.equal(ctx.player.hpMax, EASY_RULES.health);
  assert.equal(ctx.player.flasksMax, EASY_RULES.flasks);
  assert.equal(ctx.boss.hpMax, EASY_RULES.herHealth);
  const fixed = { params: new Options('rules=film'), ...fighters() };
  assert.equal(applyDifficulty(fixed, 'easy'), false);
  assert.equal(fixed.player.hpMax, undefined);
});
