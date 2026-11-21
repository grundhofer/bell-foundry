# Export a 1.8 m character GLB with feet at Y=0, facing +Z.
import bpy, sys, os, re, json, math, argparse
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='src', required=True)
ap.add_argument('--id', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--report')
ap.add_argument('--materials-from')
ap.add_argument('--proxy-src', help='the unrigged proxy FBX that was uploaded (reference for aligning the rigged one)')
ap.add_argument('--proxy', help='Mixamo-rigged proxy FBX (Original Pose); --in is then the static work .blend whose '
                                'meshes get the proxy\'s weights by Data Transfer')
ap.add_argument('--remove', action='append', default=[])
ap.add_argument('--rig', default='auto', choices=['auto', 'quaternius'])
ap.add_argument('--rotz', type=float, default=0.0)
ap.add_argument('--max-tris', type=int, default=60000)
ap.add_argument('--tex', type=int, default=2048)
ap.add_argument('--max-mb', type=float, default=15.0)
ap.add_argument('--height', type=float, default=1.8)
ap.add_argument('--build-textures', action='append', default=[],
                help='MATERIAL=base:PATH,normal:PATH,spec:PATH,ao:PATH — rebuild a material from image files '
                     '(ao is multiplied into the base colour)')
ap.add_argument('--basecolor', action='append', default=[],
                help='MATERIAL=IMAGE: base colour texture for a material whose import lost it')
ap.add_argument('--metallic', type=float, default=None,
                help='set Metallic on materials whose Metallic input has no texture (Phong-origin FBX: 0)')
a = ap.parse_args(argv)

SIDES = ('Left', 'Right')
REQUIRED = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End']
for s in SIDES:
    REQUIRED += [s + n for n in ('Shoulder', 'Arm', 'ForeArm', 'Hand',
                                 'HandIndex1', 'HandIndex2', 'HandIndex3', 'HandIndex4',
                                 'HandThumb1', 'HandThumb2', 'HandThumb3', 'HandThumb4',
                                 'UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End')]
MIXAMO_ALL = set(REQUIRED) | {'LeftEye', 'RightEye'}
for s in SIDES:
    for f in ('Middle', 'Ring', 'Pinky'):
        MIXAMO_ALL |= {f'{s}Hand{f}{i}' for i in range(1, 5)}
PREFIX = 'mixamorig:'
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
MODELS = os.path.abspath(os.environ.get('BF_MODELS', os.path.expanduser('~/Desktop/BellFoundry-Modelle')))
def shown(path):  # a path for the report: relative to the repo or to $BF_MODELS, never this machine's own
    path = os.path.abspath(path)
    for base, name in ((ROOT, ''), (MODELS, '$BF_MODELS/')):
        if path.startswith(base + os.sep):
            return name + os.path.relpath(path, base)
    return os.path.basename(path)
report = {'id': a.id, 'source': shown(a.src), 'warnings': []}
def warn(msg):
    print('WARNING', msg)
    report['warnings'].append(msg)

src = os.path.abspath(a.src)
ext = os.path.splitext(src)[1].lower()
if ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=src)
    elif ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=src)
    else:
        raise SystemExit('unknown format ' + ext)
scene = bpy.context.scene
vl = bpy.context.view_layer

if a.proxy:
    real = [o for o in scene.objects if o.type == 'MESH']
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(a.proxy))
    new = [o for o in bpy.data.objects if o not in before]
    p_arm = [o for o in new if o.type == 'ARMATURE'][0]
    p_meshes = [o for o in new if o.type == 'MESH' and len(o.data.polygons)]
    if len(p_meshes) > 1:
        with bpy.context.temp_override(active_object=p_meshes[0], object=p_meshes[0],
                                       selected_objects=p_meshes, selected_editable_objects=p_meshes):
            bpy.ops.object.join()
    p_mesh = p_meshes[0]
    vl.update()
    def wbbox(objs):
        dg = bpy.context.evaluated_depsgraph_get()
        lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
        for o in objs:
            ev = o.evaluated_get(dg)
            for v in ev.data.vertices:
                w = ev.matrix_world @ v.co
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        return lo, hi
    plo, phi = wbbox([p_mesh])
    if a.proxy_src:
        # Compare the proxy with the mesh sent to Mixamo.
        before2 = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=os.path.abspath(a.proxy_src))
        ref = [o for o in bpy.data.objects if o not in before2]
        rlo, rhi = wbbox([o for o in ref if o.type == 'MESH'])
        for o in ref:
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        rlo, rhi = wbbox(real)
    pd, rd = phi - plo, rhi - rlo
    report['proxy_bbox'] = [list(map(lambda x: round(x, 3), pd)), list(map(lambda x: round(x, 3), rd))]
    k = pd.z / rd.z
    if abs(pd.x / (rd.x * k) - 1) > 0.15 or abs(pd.y / (rd.y * k) - 1) > 0.25:
        raise SystemExit(f'proxy does not line up with the mesh (proxy {tuple(pd)}, mesh {tuple(rd)}): '
                         'was it downloaded in T-pose instead of Original Pose?')
    off = Vector(((plo.x + phi.x) / 2, (plo.y + phi.y) / 2, plo.z)) - k * Vector(((rlo.x + rhi.x) / 2, (rlo.y + rhi.y) / 2, rlo.z))
    A = Matrix.Translation(off) @ Matrix.Scale(k, 4)
    if abs(k - 1) < 0.02 and abs(off.z) < 0.02:
        report['proxy_alignment_ignored'] = [round(k, 4)] + [round(x, 4) for x in off]
        A = Matrix.Identity(4); k = 1.0; off = Vector()
    for o in real:
        o.data.transform(A @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    if abs(k - 1) > 0.01 or off.length > 0.01:
        warn(f'proxy alignment: scale {k:.4f}, offset {tuple(round(x, 4) for x in off)}')
    for o in real:
        for g in p_mesh.vertex_groups:
            if g.name not in o.vertex_groups:
                o.vertex_groups.new(name=g.name)
        m = o.modifiers.new('wt', 'DATA_TRANSFER')
        m.object = p_mesh
        m.use_vert_data = True
        m.data_types_verts = {'VGROUP_WEIGHTS'}
        m.vert_mapping = 'POLYINTERP_NEAREST'
        m.layers_vgroup_select_src = 'ALL'
        m.layers_vgroup_select_dst = 'NAME'
        with bpy.context.temp_override(active_object=o, object=o):
            bpy.ops.object.modifier_apply(modifier=m.name)
        for x in scene.objects:
            x.select_set(x == o)
        vl.objects.active = o
        with bpy.context.temp_override(active_object=o, object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
            bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
        mw = o.matrix_world.copy()
        o.parent = p_arm
        o.matrix_world = mw
        o.modifiers.new('Armature', 'ARMATURE').object = p_arm
    bpy.data.objects.remove(p_mesh, do_unlink=True)
    report['weights_from_proxy'] = shown(a.proxy)

def base_name(name):
    n = re.sub(r'_\d+$', '', name)
    n = re.sub(r'\.\d{3}$', '', n)
    if ':' in n:
        n = n.split(':')[-1]
    return n

QUAT = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2',
        'neck_01': 'Neck', 'head': 'Head', 'Head': 'Head'}
for sfx, side in (('l', 'Left'), ('r', 'Right')):
    QUAT.update({f'clavicle_{sfx}': side + 'Shoulder', f'upperarm_{sfx}': side + 'Arm',
                 f'lowerarm_{sfx}': side + 'ForeArm', f'hand_{sfx}': side + 'Hand',
                 f'thigh_{sfx}': side + 'UpLeg', f'calf_{sfx}': side + 'Leg',
                 f'foot_{sfx}': side + 'Foot', f'ball_{sfx}': side + 'ToeBase'})
    for fq, fm in (('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky'), ('thumb', 'Thumb')):
        for i in (1, 2, 3):
            QUAT[f'{fq}_0{i}_{sfx}'] = f'{side}Hand{fm}{i}'
            QUAT[f'{fq}_{i:02d}_{sfx}'] = f'{side}Hand{fm}{i}'
        QUAT[f'{fq}_04_leaf_{sfx}'] = f'{side}Hand{fm}4'
    QUAT[f'ball_leaf_{sfx}'] = side + 'Toe_End'

def target_name(name):
    if a.rig == 'quaternius':
        b = re.sub(r'\.\d{3}$', '', name)
        return PREFIX + QUAT[b] if b in QUAT else None
    b = base_name(name)
    return PREFIX + b if b in MIXAMO_ALL else None

arms = [o for o in scene.objects if o.type == 'ARMATURE']
if not arms:
    raise SystemExit('no armature in source')
arm = max(arms, key=lambda o: sum(1 for b in o.data.bones if target_name(b.name)))
report['source_armature'] = arm.name

rx = [re.compile(r) for r in a.remove]
def uses_arm(o):
    return any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers) or \
        (o.parent == arm)
meshes, removed = [], []
for o in list(scene.objects):
    if o.type != 'MESH' or len(o.data.polygons) == 0:
        continue
    names = [o.name] + ([o.parent.name] if o.parent else []) + [m.name for m in o.data.materials if m]
    if any(r.search(n) for r in rx for n in names):
        removed.append(o.name); continue
    if not o.visible_get() or o.hide_render:
        removed.append(o.name + ' (hidden)'); continue
    if not uses_arm(o):
        removed.append(o.name + ' (not on the armature)'); continue
    meshes.append(o)
report['removed_objects'] = removed
if not meshes:
    raise SystemExit('no skinned meshes found')

for o in list(bpy.data.objects):
    o.animation_data_clear()
    if o.type == 'MESH' and o.data.shape_keys:
        o.shape_key_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
vl.update()

for o in meshes:
    if o.parent == arm and o.parent_type == 'BONE' and o.parent_bone:
        vg = o.vertex_groups.get(o.parent_bone) or o.vertex_groups.new(name=o.parent_bone)
        vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
        if not any(m.type == 'ARMATURE' for m in o.modifiers):
            o.modifiers.new('Armature', 'ARMATURE').object = arm

R = Matrix.Rotation(math.radians(a.rotz), 4, 'Z')
mesh_world = {o.name: o.matrix_world.copy() for o in meshes}
arm_world = arm.matrix_world.copy()
for o in meshes:
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
    m = R @ mesh_world[o.name]
    if o.data.users > 1:
        o.data = o.data.copy()
    o.data.transform(m)
    if m.determinant() < 0:
        o.data.flip_normals()
arm.parent = None
arm.matrix_world = R @ arm_world

keep = {arm.name} | {o.name for o in meshes}
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for o in [arm] + meshes:
    if o.name not in scene.collection.objects:
        scene.collection.objects.link(o)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)

def apply_arm_transform():
    # Detach children so they do not inherit the transform twice.
    kids = [o for o in meshes if o.parent == arm]
    for o in kids:
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
    for o in scene.objects:
        o.select_set(o == arm)
    vl.objects.active = arm
    with bpy.context.temp_override(active_object=arm, object=arm, selected_objects=[arm],
                                   selected_editable_objects=[arm]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in kids:
        o.parent = arm
        o.matrix_parent_inverse = Matrix.Identity(4)
        o.matrix_basis = Matrix.Identity(4)

apply_arm_transform()

renamed, seen = {}, {}
for b in arm.data.bones:
    t = target_name(b.name)
    if t and t not in seen:
        seen[t] = b.name
for t, old in seen.items():
    if old != t:
        clash = arm.data.bones.get(t)
        if clash and clash.name != old:
            clash.name = clash.name + '_old'
        arm.data.bones[old].name = t
        renamed[old] = t
report['renamed_bones'] = len(renamed)

hb = arm.data.bones.get(PREFIX + 'Hips')
if hb is None:
    raise SystemExit('no Hips bone after renaming')
ancestors = [b.name for b in hb.parent_recursive]
if ancestors:
    for o in meshes:
        dst = o.vertex_groups.get(PREFIX + 'Hips') or o.vertex_groups.new(name=PREFIX + 'Hips')
        for an in ancestors:
            g = o.vertex_groups.get(an)
            if g is None:
                continue
            for v in o.data.vertices:
                for ge in v.groups:
                    if ge.group == g.index and ge.weight > 0:
                        dst.add([v.index], ge.weight, 'ADD')
            o.vertex_groups.remove(g)
    vl.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    eb[PREFIX + 'Hips'].parent = None
    for an in ancestors:
        for c in eb[an].children:
            if c.name != PREFIX + 'Hips':
                c.parent = None
        eb.remove(eb[an])
    bpy.ops.object.mode_set(mode='OBJECT')
    report['removed_root_bones'] = ancestors

def add_end_bone(name, parent, length_frac=0.5):
    bpy.ops.object.mode_set(mode='OBJECT')
    vl.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    p = eb.get(parent)
    if p is None or name in eb:
        bpy.ops.object.mode_set(mode='OBJECT'); return False
    nb = eb.new(name)
    d = p.tail - p.head
    nb.head = p.tail.copy()
    nb.tail = p.tail + d * length_frac
    nb.roll = p.roll
    nb.parent = p
    nb.use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return True

added = []
names = {b.name for b in arm.data.bones}
for child, parent in [('HeadTop_End', 'Head')] + \
        [(s + 'Toe_End', s + 'ToeBase') for s in SIDES] + \
        [(s + f'Hand{f}4', s + f'Hand{f}3') for s in SIDES for f in ('Index', 'Thumb', 'Middle', 'Ring', 'Pinky')]:
    if PREFIX + child not in names and PREFIX + parent in names:
        if add_end_bone(PREFIX + child, PREFIX + parent):
            added.append(child)
report['added_end_bones'] = added

# Mirror missing finger bones without adding skin weights.
def other(n):
    return n.replace('Left', '#').replace('Right', 'Left').replace('#', 'Right')
missing = [PREFIX + b for b in REQUIRED if PREFIX + b not in {x.name for x in arm.data.bones}]
mirrorable = [n for n in missing if other(n) in arm.data.bones]
if mirrorable:
    vl.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    mirrored = []
    for n in sorted(mirrorable, key=lambda n: len(eb[other(n)].parent_recursive)):
        src_b = eb[other(n)]
        nb = eb.new(n)
        nb.head = Vector((-src_b.head.x, src_b.head.y, src_b.head.z))
        nb.tail = Vector((-src_b.tail.x, src_b.tail.y, src_b.tail.z))
        nb.roll = -src_b.roll
        pn = other(src_b.parent.name) if src_b.parent else None
        nb.parent = eb.get(pn) if pn else None
        nb.use_deform = False
        mirrored.append(n[len(PREFIX):])
    bpy.ops.object.mode_set(mode='OBJECT')
    report['mirrored_bones'] = mirrored
    warn('mirrored (non-deforming) bones from the other side: ' + ', '.join(mirrored))
names = {b.name for b in arm.data.bones}
thumbless = [sd for sd in SIDES if PREFIX + sd + 'HandThumb1' not in names and PREFIX + sd + 'HandIndex1' in names]
if thumbless:
    vl.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for sd in thumbless:
        parent = eb[PREFIX + sd + 'Hand']
        for i in range(1, 5):
            src_b = eb.get(PREFIX + sd + f'HandIndex{i}')
            if src_b is None:
                break
            nb = eb.new(PREFIX + sd + f'HandThumb{i}')
            nb.head, nb.tail, nb.roll = src_b.head.copy(), src_b.tail.copy(), src_b.roll
            nb.parent = parent; nb.use_deform = False
            parent = nb
    bpy.ops.object.mode_set(mode='OBJECT')
    report['thumbs_copied_from_index'] = thumbless
    warn('no thumb bones: copied the index chain as non-deforming thumbs on ' + ', '.join(thumbless))
arm.name = 'Armature'
arm.data.name = 'Armature'

bone_names = {b.name for b in arm.data.bones}
for o in meshes:
    o.parent = arm
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.matrix_basis = Matrix.Identity(4)
    mods = [m for m in o.modifiers if m.type == 'ARMATURE']
    for m in mods[1:]:
        o.modifiers.remove(m)
    if mods:
        mods[0].object = arm
    else:
        o.modifiers.new('Armature', 'ARMATURE').object = arm
    for m in list(o.modifiers):
        if m.type != 'ARMATURE':
            warn(f'{o.name}: applying modifier {m.type}')
            with bpy.context.temp_override(active_object=o, object=o):
                bpy.ops.object.modifier_apply(modifier=m.name)
    for vg in list(o.vertex_groups):
        if vg.name not in bone_names:
            o.vertex_groups.remove(vg)

vl.update()
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in meshes:
    for v in o.data.vertices:
        lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
hips = arm.data.bones[PREFIX + 'Hips'].head_local
s = a.height / (hi.z - lo.z)
N = Matrix.Translation((-hips.x * s, -hips.y * s, -lo.z * s)) @ Matrix.Scale(s, 4)
for o in meshes:
    o.data.transform(N)
arm.matrix_world = N
apply_arm_transform()
report['scale_applied'] = s

def strip_dupe(n):
    return re.sub(r'\.\d{3}$', '', n)
if a.materials_from:
    with bpy.data.libraries.load(a.materials_from, link=False) as (src_d, dst_d):
        dst_d.materials = list(src_d.materials)
    lib = {}
    for m in dst_d.materials:
        if m:
            lib.setdefault(strip_dupe(m.name), m)
    restored, missing = [], []
    for o in meshes:
        for i, slot in enumerate(o.material_slots):
            cur = slot.material
            key = strip_dupe(cur.name) if cur else None
            if key in lib and lib[key] is not cur:
                o.data.materials[i] = lib[key]
                restored.append(key)
            elif cur is not None and key not in lib:
                missing.append(cur.name)
    report['materials_restored'] = sorted(set(restored))
    if missing:
        warn('materials not found in work blend: ' + ', '.join(sorted(set(missing))))

def tris_of(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)
total = sum(tris_of(o) for o in meshes)
report['tris_source'] = total
if total > a.max_tris:
    ratio = (a.max_tris * 0.97) / total
    for o in meshes:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
        # Apply decimation before the armature modifier.
        with bpy.context.temp_override(active_object=o, object=o):
            bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
            bpy.ops.object.modifier_apply(modifier=m.name)
    report['decimate_ratio'] = round(ratio, 4)
report['tris'] = sum(tris_of(o) for o in meshes)

if len(meshes) > 1:
    with bpy.context.temp_override(active_object=meshes[0], object=meshes[0],
                                   selected_objects=meshes, selected_editable_objects=meshes):
        bpy.ops.object.join()
    meshes = [meshes[0]]
meshes[0].name = a.id
meshes[0].data.name = a.id

used_mats = {m for o in meshes for m in o.data.materials if m}
def image_alpha_min(im):
    try:
        import numpy as np
        if im.channels < 4:
            return 1.0
        px = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        return float(px[3::4].min())
    except Exception:
        return 0.0
# Convert old Cycles materials to Principled BSDF so glTF keeps their color.
for m in used_mats:
    if not (m.use_nodes and m.node_tree) or any(n.type == 'BSDF_PRINCIPLED' for n in m.node_tree.nodes):
        continue
    nt = m.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) or \
        next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    diff = next((n for n in nt.nodes if n.type == 'BSDF_DIFFUSE'), None)
    gloss = next((n for n in nt.nodes if n.type == 'BSDF_GLOSSY'), None)
    src = diff or gloss
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    col_in = src.inputs['Color'] if src else None
    if col_in is not None and col_in.is_linked:
        nt.links.new(col_in.links[0].from_socket, bsdf.inputs['Base Color'])
    elif col_in is not None:
        bsdf.inputs['Base Color'].default_value = col_in.default_value
    else:
        bsdf.inputs['Base Color'].default_value = m.diffuse_color
    if diff is None and gloss is not None:
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = max(0.25, gloss.inputs['Roughness'].default_value)
        if not (col_in and col_in.is_linked):
            bsdf.inputs['Base Color'].default_value = m.diffuse_color
    else:
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = gloss.inputs['Roughness'].default_value if gloss else 0.7
    if out is None:
        out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    report.setdefault('legacy_materials_converted', []).append(m.name)
if report.get('legacy_materials_converted'):
    warn('old node materials rebuilt as Principled BSDF: ' + ', '.join(report['legacy_materials_converted']))

for spec in a.build_textures:
    mname, parts = spec.split('=', 1)
    files = dict(x.split(':', 1) for x in parts.split(','))
    for m in used_mats:
        if strip_dupe(m.name) != mname:
            continue
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = 0.7
        def tex(path, colour=True):
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = bpy.data.images.load(os.path.abspath(path))
            if not colour:
                t.image.colorspace_settings.name = 'Non-Color'
            return t
        if 'base' in files:
            t = tex(files['base'])
            if 'ao' in files:
                import numpy as np
                ao_im = bpy.data.images.load(os.path.abspath(files['ao']))
                w, h = t.image.size
                if tuple(ao_im.size) != (w, h):
                    ao_im.scale(w, h)
                bp = np.empty(w * h * 4, dtype=np.float32); t.image.pixels.foreach_get(bp)
                ap_ = np.empty(w * h * 4, dtype=np.float32); ao_im.pixels.foreach_get(ap_)
                for c in range(3):
                    bp[c::4] *= ap_[0::4]
                img = bpy.data.images.new(m.name + '_base_ao', w, h)
                img.pixels.foreach_set(bp)
                t.image = img
            t.image.pack()
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if 'normal' in files:
            t = tex(files['normal'], False); t.image.pack()
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(t.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        if 'spec' in files:
            t = tex(files['spec'], False); t.image.pack()
            nt.links.new(t.outputs['Color'], bsdf.inputs['Specular IOR Level'])
        set_opaque(m) if 'set_opaque' in globals() else None
        report.setdefault('materials_built', []).append(f'{m.name}: ' + ', '.join(sorted(files)))

for spec in a.basecolor:
    mname, path = spec.split('=', 1)
    for m in used_mats:
        if strip_dupe(m.name) != mname or not m.use_nodes:
            continue
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        if bsdf.inputs['Base Color'].is_linked:
            warn(f'{m.name}: base colour already has a texture, --basecolor ignored')
            continue
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(os.path.abspath(path))
        tex.image.pack()
        m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        report.setdefault('basecolor_added', []).append(f'{m.name} <- {os.path.basename(path)}')

def set_opaque(m):
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'DITHERED'
    try:
        m.blend_method = 'OPAQUE'
    except Exception:
        pass

def combine_alpha(m, bsdf, base_node, mask_node, mask_socket):
    """glTF keeps alpha only in the base colour texture's A channel: bake the separate mask into it."""
    import numpy as np
    mask_im = mask_node.image
    w, h = mask_im.size
    mp = np.empty(w * h * 4, dtype=np.float32); mask_im.pixels.foreach_get(mp)
    mask = mp[3::4] if mask_socket == 'Alpha' else mp[0::4]
    if base_node is not None:
        bim = base_node.image
        if tuple(bim.size) != (w, h):
            bim = bim.copy(); bim.scale(w, h)
        bp = np.empty(w * h * 4, dtype=np.float32); bim.pixels.foreach_get(bp)
    else:
        c = bsdf.inputs['Base Color'].default_value
        bp = np.tile(np.array(c, dtype=np.float32), w * h)
    bp[3::4] = mask
    img = bpy.data.images.new(m.name + '_rgba', w, h, alpha=True)
    img.pixels.foreach_set(bp)
    img.pack()
    node = base_node or m.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    m.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    m.node_tree.links.new(node.outputs['Alpha'], bsdf.inputs['Alpha'])
    if mask_node is not node:
        m.node_tree.nodes.remove(mask_node)
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'DITHERED'
    try:
        m.blend_method = 'CLIP'
    except Exception:
        pass
    warn(f'{m.name}: separate alpha mask baked into the base colour alpha')

for m in used_mats:
    if not (m.use_nodes and m.node_tree):
        continue
    for n in [x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED']:
        al = n.inputs['Alpha']
        bl = n.inputs['Base Color'].links
        base_node = bl[0].from_node if bl and bl[0].from_node.type == 'TEX_IMAGE' else None
        for l in list(al.links):
            src = l.from_node
            if src.type != 'TEX_IMAGE' or not src.image:
                continue
            same = base_node is not None and (src.image == base_node.image or
                                              strip_dupe(src.image.name) == strip_dupe(base_node.image.name))
            sock = l.from_socket.name
            if sock == 'Alpha' and image_alpha_min(src.image) > 0.98:
                if same:
                    m.node_tree.links.remove(l)
                    al.default_value = 1.0
                    set_opaque(m)
                    warn(f'{m.name}: alpha channel is opaque, exported as OPAQUE')
                    continue
                sock = 'Color'
            if not (same and sock == 'Alpha'):
                combine_alpha(m, n, base_node, src, sock)

used_images = set()
for m in used_mats:
    if m.use_nodes and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                used_images.add(n.image)

def limit_textures(px):
    for im in used_images:
        w, h = im.size
        if max(w, h) > px:
            f = px / max(w, h)
            im.scale(max(1, round(w * f)), max(1, round(h * f)))

def export(path):
    for o in scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_animations=False,
        export_skins=True, export_morph=False, export_cameras=False, export_lights=False,
        export_extras=False, export_def_bones=False, export_image_format='WEBP',
        export_image_quality=85, export_materials='EXPORT')
    return os.path.getsize(path) / 1e6

os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
limit_textures(a.tex)
mb = export(a.out)
tex_px = a.tex
if mb > a.max_mb and a.tex > 1024:
    warn(f'{mb:.1f} MB at {a.tex}px textures -> re-export with 1024px')
    limit_textures(1024)
    tex_px = 1024
    mb = export(a.out)
if mb > a.max_mb:
    warn(f'file is still {mb:.1f} MB')

names = {b.name for b in arm.data.bones}
report.update({
    'out': shown(a.out),
    'file_mb': round(mb, 2),
    'texture_limit': tex_px,
    'textures': sorted({f'{im.name} {im.size[0]}x{im.size[1]}' for im in used_images}),
    'materials': sorted(m.name for m in used_mats),
    'bones': len(arm.data.bones),
    'missing_required_bones': [b for b in REQUIRED if PREFIX + b not in names],
    'extra_bones': sorted(n for n in names if n[len(PREFIX):] not in MIXAMO_ALL),
    'meshes': [o.name for o in meshes],
})
if report['missing_required_bones']:
    warn('missing required bones: ' + ', '.join(report['missing_required_bones']))
if a.report:
    with open(a.report, 'w') as f:
        json.dump(report, f, indent=1)
print('GAME_RESULT', json.dumps({k: report[k] for k in ('id', 'tris', 'file_mb', 'bones', 'missing_required_bones', 'texture_limit')}))
