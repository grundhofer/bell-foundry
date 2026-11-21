# Kokoro takes for the two rescue lines (the old foundry master who pours the fallen pilgrim back into shape):
# every line x voice x speed as 24 kHz mono wav.
# usage: python tts_rescue.py outdir bm_george,bm_fable 0.85,0.95 [line,line]
import sys, os
import numpy as np, soundfile as sf
from kokoro import KPipeline
from phonemizer.backend.espeak.wrapper import EspeakWrapper
# espeak-ng keeps its data path in a 160-byte buffer: the venv's own path is longer, so a copy sits at a short path
EspeakWrapper.set_data_path(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'es'))

OUT = sys.argv[1]
LINES = {
    'voice_save': 'Again? Back into the mould with you.',
    'voice_save_b': 'Hold still. Back into the mould.',
    'voice_fries': "That bronze comes out of your wages.",
    'voice_fries_b': "Bronze isn't free, you know.",
}
VOICES = sys.argv[2].split(',')
SPEEDS = [float(s) for s in sys.argv[3].split(',')]
only = sys.argv[4].split(',') if len(sys.argv) > 4 else list(LINES)
pipes = {}
for v in VOICES:
    lang = v[0]
    p = pipes.get(lang) or pipes.setdefault(lang, KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M'))
    for name in only:
        for sp in SPEEDS:
            parts = [a.numpy() if hasattr(a, 'numpy') else np.asarray(a) for _, ps, a in p(LINES[name], voice=v, speed=sp)]
            audio = np.concatenate(parts)
            fn = os.path.join(OUT, f'{name}__{v}__{sp}.wav')
            sf.write(fn, audio, 24000)
            print(fn.split('/')[-1], round(len(audio) / 24000, 2))
