# Export a geometry-only FBX for rigging and a .blend with materials for later.
import bpy, sys, os, re, json, math, argparse
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='src', required=True)
ap.add_argument('--id', required=True)
ap.add_argument('--outdir', required=True)
ap.add_argument('--workdir', required=True)
ap.add_argument('--remove', action='append', default=[], help='regex on object or material name')
ap.add_argument('--pose', default='rest', choices=['rest', 'pose'])
ap.add_argument('--rotz', type=float, default=0.0)
ap.add_argument('--rotx', type=float, default=0.0)
ap.add_argument('--drop-detached', action='store_true',
                help='drop loose parts whose bbox does not touch the main body cluster (props laid out beside the model)')
ap.add_argument('--target-tris', type=int, default=40000)
ap.add_argument('--max-tris', type=int, default=45000)
ap.add_argument('--height', type=float, default=1.8)
ap.add_argument('--cut-capsule', action='append', default=[],
                help='x1,y1,z1,x2,y2,z2,radius,zmin in the final (1.8 m, centred) frame: delete faces whose centre '
                     'is within radius of that segment and above zmin (a weapon fused into the mesh)')
a = ap.parse_args(argv)

src = os.path.abspath(a.src)
ext = os.path.splitext(src)[1].lower()
if ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=src)
    else:
        raise SystemExit('unknown format ' + ext)

scene = bpy.context.scene
vl = bpy.context.view_layer
log = {'id': a.id, 'source': src, 'removed': [], 'kept': [], 'skipped_hidden': []}

for ob in bpy.data.objects:
    if ob.type == 'ARMATURE':
        ob.data.pose_position = 'REST' if a.pose == 'rest' else 'POSE'
    if a.pose == 'rest' and ob.animation_data:
        ob.animation_data.action = None
scene.frame_set(scene.frame_start)
vl.update()
dg = bpy.context.evaluated_depsgraph_get()

rx = [re.compile(r) for r in a.remove]
def removed(ob):
    names = [ob.name] + ([ob.parent.name] if ob.parent else []) + \
            [m.name for m in ob.data.materials if m]
    return any(r.search(n) for r in rx for n in names)

new_objs = []
for ob in list(scene.objects):
    if ob.type != 'MESH' or len(ob.data.polygons) == 0:
        continue
    if ob.name.startswith('WGT-'):
        continue
    if not ob.visible_get() or ob.hide_render:
        log['skipped_hidden'].append(ob.name)
        continue
    if removed(ob):
        log['removed'].append(ob.name)
        continue
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    if len(me.polygons) == 0:
        log['skipped_hidden'].append(ob.name + ' (empty after modifiers)')
        continue
    me.transform(ob.matrix_world)
    if ob.matrix_world.determinant() < 0:
        me.flip_normals()
    for i, slot in enumerate(ob.material_slots):
        if slot.link == 'OBJECT' and i < len(me.materials):
            me.materials[i] = slot.material
    nob = bpy.data.objects.new(ob.name + '_static', me)
    new_objs.append(nob)
    log['kept'].append(ob.name)

if not new_objs:
    raise SystemExit('nothing left to export')

keep = set(o.name for o in new_objs)
for ob in list(bpy.data.objects):
    if ob.name not in keep:
        bpy.data.objects.remove(ob, do_unlink=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
for ob in new_objs:
    scene.collection.objects.link(ob)
    ob.vertex_groups.clear()
    ob.shape_key_clear()

main = new_objs[0]
if len(new_objs) > 1:
    with bpy.context.temp_override(active_object=main, object=main,
                                   selected_objects=new_objs, selected_editable_objects=new_objs):
        bpy.ops.object.join()
main.name = a.id
main.data.name = a.id
me = main.data

if a.drop_detached:
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    parent = list(range(len(bm.verts)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for e in bm.edges:
        x, y = find(e.verts[0].index), find(e.verts[1].index)
        if x != y: parent[x] = y
    parts = {}
    for v in bm.verts:
        r = find(v.index)
        b = parts.setdefault(r, [Vector(v.co), Vector(v.co), 0])
        b[0] = Vector(map(min, b[0], v.co)); b[1] = Vector(map(max, b[1], v.co)); b[2] += 1
    big = max(parts, key=lambda k: parts[k][2])
    clo, chi = parts[big][0].copy(), parts[big][1].copy()
    inside = {big}
    changed = True
    while changed:
        changed = False
        for k, (plo, phi, n) in parts.items():
            if k in inside: continue
            if all(plo[i] <= chi[i] and phi[i] >= clo[i] for i in range(3)):
                inside.add(k); changed = True
                clo = Vector(map(min, clo, plo)); chi = Vector(map(max, chi, phi))
    drop = [v for v in bm.verts if find(v.index) not in inside]
    log['dropped_detached_parts'] = [
        {'verts': parts[k][2], 'center': [round(c, 3) for c in (parts[k][0] + parts[k][1]) / 2]}
        for k in parts if k not in inside]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    bm.to_mesh(me); bm.free()

if a.rotx:
    me.transform(Matrix.Rotation(math.radians(a.rotx), 4, 'X'))
if a.rotz:
    me.transform(Matrix.Rotation(math.radians(a.rotz), 4, 'Z'))
co = [v.co for v in me.vertices]
lo = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co)))
hi = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
s = a.height / (hi.z - lo.z)
me.transform(Matrix.Translation((0, 0, 0)) @ Matrix.Scale(s, 4) @
             Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
log['scale_factor'] = s
log['dims_after'] = [round((hi.x - lo.x) * s, 3), round((hi.y - lo.y) * s, 3), a.height]

if a.cut_capsule:
    import bmesh
    from mathutils.geometry import intersect_point_line
    bm = bmesh.new(); bm.from_mesh(me)
    cut = []
    for spec in a.cut_capsule:
        x1, y1, z1, x2, y2, z2, r, zmin = map(float, spec.split(','))
        p1, p2 = Vector((x1, y1, z1)), Vector((x2, y2, z2))
        for f in bm.faces:
            c = f.calc_center_median()
            if c.z < zmin:
                continue
            q, t = intersect_point_line(c, p1, p2)
            t = min(1.0, max(0.0, t))
            if (c - (p1 + (p2 - p1) * t)).length < r:
                cut.append(f)
    cut = list(set(cut))
    log['cut_faces'] = len(cut)
    bmesh.ops.delete(bm, geom=cut, context='FACES')
    bm.to_mesh(me); bm.free()

def tris(m):
    return sum(len(p.vertices) - 2 for p in m.polygons)

log['tris_before'] = tris(me)
log['decimate_ratio'] = 1.0
if log['tris_before'] > a.max_tris:
    ratio = a.target_tris / log['tris_before']
    mod = main.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    with bpy.context.temp_override(active_object=main, object=main):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    log['decimate_ratio'] = round(ratio, 4)
me = main.data
log['tris'] = tris(me)
log['materials'] = [m.name if m else None for m in me.materials]

def img_info(node):
    im = node.image
    return {'image': im.name, 'size': list(im.size), 'filepath': im.filepath, 'packed': bool(im.packed_file)} if im else None

mats = {}
for m in me.materials:
    if not m:
        continue
    info = {'textures': []}
    if m.use_nodes and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                links = [f'{l.to_node.name}.{l.to_socket.name}' for o in n.outputs for l in o.links]
                d = img_info(n); d['node'] = n.name; d['feeds'] = links
                info['textures'].append(d)
            if n.type == 'BSDF_PRINCIPLED':
                bc = n.inputs['Base Color'].default_value
                info['base_color'] = [round(x, 4) for x in bc]
                info['metallic'] = round(n.inputs['Metallic'].default_value, 4)
                info['roughness'] = round(n.inputs['Roughness'].default_value, 4)
    info['blend_method'] = getattr(m, 'surface_render_method', None)
    mats[m.name] = info

os.makedirs(a.outdir, exist_ok=True)
os.makedirs(a.workdir, exist_ok=True)
work_blend = os.path.join(a.workdir, a.id + '.blend')
log['work_blend'] = work_blend
log['note'] = ('Restore materials after Mixamo: append bpy.data.materials by name from work_blend '
               '(images are packed there at source resolution).')
log['material_info'] = mats

side = main.copy()
side.rotation_euler = (0, 0, math.radians(90))
side.location = (1.25, 0, 0)
scene.collection.objects.link(side)
cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.9
cam = bpy.data.objects.new('cam', cam_data)
cam.location = (0.62, -10, 0.92)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(a.outdir, a.id + '.png')
bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(side, do_unlink=True)
bpy.data.objects.remove(cam, do_unlink=True)

try:
    bpy.ops.file.pack_all()
except Exception as e:
    log['pack_warning'] = str(e)
bpy.ops.wm.save_as_mainfile(filepath=work_blend, compress=True)

for m in me.materials:
    if m and m.use_nodes and m.node_tree:
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE':
                m.node_tree.nodes.remove(n)
fbx = os.path.join(a.outdir, a.id + '.fbx')
for ob in scene.objects:
    ob.select_set(ob == main)
vl.objects.active = main
bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True, object_types={'MESH'},
                         path_mode='STRIP', embed_textures=False, mesh_smooth_type='FACE',
                         add_leaf_bones=False, bake_anim=False)
log['fbx'] = fbx
log['fbx_mb'] = round(os.path.getsize(fbx) / 1e6, 2)
with open(os.path.join(a.outdir, a.id + '.materials.json'), 'w') as f:
    json.dump(log, f, indent=1)
print('UPLOAD_RESULT', json.dumps({k: log[k] for k in ('id', 'tris_before', 'tris', 'decimate_ratio', 'fbx_mb', 'removed', 'kept', 'dims_after')}))
