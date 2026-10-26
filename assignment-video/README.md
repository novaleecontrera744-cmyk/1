# Persian setuid assignment video

Explainer video for assignment 1 (setuid access control), built from the supplied narration,
source code and recorded execution evidence. Nothing was synthesised: the voice is the supplied
recording (cut and cleaned), every code excerpt is read from `../inputs/code`, and every number comes
from `../inputs/evidence` (`src/verify_evidence.py` checks them).

| Output | Content |
| --- | --- |
| `output/persian-setuid-assignment.mp4` | 1920×1080, 30 fps, H.264 + AAC, 4:50, subtitles burned into a separate safe area |
| `output/subtitles-fa.srt` | the same corrected, re-timed subtitles as UTF-8 SRT |
| `output/evidence-verification.txt` | automated checks of all figures shown in the video |

## Layout

| Path | Purpose |
| --- | --- |
| `data/subtitles_fa.txt` | corrected subtitle text, one cue per line (`id|text`) - edit here |
| `data/audio_removals.json` | fillers, false start and stutter cut from the recording |
| `src/audio/` | `build_edit.py` (cuts, pause shortening), `finalize_audio.py` (tempo 1.04, loudness) |
| `src/subtitles/` | `transcribe.py` (Whisper timings of the edited audio), `build_subtitles.py` (alignment, SRT, timeline) |
| `src/render/` | `extract_data.py` (excerpts and evidence to `build/data.js`), `render.mjs` (frame renderer + ffmpeg) |
| `src/scene/` | the video itself: `index.html`, `style.css`, `lib.js`, `main.js`, `scene1-7.js` |
| `assets/fonts/` | Vazirmatn and JetBrains Mono (SIL OFL) |
| `build/` | intermediates: edited audio, ASR timings, `data.js`, `timeline.js` |

## Rebuild

Needs Node 20+, `ffmpeg` (with rubberband), Chrome or Chromium, Python 3.10+ (`pip install -r requirements.txt`).

```sh
npm install
ffmpeg -y -i "../inputs/Voice 261026_193553.mp3" -ar 48000 -ac 1 -c:a pcm_s16le build/audio/orig48k.wav
python3 src/audio/build_edit.py && python3 src/audio/finalize_audio.py      # build/audio/final.wav
python3 src/render/extract_data.py && python3 src/verify_evidence.py          # build/data.js, output/evidence-verification.txt
python3 src/subtitles/build_subtitles.py                                      # output/subtitles-fa.srt, build/timeline.js
CHROME_PATH=/path/to/chrome npm run render                                    # output/persian-setuid-assignment.mp4 (about 12 min on 2 vCPUs)
```

`build/asr/final_large-v3.json` is kept so the subtitles can be rebuilt without ASR. After changing the
audio, regenerate it: `ffmpeg -i build/audio/final.wav -ar 16000 -ac 1 /tmp/final16k.wav`, then
`python3 src/subtitles/transcribe.py /tmp/final16k.wav build/asr/final_large-v3.json large-v3`.
Preview single moments with `node src/render/render.mjs --stills 12,95.5` (PNGs in `build/stills/`).

## Notes

- Panels labelled «بازنمایی خروجی ثبت‌شده» redraw recorded output (log, JSON); no command was run live and the setuid helper was never executed.
- The ~36 s runtime shown in the results scene is the narrator's recorded figure; it is not part of the saved log.
- The 327 and 111 trace counts overlap (they count traces containing an allowed or a denied `run_worker`).
- `mutant_backend` is a local test double used only to demonstrate the reducer; its source is not part of the inputs.
