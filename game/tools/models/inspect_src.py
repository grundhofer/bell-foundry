# Usage: blender -b -P inspect_src.py -- MODEL
import bpy, sys, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
path = args[0]
ext = os.path.splitext(path)[1].lower()
if ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
dg = bpy.context.evaluated_depsgraph_get()
lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
total = 0
print('=== ', path)
for o in bpy.data.objects:
    line = f'{o.type:9s} {o.name!r} parent={o.parent.name if o.parent else None!r} pb={o.parent_bone!r} hide={o.hide_get() if o.name in bpy.context.view_layer.objects else "n/a"}/{o.hide_render} scale={tuple(round(s,3) for s in o.scale)}'
    if o.type == 'MESH':
        me = o.data
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        total += tris
        mods = [(m.type, getattr(m, 'object', None) and m.object.name) for m in o.modifiers]
        line += f' tris={tris} verts={len(me.vertices)} mats={[m.name if m else None for m in me.materials]} vgroups={len(o.vertex_groups)} mods={mods}'
        if o.name in bpy.context.view_layer.objects:
            ev = o.evaluated_get(dg)
            for c in ev.bound_box:
                w = ev.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
            d = ev.dimensions
            line += f' dims={tuple(round(x,3) for x in (ev.matrix_world.to_scale()[0]*d.x, d.y, d.z))}'
    if o.type == 'ARMATURE':
        bones = [b.name for b in o.data.bones]
        line += f' bones={len(bones)} first={bones[:40]} pose_pos={o.data.pose_position}'
    print(line)
print('total tris', total, 'bbox', tuple(round(x,3) for x in lo), tuple(round(x,3) for x in hi))
for im in bpy.data.images:
    print('IMG', im.name, tuple(im.size), im.filepath[:80], 'packed' if im.packed_file else '')
print('ACTIONS', [a.name for a in bpy.data.actions][:20])
