"""Transcribe a WAV file with faster-whisper and store word-level timestamps as JSON."""
import json
import sys
import time

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

wav, out, model_name = sys.argv[1], sys.argv[2], sys.argv[3]
t0 = time.time()
model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=2)
print(f"model loaded in {time.time() - t0:.1f}s", flush=True)
audio, sample_rate = sf.read(wav, dtype="float32")
assert sample_rate == 16000 and audio.ndim == 1
segments, info = model.transcribe(
    audio, language="fa", beam_size=5, word_timestamps=True,
    condition_on_previous_text=False, vad_filter=False, temperature=0.0,
)
result = {"language": info.language, "duration": info.duration, "segments": []}
for seg in segments:
    result["segments"].append({
        "start": seg.start, "end": seg.end, "text": seg.text,
        "words": [{"w": w.word, "s": w.start, "e": w.end, "p": w.probability} for w in (seg.words or [])],
    })
    print(f"[{seg.start:7.2f} -> {seg.end:7.2f}] {seg.text}", flush=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
print(f"done in {time.time() - t0:.1f}s", flush=True)
