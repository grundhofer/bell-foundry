import { TEXT } from '../ui/menus.js';
import { fillPlaceholders } from '../ui/language.js';

const IDLE_TITLE = 40,
  IDLE_RUN = 90,
  END_WAIT = 30,
  DEMO_MAX = 180;
const KEY = 'foundry.expo.best',
  KEEP = 5;
const RUN = { fight: true, phase: true, rescue: true };

const falls = (k) => (k ? fillPlaceholders(TEXT.expoFalls, { n: k }) : TEXT.expoNoFall);
const clock = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function loadBestTimes() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter((r) => r && typeof r.t === 'number') : [];
  } catch (e) {
    return [];
  }
}
function saveBestTimes(a) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch (e) {}
}

const CSS = `
.tbf-expo { position: absolute; inset: 0; pointer-events: none; z-index: 5; font-family: var(--serif, Georgia, serif); color: var(--ivory, #f4efe6); text-shadow: var(--shade, 0 1px 3px rgba(0,0,0,.8)); }
.tbf-expo > * { position: absolute; opacity: 0; transition: opacity .6s ease; }
.tbf-expo .on { opacity: 1; }
.tbf-expo .clock { top: max(12px, calc(var(--u, 1px) * 26)); left: 50%; transform: translateX(-50%); font-size: max(16px, calc(var(--u, 1px) * 26)); letter-spacing: .08em; font-variant-numeric: tabular-nums; }
.tbf-expo .demo { left: 50%; bottom: max(24px, calc(var(--u, 1px) * 70)); transform: translateX(-50%); text-align: center; font-size: max(17px, calc(var(--u, 1px) * 30)); letter-spacing: .06em; white-space: nowrap; }
.tbf-expo .demo.on { animation: tbf-expo-breathe 2.6s ease-in-out infinite; }
.tbf-expo .demo small { display: block; font-size: .62em; letter-spacing: .3em; text-transform: uppercase; opacity: .75; margin-bottom: .4em; }
.tbf-expo .best { right: max(16px, calc(var(--u, 1px) * 40)); bottom: max(16px, calc(var(--u, 1px) * 34)); font-size: max(14px, calc(var(--u, 1px) * 18)); opacity: 0; }
.tbf-expo .best.on { opacity: .8; }
.tbf-expo .result { left: 50%; top: max(20px, calc(var(--u, 1px) * 70)); transform: translateX(-50%); text-align: center; min-width: min(90vw, 420px); }
.tbf-expo .result .me { font-size: max(20px, calc(var(--u, 1px) * 36)); letter-spacing: .04em; }
.tbf-expo .result .new { display: block; font-size: .5em; letter-spacing: .3em; text-transform: uppercase; color: var(--gold, #e7b766); margin-top: .3em; }
.tbf-expo .result ol { list-style: none; margin: max(10px, calc(var(--u, 1px) * 18)) 0 0; padding: 0; font-size: max(14px, calc(var(--u, 1px) * 19)); font-variant-numeric: tabular-nums; }
.tbf-expo .result h3 { margin: max(14px, calc(var(--u, 1px) * 24)) 0 0; font-weight: 400; font-size: max(12px, calc(var(--u, 1px) * 14)); letter-spacing: .3em; text-transform: uppercase; opacity: .7; }
.tbf-expo .result li { padding: .15em 0; opacity: .8; }
.tbf-expo .result li.mine { opacity: 1; color: var(--gold, #e7b766); }
@keyframes tbf-expo-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { .tbf-expo .demo { animation: none; } }
`;

export function attachExpo(game) {
  const ctx = game.ctx,
    params = game.params;
  if (params.get('expo') === 'reset') saveBestTimes([]);

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'tbf-expo';
  el.innerHTML = '<div class="clock"></div><div class="demo"></div><div class="best"></div><div class="result"></div>';
  (ctx.ui.root || document.body).appendChild(el);
  const n = {
    clock: el.querySelector('.clock'),
    demo: el.querySelector('.demo'),
    best: el.querySelector('.best'),
    result: el.querySelector('.result'),
  };
  const show = (node, on) => node.classList.toggle('on', !!on);

  let lastInput = performance.now();
  const touched = () => {
    lastInput = performance.now();
    if (demo) stopDemo();
  };
  for (const type of ['keydown', 'pointerdown', 'wheel', 'touchstart'])
    window.addEventListener(
      type,
      (e) => {
        if (e.isTrusted) touched();
      },
      { capture: true, passive: true },
    );
  window.addEventListener(
    'mousemove',
    (e) => {
      if (e.isTrusted && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) touched();
    },
    { passive: true },
  );
  let gestureAt = 0;
  const hwTouched = () => {
    const hw = ctx.hw;
    if (!hw || !hw.dev) return false;
    if (hw.lastGesture && hw.lastGesture.at > gestureAt) {
      gestureAt = hw.lastGesture.at;
      return true;
    }
    for (const d of Object.values(hw.dev)) {
      const l = d && d.last;
      if (l && performance.now() - d.at < 500 && (l.buttons || Math.hypot(l.joy[0], l.joy[1]) > 0.5)) return true;
    }
    return false;
  };
  const padTouched = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads)
      if (p && (p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > 0.5))) return true;
    return false;
  };

  let demo = null,
    botMod = null;
  async function startDemo() {
    if (demo) return;
    demo = { at: performance.now(), hook: null };
    try {
      botMod = botMod || (await import('./bot.js'));
    } catch (e) {
      console.error('expo: no bot', e);
      demo = null;
      return;
    }
    if (!demo) return;
    game.begin('fight');
    demo.hook = botMod.attachBot(game, { skill: 1 });
  }
  function stopDemo() {
    const d = demo;
    demo = null;
    if (!d) return;
    if (d.hook) d.hook.dispose();
    const i = ctx.input;
    for (const a of [...i.scripted]) i.set(a, false);
    i.setMove(null);
    i.setLook(null);
    game.begin('title');
    lastInput = performance.now();
  }

  let run = { time: 0, falls: 0 },
    finished = null;
  ctx.bus.on('fight-reset', () => {
    run = { time: 0, falls: 0 };
    finished = null;
  });
  game.hooks.stepStart.push((dt) => {
    if (demo && demo.hook) demo.hook(dt);
    if (!demo && RUN[game.state]) run.time += dt;
  });
  ctx.bus.on('player-died', () => {
    if (!demo) run.falls++;
  });
  ctx.bus.on('state', (e) => {
    if (e.to === 'won' && !demo && run.time > 0) finish();
    if (e.to === 'won' && demo) stopDemo();
  });
  function finish() {
    const rec = { t: Math.round(run.time * 10) / 10, falls: run.falls, at: Date.now() };
    const best = loadBestTimes();
    best.push(rec);
    best.sort((a, b) => a.t - b.t || a.falls - b.falls);
    const kept = best.slice(0, KEEP);
    saveBestTimes(kept);
    finished = { rec, list: kept, first: kept[0] === rec, place: kept.indexOf(rec) };
    paintResult();
  }
  function paintResult() {
    const f = finished;
    if (!f) return;
    const row = (r) => `<li class="${r === f.rec ? 'mine' : ''}">${clock(r.t)} · ${falls(r.falls)}</li>`;
    n.result.innerHTML =
      `<div class="me">${fillPlaceholders(TEXT.expoYourTime, { t: clock(f.rec.t) })} · ${falls(f.rec.falls)}` +
      (f.first ? `<span class="new">${TEXT.expoRecord}</span>` : '') +
      `</div>` +
      `<h3>${TEXT.expoBest}</h3><ol>${f.list.map(row).join('')}</ol>` +
      (f.place < 0 ? `<ol><li class="mine">${clock(f.rec.t)} · ${falls(f.rec.falls)}</li></ol>` : '');
  }

  let wonAt = 0,
    lastLang = '';
  setInterval(() => {
    const now = performance.now(),
      st = game.state;
    if (hwTouched() || padTouched()) touched();
    const idle = (now - lastInput) / 1000;
    if (lastLang !== ctx.ui.settings.lang) {
      lastLang = ctx.ui.settings.lang;
      paintResult();
      n.demo.innerHTML = `<small>${TEXT.expoDemo}</small>${TEXT.expoJoin}`;
    }

    if (demo) {
      if ((now - demo.at) / 1000 > DEMO_MAX) stopDemo();
    } else if (st === 'title') {
      if (idle > IDLE_TITLE && ctx.ui.screen === 'title') startDemo();
    } else if ((RUN[st] || st === 'intro' || game.paused) && idle > IDLE_RUN) game.begin('title');

    if (st === 'won' && game.flow.wonStage >= 1) {
      if (!wonAt) wonAt = now;
      if ((now - wonAt) / 1000 > END_WAIT) game.begin('title');
    } else wonAt = 0;

    const best = loadBestTimes()[0];
    n.best.textContent = best ? fillPlaceholders(TEXT.expoBestShort, { t: clock(best.t) }) : '';
    show(n.best, st === 'title' && best && !demo);
    show(n.demo, !!demo);
    n.clock.textContent = clock(run.time);
    show(n.clock, !demo && (st === 'fight' || st === 'rescue') && !game.paused);
    show(n.result, !demo && st === 'won' && game.flow.wonStage >= 1 && finished);
  }, 250);

  return {
    get demo() {
      return !!demo;
    },
    get run() {
      return run;
    },
    startDemo,
    stopDemo,
  };
}
