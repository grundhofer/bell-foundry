# The everyday effects from CC0 recordings (and the drips from code), written as the game's files (48 kHz mono Opus,
# peak -2 dBFS) and entered into src/audio/manifest.js with gains that bring each group to its level in the mix:
#
#   step_walk, step_run   footsteps on rock (NOX Sound, Essentials Series, Footsteps_Rock Walk/Run, CC0)
#   step_slow             the same rock steps 4 semitones down and darker, for the slow walks of the cutscenes
#   boss_step             a jump landing on rock (NOX, Footsteps_Rock_Jump_Land) 5 semitones down, with a pickaxe on
#                         stone (Kenney Impact Sounds, impactMining) for the crunch and a heavy punch (impactPunch_heavy)
#                         6 semitones down for the body
#   block                 a blow on the wooden shield with its iron rim: impactWood_heavy and impactPlate_heavy (Kenney)
#   clash                 metal on metal or stone: impactMetal_light (Kenney) 2 semitones up
#   hit_armor             the blade on her: impactPlate_light 3 semitones up with impactMetal_light 5 up on top (Kenney)
#   hit_armor_heavy       impactPlate_medium with impactPunch_heavy under it and impactMetal_light on top (Kenney)
#                         (block and both hits through a soft clip: full body without sharp peaks)
#   sword_draw            drawKnife (Kenney RPG Audio) 3 semitones down: a longer blade
#   ui_move, ui_select,   select, tick and back (Kenney Interface Sounds) lowered and darkened to the soft clicks of the
#   ui_back               menus
#   drip                  water drops in the nave, made here: a bubble's ringing (a sine whose pitch rises as it
#                         fades, after van den Doel, "Physically-based models for liquid sounds", 2004) with a soft tick
#
# usage: python -I build_sfx_foley.py <spielassets dir> <NOX footsteps dir> <game dir>
#   <NOX footsteps dir> holds Footsteps_Rock/ from Essentials_Series_NOX_SOUND.zip (extract only that folder)
import sys, os, subprocess, tempfile, json
import numpy as np

FF = '/opt/homebrew/bin/ffmpeg'
SR = 48000
LIB, NOX, GAME = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.path.join(GAME, 'assets/audio/sfx')
KI = os.path.join(LIB, 'kenney/impact-sounds/Audio')
KR = os.path.join(LIB, 'kenney/rpg-audio/Audio')
KU = os.path.join(LIB, 'kenney/interface-sounds/Audio')
ROCK = os.path.join(NOX, 'Footsteps_Rock')

# Each group's level in the mix (the loudest 100 ms after a 100 Hz high-pass, plus the take's gain, in dB).
TARGET = {'step_walk': -26.0, 'step_run': -23.8, 'step_slow': -22.4, 'boss_step': -14.0, 'drip': -30.5, 'block': -9.4,
          'clash': -14.5, 'hit_armor': -13.4, 'hit_armor_heavy': -10.4, 'sword_draw': -21.9, 'ui_back': -25.4,
          'ui_move': -27.2, 'ui_select': -23.8}


def load(fn, filt=None):
    a = [FF, '-v', 'error', '-i', fn]
    if filt: a += ['-af', filt]
    raw = subprocess.run(a + ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def pitch(st):
    r = 2 ** (st / 12)
    return f'aresample={SR},asetrate={SR * r:.3f},aresample={SR}'       # pitch and length together, like a slower tape


def onset(x, db=-30):
    return int(np.argmax(np.abs(x) > np.max(np.abs(x)) * 10 ** (db / 20)))


def start(x, pre=0.003):
    x = x[max(0, onset(x) - int(SR * pre)):].copy()                   # the sound begins when the game asks for it
    f = int(SR * 0.002); x[:f] *= np.linspace(0, 1, f)
    return x


def trim_tail(x, db=-60, fade=0.15):
    w = int(SR * 0.01); n = len(x) // w
    e = 10 * np.log10(np.mean(x[:n * w].reshape(n, w) ** 2, axis=1) + 1e-15); top = e.max()
    last = (n - int(np.argmax(e[::-1] > top + db))) * w
    x = x[:last].copy(); f = min(len(x) // 3, int(SR * fade)); x[-f:] *= np.linspace(1, 0, f) ** 2
    return x


def layer(*parts):                                                   # (signal, gain, delay s), each from its onset
    parts = [(start(p), g, int(SR * d)) for p, g, d in parts]
    x = np.zeros(max(len(p) + d for p, g, d in parts))
    for p, g, d in parts: x[d:d + len(p)] += g * p / np.max(np.abs(p))
    return x


def tame(x, drive=2.0):                                              # a soft clip: the crack of a blow less spiky, its body fuller
    x = x / np.max(np.abs(x))
    return np.tanh(drive * x) / np.tanh(drive)


def loud(x):
    y = subprocess.run([FF, '-v', 'error', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-', '-af', 'highpass=f=100',
                        '-f', 'f64le', '-'], input=x.astype(np.float64).tobytes(), capture_output=True, check=True).stdout
    y = np.frombuffer(y, np.float64); w = int(SR * 0.1); h = w // 4
    if len(y) < w: y = np.pad(y, (0, w - len(y)))
    return max(10 * np.log10(np.mean(y[i:i + w] ** 2) + 1e-15) for i in range(0, len(y) - w + 1, h))


def write(x, fn, br='96k'):
    x = x / np.max(np.abs(x)) * 10 ** (-2.0 / 20)
    t = tempfile.NamedTemporaryFile(suffix='.f64', delete=False); t.write(x.astype(np.float64).tobytes()); t.close()
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', t.name, '-ar', '48000',
                    '-c:a', 'libopus', '-b:a', br, '-vbr', 'on', fn], check=True)
    os.unlink(t.name)


groups = {}


def put(name, takes):
    files, gains, secs = [], [], []
    for i, x in enumerate(takes):
        f = f'{name}_{i + 1}.ogg'; write(x, os.path.join(OUT, f))
        y = load(os.path.join(OUT, f))
        files.append(f); gains.append(round(10 ** ((TARGET[name] - loud(y)) / 20), 4)); secs.append(round(len(y) / SR, 3))
    groups[name] = {'takes': files, 'gains': gains, 'seconds': secs}


# ---- steps
rock = lambda kind, n, filt='highpass=f=40': load(os.path.join(ROCK, 'Footsteps_Rock_' + kind.split('_')[0], f'Footsteps_Rock_{kind}_{n:02d}.wav'), filt)
put('step_walk', [trim_tail(start(rock('Walk', n))) for n in (3, 5, 6, 7, 8, 9)])
put('step_run', [trim_tail(start(rock('Run', n))) for n in (2, 3, 4, 7, 9, 10)])
put('step_slow', [trim_tail(start(rock('Walk', n, f'highpass=f=40,{pitch(-4)},lowpass=f=2500'))) for n in (1, 2, 4, 6)])
boss = []
for land, mine, punch in [(1, 0, 0), (2, 1, 4), (4, 3, 1), (5, 4, 3), (6, 0, 2)]:
    a = rock('Jump_Land', land, f'highpass=f=30,{pitch(-5)}')
    b = load(os.path.join(KI, f'impactMining_{mine:03d}.ogg'), f'highpass=f=60,{pitch(-3)}')
    c = load(os.path.join(KI, f'impactPunch_heavy_{punch:03d}.ogg'), f'highpass=f=25,{pitch(-6)},lowpass=f=900')
    boss.append(trim_tail(layer((a, 1.0, 0), (b, 0.5, 0.004), (c, 0.6, 0)), fade=0.3))
put('boss_step', boss)

# ---- blows
k = lambda f, filt='highpass=f=60': load(os.path.join(KI, f + '.ogg'), filt)
put('block', [tame(trim_tail(layer((k(f'impactWood_heavy_{w:03d}'), 1.0, 0), (k(f'impactPlate_heavy_{p:03d}'), 0.7, 0.002))))
              for w, p in [(0, 1), (1, 3), (2, 0), (3, 4)]])
put('clash', [trim_tail(start(k(f'impactMetal_light_{n:03d}', f'highpass=f=80,{pitch(2)}'))) for n in (0, 1, 2, 4)])
put('hit_armor', [tame(trim_tail(layer((k(f'impactPlate_light_{p:03d}', f'highpass=f=80,{pitch(3)}'), 1.0, 0),
                                       (k(f'impactMetal_light_{m:03d}', f'highpass=f=300,{pitch(5)}'), 0.65, 0.002))))
                  for p, m in [(0, 3), (1, 0), (2, 1), (3, 2), (4, 4), (2, 3)]])
put('hit_armor_heavy', [tame(trim_tail(layer((k(f'impactPlate_medium_{p:03d}', f'highpass=f=60,{pitch(1)}'), 1.0, 0),
                                        (k(f'impactPunch_heavy_{u:03d}', f'highpass=f=40,{pitch(-2)}'), 0.6, 0),
                                        (k(f'impactMetal_light_{m:03d}', f'highpass=f=300,{pitch(4)}'), 0.6, 0.003))))
                        for p, u, m in [(1, 1, 3), (2, 3, 0), (4, 4, 1)]])
put('sword_draw', [trim_tail(start(load(os.path.join(KR, f'drawKnife{n}.ogg'), f'highpass=f=150,{pitch(-3)}')), fade=0.1)
                   for n in (3, 2)])

# ---- menus
u = lambda f, st, lp: trim_tail(start(load(os.path.join(KU, f + '.ogg'), f'highpass=f=60,{pitch(st)},lowpass=f={lp}')), fade=0.02)
put('ui_move', [u('select_001', -6, 3000), u('select_002', -6, 3000), u('tick_004', -7, 3000)])
put('ui_select', [u('back_002', -4, 3500)])
put('ui_back', [u('back_004', -9, 2500)])

# ---- drips
rng = np.random.default_rng(11)
drips = []
for i in range(8):
    f0 = rng.uniform(1400, 3800) if i % 2 == 0 else rng.uniform(3800, 6500)
    tau = rng.uniform(0.012, 0.035); dur = min(0.16, tau * 5 + 0.01)
    t = np.arange(int(SR * dur)) / SR
    f = f0 * (1 + rng.uniform(0.08, 0.2) * t / tau)                  # the bubble shrinks: its pitch climbs as it rings
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)
    tick = rng.standard_normal(int(SR * 0.0015)) * np.hanning(int(SR * 0.0015)) * 0.25
    x[:len(tick)] += tick
    x[:int(SR * 0.0005)] *= np.linspace(0, 1, int(SR * 0.0005))
    drips.append(trim_tail(x, fade=0.02))
put('drip', drips)

# ---- the manifest (json, indent 1, sfx names sorted; only these groups change)
p = os.path.join(GAME, 'src/audio/manifest.js')
s = open(p).read(); head, body = s.split('export const FILES = ', 1); d = json.loads(body.rstrip().rstrip(';'))
for name, g in groups.items():
    old = d['sfx'][name]
    for f in old['takes']:
        if f not in g['takes'] and os.path.exists(os.path.join(OUT, f)): os.remove(os.path.join(OUT, f))
    d['sfx'][name] = {**{k2: v for k2, v in old.items() if k2 not in g}, **g}
d['sfx'] = dict(sorted(d['sfx'].items()))
open(p, 'w').write(head + 'export const FILES = ' + json.dumps(d, indent=1, ensure_ascii=False) + ';\n')
for name, g in groups.items(): print(name, g['takes'], g['gains'], g['seconds'])
