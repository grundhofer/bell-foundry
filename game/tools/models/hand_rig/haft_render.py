# Close one hand of a character GLB round a haft-sized cylinder in the palm and render it (Blender, background).
# blender -b --factory-startup --disable-autoexec -P haft_render.py -- IN.glb OUTPREFIX SIDE JOINTS_REF.json [haft_radius]
# JOINTS_REF.json: measured joints (fixes the haft and camera so before/after renders match).
# Each finger chain turns about the haft axis joint by joint until its next joint would enter the haft.
import bpy, bmesh, sys, json, math
from mathutils import Vector, Matrix, Quaternion
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, side, ref = argv[:4]
RH = float(argv[4]) if len(argv) > 4 else 0.041
RF = RH + 0.009   # finger centre line rides this far from the haft axis
P = 'mixamorig:'
R = {k: Vector(v) for k, v in json.load(open(ref)).items()}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
me = [o for o in bpy.data.objects if o.type == 'MESH'][0]
wrist = arm.data.bones[P + side + 'Hand'].head_local.copy()
m1, tip = R[side + 'HandMiddle1'], R[side + 'HandMiddle4']
fwd = (m1 - wrist).normalized()
across = (R[side + 'HandIndex1'] - R[side + 'HandPinky1']).normalized()
d = (R[side + 'HandMiddle2'] - m1).normalized()
palm = (tip - m1) - d * (tip - m1).dot(d); palm.normalize()
palm = (palm - fwd * palm.dot(fwd)).normalized()
A = (across - fwd * across.dot(fwd)).normalized()
# palm skin depth below the knuckle line
M = (R[side + 'HandIndex1'] + R[side + 'HandPinky1']) * 0.5
depth = 0.0
for v in me.data.vertices:
    q = v.co - M
    if q.length < 0.06 and abs(q.dot(fwd) + 0.01) < 0.015 and abs(q.dot(A)) < 0.03:
        depth = max(depth, q.dot(palm))
C = M - fwd * 0.01 + palm * (min(depth, 0.022) + RH)
print('HAFT depth %.3f centre %s' % (depth, tuple(round(x, 4) for x in C)))

bm = bmesh.new(); bm.from_mesh(me.data)
cc = (wrist + R[side + 'HandMiddle2']) * 0.5
bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co - cc).length > 0.16], context='VERTS')
bm.to_mesh(me.data); bm.free()

def dist_axis(p):
    q = p - C
    return (q - A * q.dot(A)).length

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
dg = bpy.context.evaluated_depsgraph_get()
def head(name):
    pb = arm.pose.bones[P + name]
    return arm.matrix_world @ pb.head
def tailw(name):
    pb = arm.pose.bones[P + name]
    return arm.matrix_world @ pb.tail
def set_rot(name, axis, rad):
    pb = arm.pose.bones[P + name]
    # axis is a world (armature) axis; express it in the bone's posed parent space
    bpy.context.view_layer.update()
    par = pb.parent.matrix if pb.parent else Matrix()
    rest_rel = (pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local) if pb.parent else pb.bone.matrix_local
    cur = par @ rest_rel   # posed frame of the bone before its own rotation
    loc = (cur.to_3x3().inverted() @ axis).normalized()
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = Quaternion(loc, rad)
def wrap(chain, axis, maxdeg=110):
    # per joint: turn as far as possible in the first range of angles where the next joint stays out of the haft
    for k, name in enumerate(chain[:-1]):
        nxt = chain[k + 1]
        best, seen = 0, False
        for deg in range(-30, maxdeg + 1, 2):
            set_rot(name, axis, math.radians(deg))
            bpy.context.view_layer.update()
            e = head(nxt); mid = (head(name) + e) * 0.5
            ok = dist_axis(e) >= RF and dist_axis(mid) >= RF * 0.92
            if ok:
                best, seen = deg, True
            elif seen:
                break
        set_rot(name, axis, math.radians(best))
        bpy.context.view_layer.update()
        print('WRAP', name, best)
names = {b.name for b in arm.data.bones}
# direction that curls the fingers to the palm
s = A if (Quaternion(A, 0.3) @ d - d).dot(palm) > 0 else -A
for fn in ('Index', 'Middle', 'Ring', 'Pinky'):
    chain = [side + 'Hand' + fn + str(k) for k in (1, 2, 3, 4) if P + side + 'Hand' + fn + str(k) in names]
    if len(chain) == 4:
        wrap(chain[:3] + [chain[3]], s)
# thumb: oppose about the forearm axis, then wrap the other way round the haft
t2, t3 = R[side + 'HandThumb2'], R[side + 'HandThumb3']
td = (t3 - t2).normalized()
ax0 = fwd if (Quaternion(fwd, 0.3) @ td - td).dot(palm) > 0 else -fwd
thumb = [side + 'HandThumb' + str(k) for k in (1, 2, 3, 4)]
w = arm.pose.bones[P + thumb[0]].bone
if (w.head_local - R[side + 'HandIndex1']).length > 0.005:   # a real thumb, not a copy on the index
    set_rot(thumb[0], ax0, math.radians(25))
    bpy.context.view_layer.update()
    wrap(thumb[1:], -s, 90)
bpy.ops.object.mode_set(mode='OBJECT')

cyl_me = bpy.data.meshes.new('haft'); bmc = bmesh.new()
bmesh.ops.create_cone(bmc, cap_ends=True, segments=32, radius1=RH, radius2=RH, depth=0.30)
bmc.to_mesh(cyl_me); bmc.free()
cyl = bpy.data.objects.new('haft', cyl_me); bpy.context.scene.collection.objects.link(cyl)
z = A; x = palm.cross(z).normalized(); y = z.cross(x)
cyl.matrix_world = Matrix.Translation(C) @ Matrix((x, y, z)).transposed().to_4x4()
mt = bpy.data.materials.new('wood'); mt.diffuse_color = (0.35, 0.22, 0.12, 0.55); cyl.data.materials.append(mt)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_xray = False
sc.render.resolution_x = 600; sc.render.resolution_y = 600
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 0.22
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
c0 = (wrist + C) * 0.5
b = fwd.cross(palm).normalized()
views = {'axis': (A * 1.0 + fwd * 0.0), 'axis2': -A, 'palm': palm + A * 0.3, 'back': -palm + A * 0.2}
for name, dv in views.items():
    dv = dv.normalized()
    loc = c0 + dv * 0.5
    zc = dv; up = -fwd if abs(fwd.dot(zc)) < 0.95 else palm
    yc = (up - zc * up.dot(zc)).normalized(); xc = yc.cross(zc)
    cam.matrix_world = Matrix.Translation(loc) @ Matrix((xc, yc, zc)).transposed().to_4x4()
    sc.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)
