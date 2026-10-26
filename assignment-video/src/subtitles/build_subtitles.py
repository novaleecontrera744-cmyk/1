#!/usr/bin/env python3
"""Build the Persian SRT and the renderer timeline from the corrected cue text.

The corrected text (data/subtitles_fa.txt) is aligned at character level to the
word timestamps of a speech-recognition pass over the FINAL edited audio, so the
original SRT timestamps are never reused. Cue edges are then snapped to real
pauses measured in the final audio.
"""
import argparse
import difflib
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
ZWNJ = "\u200c"
CHAR_DUR = 0.065          # seconds per letter, used only to extend partial matches
MIN_BLOCK = 3             # ignore matching blocks shorter than this many letters
LINE_SOFT_LIMIT = 46      # characters per caption line
SPEECH_DB = -32.0         # frames louder than this count as speech
BRIDGE = 0.12             # gaps shorter than this inside speech are not pauses
MIN_PAUSE = 0.15          # shortest gap treated as a pause
ONSET_LEAD = 0.10         # a cue appears this long before speech resumes
OFFSET_LAG = 0.12         # a cue stays this long after speech stops


def normalise(text):
    """Letters only: unify Arabic/Persian variants, drop marks, digits to ASCII, lower-case Latin."""
    table = {"ي": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "ؤ": "و", "ئ": "ی", "ء": ""}
    out = []
    for ch in unicodedata.normalize("NFKC", text):
        ch = table.get(ch, ch)
        if ch in (ZWNJ, "ـ") or unicodedata.category(ch).startswith(("P", "M", "Z", "C", "S")):
            continue
        if ch.isdigit():
            ch = str(unicodedata.digit(ch))
        out.append(ch.lower())
    return "".join(out)


def read_cues(path):
    cues = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            cue_id, text = line.split("|", 1)
            cues.append({"id": cue_id.strip(), "text": text.strip()})
    return cues


def align(cues, asr_words):
    """Return per-token (start, end) in seconds, interpolating tokens without a match."""
    tokens = []
    for ci, cue in enumerate(cues):
        for word in cue["text"].split():
            tokens.append({"cue": ci, "text": word, "norm": normalise(word)})
    a_chars, a_owner = [], []
    for ti, tok in enumerate(tokens):
        a_chars.extend(tok["norm"])
        a_owner.extend([ti] * len(tok["norm"]))
    b_chars, b_time = [], []
    for w in asr_words:
        letters = normalise(w["w"])
        for j, ch in enumerate(letters):
            b_chars.append(ch)
            b_time.append(w["s"] + (j + 0.5) / len(letters) * (w["e"] - w["s"]))
    matcher = difflib.SequenceMatcher(None, "".join(a_chars), "".join(b_chars), autojunk=False)
    first = {}
    last = {}
    for block in matcher.get_matching_blocks():
        if block.size < MIN_BLOCK:
            continue
        for k in range(block.size):
            ia, ib = block.a + k, block.b + k
            ti = a_owner[ia]
            first.setdefault(ti, (ia, b_time[ib]))
            last[ti] = (ia, b_time[ib])
    offsets = {}
    pos = 0
    for ti, tok in enumerate(tokens):
        offsets[ti] = pos
        pos += len(tok["norm"])
    for ti, tok in enumerate(tokens):
        n = len(tok["norm"])
        if ti in first:
            ia0, t0 = first[ti]
            ia1, t1 = last[ti]
            tok["start"] = t0 - (ia0 - offsets[ti]) * CHAR_DUR
            tok["end"] = t1 + (offsets[ti] + n - 1 - ia1) * CHAR_DUR + CHAR_DUR
            tok["matched"] = True
        else:
            tok["matched"] = False
    # monotonic clean-up and interpolation of unmatched tokens
    matched = [i for i, t in enumerate(tokens) if t["matched"]]
    for i, tok in enumerate(tokens):
        if tok["matched"]:
            continue
        prev = max((m for m in matched if m < i), default=None)
        nxt = min((m for m in matched if m > i), default=None)
        lo = tokens[prev]["end"] if prev is not None else 0.0
        hi = tokens[nxt]["start"] if nxt is not None else lo + 1.0
        span = range((prev + 1) if prev is not None else 0, nxt if nxt is not None else len(tokens))
        total = sum(max(1, len(tokens[j]["norm"])) for j in span)
        acc = sum(max(1, len(tokens[j]["norm"])) for j in range(span.start, i))
        w = max(1, len(tok["norm"]))
        tok["start"] = lo + (hi - lo) * acc / total
        tok["end"] = lo + (hi - lo) * (acc + w) / total
    cursor = 0.0
    for tok in tokens:
        tok["start"] = max(tok["start"], cursor)
        tok["end"] = max(tok["end"], tok["start"] + 0.05)
        cursor = tok["start"]
    return tokens


def audio_levels(path):
    """Short-time RMS level in dB per 10 ms frame (25 ms window) and the duration in seconds."""
    x, sr = sf.read(path, dtype="float32")
    hop, win = int(0.01 * sr), int(0.025 * sr)
    n = (len(x) - win) // hop
    rms = np.sqrt(np.array([np.mean(x[i * hop:i * hop + win] ** 2) for i in range(n)]) + 1e-12)
    return 20 * np.log10(rms + 1e-9), len(x) / sr


def speech_pauses(db):
    """Return (start, end) seconds of every pause: a gap in speech of at least MIN_PAUSE after bridging short dips."""
    active = db > SPEECH_DB
    gaps, i = [], 0
    while i < len(active):
        if not active[i]:
            j = i
            while j < len(active) and not active[j]:
                j += 1
            gaps.append((i, j))
            i = j
        else:
            i += 1
    pauses = []
    for i, j in gaps:
        inner = i > 0 and j < len(active)
        if inner and (j - i) * 0.01 < BRIDGE:
            continue
        if (j - i) * 0.01 >= MIN_PAUSE:
            pauses.append((i * 0.01, j * 0.01))
    return pauses


def snap(cues_t, pauses, duration):
    """Put cue edges on measured pauses: a cue starts where speech resumes and ends just after it stops."""
    for cue in cues_t:
        starts = [(b, e) for b, e in pauses
                  if cue["start"] - 0.35 <= e <= min(cue["start"] + 0.75, cue["first_end"] + 0.15) and b <= cue["start"] + 0.15]
        if starts:
            cue["start"] = min(starts, key=lambda p: abs(p[1] - cue["start"]))[1] - ONSET_LEAD
        ends = [(b, e) for b, e in pauses
                if max(cue["end"] - 0.5, cue["last_start"] - 0.1) <= b <= cue["end"] + 0.35 and e >= cue["end"] - 0.1]
        cue["end"] = (min(ends, key=lambda p: abs(p[0] - cue["end"]))[0] + OFFSET_LAG) if ends else cue["end"] + 0.06
    for k, cue in enumerate(cues_t):
        prev_end = cues_t[k - 1]["end"] if k else 0.0
        cue["start"] = max(cue["start"], prev_end + 0.02 if k else 0.0)
        nxt = cues_t[k + 1]["start"] if k + 1 < len(cues_t) else duration
        cue["end"] = min(cue["end"], nxt - 0.02, duration - 0.05)
        if nxt - cue["end"] < 0.25 and k + 1 < len(cues_t):
            cue["end"] = nxt - 0.02          # keep the caption up across a very short gap
        if cue["end"] - cue["start"] < 1.0:
            cue["end"] = min(cue["start"] + 1.0, nxt - 0.02)
    return cues_t


def wrap_two_lines(text):
    """Split into at most two balanced lines without breaking Latin phrases."""
    words = text.split()
    if len(text) <= LINE_SOFT_LIMIT:
        return [text]
    best, best_score = None, None
    for i in range(1, len(words)):
        left, right = " ".join(words[:i]), " ".join(words[i:])
        score = abs(len(left) - len(right))
        if re.fullmatch(r"[A-Za-z0-9_.]+", words[i - 1]) and re.fullmatch(r"[A-Za-z0-9_.]+", words[i]):
            score += 100
        if words[i] == "و" or words[i - 1].endswith(("،", ".")):
            score -= 4
        if best_score is None or score < best_score:
            best, best_score = (left, right), score
    return list(best)


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--cues", default=str(ROOT / "data/subtitles_fa.txt"))
    p.add_argument("--asr", default="/tmp/work/asr/final_large-v3.json")
    p.add_argument("--audio", default=str(ROOT / "build/audio/final.wav"))
    p.add_argument("--srt", default=str(ROOT / "output/subtitles-fa.srt"))
    p.add_argument("--timeline", default=str(ROOT / "build/timeline.json"))
    args = p.parse_args()

    cues = read_cues(args.cues)
    asr = json.loads(Path(args.asr).read_text(encoding="utf-8"))
    words = [w for s in asr["segments"] for w in s["words"]]
    tokens = align(cues, words)
    db, duration = audio_levels(args.audio)
    pauses = speech_pauses(db)

    timed = []
    for ci, cue in enumerate(cues):
        toks = [t for t in tokens if t["cue"] == ci]
        timed.append({"ids": [cue["id"]], "text": cue["text"], "start": toks[0]["start"], "first_end": toks[0]["end"],
                      "end": toks[-1]["end"], "last_start": toks[-1]["start"],
                      "unmatched": sum(1 for t in toks if not t["matched"])})
    timed = snap(timed, pauses, duration)

    merged = []
    for cue in timed:
        if merged:
            prev = merged[-1]
            short = (prev["end"] - prev["start"] < 1.5) or (cue["end"] - cue["start"] < 1.5)
            fits = len(prev["text"]) + 1 + len(cue["text"]) <= 2 * LINE_SOFT_LIMIT
            if short and fits and cue["start"] - prev["end"] < 0.45:
                prev["ids"] += cue["ids"]
                prev["text"] += " " + cue["text"]
                prev["end"] = cue["end"]
                prev["unmatched"] += cue["unmatched"]
                continue
        merged.append(dict(cue))

    srt_lines, out_cues = [], []
    for i, cue in enumerate(merged, start=1):
        lines = wrap_two_lines(cue["text"])
        rendered = [("\u200f" + l) if re.match(r"[A-Za-z0-9]", l) else l for l in lines]
        srt_lines.append(f"{i}\n{srt_time(cue['start'])} --> {srt_time(cue['end'])}\n" + "\n".join(rendered) + "\n")
        out_cues.append({"n": i, "ids": cue["ids"], "start": round(cue["start"], 3), "end": round(cue["end"], 3),
                         "text": cue["text"], "lines": lines, "unmatched": cue["unmatched"]})
    Path(args.srt).parent.mkdir(parents=True, exist_ok=True)
    Path(args.srt).write_text("\n".join(srt_lines), encoding="utf-8")
    Path(args.timeline).write_text(json.dumps({
        "duration": duration, "cues": out_cues,
        "tokens": [{"cue": t["cue"], "id": cues[t["cue"]]["id"], "text": t["text"], "start": round(t["start"], 3),
                    "end": round(t["end"], 3), "matched": t["matched"]} for t in tokens]},
        ensure_ascii=False, indent=1), encoding="utf-8")
    timeline_js = Path(args.timeline).with_suffix(".js")
    timeline_js.write_text("window.TIMELINE = " + Path(args.timeline).read_text(encoding="utf-8") + ";\n", encoding="utf-8")
    unmatched = sum(1 for t in tokens if not t["matched"])
    print(f"{len(cues)} authored cues -> {len(out_cues)} final cues; tokens={len(tokens)} unmatched={unmatched}; duration={duration:.2f}")


if __name__ == "__main__":
    main()
