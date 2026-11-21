# Usage: blender -b -P quaternius_assemble.py -- OUTFIT.gltf BASE.gltf OUT.blend
import bpy, sys
outfit, base, out = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=outfit)
arm = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE'][0]
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=base)
new = [o for o in bpy.data.objects if o not in before]
arm_b = [o for o in new if o.type == 'ARMATURE'][0]
HEAD = {'Head', 'neck_01'}
for o in new:
    if o.type != 'MESH' or o.parent != arm_b:
        continue
    if o.name.startswith('SuperHero') or o.name.startswith('Superhero'):
        idx = {g.index: g.name for g in o.vertex_groups}
        def head_weight(v):
            tot = sum(g.weight for g in v.groups) or 1
            return sum(g.weight for g in v.groups if idx.get(g.group) in HEAD) / tot
        hv = [head_weight(v) > 0.5 for v in o.data.vertices]
        import bmesh
        bm = bmesh.new(); bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        drop = [f for f in bm.faces if not all(hv[v.index] for v in f.verts)]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        bm.to_mesh(o.data); bm.free()
    mw = o.matrix_world.copy()
    o.parent = arm
    o.matrix_world = mw
    for m in o.modifiers:
        if m.type == 'ARMATURE':
            m.object = arm
for o in new:
    if o.type == 'ARMATURE' or (o.type == 'MESH' and o.parent is None):
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.parent is None:
        bpy.data.objects.remove(o, do_unlink=True)
# Drop references to normal maps missing from the pack.
for m in bpy.data.materials:
    if m.use_nodes and m.node_tree:
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] == 0:
                print('MISSING TEXTURE dropped:', m.name, n.image.filepath)
                m.node_tree.nodes.remove(n)
for im in list(bpy.data.images):
    if im.users == 0 or im.size[0] == 0:
        bpy.data.images.remove(im)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('ASSEMBLED', [o.name for o in bpy.data.objects])
