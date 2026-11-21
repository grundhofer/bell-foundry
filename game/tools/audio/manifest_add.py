# Writes the new files into src/audio/manifest.js in the manifest's format (json, indent 1, sfx names sorted):
# gains from integrated loudness against a target, seconds from the decoded sample count.
import sys, json, subprocess
R = sys.argv[1]
FF = '/opt/homebrew/bin/ffmpeg'
def lufs(fn):
    t = subprocess.run([FF, '-hide_banner', '-nostats', '-i', fn, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(json.loads(t[t.rindex('{'):t.rindex('}') + 1])['input_i'])
def seconds(fn):
    raw = subprocess.run([FF, '-v', 'error', '-i', fn, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return round(len(raw) / 4 / 48000, 3)
gain = lambda fn, target: round(10 ** ((target - lufs(fn)) / 20), 4)
p = R + '/src/audio/manifest.js'
s = open(p).read(); head, body = s.split('export const FILES = ', 1); d = json.loads(body[:-2])
A = R + '/assets/audio/'
sfx = d['sfx']
sfx['furnace'] = {'takes': ['furnace_1.ogg'], 'gains': [gain(A + 'sfx/furnace_1.ogg', -31.0)], 'seconds': [seconds(A + 'sfx/furnace_1.ogg')], 'loop': [0.5, 24.5], 'rate': 24000}
h = ['hammer_1.ogg', 'hammer_2.ogg', 'hammer_3.ogg']
sfx['hammer'] = {'takes': h, 'gains': [gain(A + 'sfx/' + f, -18.5) for f in h], 'seconds': [seconds(A + 'sfx/' + f) for f in h]}
d['sfx'] = dict(sorted(sfx.items()))
V = json.loads(sys.argv[2])            # {name: {text, seconds, gain}}
order = list(d.keys()); vg = {n: {'file': n + '.ogg', 'seconds': v['seconds'], 'text': v['text'], 'gain': v['gain']} for n, v in V.items()}
new = {}
for k in order:
    if k == 'voice_giesserei': continue
    new[k] = d[k]
    if k == 'sfx': new['voice_giesserei'] = vg  # the foundry's lines
open(p, 'w').write(head + 'export const FILES = ' + json.dumps(new, indent=1, ensure_ascii=False) + ';\n')
print(json.dumps(new['sfx']['furnace']), json.dumps(new['sfx']['hammer']))
print(json.dumps(new['voice_giesserei'], indent=1))
