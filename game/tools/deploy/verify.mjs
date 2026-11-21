// Checks that dist/'s models decode to exactly what game/ has (all but textures that build.mjs resized on purpose).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const HERE = path.dirname(fileURLToPath(import.meta.url)), GAME = path.resolve(HERE, '..', '..'), OUT = path.resolve(GAME, '..', 'dist');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
let bad = 0;
for (const rel of process.argv.slice(2)) {
  const a = (await io.read(path.join(GAME, 'assets/models', rel))).getRoot(), b = (await io.read(path.join(OUT, 'assets/models', rel))).getRoot();
  const A = a.listAccessors(), B = b.listAccessors(); let diff = A.length !== B.length ? 1 : 0;
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i].getArray(), y = B[i].getArray();
    if (x.length !== y.length || x.constructor !== y.constructor || A[i].getNormalized() !== B[i].getNormalized()) { diff++; continue; }
    const xb = new Uint8Array(x.buffer, x.byteOffset, x.byteLength), yb = new Uint8Array(y.buffer, y.byteOffset, y.byteLength);
    for (let k = 0; k < xb.length; k++) if (xb[k] !== yb[k]) { diff++; break; }
  }
  const N = a.listNodes(), M = b.listNodes();
  for (let i = 0; i < N.length; i++) { const p = N[i], q = M[i]; if (!q || p.getName() !== q.getName() || JSON.stringify([p.getTranslation(), p.getRotation(), p.getScale(), p.getExtras()]) !== JSON.stringify([q.getTranslation(), q.getRotation(), q.getScale(), q.getExtras()])) diff++; }
  console.log(`${rel.padEnd(24)} accessors ${A.length} nodes ${N.length} differences ${diff}`); bad += diff;
}
process.exit(bad ? 1 : 0);
