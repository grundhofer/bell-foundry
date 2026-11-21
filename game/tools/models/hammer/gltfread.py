import json, struct, numpy as np
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(p):
    d=open(p,'rb').read()
    assert d[:4]==b'glTF'
    l=struct.unpack('<I',d[12:16])[0]; j=json.loads(d[20:20+l])
    o=20+l; bin=None
    if o<len(d):
        bl,bt=struct.unpack('<II',d[o:o+8]); bin=d[o+8:o+8+bl]
    return j,bin
def acc(j,bin,i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
    dt=np.dtype(CT[a['componentType']]); n=NC[a['type']]
    off=bv.get('byteOffset',0)+a.get('byteOffset',0)
    stride=bv.get('byteStride',dt.itemsize*n)
    raw=np.frombuffer(bin,dtype=np.uint8,count=stride*(a['count']-1)+dt.itemsize*n,offset=off)
    out=np.empty((a['count'],n),dtype=dt)
    for k in range(a['count']):
        pass
    arr=np.lib.stride_tricks.as_strided(np.frombuffer(raw.tobytes(),dtype=np.uint8),shape=(a['count'],n*dt.itemsize),strides=(stride,1))
    out=np.frombuffer(np.ascontiguousarray(arr).tobytes(),dtype=dt).reshape(a['count'],n)
    if a.get('normalized'):
        out=out.astype(np.float32)/np.iinfo(dt).max
    return out
def local(n):
    if 'matrix' in n: return np.array(n['matrix'],dtype=np.float64).reshape(4,4).T
    T=np.eye(4); t=n.get('translation',[0,0,0]); r=n.get('rotation',[0,0,0,1]); s=n.get('scale',[1,1,1])
    x,y,z,w=r
    R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    T[:3,:3]=R*np.array(s); T[:3,3]=t
    return T
def world(j,idx):
    parent={}
    for i,n in enumerate(j['nodes']):
        for c in n.get('children',[]): parent[c]=i
    M=np.eye(4); i=idx; chain=[]
    while i is not None:
        M=local(j['nodes'][i])@M; chain.append(j['nodes'][i].get('name')); i=parent.get(i)
    return M,chain
