import sys, numpy as np
sys.path.insert(0, sys.argv[2])
from gltfread import load, acc
j,bin=load(sys.argv[1])
print('keys',sorted(j.keys()))
print('images' in j, 'textures' in j, 'samplers' in j, 'extensionsUsed' in j)
print('scenes',j['scenes'])
for i,n in enumerate(j['nodes']): print('node',i,n)
print('materials',[m['name'] for m in j['materials']], [list(m.keys()) for m in j['materials']])
allp=[]
for pr in j['meshes'][0]['primitives']:
    at=pr['attributes']; print('prim mat',j['materials'][pr['material']]['name'],'attrs',sorted(at))
    p=acc(j,bin,at['POSITION']); n=acc(j,bin,at['NORMAL']); uv=acc(j,bin,at['TEXCOORD_0']); c=acc(j,bin,at['COLOR_0']); idx=acc(j,bin,pr['indices']).ravel()
    ca=j['accessors'][at['COLOR_0']]
    print('  verts',len(p),'tris',len(idx)//3,'idx max',idx.max(),'pos min',p.min(0).round(4),'max',p.max(0).round(4))
    print('  normal len',np.linalg.norm(n,axis=1).min().round(4),np.linalg.norm(n,axis=1).max().round(4),'uv',uv.min(0).round(3),uv.max(0).round(3),'color',c.min(),c.max(),ca['componentType'],ca.get('normalized'))
    t=idx.reshape(-1,3); fn=np.cross(p[t[:,1]]-p[t[:,0]],p[t[:,2]]-p[t[:,0]]); vn=n[t].sum(1)
    print('  face normal agrees with vertex normals: %.3f'%np.mean((fn*vn).sum(1)>0))
    allp.append(p)
P=np.concatenate(allp); print('ALL bounds',P.min(0).round(4),P.max(0).round(4))
hp=allp[0]; hh=hp[hp[:,1]>1.2325]
print('head block (y>1.2325) x %.4f..%.4f  y %.4f..%.4f  z %.4f..%.4f'%(hh[:,0].min(),hh[:,0].max(),hh[:,1].min(),hh[:,1].max(),hh[:,2].min(),hh[:,2].max()))
print('head material prim y range',hp[:,1].min().round(4),hp[:,1].max().round(4))
