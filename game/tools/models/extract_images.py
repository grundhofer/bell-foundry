# Usage: blender -b -P extract_images.py -- SRC.blend OUTDIR
import bpy, sys, os
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
os.makedirs(out, exist_ok=True)
for im in bpy.data.images:
    if im.packed_file:
        name = os.path.basename(im.filepath) or im.name
        with open(os.path.join(out, name), 'wb') as f:
            f.write(im.packed_file.data)
        print('IMAGE', name, tuple(im.size))
