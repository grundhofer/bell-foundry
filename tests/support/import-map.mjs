// Resolves 'three' and 'three/addons/…' for node tests the way game/index.html's import map does in the browser.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const VENDOR = path.resolve(import.meta.dirname, '..', '..', 'game', 'vendor', 'three');

export async function resolve(specifier, context, next) {
  if (specifier === 'three')
    return { url: pathToFileURL(path.join(VENDOR, 'three.module.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/'))
    return {
      url: pathToFileURL(path.join(VENDOR, 'addons', specifier.slice('three/addons/'.length))).href,
      shortCircuit: true,
    };
  return next(specifier, context);
}
