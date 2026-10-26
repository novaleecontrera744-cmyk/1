#!/usr/bin/env python3
"""Cut fillers, a throat clear, a false start and a stutter out of the recording,
shorten long pauses, and write the assembled audio plus an exact time map.

Every output sample is taken from the original recording. Nothing is synthesised.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
FRAME = 0.010            # envelope hop in seconds
QUIET_LEVEL = 2.5        # level units: (dB + 60) / 6, so 2.5 is about -45 dB
CROSSFADE = 0.020        # seconds


def envelope_levels(x, sr):
    """Short-time level per 10 ms frame (25 ms window, max over two frames)."""
    hop, win = int(FRAME * sr), int(0.025 * sr)
    count = (len(x) - win) // hop
    rms = np.sqrt(np.array([np.mean(x[i * hop:i * hop + win] ** 2) for i in range(count)]) + 1e-12)
    db = 20 * np.log10(rms + 1e-9)
    level = np.array([(max(db[i], db[min(i + 1, count - 1)]) + 60) / 6 for i in range(count)])
    return level


PAUSE_BASE, PAUSE_SLOPE, PAUSE_MAX = 0.20, 0.20, 0.44


def pause_target(frames):
    """Target length (frames) for a quiet run of the given length."""
    q = frames * FRAME
    if q < 0.20:
        return frames
    target = min(PAUSE_BASE + PAUSE_SLOPE * (q - 0.20), PAUSE_MAX)
    return min(frames, int(round(target / FRAME)))


def build(args):
    removals = json.loads((ROOT / "data" / "audio_removals.json").read_text())["removals"]
    x, sr = sf.read(args.input, dtype="float32")
    assert x.ndim == 1
    level = envelope_levels(x, sr)
    n = len(level)
    keep = np.ones(n, bool)
    for r in removals:
        keep[int(round(r["start"] / FRAME)):int(round(r["end"] / FRAME))] = False

    kept_idx = np.flatnonzero(keep)
    quiet = level[kept_idx] <= QUIET_LEVEL
    drop_pause = []
    i = 0
    while i < len(kept_idx):
        if quiet[i]:
            j = i
            while j < len(kept_idx) and quiet[j]:
                j += 1
            run = j - i
            starts_file = i == 0
            ends_file = j == len(kept_idx)
            if starts_file:
                target = int(round(args.lead / FRAME))
                if run > target:
                    drop_pause.extend(kept_idx[i:j - target])
            elif ends_file:
                target = int(round(args.tail / FRAME))
                if run > target:
                    drop_pause.extend(kept_idx[i + target:j])
            else:
                target = pause_target(run)
                if run > target:
                    half = target // 2
                    margin = 3  # never touch the 30 ms next to speech
                    drop_pause.extend(kept_idx[i + max(half, margin):j - max(target - half, margin)])
            i = j
        else:
            i += 1
    keep[np.array(drop_pause, dtype=int)] = False

    # contiguous kept runs -> segments in original samples
    hop = int(FRAME * sr)
    segments, i = [], 0
    while i < n:
        if keep[i]:
            j = i
            while j < n and keep[j]:
                j += 1
            segments.append((i * hop, j * hop))
            i = j
        else:
            i += 1
    last_end = min(len(x), segments[-1][1] + int(0.03 * sr))
    segments[-1] = (segments[-1][0], last_end)

    xf = int(CROSSFADE * sr)
    out = np.zeros(0, np.float32)
    mapping, junctions = [], []
    for k, (a, b) in enumerate(segments):
        piece = x[a:b]
        if k == 0:
            out = piece.copy()
            mapping.append({"src_start": a / sr, "src_end": b / sr, "dst_start": 0.0, "dst_end": len(out) / sr})
            continue
        n_over = min(xf, len(out), len(piece))
        t = np.linspace(0, np.pi / 2, n_over, dtype=np.float32)
        blended = out[-n_over:] * np.cos(t) + piece[:n_over] * np.sin(t)
        junctions.append(len(out) / sr)
        dst_start = (len(out) - n_over) / sr
        out = np.concatenate([out[:-n_over], blended, piece[n_over:]])
        mapping.append({"src_start": a / sr, "src_end": b / sr, "dst_start": dst_start, "dst_end": len(out) / sr})

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, out, sr, subtype="FLOAT")
    removed_manual = sum(r["end"] - r["start"] for r in removals)
    report = {
        "input_seconds": len(x) / sr, "output_seconds": len(out) / sr,
        "removed_manual_seconds": removed_manual,
        "removed_pause_seconds": len(drop_pause) * FRAME,
        "segments": len(segments), "junctions": len(junctions),
        "lead_seconds": args.lead, "tail_seconds": args.tail,
    }
    Path(args.map).write_text(json.dumps({"report": report, "segments": mapping, "junctions": junctions},
                                         indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--input", default=str(ROOT / "build/audio/orig48k.wav"))
    p.add_argument("--output", default=str(ROOT / "build" / "audio" / "assembled.wav"))
    p.add_argument("--map", default=str(ROOT / "build" / "audio" / "edit_map.json"))
    p.add_argument("--lead", type=float, default=0.35)
    p.add_argument("--tail", type=float, default=0.45)
    build(p.parse_args())
