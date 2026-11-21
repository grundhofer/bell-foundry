# Kokoro takes for the foundry's spoken lines: every line x voice x speed as 24 kHz mono wav in takes/.
import sys, os, itertools
import numpy as np, soundfile as sf
from kokoro import KPipeline
from phonemizer.backend.espeak.wrapper import EspeakWrapper
# espeak-ng keeps its data path in a 160-byte buffer: the venv's own path is longer, so a copy sits at a short path
EspeakWrapper.set_data_path(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'es'))

OUT = sys.argv[1]
LINES = {
    'boss_intro': 'Put out your light, pilgrim. My bells are cooling in the dark.',
    'boss_phase': 'Then you will ring with them.',
    'boss_end': 'Let them ring.',
    'voice_save': 'Do I have to recast you too?',
    'voice_fries': 'What a waste of good bronze.',
}
VOICES = sys.argv[2].split(',') if len(sys.argv) > 2 else ['af_heart', 'af_bella', 'bf_emma', 'af_nicole', 'bf_isabella']
SPEEDS = [float(s) for s in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0.8, 0.9]
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
            print(fn, round(len(audio) / 24000, 2))
