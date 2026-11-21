// Static server for the game folder (game/), plus the sink the dev modes post their results to.
//
//   node tools/serve.mjs [port] [outDir]       (defaults: 8080, ./out)
//
// GET  serves game/ as it is (no build step).
// POST /__shot/<name> writes the request body to <outDir>/<name> (screenshots, fight tallies, perf numbers, errors).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'game');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/**
 * @param {{ port?: number, outDir?: string, quiet?: boolean }} [o]
 * @returns {Promise<http.Server>}
 */
export function serve({ port = 8080, outDir = path.resolve('out'), quiet = false } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname.startsWith('/__shot/')) {
      const name = path.basename(decodeURIComponent(url.pathname.slice('/__shot/'.length)));
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, name), Buffer.concat(chunks));
        if (!quiet) console.log('wrote', name);
        res.end('ok');
      });
      return;
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) return void res.writeHead(404).end('not found');
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 8080);
  const outDir = path.resolve(process.argv[3] || 'out');
  await serve({ port, outDir });
  console.log(`http://localhost:${port}/  (results -> ${outDir})`);
}
