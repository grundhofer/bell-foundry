# Shared: load GLB, build skin-island graph of one hand. Imported by other scripts via exec.
import bpy, sys, bmesh, heapq, numpy as np
from mathutils import Vector
from collections import defaultdict
P = 'mixamorig:'
def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    arm = [o for o in bpy.data.objects if o.type=='ARMATURE'][0]
    me = [o for o in bpy.data.objects if o.type=='MESH'][0]
    return arm, me
def hand_graph(arm, me, side):
    gi = {g.index: g.name for g in me.vertex_groups}
    V = me.data.vertices
    co = np.array([v.co[:] for v in V])
    hw = np.array([sum(g.weight for g in v.groups if side+'Hand' in gi[g.group]) for v in V])
    mat = np.zeros(len(V), int)
    for p in me.data.polygons:
        for i in p.vertices: mat[i] = p.material_index
    # merge coincident
    key, rep = {}, np.arange(len(V))
    for i, c in enumerate(co):
        k = tuple(np.round(c, 5))
        if k in key: rep[i] = key[k]
        else: key[k] = i
    adj = defaultdict(set)
    for e in me.data.edges:
        a, b = rep[e.vertices[0]], rep[e.vertices[1]]
        if a != b: adj[a].add(b); adj[b].add(a)
    return dict(co=co, hw=hw, mat=mat, rep=rep, adj=adj, gi=gi)
def dijkstra(G, sources, allowed):
    co, adj = G['co'], G['adj']
    d = {s: 0.0 for s in sources}; h = [(0.0, s) for s in sources]; heapq.heapify(h)
    while h:
        dd, u = heapq.heappop(h)
        if dd > d.get(u, 1e9): continue
        for w in adj[u]:
            if w not in allowed: continue
            nd = dd + float(np.linalg.norm(co[u]-co[w]))
            if nd < d.get(w, 1e9): d[w] = nd; heapq.heappush(h, (nd, w))
    return d
