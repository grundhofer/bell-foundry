# The smith's voice (Vulkar): a dry Kokoro male take (24 kHz mono) -> a dark 48 kHz stereo Opus line for assets/audio/voice_smith/.
#
#   pitch    semitones down for the voice's fundamental (WORLD vocoder: pitch and formants move separately)
#   formant  semitones down for the spectral envelope (less than pitch, so the words stay words: a bigger throat, not a slowed tape)
#   flat     how much of the line's melody is kept (1 all, 0.6 flatter: a level, threatening delivery)
#   sub      a second voice an octave under the first (same envelope), dB under it, low-passed
#   growl    a rough edge: the voice amplitude-modulated near f0/2 (subharmonic, like a fry), then soft-clipped; dB under the voice
#   whisper  a breathy double from the same envelope with no voicing, high-passed, wide and a little late; dB under the voice
#   comp     a 4:1 compressor after the EQ: a dense, close voice that the hall cannot swallow
#   hall     a long dark stone hall baked in (the game's voice bus has none): voice_fx.impulse, RT60 `rt`, low-passed tail
#   rumble   a low forge rumble under the words (brown noise 25-110 Hz with a slow swell); dB under the voice, 0 = off
#   level    sample peak -2.0 dBFS (about -1.7 dBTP after the codec) like the other lines; the printed gain brings it to `target` LUFS
#
# usage: python smith_fx.py in.wav out.ogg [--pitch 8] [--formant 4] [--tempo 0.85] ...
#        prints json: seconds (end of the words from the file's start), duration, lufs, tp, gain
import sys, argparse, subprocess, json, tempfile, os
import numpy as np, pyworld as pw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voice_fx import ff, load, through, fftconv, impulse, FF, SR


def warp_env(sp, a):
    """Spectral envelope with every formant moved by factor a (a < 1: lower): new(f) = old(f / a)."""
    n = sp.shape[1]; k = np.arange(n); src = np.clip(k / a, 0, n - 1)
    lo = np.floor(src).astype(int); hi = np.minimum(lo + 1, n - 1); w = src - lo
    out = sp[:, lo] * (1 - w) + sp[:, hi] * w
    out[:, src >= n - 1] = sp[:, -1:].min() * 0.001 + out[:, src >= n - 1] * 0.05   # above the old top: nearly silent
    return out


def rms(x): return np.sqrt(np.mean(x ** 2)) + 1e-12


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--pitch', type=float, default=8.0)
    ap.add_argument('--formant', type=float, default=4.0)
    ap.add_argument('--flat', type=float, default=0.6)
    ap.add_argument('--tempo', type=float, default=0.85, help='<1 slower (frame stretch in the vocoder)')
    ap.add_argument('--sub', type=float, default=-9)
    ap.add_argument('--growl', type=float, default=-10)
    ap.add_argument('--whisper', type=float, default=-13)
    ap.add_argument('--wet', type=float, default=0.30)
    ap.add_argument('--rt', type=float, default=4.2)
    ap.add_argument('--rumble', type=float, default=-26)
    ap.add_argument('--tail', type=float, default=3.0)
    ap.add_argument('--target', type=float, default=-17.2)
    ap.add_argument('--dry', help='also write the processed voice before hall/rumble here (wav), for checks')
    o = ap.parse_args()

    x = load(o.src)                                     # 48 kHz mono float64
    # trim to 40 ms before the first word and 120 ms after the last
    w = int(SR * 0.01); n = len(x) // w
    e = 10 * np.log10(np.mean(x[:n * w].reshape(n, w) ** 2, axis=1) + 1e-12); top = e.max()
    on = max(0, int(np.argmax(e > top - 40)) * w - int(SR * 0.04)); off = min(len(x), (n - int(np.argmax(e[::-1] > top - 40))) * w + int(SR * 0.12))
    x = np.ascontiguousarray(x[on:off])

    # 1 WORLD analysis
    fp = 5.0
    f0, t = pw.harvest(x, SR, f0_floor=55, f0_ceil=400, frame_period=fp)
    sp = pw.cheaptrick(x, f0, t, SR); apr = pw.d4c(x, f0, t, SR)
    if o.tempo != 1.0:                                  # stretch frames in time
        m = len(f0); idx = np.linspace(0, m - 1, int(round(m / o.tempo)))
        i0 = np.floor(idx).astype(int); i1 = np.minimum(i0 + 1, m - 1); ww = (idx - i0)[:, None]
        v = (f0[i0] > 0) & (f0[i1] > 0)
        f0 = np.where(v, f0[i0] * (1 - ww[:, 0]) + f0[i1] * ww[:, 0], 0)
        sp = sp[i0] * (1 - ww) + sp[i1] * ww; apr = apr[i0] * (1 - ww) + apr[i1] * ww
    voiced = f0 > 0
    med = np.exp(np.median(np.log(f0[voiced])))
    g = f0.copy(); g[voiced] = med * (f0[voiced] / med) ** o.flat * 2 ** (-o.pitch / 12)
    spw = np.ascontiguousarray(warp_env(sp, 2 ** (-o.formant / 12)))
    apr = np.ascontiguousarray(apr)
    main_v = pw.synthesize(np.ascontiguousarray(g), spw, apr, SR, fp)
    L = len(main_v)

    # 2 the octave under: same throat, half the fundamental, darker
    sub = np.zeros(L)
    if o.sub > -60:
        s = pw.synthesize(np.ascontiguousarray(g / 2), spw, apr, SR, fp)[:L]
        s = through(s, 'lowpass=f=900,lowpass=f=900')[:L]
        sub[:len(s)] = s * 10 ** (o.sub / 20) * rms(main_v) / rms(s)
    # 3 growl: amplitude modulation near half the fundamental, then soft clipping, band-limited
    gr = np.zeros(L)
    if o.growl > -60:
        tt = np.arange(L) / SR
        fr = np.interp(tt, np.arange(len(g)) * fp / 1000, np.where(g > 0, g, med * 2 ** (-o.pitch / 12))) / 2
        ph = 2 * np.pi * np.cumsum(fr) / SR + np.cumsum(np.random.default_rng(3).standard_normal(L)) * 0.002
        y = main_v * (1 + 0.9 * np.sin(ph))
        y = np.tanh(3.5 * y / (np.max(np.abs(y)) + 1e-12))
        y = through(y, 'highpass=f=250,lowpass=f=3500')[:L]
        gr[:len(y)] = y * 10 ** (o.growl / 20) * rms(main_v) / rms(y)
    # 4 whisper double: the same envelope, no voicing (aperiodicity 1), formants a touch less low, wide and late
    wl = np.zeros(L); wr = np.zeros(L)
    if o.whisper > -60:
        spw2 = np.ascontiguousarray(warp_env(sp, 2 ** (-o.formant * 0.5 / 12)))
        wh = pw.synthesize(np.ascontiguousarray(g), spw2, np.ones_like(apr), SR, fp)[:L]
        wh = through(wh, 'highpass=f=1200,equalizer=f=5000:t=q:w=1:g=3')[:L]
        wh = wh * 10 ** (o.whisper / 20) * rms(main_v) / rms(wh)
        d1, d2 = int(SR * 0.017), int(SR * 0.029)
        wl[d1:] = wh[:L - d1]; wr[d2:] = wh[:L - d2] * 0.9

    voice = main_v + sub + gr
    voice = through(voice, 'highpass=f=38,equalizer=f=110:t=q:w=0.9:g=3,equalizer=f=420:t=q:w=1.2:g=-2.5,equalizer=f=2600:t=q:w=1.1:g=3,deesser=i=0.3,acompressor=threshold=0.08:ratio=4:attack=4:release=160:knee=4:makeup=2')[:L]
    # where the words end (from the trimmed file start)
    n = len(voice) // w
    e = 10 * np.log10(np.mean(voice[:n * w].reshape(n, w) ** 2, axis=1) + 1e-12); top = e.max()
    first = int(np.argmax(e > top - 35)) * w
    last = (n - int(np.argmax(e[::-1] > top - 35))) * w
    lead = max(0, first - int(SR * 0.04))
    voice = voice[lead:]; wl = wl[lead:]; wr = wr[lead:]; words_end = (last - lead) / SR
    N = int(SR * (words_end + o.tail))
    pad = lambda a: np.concatenate([a, np.zeros(max(0, N - len(a)))])[:N]
    voice, wl, wr = pad(voice), pad(wl), pad(wr)
    Ld, Rd = voice + wl, voice + wr
    if o.dry:
        import soundfile as sf; sf.write(o.dry, np.stack([Ld, Rd], 1) * 0.5 / np.max(np.abs(Ld)), SR)

    # 5 the hall: dark stone, pre-delayed, the tail low-passed
    irL, irR = impulse(o.rt, 11), impulse(o.rt, 12)
    hl = through(fftconv(Ld, irL)[:N], 'lowpass=f=2400,highpass=f=60')[:N]
    hr = through(fftconv(Rd, irR)[:N], 'lowpass=f=2400,highpass=f=60')[:N]
    pre = int(SR * 0.035)
    hl = np.concatenate([np.zeros(pre), hl])[:N]; hr = np.concatenate([np.zeros(pre), hr])[:N]
    k = rms(voice) / (rms(hl) + 1e-12)
    out = np.stack([Ld * (1 - o.wet) + hl * k * o.wet * 1.4, Rd * (1 - o.wet) + hr * k * o.wet * 1.4], 1)

    # 6 the forge rumble under it: brown noise, 25-110 Hz, swelling in and dying with the tail
    if o.rumble > -60:
        rng = np.random.default_rng(7)
        b = np.cumsum(rng.standard_normal((N, 2)), 0); b -= np.linspace(0, 1, N)[:, None] * b[-1]
        b = through(b.reshape(-1), 'highpass=f=25,lowpass=f=110,lowpass=f=110', ch_in=2, ch_out=2)[:N]
        tt = np.arange(N) / SR
        env = np.clip(tt / 0.6, 0, 1) * np.clip((words_end + o.tail * 0.8 - tt) / (o.tail * 0.8), 0, 1) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.35 * tt))
        b = b / rms(b) * rms(voice[: int(SR * words_end)]) * 10 ** (o.rumble / 20) * env[:, None]
        out = out + b

    f = int(SR * 0.6); out[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    out[:int(SR * 0.003)] *= np.linspace(0, 1, int(SR * 0.003))[:, None]
    out *= 10 ** (-2.0 / 20) / np.max(np.abs(out))
    tmp = tempfile.NamedTemporaryFile(suffix='.f64', delete=False); tmp.write(out.astype(np.float64).tobytes()); tmp.close()
    ff(['-y', '-f', 'f64le', '-ar', str(SR), '-ac', '2', '-i', tmp.name, '-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on', '-application', 'audio', o.dst])
    os.unlink(tmp.name)
    rep = subprocess.run([FF, '-hide_banner', '-nostats', '-i', o.dst, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(rep[rep.rindex('{'):rep.rindex('}') + 1])
    lufs, tp = float(j['input_i']), float(j['input_tp'])
    print(json.dumps({'file': os.path.basename(o.dst), 'seconds': round(words_end, 2), 'duration': round(N / SR, 3), 'lufs': lufs, 'tp': tp, 'gain': round(10 ** ((o.target - lufs) / 20), 4)}))


if __name__ == '__main__':
    main()
