# From finger centerlines (findjoints.py output) estimate joint positions.
import sys, json
import numpy as np
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
L_ = json.load(open(argv[0])); side = argv[1]; out = argv[2]
R = dict(DIP=0.34, PIP=0.73, MCP=1.34, IP=0.48, TMCP=1.0, CMC=0.75)
if len(argv) > 3: R.update(json.loads(argv[3]))
f = np.array(L_['f']); b = np.array(L_['b']); wrist = np.array(L_['wrist'])
fingers = sorted(L_['fingers'], key=lambda x: x['b'])
# thumb: separates first (lowest first-t)
thumb = min(fingers, key=lambda x: x['line'][0][0])
others = [x for x in fingers if x is not thumb]
# order index..pinky starting next to the thumb
others.sort(key=lambda x: abs(x['b'] - thumb['b']))
names = ['Index', 'Middle', 'Ring', 'Pinky']
def smooth(C, k=2):
    return np.array([C[max(0, i-k):i+k+1].mean(0) for i in range(len(C))])
def at_arc(C, s):  # point at arc length s from C[0]
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    s = min(max(s, 0), d[-1]); i = min(np.searchsorted(d, s), len(C)-1)
    if i == 0: return C[0]
    u = (s - d[i-1]) / max(d[i] - d[i-1], 1e-9); return C[i-1] + u * (C[i] - C[i-1])
J = {}
for nm, fg in zip(names, others):
    C = smooth(np.array([p[1:] for p in fg['line']]))
    tipdir = C[-1] - C[-4]; tipdir /= np.linalg.norm(tipdir)
    tip = C[-1] + tipdir * 0.002
    Ct = np.vstack([C, tip])[::-1]       # from tip to web
    arc = np.sum(np.linalg.norm(np.diff(Ct, axis=0), axis=1))
    base = C[0]; bdir = C[0] - C[min(6, len(C)-1)]; bdir /= np.linalg.norm(bdir)
    J[side+'Hand'+nm+'4'] = tip
    J[side+'Hand'+nm+'3'] = at_arc(Ct, R['DIP'] * arc)
    J[side+'Hand'+nm+'2'] = at_arc(Ct, R['PIP'] * arc)
    J[side+'Hand'+nm+'1'] = base + bdir * (R['MCP'] - 1) * arc
    print(nm, 'free length %.1f mm' % (arc*1000), 'web t %.3f' % fg['line'][0][0])
C = smooth(np.array([p[1:] for p in thumb['line']]))
tipdir = C[-1] - C[-4]; tipdir /= np.linalg.norm(tipdir)
tip = C[-1] + tipdir * 0.002
Ct = np.vstack([C, tip])[::-1]
arc = np.sum(np.linalg.norm(np.diff(Ct, axis=0), axis=1))
bdir = C[0] - C[min(6, len(C)-1)]; bdir /= np.linalg.norm(bdir)
J[side+'HandThumb4'] = tip
J[side+'HandThumb3'] = at_arc(Ct, R['IP'] * arc)
mcp = C[0] + bdir * (R['TMCP'] - 1) * arc
J[side+'HandThumb2'] = mcp
toward = wrist - mcp; toward /= np.linalg.norm(toward)
d = bdir + toward; d /= np.linalg.norm(d)
J[side+'HandThumb1'] = mcp + d * R['CMC'] * arc
print('Thumb free length %.1f mm' % (arc*1000))
json.dump({k: list(map(float, v)) for k, v in J.items()}, open(out, 'w'), indent=1)
