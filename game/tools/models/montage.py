# Usage: blender -b -P montage.py -- OUT.png IN.png [...]
import bpy, sys, numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
out, ins = args[0], args[1:]
tiles = []
for p in ins:
    im = bpy.data.images.load(p)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::2, ::2]
    tiles.append(a)
th, tw = tiles[0].shape[:2]
cols = 4; rows = (len(tiles) + cols - 1) // cols
sheet = np.ones((rows * th, cols * tw, 4), dtype=np.float32)
for i, t in enumerate(tiles):
    r, c = divmod(i, cols)
    y0 = (rows - 1 - r) * th
    sheet[y0:y0 + th, c * tw:(c + 1) * tw] = t[:th, :tw]
img = bpy.data.images.new('sheet', cols * tw, rows * th, alpha=True)
img.pixels.foreach_set(sheet.ravel())
img.filepath_raw = out; img.file_format = 'PNG'; img.save()
