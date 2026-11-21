# Two new effects from CC0 recordings, written as the game's files (48 kHz mono Opus, peak -2 dBFS):
#
#   hammer_1..3   the forge hammer's head meeting stone (layered on her slam and on a blow stopped by a pier, when she
#                 carries the hammer): a hammer on an anvil (OpenGameArt, VishwaJai, CC0) pitched down 6-8.5 semitones
#                 for a head the size of hers, with the ring of a heavy bell-like strike under it (Kenney Impact Sounds,
#                 impactBell_heavy, CC0) pitched down 5 semitones, and the bite of a small metal hit on top (OpenGameArt,
#                 rubberduck "100 CC0 metal and wood SFX", metal_hit_01/02, CC0) pitched down 4 semitones
#   furnace_1     the furnace's roar, a seamless 24 s loop padded to 25 s (loop points 0.5..24.5, like the nave's bed):
#                 a wood fire (OpenGameArt, PagDev "Fireplace Sound Loop", CC0) for the roar and its crackle, a low
#                 rumble (OpenGameArt, cinameng "Rumble FX", CC0) for its body, a rocket engine (OpenGameArt,
#                 theMinesAreShakin "Rocket Engine", CC0) low-passed at 140 Hz for its draught; a slow swell like
#                 bellows (+-1.5 dB, 6 s period, a whole number of periods in the loop)
#
# usage: python build_sfx.py <scratchpad audio dir> <out dir>
import sys, os, subprocess, tempfile, json
import numpy as np

FF = '/opt/homebrew/bin/ffmpeg'
SR = 48000
ROOT, OUT = sys.argv[1], sys.argv[2]


def load(fn, filt=None, sr=SR):
    a = [FF, '-v', 'error', '-i', fn]
    if filt: a += ['-af', filt]
    raw = subprocess.run(a + ['-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def pitch(st):
    r = 2 ** (st / 12)
    return f'aresample={SR},asetrate={SR * r:.3f},aresample={SR}'       # pitch and length together, like a slower tape


def write(x, fn, rate=SR, br='96k'):
    x = x / np.max(np.abs(x)) * 10 ** (-2.0 / 20)
    t = tempfile.NamedTemporaryFile(suffix='.f64', delete=False); t.write(x.astype(np.float64).tobytes()); t.close()
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', t.name, '-ar', '48000', '-c:a', 'libopus', '-b:a', br, '-vbr', 'on', fn], check=True)
    os.unlink(t.name)


def trim_tail(x, db=-60):
    w = int(SR * 0.01); n = len(x) // w
    e = 10 * np.log10(np.mean(x[:n * w].reshape(n, w) ** 2, axis=1) + 1e-15); top = e.max()
    last = (n - int(np.argmax(e[::-1] > top + db))) * w
    x = x[:last].copy(); f = min(len(x) // 3, int(SR * 0.15)); x[-f:] *= np.linspace(1, 0, f) ** 2
    return x


# ---- the hammer
K = os.path.join(ROOT, 'dl_kenney_impact-sounds/x/Audio')
hammer = os.path.join(ROOT, 'dl_oga_blacksmith/blacksmithhammer.wav')
MW = os.path.join(ROOT, 'dl_oga_metalwood100/x')
for i, (st, bell, bst, bgain, bite) in enumerate([(-7, 'impactBell_heavy_001.ogg', -5, 0.5, 'metal_hit_01.ogg'), (-8.5, 'impactBell_heavy_002.ogg', -5, 0.55, 'metal_hit_02.ogg'), (-6, 'impactBell_heavy_000.ogg', -6, 0.4, 'metal_hit_01.ogg')]):
    a = load(hammer, f'highpass=f=40,{pitch(st)}')
    b = load(os.path.join(K, bell), f'highpass=f=40,{pitch(bst)}')
    c = load(os.path.join(MW, bite), f'highpass=f=200,{pitch(-4)}')
    n = max(len(a), len(b) + int(SR * 0.004), len(c)); x = np.zeros(n)
    x[:len(a)] += a / np.max(np.abs(a))
    x[int(SR * 0.004):int(SR * 0.004) + len(b)] += bgain * b / np.max(np.abs(b))
    x[:len(c)] += 0.3 * c / np.max(np.abs(c))
    x = trim_tail(x)
    x[:int(SR * 0.002)] *= np.linspace(0, 1, int(SR * 0.002))
    write(x, os.path.join(OUT, f'hammer_{i + 1}.ogg'))

# ---- the furnace
LOOP, PADS = 24.0, 0.5
N = int(SR * (LOOP + 2))                                           # 2 s more than the loop: the crossfade
fire = load(os.path.join(ROOT, 'dl_oga_fireplace/fire.wav'), 'highpass=f=45')[int(SR * 2):][:N]
rum = load(os.path.join(ROOT, 'dl_oga_rumble/rumble.wav'), f'highpass=f=30,lowpass=f=700,{pitch(-2)}')
rum = rum[int(SR * 2.5):]                                           # (its first 2 s fade in)
rum = np.concatenate([rum, rum[::-1]])[:N]                          # (19 s long: mirrored to cover 26 s without a seam)
eng = load(os.path.join(ROOT, 'dl_oga_rocket/rocket_engine.001.wav'), 'highpass=f=25,lowpass=f=140')
seg = int(SR * 5.0); xf = int(SR * 1.0); e2 = np.zeros(N); pos = 0; rng = np.random.default_rng(7)
while pos < N:                                                      # (6 s long: overlapped 5 s pieces from random places)
    s = rng.integers(0, len(eng) - seg); piece = eng[s:s + seg].copy()
    piece[:xf] *= np.sin(np.linspace(0, np.pi / 2, xf)); piece[-xf:] *= np.cos(np.linspace(0, np.pi / 2, xf))
    m = min(seg, N - pos); e2[pos:pos + m] += piece[:m]; pos += seg - xf
rms = lambda v: np.sqrt(np.mean(v ** 2))
x = fire / rms(fire) * 1.0 + rum / rms(rum) * 0.55 + e2 / rms(e2) * 0.45
t = np.arange(N) / SR
x *= 10 ** (1.5 * np.sin(2 * np.pi * t / 6.0) / 20)                # bellows: 4 periods in the 24 s loop
L = int(SR * LOOP); c = int(SR * 2.0)
loop = x[:L].copy()
w = np.linspace(0, np.pi / 2, c)
loop[:c] = x[:c] * np.sin(w) + x[L:L + c] * np.cos(w)              # the end of the take runs on into its start: no seam
p = int(SR * PADS)
fileX = np.concatenate([loop[-p:], loop, loop[:p]])
write(fileX, os.path.join(OUT, 'furnace_1.ogg'))

for f in sorted(os.listdir(OUT)):
    if f.endswith('.ogg'): print(f)
