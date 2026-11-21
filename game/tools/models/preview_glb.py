# Usage: blender -b -P preview_glb.py -- MODEL OUT.png
import bpy, sys, math
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[:2]
POSE = '--pose' in args
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=src)
else:
    bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
if POSE:
    from mathutils import Euler
    for a in [o for o in scene.objects if o.type == 'ARMATURE']:
        for name, rot in (('LeftArm', (0, 0, 50)), ('RightArm', (0, 0, -50)), ('LeftForeArm', (0, 0, 60)),
                          ('RightForeArm', (0, 0, -60)), ('LeftUpLeg', (-45, 0, 0)), ('RightLeg', (60, 0, 0)),
                          ('Head', (0, 30, 0)), ('Spine1', (20, 0, 0))):
            pb = a.pose.bones.get('mixamorig:' + name)
            if pb:
                pb.rotation_mode = 'XYZ'
                pb.rotation_euler = Euler([math.radians(x) for x in rot])
root = [o for o in scene.objects if o.parent is None]
coll = bpy.data.collections.new('fig')
for o in list(scene.collection.objects):
    scene.collection.objects.unlink(o); coll.objects.link(o)
scene.collection.children.link(coll)
inst = bpy.data.objects.new('side', None)
inst.instance_type = 'COLLECTION'; inst.instance_collection = coll
inst.rotation_euler = (0, 0, math.radians(90)); inst.location = (1.25, 0, 0)
scene.collection.objects.link(inst)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.9
cam.location = (0.62, -10, 0.92); cam.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(cam); scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
