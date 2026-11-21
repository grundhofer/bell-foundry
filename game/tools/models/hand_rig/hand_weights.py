# Finger weights for a refitted hand rig (Blender, background).
# blender -b --factory-startup --disable-autoexec -P hand_weights.py -- IN.glb JOINTS.json OUT.json
# JOINTS.json: {"RightHandIndex1": [x, y, z], ...} in Blender coordinates (Z up) of the imported GLB, for
# Index/Middle/Ring/Pinky/Thumb 1-4 of each side. Vertices that carry hand weights now keep their total hand share
# (wrist blend with the forearm untouched); only its split between the hand and the finger bones is recomputed by
# bone heat on the bare-skin hand, smoothed across the mesh's split seams; bandages take the nearest skin's split.
# OUT.json: {"verts": {blender_vertex_index: [[bone, weight], ...]}, "stats": {...}}
import bpy, bmesh, sys, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
src, joints_path, out_path = argv[:3]
P = 'mixamorig:'
FINGERS = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')
J = {k: Vector(v) for k, v in json.load(open(joints_path)).items()}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
me = [o for o in bpy.data.objects if o.type == 'MESH'][0]
vl = bpy.context.view_layer
sides = [s for s in ('Left', 'Right') if s + 'HandIndex1' in J]

# Bones at the measured joints (heads/tails only matter for the heat solve).
vl.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for s in sides:
    hand = eb[P + s + 'Hand']
    hand.tail = J[s + 'HandMiddle1']
    for fn in FINGERS:
        parent = hand
        for k in range(1, 5):
            name = P + s + 'Hand' + fn + str(k)
            b = eb.get(name) or eb.new(name)
            b.use_connect = False
            b.parent = parent
            b.head = J[s + 'Hand' + fn + str(k)]
            b.tail = J[s + 'Hand' + fn + str(k + 1)] if k < 4 else \
                b.head + (J[s + 'Hand' + fn + '4'] - J[s + 'Hand' + fn + '3']) * 0.5
            b.use_deform = k < 4
            parent = b
bpy.ops.object.mode_set(mode='OBJECT')

gi = {g.index: g.name for g in me.vertex_groups}
V = me.data.vertices
co = np.array([v.co[:] for v in V])
mat_body = [i for i, m in enumerate(me.data.materials) if m and m.name.startswith('Body')][0]
result, stats, where = {}, {}, {}

for s in sides:
    hand_set = {P + s + 'Hand'} | {P + s + 'Hand' + fn + str(k) for fn in FINGERS for k in range(1, 5)}
    H = np.zeros(len(V))
    for v in V:
        H[v.index] = sum(g.weight for g in v.groups if gi[g.group] in hand_set)
    region = np.where(H > 1e-4)[0]
    # Temporary bare-skin hand mesh, coincident vertices merged.
    tmp_me = me.data.copy()
    tmp = bpy.data.objects.new('tmp_' + s, tmp_me)
    bpy.context.scene.collection.objects.link(tmp)
    tmp.vertex_groups.clear()
    bm = bmesh.new(); bm.from_mesh(tmp_me); bm.verts.ensure_lookup_table()
    keep = np.zeros(len(V), bool); keep[region] = True
    kill = [f for f in bm.faces if f.material_index != mat_body or not all(keep[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
    bm.to_mesh(tmp_me); bm.free()
    # Deform only this hand's bones.
    saved = {b.name: b.use_deform for b in arm.data.bones}
    for b in arm.data.bones:
        b.use_deform = b.name in hand_set and not b.name.endswith('4')
    for o in bpy.context.scene.objects:
        o.select_set(o in (tmp, arm))
    vl.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for b in arm.data.bones:
        b.use_deform = saved[b.name]
    tv = tmp_me.vertices
    tco = np.array([v.co[:] for v in tv])
    names = sorted(n for n in hand_set if not n.endswith('4'))
    col = {n: i for i, n in enumerate(names)}
    W = np.zeros((len(tv), len(names)))
    tgi = {g.index: g.name for g in tmp.vertex_groups}
    for v in tv:
        for g in v.groups:
            n = tgi[g.group]
            if n in col:
                W[v.index, col[n]] = g.weight
    failed = int((W.sum(1) < 1e-6).sum())
    # Neighbours: mesh edges plus links across split seams (vertices closer than 1.5 mm).
    nb = [set() for _ in range(len(tv))]
    for e in tmp_me.edges:
        a, b = e.vertices
        nb[a].add(b); nb[b].add(a)
    from mathutils.kdtree import KDTree
    kd = KDTree(len(tv))
    for i, c in enumerate(tco):
        kd.insert(c, i)
    kd.balance()
    for i, c in enumerate(tco):
        for _, j, d in kd.find_range(c, 0.0015):
            if j != i:
                nb[i].add(j); nb[j].add(i)
    # Vertices with no heat solution take their neighbours' weights first.
    for _ in range(30):
        empty = np.where(W.sum(1) < 1e-6)[0]
        if not len(empty):
            break
        for i in empty:
            ws = [W[j] for j in nb[i] if W[j].sum() > 1e-6]
            if ws:
                W[i] = np.mean(ws, 0)
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    for _ in range(3):
        W2 = W.copy()
        for i in range(len(tv)):
            if nb[i]:
                W2[i] = 0.5 * W[i] + 0.5 * np.mean([W[j] for j in nb[i]], 0)
        W = W2
    # Map back to every region vertex (skin and bandages) through the nearest skin triangle.
    tris = []
    for p in tmp_me.polygons:
        vs = list(p.vertices)
        for k in range(1, len(vs) - 1):
            tris.append((vs[0], vs[k], vs[k + 1]))
    bvh = BVHTree.FromPolygons([Vector(c) for c in tco], tris)
    far = 0
    for vi in region:
        p = Vector(co[vi])
        loc, nrm, ti, dist = bvh.find_nearest(p)
        a, b, c = (Vector(tco[k]) for k in tris[ti])
        # barycentric
        v0, v1, v2 = b - a, c - a, loc - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-18:
            bw = (1 / 3, 1 / 3, 1 / 3)
        else:
            y = (d11 * d20 - d01 * d21) / den; z = (d00 * d21 - d01 * d20) / den
            bw = (1 - y - z, y, z)
        w = sum(bw[k] * W[tris[ti][k]] for k in range(3))
        if dist > 0.03:
            far += 1
        w = np.maximum(w, 0); w /= max(w.sum(), 1e-9)
        others = [(gi[g.group], g.weight) for g in V[vi].groups if gi[g.group] not in hand_set and g.weight > 0]
        room = max(1, 4 - len(others))
        hw = sorted(((names[k], float(w[k])) for k in range(len(names)) if w[k] > 0.01), key=lambda x: -x[1])[:room]
        tot = sum(x[1] for x in hw)
        hw = [(n, x / tot * H[vi]) for n, x in hw]
        allw = others + hw
        t = sum(x[1] for x in allw)
        result[int(vi)] = [[n[len(P):], round(x / t, 6)] for n, x in allw]
        where[int(vi)] = [round(float(x), 6) for x in co[vi]]
    stats[s] = dict(region=int(len(region)), skin_verts=len(tv), heat_failed=failed, far_from_skin=far,
                    finger_weight={n[len(P):]: round(float(sum(dict(result[int(v)]).get(n[len(P):], 0) for v in region)), 1) for n in names})
    bpy.data.objects.remove(tmp, do_unlink=True)

json.dump({'verts': result, 'co': where, 'stats': stats, 'nverts': len(V)}, open(out_path, 'w'))
print('HAND_WEIGHTS', json.dumps(stats))
