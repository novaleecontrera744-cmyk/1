#!/usr/bin/env python3
"""Time-stretch (pitch preserved), clean, loudness-normalise and limit the assembled audio."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def measure(path):
    """Integrated loudness (LUFS) and sample peak (dBFS) via ffmpeg."""
    out = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=sample", "-f", "null", "-"]).stderr
    summary = out[out.rfind("Summary:"):]
    lufs = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    peak = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1))
    return lufs, peak


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default=str(ROOT / "build/audio/assembled.wav"))
    p.add_argument("--output", default=str(ROOT / "build/audio/final.wav"))
    p.add_argument("--tempo", type=float, default=1.045)
    p.add_argument("--target-lufs", type=float, default=-16.0)
    p.add_argument("--ceiling", type=float, default=0.84)  # linear, about -1.5 dBFS
    p.add_argument("--pad-end", type=float, default=0.5)
    args = p.parse_args()
    work = Path(args.output).with_suffix(".stretched.wav")
    stretch = (f"highpass=f=60,rubberband=tempo={args.tempo}:pitch=1:transients=crisp:"
               f"detector=compound:phase=laminar:window=standard:formant=preserved")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", args.input, "-af", stretch,
         "-c:a", "pcm_f32le", str(work)])
    lufs, peak = measure(work)
    gain = args.target_lufs - lufs
    chain = (f"volume={gain:.2f}dB,alimiter=limit={args.ceiling}:attack=4:release=60:level=disabled,"
             f"apad=pad_dur={args.pad_end}")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(work), "-af", chain,
         "-c:a", "pcm_f32le", args.output])
    lufs2, peak2 = measure(args.output)
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", args.output]).stdout)
    report = {"tempo": args.tempo, "pre_gain_lufs": lufs, "pre_peak_dbfs": peak, "gain_db": round(gain, 2),
              "final_lufs": lufs2, "final_sample_peak_dbfs": peak2, "duration": dur}
    Path(args.output).with_suffix(".json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
