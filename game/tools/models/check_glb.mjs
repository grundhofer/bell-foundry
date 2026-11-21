// Run with node check_glb.mjs file.glb [...]. Exit 1 if any model fails.
import { readFileSync, statSync } from 'node:fs';

const SIDES = ['Left', 'Right'];
const REQUIRED = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End'];
for (const s of SIDES)
  for (const n of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'HandIndex1', 'HandIndex2', 'HandIndex3', 'HandIndex4',
    'HandThumb1', 'HandThumb2', 'HandThumb3', 'HandThumb4', 'UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End'])
    REQUIRED.push(s + n);

function parse(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jlen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jlen).toString('utf8'));
  const binStart = 20 + jlen + 8;
  return { json, bin: b.subarray(binStart) };
}

function imageSize(buf, mime) {
  if (mime === 'image/webp') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (fmt === 'VP8L') { const v = buf.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
    if (fmt === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (mime === 'image/png') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  return [0, 0];
}

function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1];
}
function mul(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++)
    for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k];
  return r;
}
const isIdentity = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-5);

export function check(path) {
  const { json: j } = parse(path);
  const { bin } = parse(path);
  const errors = [], info = {};
  const nodes = j.nodes || [];
  const names = new Set(nodes.map((n) => n.name));
  const missing = REQUIRED.filter((b) => !names.has('mixamorig:' + b));
  if (missing.length) errors.push('missing bones: ' + missing.join(','));
  if ((j.skins || []).length !== 1) errors.push(`skins: ${(j.skins || []).length} (want 1)`);
  info.bones = j.skins?.[0]?.joints.length ?? 0;
  const roots = j.scenes[j.scene ?? 0].nodes;
  const root = nodes[roots[0]];
  if (roots.length !== 1 || root.name !== 'Armature') errors.push('scene root is not a single "Armature" node');
  if (!isIdentity(trs(root))) errors.push('Armature node transform is not identity');
  if (!(root.children || []).some((c) => nodes[c].name === 'mixamorig:Hips')) errors.push('mixamorig:Hips is not a child of Armature');
  if ((j.animations || []).length) errors.push('has animations');
  if ((j.cameras || []).length) errors.push('has cameras');
  if (j.extensions?.KHR_lights_punctual) errors.push('has lights');

  const world = new Array(nodes.length);
  const walk = (i, parent) => { world[i] = mul(parent, trs(nodes[i])); (nodes[i].children || []).forEach((c) => walk(c, world[i])); };
  roots.forEach((r) => walk(r, trs({})));
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], tris = 0;
  nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    for (const p of j.meshes[n.mesh].primitives) {
      const acc = j.accessors[p.attributes.POSITION];
      tris += p.indices !== undefined ? j.accessors[p.indices].count / 3 : acc.count / 3;
      const m = world[i];
      for (const cx of [acc.min[0], acc.max[0]]) for (const cy of [acc.min[1], acc.max[1]]) for (const cz of [acc.min[2], acc.max[2]]) {
        const v = [0, 1, 2].map((r) => m[r] * cx + m[4 + r] * cy + m[8 + r] * cz + m[12 + r]);
        lo = lo.map((x, k) => Math.min(x, v[k])); hi = hi.map((x, k) => Math.max(x, v[k]));
      }
    }
  });
  info.height = +(hi[1] - lo[1]).toFixed(4);
  info.feet = +lo[1].toFixed(4);
  info.tris = tris;
  if (Math.abs(hi[1] - 1.8) > 0.005 || Math.abs(lo[1]) > 0.005) errors.push(`bbox y ${lo[1].toFixed(3)}..${hi[1].toFixed(3)} (want 0..1.8)`);
  if (tris > 60000) errors.push(`tris ${tris} > 60000`);
  const hips = nodes.findIndex((n) => n.name === 'mixamorig:Hips');
  if (hips >= 0) {
    const h = world[hips];
    info.hipsXZ = [+h[12].toFixed(3), +h[14].toFixed(3)];
    if (Math.abs(h[12]) > 0.01 || Math.abs(h[14]) > 0.01) errors.push(`hips not centred: x=${h[12].toFixed(3)} z=${h[14].toFixed(3)}`);
  }
  const lf = nodes.findIndex((n) => n.name === 'mixamorig:LeftFoot'), lt = nodes.findIndex((n) => n.name === 'mixamorig:LeftToeBase');
  if (lf >= 0 && lt >= 0 && world[lt][14] <= world[lf][14]) errors.push('toes are not in +Z of the feet (facing?)');

  info.textures = (j.images || []).map((im) => {
    const bv = j.bufferViews[im.bufferView];
    const buf = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const [w, h] = imageSize(buf, im.mimeType);
    if (!['image/webp', 'image/jpeg'].includes(im.mimeType)) errors.push(`${im.name}: ${im.mimeType}`);
    if (Math.max(w, h) > 2048) errors.push(`${im.name}: ${w}x${h} > 2048`);
    return `${w}x${h} ${im.mimeType.split('/')[1]}`;
  });
  info.materials = (j.materials || []).length;
  info.mb = +(statSync(path).size / 1e6).toFixed(2);
  return { path, ok: errors.length === 0, errors, info };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  for (const p of process.argv.slice(2)) {
    try {
      const r = check(p);
      if (!r.ok) bad++;
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${p.split('/').pop()} ${JSON.stringify(r.info)}${r.ok ? '' : '\n     ' + r.errors.join('\n     ')}`);
    } catch (e) { bad++; console.log(`FAIL ${p}: ${e.message}`); }
  }
  process.exit(bad ? 1 : 0);
}
