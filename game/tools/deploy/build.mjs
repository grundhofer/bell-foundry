// Builds dist/ (next to game/) for GitHub Pages: the game folder without tools and tests, models made smaller.
//
//   cd game/tools/deploy && npm install && npm run build        (on GitHub: .github/workflows/pages.yml)
//
// Models:
//   - GLBs packed with EXT_meshopt_compression (no quantization, no filters): vertex and key data decode bit for bit,
//     but the packing turns each triangle's corners and snaps rest turns under 1e-6 to none. So the files the fight is
//     computed from stay exactly as they are (EXACT: the pilgrim's and the boss's skeletons and clips), and replays
//     and recordings come out the same; the figures under alt/, the arena's pieces and the props are packed.
//   - figures under assets/models/alt that only the pilgrim wears: textures halved to at most 1024 px (webp, q 85).
//     The boss's figures keep theirs: she is seen up to several metres tall; unless the file would still be over
//     BIG, then theirs are halved too.
// The game's loader knows meshopt (src/core/assets.js, vendor/three/addons/libs/meshopt_decoder.module.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..');
const OUT = path.resolve(GAME, '..', 'dist');
const SKIP = new Set(['tools', 'tests', 'node_modules', '.DS_Store']);
const PLAYER_TEX = 1024, BIG = 8e6;
const EXACT = new Set(['pilgrim.clips.glb', 'pilgrim.motion.glb', 'boss.clips.glb']);

function copy(from, to) {
  for (const name of fs.readdirSync(from)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const a = path.join(from, name), b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b); } else fs.copyFileSync(a, b);
  }
}
function glbs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) glbs(p, out); else if (name.endsWith('.glb')) out.push(p);
  }
  return out;
}
/** Which figures under alt/ only the pilgrim wears (roster.json: role 'player'). */
function playerOnly() {
  const roster = JSON.parse(fs.readFileSync(path.join(GAME, 'tools', 'models', 'roster.json'), 'utf8'));
  return new Set(roster.filter((e) => e.role === 'player').map((e) => e.id + '.glb'));
}

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
copy(GAME, OUT);

const small = playerOnly(); let before = 0, after = 0;
for (const file of glbs(path.join(OUT, 'assets', 'models'))) {
  const was = fs.statSync(file).size; before += was;
  const rel = path.relative(path.join(OUT, 'assets', 'models'), file);
  if (EXACT.has(rel)) { after += was; console.log(`${rel.padEnd(28)} ${(was / 1e6).toFixed(1).padStart(5)} MB (as it is)`); continue; }
  const doc = await io.read(file);
  const alt = rel.startsWith('alt' + path.sep) && doc.getRoot().listTextures().length > 0;
  const halve = () => doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [PLAYER_TEX, PLAYER_TEX] }));
  if (alt && small.has(path.basename(file))) await halve();
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(file, doc);
  if (alt && !small.has(path.basename(file)) && fs.statSync(file).size > BIG) { await halve(); await io.write(file, doc); }
  const now = fs.statSync(file).size; after += now;
  console.log(`${rel.padEnd(28)} ${(was / 1e6).toFixed(1).padStart(5)} MB -> ${(now / 1e6).toFixed(1).padStart(5)} MB`);
}
console.log(`models: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);

// credits and licences travel with the game (CC BY asks for the credit wherever the models are shared); they live in docs/
const DOCS = path.resolve(GAME, '..', 'docs');
fs.copyFileSync(path.join(DOCS, 'CREDITS.md'), path.join(OUT, 'CREDITS.md'));
fs.cpSync(path.join(DOCS, 'licenses'), path.join(OUT, 'licenses'), { recursive: true });

let total = 0, count = 0;
(function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else { total += fs.statSync(p).size; count++; } } })(OUT);
console.log(`dist: ${count} files, ${(total / 1e6).toFixed(1)} MB -> ${OUT}`);
