import numpy as np
from collections import defaultdict
from gltfread import load, acc, world
TOP=1.437; BOTTOM=-0.400
def components(P,I):
    par=list(range(len(P)))
    def f(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    def u(a,b): par[f(a)]=f(b)
    for a,b,c in I.reshape(-1,3): u(a,b); u(b,c)
    key=defaultdict(list)
    for i,p in enumerate(np.round(P,3)): key[tuple(p)].append(i)
    for v in key.values():
        for x in v[1:]: u(x,v[0])
    comp=np.array([f(i) for i in range(len(P))])
    _,lab=np.unique(comp,return_inverse=True)
    return lab
def get(path):
    j,bin=load(path)
    ni=[i for i,n in enumerate(j['nodes']) if 'mesh' in n and j['meshes'][n['mesh']]['name']=='Long_hammer_low1_Long_Hammer_texture_0']
    assert len(ni)==1
    M,_=world(j,ni[0])
    pr=j['meshes'][j['nodes'][ni[0]]['mesh']]['primitives']; assert len(pr)==1; pr=pr[0]
    assert pr.get('mode',4)==4
    P=acc(j,bin,pr['attributes']['POSITION']).astype(np.float64)
    N=acc(j,bin,pr['attributes']['NORMAL']).astype(np.float64)
    UV=acc(j,bin,pr['attributes']['TEXCOORD_0']).astype(np.float64)
    I=acc(j,bin,pr['indices']).ravel().astype(np.int64)
    L=M[:3,:3]
    W=(L@P.T).T+M[:3,3]
    Nw=(np.linalg.inv(L).T@N.T).T; Nw/=np.linalg.norm(Nw,axis=1,keepdims=True)
    if np.linalg.det(L)<0: I=I.reshape(-1,3)[:,::-1].ravel()
    lab=components(P,I)
    sizes=np.bincount(lab)
    c=W.mean(0); _,_,Vt=np.linalg.svd(W-c,full_matrices=False); a=Vt[0]
    t=(W-c)@a
    ext=np.array([np.ptp(t[lab==k]) for k in range(len(sizes))])
    hk=int(ext.argmax())
    H=W[lab==hk]; hc=H.mean(0); _,_,hv=np.linalg.svd(H-hc,full_matrices=False); y=hv[0]
    th=(W-hc)@y; r=np.linalg.norm((W-hc)-np.outer(th,y),axis=1)
    if th[r.argmax()]<0: y=-y; th=-th
    headk=int(np.argmax([r[lab==k].max() for k in range(len(sizes))]))
    Hd=W[lab==headk]; Hp=(Hd-hc)-np.outer((Hd-hc)@y,y)
    _,_,pv=np.linalg.svd(Hp-Hp.mean(0),full_matrices=False); x=pv[0]
    x=x-y*(x@y); x/=np.linalg.norm(x); z=np.cross(x,y)
    R=np.stack([x,y,z])
    Q=(R@(W-hc).T).T
    s=(TOP-BOTTOM)/np.ptp(Q[:,1])
    Q*=s; Q[:,1]+=TOP-Q[:,1].max()
    Nq=(R@Nw.T).T
    return dict(P=Q,N=Nq,UV=UV,I=I,lab=lab,hk=hk,headk=headk,scale=s,R=R,len_src=np.ptp((W-hc)@y))
