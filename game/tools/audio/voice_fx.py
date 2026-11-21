# The foundry's voice: a dry Kokoro take (24 kHz mono) -> a 48 kHz stereo Opus line for assets/audio/voice_giesserei/.
#
#   pitch     semitones down (asetrate: the formants come down with it, so she sounds larger), tempo kept by atempo
#   under     a second voice an octave below, this many dB under the first (her size; something not human in it)
#   grit      a rough edge: a hard-driven, soft-clipped, band-limited copy of the voice, this many dB under it (-60 = off)
#   chorus    a slight doubling (two voices 20-35 ms late, slowly drifting)
#   hall      a long stone hall baked in (the game's voice bus has no hall): a synthetic impulse, stereo, RT60 `rt` s
#   level     the file peaks at -1.7 dBTP; the manifest's gain brings it to `target` LUFS
#
# usage: python voice_fx.py in.wav out.ogg [--pitch 2.5] [--under -16] [--wet 0.32] [--rt 3.4] [--tempo 1.0]
#        prints: seconds (end of the spoken words, from the file's start), integrated LUFS of the file, gain
import sys, argparse, subprocess, json, tempfile, os
import numpy as np

FF = '/opt/homebrew/bin/ffmpeg'
SR = 48000


def ff(args, data=None):
    return subprocess.run([FF, '-v', 'error', *args], input=data, capture_output=True, check=True).stdout


def load(fn, filt=None, sr=SR):
    a = ['-i', fn]
    if filt: a += ['-af', filt]
    return np.frombuffer(ff(a + ['-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']), np.float32).astype(np.float64)


def through(x, filt, sr=SR, ch_in=1, ch_out=1):
    raw = ff(['-f', 'f64le', '-ar', str(sr), '-ac', str(ch_in), '-i', '-', '-af', filt, '-ac', str(ch_out), '-ar', str(sr), '-f', 'f64le', '-'], x.astype(np.float64).tobytes())
    y = np.frombuffer(raw, np.float64)
    return y.reshape(-1, ch_out) if ch_out > 1 else y


def fftconv(a, b):
    n = len(a) + len(b) - 1; N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, N) * np.fft.rfft(b, N), N)[:n]


def impulse(rt, seed, pre=0.028, sr=SR):
    """A stone hall: sparse early reflections, then dense noise falling 60 dB in `rt` s, darker as it goes."""
    rng = np.random.default_rng(seed)
    n = int(sr * (rt * 1.15 + pre)); t = np.arange(n) / sr
    tail = rng.standard_normal(n) * 10 ** (-3 * np.maximum(0, t - pre) / rt)
    tail[t < pre] = 0
    # darker with time: blend a low-passed copy in as the tail goes on
    k = int(sr * 0.0012); lp = np.convolve(tail, np.ones(k) / k, 'same')
    mix = np.clip((t - pre) / (rt * 0.5), 0, 1)
    tail = tail * (1 - mix) + lp * mix * 1.6
    for d, g in [(0.011, 0.5), (0.019, 0.35), (0.031, 0.3), (0.047, 0.22), (0.063, 0.18)]:      # early reflections off near walls
        i = int(sr * (pre * 0.4 + d + rng.uniform(-0.002, 0.002)))
        if i < n: tail[i] += g * (1 if rng.random() > 0.5 else -1)
    return tail / np.sqrt(np.sum(tail ** 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--pitch', type=float, default=2.5)
    ap.add_argument('--tempo', type=float, default=1.0, help='extra slowing (<1) after the pitch')
    ap.add_argument('--under', type=float, default=-16)
    ap.add_argument('--chorus', type=float, default=1.0)
    ap.add_argument('--grit', type=float, default=-60)
    ap.add_argument('--wet', type=float, default=0.32)
    ap.add_argument('--rt', type=float, default=3.4)
    ap.add_argument('--tail', type=float, default=3.0, help='seconds of file after the words')
    ap.add_argument('--target', type=float, default=-17.2)
    o = ap.parse_args()

    r = 2 ** (-o.pitch / 12)
    # 1 the dry voice, pitched: asetrate lowers pitch and formants and slows it by r; atempo gives back all but `tempo`
    pitch = f'aresample={SR},asetrate={SR * r:.3f},aresample={SR},atempo={min(2, max(0.5, o.tempo / r)):.5f}'
    eq = 'highpass=f=75,equalizer=f=180:t=q:w=1:g=2.5,equalizer=f=3200:t=q:w=1.2:g=1.5,deesser=i=0.35'
    dry = load(o.src, f'{pitch},{eq}')
    # trim the start to 40 ms before the first word
    w = int(SR * 0.01); n = len(dry) // w
    e = 10 * np.log10(np.mean(dry[:n * w].reshape(n, w) ** 2, axis=1) + 1e-12); top = e.max()
    on = max(0, int(np.argmax(e > top - 35)) * w - int(SR * 0.04))
    last = (n - int(np.argmax(e[::-1] > top - 35))) * w
    dry = dry[on:]; words_end = (last - on) / SR
    # 2 the octave under her: the same line an octave down, a little late
    under = np.zeros_like(dry)
    if o.under > -60:
        u = through(dry, f'asetrate={SR / 2},aresample={SR},atempo=2.0,lowpass=f=1800')
        u = np.concatenate([np.zeros(int(SR * 0.012)), u])[:len(dry)]
        under[:len(u)] = u * 10 ** (o.under / 20) * (np.sqrt(np.mean(dry ** 2)) / (np.sqrt(np.mean(u ** 2)) + 1e-12))
    voice = dry + under
    if o.grit > -60:
        gr = through(dry, 'volume=18dB,asoftclip=type=atan,highpass=f=350,lowpass=f=3200')[:len(dry)]
        voice[:len(gr)] += gr * 10 ** (o.grit / 20) * (np.sqrt(np.mean(dry ** 2)) / (np.sqrt(np.mean(gr ** 2)) + 1e-12))
    # 3 a slight doubling, left and right a little apart
    pad = int(SR * (words_end + o.tail)) - len(voice)
    voice = np.concatenate([voice, np.zeros(max(0, pad))])
    if o.chorus > 0:
        st = through(voice, f'chorus=0.7:0.9:22|33:{0.22 * o.chorus:.3f}|{0.18 * o.chorus:.3f}:0.25|0.31:1.6|2.1', ch_out=1)
        L = st[:len(voice)]
        st2 = through(voice, f'chorus=0.7:0.9:27|38:{0.2 * o.chorus:.3f}|{0.16 * o.chorus:.3f}:0.28|0.23:1.9|1.4', ch_out=1)
        R = st2[:len(voice)]
    else:
        L = R = voice
    # 4 the hall
    irL, irR = impulse(o.rt, 1), impulse(o.rt, 2)
    wL, wR = fftconv(L, irL)[:len(L)], fftconv(R, irR)[:len(R)]
    out = np.stack([L * (1 - o.wet) + wL * o.wet * 1.0, R * (1 - o.wet) + wR * o.wet * 1.0], 1)
    # fade the very end, and a 30 ms fade in
    f = int(SR * 0.6); out[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    out[:int(SR * 0.003)] *= np.linspace(0, 1, int(SR * 0.003))[:, None]
    # 5 level: peak to -1.7 dBTP (sample peak -2.0 to leave room for the codec), then encode
    out *= 10 ** (-2.0 / 20) / np.max(np.abs(out))
    tmp = tempfile.NamedTemporaryFile(suffix='.f64', delete=False); tmp.write(out.astype(np.float64).tobytes()); tmp.close()
    ff(['-y', '-f', 'f64le', '-ar', str(SR), '-ac', '2', '-i', tmp.name, '-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on', '-application', 'audio', o.dst])
    os.unlink(tmp.name)
    rep = subprocess.run([FF, '-hide_banner', '-nostats', '-i', o.dst, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(rep[rep.rindex('{'):rep.rindex('}') + 1])
    lufs, tp = float(j['input_i']), float(j['input_tp'])
    gain = 10 ** ((o.target - lufs) / 20)
    print(json.dumps({'file': os.path.basename(o.dst), 'seconds': round(words_end, 2), 'duration': round(len(out) / SR, 3), 'lufs': lufs, 'tp': tp, 'gain': round(gain, 4)}))


if __name__ == '__main__':
    main()
