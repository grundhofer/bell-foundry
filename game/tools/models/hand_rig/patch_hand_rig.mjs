// Write refitted finger joints and finger weights into a character GLB, leaving everything else byte-identical
// (mesh, materials, textures and all other bones; no re-export).
// node patch_hand_rig.mjs IN.glb JOINTS.json WEIGHTS.json OUT.glb
// JOINTS.json: joint positions in Blender coordinates (Z up, as hand_weights.py / find_hand_joints.py write them)
// for <Side>Hand{Index,Middle,Ring,Pinky,Thumb}{1..4}. Missing finger nodes are added under <Side>Hand with
// the standard mixamorig names; the rest frame of each finger bone points +Y at its next joint, +X across the palm.
// WEIGHTS.json: output of hand_weights.py (Blender vertex index -> [[bone, weight], ...]).
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, jointsPath, weightsPath, outPath] = process.argv.slice(2);
const P = 'mixamorig:', FINGERS = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
const buf = readFileSync(inPath);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
const jlen = buf.readUInt32LE(12);
const j = JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8'));
const binHeader = 20 + jlen;
const binLen = buf.readUInt32LE(binHeader);
let bin = Buffer.from(buf.subarray(binHeader + 8, binHeader + 8 + binLen));
const B2G = (v) => [v[0], v[2], -v[1]];               // Blender Z-up -> glTF Y-up
const joints = Object.fromEntries(Object.entries(JSON.parse(readFileSync(jointsPath, 'utf8'))).map(([k, v]) => [k, B2G(v)]));
const W = JSON.parse(readFileSync(weightsPath, 'utf8'));

// --- small linear algebra (column-major 4x4 like glTF) ---
const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
function mul(a, b) { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k]; return r; }
function invRigid(m) { // rotation (orthonormal) + translation
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  const t = [m[12], m[13], m[14]];
  r[12] = -(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]); r[13] = -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]); r[14] = -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2]);
  return r;
}
function quatOf(m) { // from orthonormal column-major 3x3 in a 4x4
  const m00 = m[0], m11 = m[5], m22 = m[10], tr = m00 + m11 + m22; let x, y, z, w;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m[6] - m[9]) * s; y = (m[8] - m[2]) * s; z = (m[1] - m[4]) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m[6] - m[9]) / s; x = 0.25 * s; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = 0.25 * s; z = (m[9] + m[6]) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w); return [x / l, y / l, z / l, w / l];
}
const frame = (x, y, z, p) => [...x, 0, ...y, 0, ...z, 0, ...p, 1];

// --- node graph ---
const nodes = j.nodes, parentOf = {};
nodes.forEach((n, i) => (n.children || []).forEach((c) => (parentOf[c] = i)));
const byName = (nm) => nodes.findIndex((n) => n.name === P + nm);
const world = (i) => (parentOf[i] === undefined ? trs(nodes[i]) : mul(world(parentOf[i]), trs(nodes[i])));
const skin = j.skins[0], meshNode = nodes.findIndex((n) => n.skin === 0);
if (parentOf[meshNode] !== undefined && JSON.stringify(world(parentOf[meshNode])) !== JSON.stringify(trs({}))) {
  const m = world(parentOf[meshNode]); if (m.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) throw new Error('skinned mesh parent is not at identity');
}
const added = [];
for (const side of ['Left', 'Right']) {
  if (!joints[side + 'HandIndex1']) continue;
  const handI = byName(side + 'Hand'), Hw = world(handI), wrist = [Hw[12], Hw[13], Hw[14]];
  const jp = (f, k) => { const v = joints[side + 'Hand' + f + k]; if (!v) throw new Error('no joint ' + side + f + k); return v; };
  // across the palm, from the pinky knuckle to the index knuckle (mirror-symmetric between the hands)
  const across = norm(sub(jp('Index', 1), jp('Pinky', 1)));
  const palmUp = norm(cross(across, sub(jp('Middle', 1), wrist)));   // a palm normal, same handedness on both sides
  for (const f of FINGERS) {
    let parent = handI, parentW = Hw;
    for (let k = 1; k <= 4; k++) {
      const name = side + 'Hand' + f + k, p = jp(f, k);
      const y = norm(k < 4 ? sub(jp(f, k + 1), p) : sub(p, jp(f, k - 1)));
      const ref = f === 'Thumb' ? palmUp : across;                      // thumb: bends about the palm normal-ish axis
      const x = norm(sub(ref, y.map((c) => c * dot(ref, y)))), z = cross(x, y);
      const Wm = frame(x, y, z, p);
      const L = mul(invRigid(parentW), Wm);
      let i = byName(name);
      if (i < 0) {
        i = nodes.length; nodes.push({ name: P + name });
        (nodes[parent].children = nodes[parent].children || []).push(i);
        parentOf[i] = parent; skin.joints.push(i); added.push(name);
      } else if (parentOf[i] !== parent) throw new Error(name + ' has an unexpected parent');
      const n = nodes[i];
      delete n.matrix; delete n.scale;
      n.translation = [L[12], L[13], L[14]];
      n.rotation = quatOf(L);
      parent = i; parentW = mul(parentW, trs(n));
    }
  }
}

// --- inverse bind matrices: recompute for all joints from the (unchanged elsewhere) node rest pose ---
const ibmAcc = j.accessors[skin.inverseBindMatrices], ibmView = j.bufferViews[ibmAcc.bufferView];
const oldIbm = new Float32Array(bin.buffer.slice(bin.byteOffset + (ibmView.byteOffset || 0) + (ibmAcc.byteOffset || 0), bin.byteOffset + (ibmView.byteOffset || 0) + (ibmAcc.byteOffset || 0) + ibmAcc.count * 64));
const ibm = new Float32Array(skin.joints.length * 16);
let maxOldDiff = 0;
skin.joints.forEach((ni, k) => {
  const m = invRigid(world(ni));
  if (k < ibmAcc.count) {
    const name = nodes[ni].name.slice(P.length);
    const moved = /Hand(Index|Thumb|Middle|Ring|Pinky)\d$/.test(name);
    if (!moved) { for (let c = 0; c < 16; c++) { ibm[k * 16 + c] = oldIbm[k * 16 + c]; maxOldDiff = Math.max(maxOldDiff, Math.abs(oldIbm[k * 16 + c] - m[c])); } return; }
  }
  ibm.set(m, k * 16);
});
if (maxOldDiff > 1e-4) throw new Error('existing inverse bind matrices do not match the node rest pose (' + maxOldDiff + ')');
const ibmBytes = Buffer.from(ibm.buffer);
const ibmEnd = (ibmView.byteOffset || 0) + ibmView.byteLength;
if (ibmEnd !== binLen && ibmEnd + ((4 - (ibmEnd % 4)) % 4) !== binLen) {
  // not last: append a new view
  const off = Math.ceil(bin.length / 4) * 4;
  bin = Buffer.concat([bin, Buffer.alloc(off - bin.length), ibmBytes]);
  j.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: ibmBytes.length });
  ibmAcc.bufferView = j.bufferViews.length - 1; ibmAcc.byteOffset = 0;
} else {
  bin = Buffer.concat([bin.subarray(0, ibmView.byteOffset || 0), ibmBytes]);
  ibmView.byteLength = ibmBytes.length; ibmAcc.byteOffset = 0;
}
ibmAcc.count = skin.joints.length;

// --- weights ---
const jointIndex = Object.fromEntries(skin.joints.map((ni, k) => [nodes[ni].name.slice(P.length), k]));
const prims = j.meshes[nodes[meshNode].mesh].primitives;
let base = 0, changed = 0;
const total = prims.reduce((s, p) => s + j.accessors[p.attributes.POSITION].count, 0);
if (total !== W.nverts) throw new Error(`vertex count ${total} != Blender's ${W.nverts}`);
for (const p of prims) {
  const ja = j.accessors[p.attributes.JOINTS_0], wa = j.accessors[p.attributes.WEIGHTS_0];
  const jv = j.bufferViews[ja.bufferView], wv = j.bufferViews[wa.bufferView];
  if (ja.componentType !== 5121 || wa.componentType !== 5126 || jv.byteStride || wv.byteStride) throw new Error('unexpected JOINTS_0/WEIGHTS_0 layout');
  const jo = (jv.byteOffset || 0) + (ja.byteOffset || 0), wo = (wv.byteOffset || 0) + (wa.byteOffset || 0);
  const pa = j.accessors[p.attributes.POSITION], pv = j.bufferViews[pa.bufferView], po = (pv.byteOffset || 0) + (pa.byteOffset || 0), ps = pv.byteStride || 12;
  for (let v = 0; v < ja.count; v++) {
    const e = W.verts[base + v]; if (!e) continue;
    const bc = W.co[base + v], g = [bin.readFloatLE(po + v * ps), bin.readFloatLE(po + v * ps + 4), bin.readFloatLE(po + v * ps + 8)];
    if (Math.abs(g[0] - bc[0]) > 1e-5 || Math.abs(g[1] - bc[2]) > 1e-5 || Math.abs(g[2] + bc[1]) > 1e-5) throw new Error(`vertex ${base + v}: Blender and GLB positions differ`);
    if (e.length > 4) throw new Error('more than 4 influences');
    const list = e.map(([nm, w]) => { const k = jointIndex[nm]; if (k === undefined) throw new Error('no joint ' + nm); return [k, w]; });
    const s = list.reduce((a, x) => a + x[1], 0);
    for (let c = 0; c < 4; c++) {
      bin[jo + v * 4 + c] = c < list.length ? list[c][0] : 0;
      bin.writeFloatLE(c < list.length ? list[c][1] / s : 0, wo + v * 16 + c * 4);
    }
    changed++;
  }
  base += ja.count;
}

// --- write ---
j.buffers[0].byteLength = bin.length;
let json = Buffer.from(JSON.stringify(j), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const out = Buffer.alloc(12 + 8 + json.length + 8 + binPad.length);
out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
out.writeUInt32LE(json.length, 12); out.writeUInt32LE(0x4e4f534a, 16); json.copy(out, 20);
out.writeUInt32LE(binPad.length, 20 + json.length); out.writeUInt32LE(0x004e4942, 24 + json.length); binPad.copy(out, 28 + json.length);
writeFileSync(outPath, out);
console.log(JSON.stringify({ out: outPath, joints: skin.joints.length, added, weightsChanged: changed, mb: +(out.length / 1e6).toFixed(2) }));
