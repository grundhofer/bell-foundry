// @ts-check
import { applyEarly as applyLookEarly, install as installLook } from './look/install.js';
import { Game } from './app/game.js';
import { OPTIONS } from './config/options.js';

const params = OPTIONS;

async function main() {
  applyLookEarly();
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
  const game = new Game({ canvas, uiRoot: document.getElementById('ui'), params });
  /** @type {any} */ (window).game = game; // for the console and the test runs
  await game.load();
  await installLook(game);
  if (params.has('expo')) game.expo = (await import('./app/exhibition-mode.js')).attachExpo(game);
  const dev = game.dev || params.has('at') ? await import('./dev/index.js') : null;
  if (!dev) {
    game.start('title');
    return;
  }
  if (await dev.attach(game, params)) return;
  game.loop.start();
}

main().catch((err) => {
  console.error(err);
  document.title = 'error: ' + err.message;
  const waiting = params.get('shot') || params.get('perf') || params.get('fight');
  if (waiting)
    fetch('/__shot/' + waiting + '.error.txt', { method: 'POST', body: String((err && err.stack) || err) }).catch(
      () => {},
    );
  const p = document.createElement('p');
  p.textContent = 'Could not start the game: ' + err.message;
  p.style.cssText = 'position:fixed;left:24px;top:24px;font:16px system-ui;color:#f4efe6;max-width:70ch';
  document.body.appendChild(p);
});
