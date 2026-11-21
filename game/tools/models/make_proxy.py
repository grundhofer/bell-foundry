# Usage: blender -b -P make_proxy.py -- IN.fbx OUT.fbx [voxel_m] [tris] [solidify_m]
import bpy, sys, os
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
voxel = float(args[2]) if len(args) > 2 else 0.01
target = int(args[3]) if len(args) > 3 else 20000
solid = float(args[4]) if len(args) > 4 else 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if len(obs) > 1:
    with bpy.context.temp_override(active_object=obs[0], object=obs[0], selected_objects=obs, selected_editable_objects=obs):
        bpy.ops.object.join()
o = obs[0]
# Bake transforms so the voxel size is in meters.
mw = o.matrix_world.copy()
o.data.transform(mw)
o.matrix_world.identity()
if solid > 0:
    sm = o.modifiers.new('solid', 'SOLIDIFY'); sm.thickness = solid; sm.offset = 0.0
    with bpy.context.temp_override(active_object=o, object=o):
        bpy.ops.object.modifier_apply(modifier=sm.name)
m = o.modifiers.new('remesh', 'REMESH')
m.mode = 'VOXEL'; m.voxel_size = voxel; m.adaptivity = 0.0
with bpy.context.temp_override(active_object=o, object=o):
    bpy.ops.object.modifier_apply(modifier=m.name)
tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
if tris > target:
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = target / tris; d.use_collapse_triangulate = True
    with bpy.context.temp_override(active_object=o, object=o):
        bpy.ops.object.modifier_apply(modifier=d.name)
o.data.materials.clear()
o.data.materials.append(bpy.data.materials.new('proxy'))
o.name = o.data.name = os.path.splitext(os.path.basename(out))[0]
import bmesh
bm = bmesh.new(); bm.from_mesh(o.data)
bm.verts.ensure_lookup_table()
seen, islands = set(), []
for v in bm.verts:
    if v.index in seen: continue
    stack, isl = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop(); isl.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index); stack.append(y)
    islands.append(isl)
islands.sort(key=len, reverse=True)
dropped = sum(len(i) for i in islands[1:])
if len(islands) > 1:
    bmesh.ops.delete(bm, geom=[v for isl in islands[1:] for v in isl], context='VERTS')
bm.to_mesh(o.data); bm.free()
for x in bpy.context.scene.objects:
    x.select_set(x == o)
bpy.context.view_layer.objects.active = o
bpy.ops.export_scene.fbx(filepath=out, use_selection=True, object_types={'MESH'}, path_mode='STRIP',
                         mesh_smooth_type='FACE', add_leaf_bones=False, bake_anim=False)
print('PROXY', out, 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons), 'islands', len(islands),
      'dropped_verts', dropped, 'MB', round(os.path.getsize(out) / 1e6, 2))
