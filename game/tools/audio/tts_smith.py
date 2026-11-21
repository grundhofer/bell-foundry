# Kokoro takes for the smith's spoken lines (Vulkar): every line x male voice x speed as 24 kHz mono wav.
# usage: python tts_smith.py outdir am_fenrir,am_onyx 0.8,0.9 [line,line]
import sys, os
import numpy as np, soundfile as sf
from kokoro import KPipeline
from phonemizer.backend.espeak.wrapper import EspeakWrapper
# espeak-ng keeps its data path in a 160-byte buffer: the venv's own path is longer, so a copy sits at a short path
EspeakWrapper.set_data_path(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'es'))

OUT = sys.argv[1]
LINES = {
    'boss_intro': 'Put out your light, pilgrim. Your bones will feed my forge.',
    'boss_intro_b': 'Put out your light, pilgrim. My bells are cooling in the dark.',
    'boss_phase': 'Then I will melt you down.',
    'boss_phase_b': 'Then you will ring with them.',
    'boss_end': 'Let them ring.',
    'boss_end_b': 'Let the bells ring.',
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
