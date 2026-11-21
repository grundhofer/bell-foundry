import sys, json, struct, numpy as np
sys.path.insert(0, sys.argv[2])
from xform import get, TOP, BOTTOM
src, _, out = sys.argv[1:4]
SPLIT_Y = float(sys.argv[4])
d=get(src)
P,N,UV,I=d['P'],d['N'],d['UV'],d['I'].reshape(-1,3)
cy=P[I][:,:,1].mean(1)
head=cy>=SPLIT_Y
anchors=[('pommel',BOTTOM+0.04),('left',-0.165),('guard',0.117),('base',0.237),('tip',TOP)]
blob=bytearray(); views=[]; accs=[]
def add(arr, target, ctype, typ, normalized=False, minmax=False):
    while len(blob)%4: blob.append(0)
    b=arr.tobytes(); views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(b),'target':target}); blob.extend(b)
    a={'bufferView':len(views)-1,'componentType':ctype,'count':int(arr.shape[0]),'type':typ}
    if normalized: a['normalized']=True
    if minmax: a['min']=[float(v) for v in arr.min(0)]; a['max']=[float(v) for v in arr.max(0)]
    accs.append(a); return len(accs)-1
prims=[]
for mi,mask in enumerate([head,~head]):
    tri=I[mask]; used=np.unique(tri); remap=-np.ones(len(P),np.int64); remap[used]=np.arange(len(used))
    p=P[used].astype(np.float32); n=N[used]; n=(n/np.linalg.norm(n,axis=1,keepdims=True)).astype(np.float32)
    uv=UV[used].astype(np.float32); col=np.full((len(used),4),255,np.uint8)
    idx=remap[tri].ravel().astype(np.uint16 if len(used)<65536 else np.uint32)
    prims.append({'attributes':{'POSITION':add(p,34962,5126,'VEC3',minmax=True),'NORMAL':add(n,34962,5126,'VEC3'),
        'TEXCOORD_0':add(uv,34962,5126,'VEC2'),'COLOR_0':add(col,34962,5121,'VEC4',normalized=True)},
        'indices':add(idx,34963,5123 if idx.dtype==np.uint16 else 5125,'SCALAR'),'material':mi,'mode':4})
while len(blob)%4: blob.append(0)
nodes=[{'name':nm,'translation':[0.0,round(float(y),6),0.0]} for nm,y in anchors]
nodes.append({'name':'hammer','mesh':0,'children':list(range(len(anchors)))})
j={'asset':{'version':'2.0','generator':'hammer build.py'},
   'scene':0,'scenes':[{'nodes':[len(nodes)-1]}],'nodes':nodes,
   'meshes':[{'name':'hammer','primitives':prims}],
   'materials':[{'name':'hammer_head','pbrMetallicRoughness':{'baseColorFactor':[0.32,0.32,0.34,1.0],'metallicFactor':1.0,'roughnessFactor':0.5}},
                {'name':'hammer_haft','pbrMetallicRoughness':{'baseColorFactor':[0.42,0.29,0.18,1.0],'metallicFactor':0.0,'roughnessFactor':0.8}}],
   'accessors':accs,'bufferViews':views,'buffers':[{'byteLength':len(blob)}]}
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
total=12+8+len(js)+8+len(blob)
with open(out,'wb') as f:
    f.write(struct.pack('<III',0x46546C67,2,total)); f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II',len(blob),0x004E4942)); f.write(blob)
print('scale',d['scale'],'head tris',int(head.sum()),'haft tris',int((~head).sum()))
