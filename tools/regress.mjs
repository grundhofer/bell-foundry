// Regression run: plays fixed scenes and bot fights in Chrome and compares them with a stored baseline.
//
//   node tools/regress.mjs baseline        record the baseline (out/regress/baseline)
//   node tools/regress.mjs                 record again (out/regress/current) and compare
//   node tools/regress.mjs --only fight    only scenarios whose name contains "fight"
//
// Fights are computed in fixed steps from a seed, so their tallies must match exactly.
// Screenshots may differ by a few pixels of GPU noise; more than MAX_DIFF of the image counts as a change.
/* global document -- used inside page.waitForFunction, which runs in the browser */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { serve } from './serve.mjs';

const PORT = 8391;
const MAX_DIFF = 0.002;
const SIZE = 'shotw=800&shoth=450';
const SCENARIOS = [
  { name: 'fight_seed1', q: 'fight=fight_seed1.json&bot&seed=1&limit=240' },
  { name: 'fight_seed7', q: 'fight=fight_seed7.json&bot=0.7&seed=7&limit=240' },
  { name: 'shot_title', q: `shot=shot_title.png&at=title&t=2&${SIZE}` },
  { name: 'shot_intro', q: `shot=shot_intro.png&at=intro&t=7&${SIZE}` },
  { name: 'shot_fight', q: `shot=shot_fight.png&at=fight&t=3&${SIZE}` },
  { name: 'shot_play', q: `shot=shot_play.png&at=fight&t=6&play=fwd@0-1.5,attack@1.6,lock@2,heavy@3,roll@4.2&${SIZE}` },
  { name: 'shot_phase2', q: `shot=shot_phase2.png&at=phase2&t=5&${SIZE}` },
  { name: 'shot_fight2', q: `shot=shot_fight2.png&at=fight2&t=3&${SIZE}` },
  { name: 'shot_rescue', q: `shot=shot_rescue.png&at=rescue&t=4&${SIZE}` },
  { name: 'shot_ending', q: `shot=shot_ending.png&at=ending&t=6&${SIZE}` },
  { name: 'shot_cam', q: `shot=shot_cam.png&at=fight&t=1&cam=0,6,14,0,2,-10&ui=0&${SIZE}` },
];

const args = process.argv.slice(2);
const mode = args[0] === 'baseline' ? 'baseline' : 'current';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const ROOT = path.resolve('out', 'regress');
const outDir = path.join(ROOT, mode);
const list = SCENARIOS.filter((s) => !only || s.name.includes(only));

fs.mkdirSync(outDir, { recursive: true });
for (const s of list)
  for (const ext of ['.json', '.png', '.page.png', '.error.txt', '.console.txt', '.diff.png', '.page.diff.png'])
    fs.rmSync(path.join(outDir, s.name + ext), { force: true });

const server = await serve({ port: PORT, outDir, quiet: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const failures = [];

try {
  for (const s of list) {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/?${s.q}`);
    let title = '';
    try {
      await page.waitForFunction(() => /done$|^error/.test(document.title), null, { timeout: 300000, polling: 250 });
      title = await page.title();
      if (s.name.startsWith('shot_')) await page.screenshot({ path: path.join(outDir, s.name + '.page.png') });
    } catch (e) {
      title = 'timeout';
    }
    await page.close();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!/done$/.test(title)) failures.push(`${s.name}: ${title}`);
    if (errors.length) fs.writeFileSync(path.join(outDir, s.name + '.console.txt'), errors.join('\n'));
    console.log(
      `${s.name.padEnd(14)} ${title.padEnd(12)} ${secs}s${errors.length ? `  (${errors.length} console errors)` : ''}`,
    );
  }
} finally {
  await browser.close();
  server.close();
}

if (mode === 'current') {
  const base = path.join(ROOT, 'baseline');
  for (const s of list) {
    for (const ext of ['.json', '.png', '.page.png']) {
      const a = path.join(base, s.name + ext),
        b = path.join(outDir, s.name + ext);
      if (!fs.existsSync(a) && !fs.existsSync(b)) continue;
      if (!fs.existsSync(a) || !fs.existsSync(b)) {
        failures.push(`${s.name}${ext}: only in ${fs.existsSync(a) ? 'baseline' : 'current'}`);
        continue;
      }
      if (ext === '.json') {
        const ja = fs.readFileSync(a, 'utf8'),
          jb = fs.readFileSync(b, 'utf8');
        if (ja !== jb)
          failures.push(
            `${s.name}: fight differs\n  baseline ${ja.replace(/\s+/g, ' ').slice(0, 400)}\n  current  ${jb.replace(/\s+/g, ' ').slice(0, 400)}`,
          );
      } else {
        const pa = PNG.sync.read(fs.readFileSync(a)),
          pb = PNG.sync.read(fs.readFileSync(b));
        if (pa.width !== pb.width || pa.height !== pb.height) {
          failures.push(`${s.name}: image size differs`);
          continue;
        }
        const diff = new PNG({ width: pa.width, height: pa.height });
        const n = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0.1 });
        const share = n / (pa.width * pa.height);
        if (share > MAX_DIFF) {
          const out = s.name + ext.replace('.png', '.diff.png');
          fs.writeFileSync(path.join(outDir, out), PNG.sync.write(diff));
          failures.push(`${s.name}${ext}: ${(share * 100).toFixed(2)} % of the image differs (see ${out})`);
        } else if (n) console.log(`${s.name}${ext}: ${(share * 100).toFixed(3)} % pixel noise (within tolerance)`);
      }
    }
  }
}

if (failures.length) {
  console.error('\nFAILED:\n' + failures.join('\n'));
  process.exit(1);
}
console.log(mode === 'baseline' ? '\nbaseline recorded' : '\nsame as baseline');
