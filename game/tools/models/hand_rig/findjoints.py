# Locate finger/thumb joints of one hand from cross-section slices of the skin mesh.
import sys, os, json
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'handgeo.py')).read())
argv = sys.argv[sys.argv.index('--')+1:]
arm, me = load(argv[0]); side = argv[1]; out = argv[2]
G = hand_graph(arm, me, side)
co, hw, mat, rep = G['co'], G['hw'], G['mat'], G['rep']
faces = []
for p in me.data.polygons:
    if p.material_index != 1 or min(hw[i] for i in p.vertices) < 0.01: continue
    vs = [int(rep[i]) for i in p.vertices]
    for k in range(1, len(vs)-1): faces.append((vs[0], vs[k], vs[k+1]))
used = sorted(set(i for fc in faces for i in fc))
pts = co[used]
wrist = np.array(arm.data.bones[P+side+'Hand'].head_local)
c = pts.mean(0)
f = c - wrist; f /= np.linalg.norm(f)
U, S, Vt = np.linalg.svd(pts - c)
n = Vt[2] - f * (Vt[2] @ f); n /= np.linalg.norm(n)
b = np.cross(f, n)
T = {i: float((co[i]-wrist) @ f) for i in used}
def slice_at(t):
    pts = {}; par = {}
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for fc in faces:
        cross = []
        for a_, b_ in ((fc[0], fc[1]), (fc[1], fc[2]), (fc[2], fc[0])):
            ta, tb = T[a_] - t, T[b_] - t
            if (ta < 0) != (tb < 0):
                e = (min(a_, b_), max(a_, b_))
                if e not in pts:
                    u = ta / (ta - tb); pts[e] = co[a_] + u * (co[b_] - co[a_]); par[e] = e
                cross.append(e)
        if len(cross) == 2:
            ra, rb = find(cross[0]), find(cross[1])
            if ra != rb: par[ra] = rb
    comps = defaultdict(list)
    for e in pts: comps[find(e)].append(pts[e])
    groups = []   # merge seam halves: components whose b-ranges overlap
    for ps in comps.values():
        ps = np.array(ps); bb = (ps - wrist) @ b
        groups.append([bb.min(), bb.max(), ps])
    groups.sort(key=lambda g: g[0])
    merged = []
    for g in groups:
        if merged and g[0] < merged[-1][1] - 0.001:
            m = merged[-1]; m[1] = max(m[1], g[1]); m[2] = np.vstack([m[2], g[2]])
        else: merged.append(g)
    res = []
    for lo, hi, ps in merged:
        cc = ps.mean(0)
        res.append(dict(c=cc, w=hi-lo, b=float((cc-wrist)@b)))
    return res
ts = [0.015 + k*0.001 for k in range(160)]
S_ = {t: slice_at(t) for t in ts}
for t in ts[::5]:
    print('T %.3f' % t, ' | '.join('b%+.3f w%.1f' % (g['b'], g['w']*1000) for g in S_[t]))
# fingers: groups at the slice with the most groups
best = max(ts, key=lambda t: (len(S_[t]), -t))
print('most groups at', best, len(S_[best]))
fingers = []
for g in S_[best]:
    fingers.append({'b0': g['b']})
# orient: thumb = the group whose separation is most proximal
def track(b0, start, step):
    line = []; bcur = b0; t = start
    while 0.015 <= t <= ts[-1]:
        cand = [g for g in S_[round(t, 3)] if abs(g['b'] - bcur) < 0.012] if round(t,3) in S_ else []
        if not cand: break
        g = min(cand, key=lambda g: abs(g['b'] - bcur))
        line.append((t, g)); bcur = g['b']; t = round(t + step, 3)
    return line
S_ = {round(t, 3): v for t, v in S_.items()}
best = round(best, 3)
info = []
for fg in fingers:
    dist = track(fg['b0'], best, 0.001)
    prox = track(fg['b0'], best, -0.001)
    # web: going proximal, the group widens past a single finger
    w0 = np.median([g['w'] for _, g in dist[:10] + prox[:10]])
    web = None
    line = [(t, g['c']) for t, g in reversed(prox) if web is None or t > web] + [(t, g['c']) for t, g in dist[1:]]
    info.append(dict(b=fg['b0'], web=web, tip_t=dist[-1][0], w=float(w0), line=[[t] + list(map(float, c)) for t, c in line]))
    print('FINGER b%+.3f web %s tip %.3f width %.1f n=%d' % (fg['b0'], web, dist[-1][0], w0*1000, len(line)))
json.dump(dict(f=f.tolist(), n=n.tolist(), b=b.tolist(), wrist=wrist.tolist(), fingers=info), open(out, 'w'))
