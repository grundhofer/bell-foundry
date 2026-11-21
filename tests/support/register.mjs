// node --import ./tests/support/register.mjs --test : lets tests import modules that use three.js
import { register } from 'node:module';

register('./import-map.mjs', import.meta.url);
