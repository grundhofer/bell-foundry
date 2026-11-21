import bpy, sys, math
a=sys.argv[sys.argv.index('--')+1:]
hammer, sword, basetex, out = a
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene
img=bpy.data.images.load(basetex)
def imp(path, xoff, rotz, label):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new=[o for o in bpy.data.objects if o not in before]
    root=[o for o in new if o.parent is None][0]
    root.location.x=xoff; root.rotation_mode='XYZ'; root.rotation_euler=(0,0,math.radians(rotz))
    bpy.context.view_layer.update()
    for o in new:
        if o.type=='MESH':
            for m in o.data.materials:
                if m.name.startswith('hammer'):
                    nt=m.node_tree; bs=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
                    t=nt.nodes.new('ShaderNodeTexImage'); t.image=img; nt.links.new(t.outputs['Color'],bs.inputs['Base Color'])
        if o.type=='EMPTY':
            p=o.matrix_world.to_translation()
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05,location=p)
            s=bpy.context.object; mat=bpy.data.materials.new('mk'); mat.diffuse_color=(1,0.1,0.1,1); s.data.materials.append(mat)
            bpy.ops.object.text_add(location=(p.x+0.09,p.y-0.3,p.z-0.02)); tx=bpy.context.object
            tx.data.body='%s %.3f'%(o.name.split('.')[0],o.matrix_world.to_translation().z); tx.data.size=0.055
            tx.rotation_euler=(math.radians(90),0,0); m2=bpy.data.materials.new('tx'); m2.diffuse_color=(0.9,0.9,0.2,1); tx.data.materials.append(m2)
    bpy.ops.object.text_add(location=(xoff-0.2,-0.3,1.55)); tx=bpy.context.object; tx.data.body=label; tx.data.size=0.07; tx.rotation_euler=(math.radians(90),0,0)
    m3=bpy.data.materials.new('lb'); m3.diffuse_color=(1,1,1,1); tx.data.materials.append(m3)
imp(hammer,0.0,0,'hammer side (x right)')
imp(hammer,1.0,90,'hammer front (z right)')
imp(sword,2.0,0,'greatsword (ref)')
bpy.ops.mesh.primitive_cube_add(size=1,location=(1.0,0.2,0)); g=bpy.context.object; g.scale=(3.2,0.002,0.003)
mg=bpy.data.materials.new('g'); mg.diffuse_color=(0.3,0.8,1,1); g.data.materials.append(mg)
cam=bpy.data.cameras.new('c'); cam.type='ORTHO'; cam.ortho_scale=3.5
co=bpy.data.objects.new('c',cam); sc.collection.objects.link(co); sc.camera=co
co.location=(1.1,-5,0.55); co.rotation_euler=(math.radians(90),0,0)
sc.render.engine='BLENDER_WORKBENCH'
sh=sc.display.shading; sh.light='STUDIO'; sh.color_type='TEXTURE'; sh.show_object_outline=False
sc.render.resolution_x=1600; sc.render.resolution_y=1100
sc.world=bpy.data.worlds.new('w'); sc.world.color=(0.12,0.12,0.14)
sc.render.film_transparent=False
sc.render.filepath=out; bpy.ops.render.render(write_still=True)
