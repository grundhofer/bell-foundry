# Render one hand of a character GLB with its fingers curled (Blender, background).
# blender -b --factory-startup --disable-autoexec -P pose_render.py -- IN.glb OUTPREFIX SIDE JOINTS_REF.json [curl1 curl2 curl3 thumb]
# JOINTS_REF.json: measured joints (for a fixed camera frame shared by before/after renders).
import bpy, sys, json, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, side, ref = argv[:4]
curl = [float(x) for x in argv[4:7]] if len(argv) >= 7 else [80, 90, 60]
thumb_on = (argv[7] != '0') if len(argv) >= 8 else True
P = 'mixamorig:'
R = {k: Vector(v) for k, v in json.load(open(ref)).items()}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
me = [o for o in bpy.data.objects if o.type == 'MESH'][0]
wrist = arm.data.bones[P + side + 'Hand'].head_local.copy()
m1, p2, tip = R[side + 'HandMiddle1'], R[side + 'HandMiddle2'], R[side + 'HandMiddle4']
fwd = (m1 - wrist).normalized()
across = (R[side + 'HandIndex1'] - R[side + 'HandPinky1']).normalized()
d = (p2 - m1).normalized()
palmward = (tip - m1) - d * (tip - m1).dot(d); palmward.normalize()
A = across if d.cross(palmward).dot(across) < 0 else -across   # rotation about A by +angle bends toward the palm
# check sign numerically
test = Quaternion(A, 0.3) @ d
if (test - d).dot(palmward) < 0:
    A = -A
import bmesh
cc = (wrist + R[side + 'HandMiddle2']) * 0.5
bm = bmesh.new(); bm.from_mesh(me.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co - cc).length > 0.16], context='VERTS')
bm.to_mesh(me.data); bm.free()
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
def rot(name, axis, deg):
    pb = arm.pose.bones.get(P + name)
    if pb is None:
        return False
    loc = (pb.bone.matrix_local.to_3x3().inverted() @ axis).normalized()
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = Quaternion(loc, math.radians(deg))
    return True
for f in ('Index', 'Middle', 'Ring', 'Pinky'):
    for k in range(3):
        rot(side + 'Hand' + f + str(k + 1), A, curl[k])
if thumb_on:
    t1, t2 = R[side + 'HandThumb2'], R[side + 'HandThumb3']
    td = (t2 - t1).normalized()
    # oppose: swing the thumb towards the palm about the hand's forward axis, then bend its joints
    ax0 = fwd if fwd.cross(td).dot(palmward) < 0 else -fwd
    if (Quaternion(ax0, 0.3) @ td - td).dot(palmward) < 0: ax0 = -ax0
    bend = td.cross(palmward).normalized()
    if (Quaternion(bend, 0.3) @ td - td).dot(palmward) < 0: bend = -bend
    rot(side + 'HandThumb1', ax0, 35)
    rot(side + 'HandThumb2', bend, 30)
    rot(side + 'HandThumb3', bend, 40)
bpy.ops.object.mode_set(mode='OBJECT')
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_cavity = True
sc.render.resolution_x = 600; sc.render.resolution_y = 600
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 0.22
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
c = (wrist + R[side + 'HandMiddle2']) * 0.5
n = palmward  # towards the palm side
b = fwd.cross(n).normalized(); n = b.cross(fwd).normalized()
views = {'back': -n, 'palm': n, 'side1': b, 'side2': -b}
for name, dv in views.items():
    loc = c + dv * 0.5
    z = dv.normalized(); y = (-fwd + z * fwd.dot(z)).normalized(); x = y.cross(z)
    cam.matrix_world = Matrix.Translation(loc) @ Matrix((x, y, z)).transposed().to_4x4()
    sc.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)
