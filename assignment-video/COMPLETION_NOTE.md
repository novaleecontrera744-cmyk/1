# Completion note

## Delivered

| File | Result |
| --- | --- |
| `output/persian-setuid-assignment.mp4` | 1920×1080, 30 fps (8700 frames), H.264 High/yuv420p (BT.709), AAC-LC stereo 48 kHz, **4:50.0**, about 36 MB, loudness -16.6 LUFS |
| `output/subtitles-fa.srt` | 90 corrected, re-timed cues (UTF-8, at most two lines each); the same cues are burned into the video |
| `output/evidence-verification.txt` | 53 checks on every figure in the video: 53 pass, 0 fail |
| `README.md`, `src/`, `data/`, `assets/` | editable sources and the rebuild commands |

## What was done

- **Voice**: only the supplied recording is used. 18 cuts (15 fillers, 1 false start, 1 throat clear, 1 stutter; 9.4 s),
  23.2 s of long pauses shortened, then 1.04× pitch-preserving tempo, light compression and a limiter
  (336.1 s -> 290.0 s). No synthesised speech, no music. Re-running `build_edit.py` and `finalize_audio.py` reproduces `final.wav` sample for sample.
- **Subtitles**: the supplied SRT was an automatic transcript with errors (for example «اکسپورت اس وی سی‌ان» for `exportsvc`,
  «ست یو آی دی» for `setuid`, «جلو بررسی» for «جدا بررسی») and its timing no longer fits the edited audio. The corrected text
  (`data/subtitles_fa.txt`) was aligned to Whisper word times of the edited audio and snapped to measured pauses. Two independent timing estimates
  agreed within 0.09 s for 95% of words.
- **Visuals**: seven scenes (introduction, service authority vs. user permission, policy rules, credential changes,
  independent model and comparison, reduced witness, results). Code is read from `inputs/code` by line number; JSON and log panels are drawn
  from `inputs/evidence`.

## Checked

- Evidence script: probes (alice 998, bob 997, service 999; temporary drop changes only EUID; restore `EPERM`; reopen `EACCES`; held descriptor readable),
  9 public tests, seeds 1/2/3 and 14050714, repeat run identical, `traces.json` hash and 500 distinct traces of 5-20 operations,
  the 327/111 counts recomputed with the model alone, and the two-operation witness (one-minimal).
- Automated layout audit every second of the timeline (nothing overlaps the subtitle band, nothing clipped or off-screen) and review of frames
  from every scene of the rendered MP4.

## Not verified / limits

- Nothing was executed live: the setuid helper was not installed or run, and the supplied tests were not re-run. Panels labelled «بازنمایی خروجی ثبت‌شده» redraw recorded files.
- The ≈36 s runtime is the narrator's recorded figure; the saved log contains no runtime or exit code.
- I could not listen to the audio. Cuts were chosen from spectrograms and energy and then checked by re-transcribing the edited recording; a human playback pass is still advisable.

## For the author to confirm

1. The narration says the code ran in an Ubuntu 24.04 **container**; `inputs/code/README.md` asks for a fresh dedicated Ubuntu 24.04 **VM**. The video follows the narration.
2. In the temporary-drop explanation the narrator says "UID"; the video keeps the wording and adds an on-screen note that it means `EUID`.
3. 327 and 111 count traces containing an allowed or a denied `run_worker`; 50 traces contain both (388 of 500 contain at least one). The results scene says the counts may overlap.
4. `mutant_backend` is not in the inputs, so only its recorded witness is shown and it is labelled as a test double. The 16 -> 2 strip is a schematic of the reducer;
   the surviving operations (2nd and 7th of trace 0) are taken from the data.
5. The assignment PDF was not supplied, so nothing is quoted from it; the course name is unknown and not shown.
6. Excerpts of `test_stateful.py` skip the template's `TODO` comment lines (shown as `···`, line numbers unchanged).
