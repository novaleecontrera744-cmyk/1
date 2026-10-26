#!/usr/bin/env python3
"""Build build/data.js from the read-only assignment inputs.

Source excerpts, evidence JSON, the recorded log and the probe values are read
straight from inputs/, so the video never contains retyped code or numbers.
"""
import hashlib
import json
import sys
from pathlib import Path

from pygments import lex
from pygments.lexers import CLexer, JsonLexer, PythonLexer
from pygments.token import Token

ROOT = Path(__file__).resolve().parents[3]
INPUTS = ROOT / "inputs"
OUT = ROOT / "assignment-video" / "build" / "data.js"

# id -> (file, [(first_line, last_line), ...]); several ranges are joined by a gap marker.
EXCERPTS = {
    "cred_requester": ("credentials.c", [(7, 10)]),
    "cred_transitions": ("credentials.c", [(12, 25)]),
    "pol_read": ("policy.c", [(4, 7)]),
    "pol_clone": ("policy.c", [(9, 12)]),
    "pol_run": ("policy.c", [(14, 19)]),
    "pol_fetch": ("policy.c", [(21, 24)]),
    "pol_owner": ("policy.c", [(26, 30)]),
    "eng_caller": ("engine.c", [(245, 245)]),
    "eng_run_worker": ("engine.c", [(267, 270)]),
    "eng_probe": ("engine.c", [(226, 236)]),
    "eng_respond": ("engine.c", [(101, 105)]),
    "model_state": ("policy_model.py", [(6, 6), (21, 33)]),
    "model_run": ("policy_model.py", [(110, 123)]),
    "ts_generate": ("test_stateful.py", [(79, 87)]),
    "ts_pick": ("test_stateful.py", [(26, 35)]),
    "ts_components": ("test_stateful.py", [(16, 16)]),
    "ts_symbols": ("test_stateful.py", [(135, 147)]),
    "ts_replay": ("test_stateful.py", [(201, 201), (205, 216)]),
    "ts_reduce": ("test_stateful.py", [(230, 244)]),
}

LEXERS = {".c": CLexer(), ".h": CLexer(), ".py": PythonLexer()}


def css_class(token_type):
    """Map a Pygments token type to one of a few restrained style classes."""
    if token_type in Token.Comment.Preproc:
        return "cp"
    if token_type in Token.Comment:
        return "c"
    if token_type in Token.Keyword.Type:
        return "kt"
    if token_type in Token.Keyword:
        return "k"
    if token_type in Token.Literal.String:
        return "s"
    if token_type in Token.Literal.Number:
        return "n"
    if token_type in Token.Name.Function or token_type in Token.Name.Class:
        return "nf"
    if token_type in Token.Name.Builtin:
        return "nb"
    if token_type in Token.Operator:
        return "o"
    return ""


def tokenize_file(path):
    """Return one list of [class, text] tokens per source line."""
    text = path.read_text(encoding="utf-8")
    lines = [[]]
    for token_type, value in lex(text, LEXERS[path.suffix]):
        cls = css_class(token_type)
        parts = value.split("\n")
        for index, part in enumerate(parts):
            if index > 0:
                lines.append([])
            if part:
                lines[-1].append([cls, part])
    # Verify the tokenisation reproduces the file byte for byte.
    rebuilt = "\n".join("".join(t for _, t in line) for line in lines)
    if rebuilt.rstrip("\n") != text.rstrip("\n"):
        raise SystemExit(f"tokenisation of {path.name} does not reproduce the source")
    return lines


def build_excerpts():
    cache, result = {}, {}
    for key, (name, ranges) in EXCERPTS.items():
        path = INPUTS / "code" / name
        if name not in cache:
            cache[name] = tokenize_file(path)
        rows = []
        for first, last in ranges:
            if rows:
                rows.append({"gap": True})
            for number in range(first, last + 1):
                rows.append({"n": number, "tokens": cache[name][number - 1]})
        result[key] = {"file": name, "rows": rows}
    return result


def wrap_json_line(raw):
    """Split a one-line JSON document at its top-level commas without altering tokens."""
    out, depth, in_string, escaped, current = [], 0, False, False, ""
    for ch in raw.strip():
        current += ch
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
        elif ch == "," and depth == 1:
            out.append(current)
            current = ""
    out.append(current)
    return [line.strip() for line in out]


def json_tokens(line):
    """Tokenise one JSON text line into [class, text] pairs using Pygments."""
    tokens = []
    for token_type, value in lex(line, JsonLexer()):
        value = value.rstrip("\n")
        if not value:
            continue
        if token_type in Token.Name.Tag:
            cls = "jk"
        elif token_type in Token.Literal.String:
            cls = "s"
        elif token_type in Token.Literal.Number:
            cls = "n"
        elif token_type in Token.Keyword.Constant:
            cls = "k"
        else:
            cls = ""
        tokens.append([cls, value])
    return tokens


def build_evidence():
    evidence = {}
    for name in ("probe-alice.json", "probe-bob.json"):
        raw = (INPUTS / "evidence" / name).read_text(encoding="utf-8")
        parsed = json.loads(raw)
        lines = wrap_json_line(raw)
        evidence[name] = {
            "file": f"evidence/{name}",
            "raw": raw.strip(),
            "parsed": parsed,
            "lines": [{"text": l, "tokens": json_tokens(l)} for l in lines],
        }
    return evidence


def build_runs():
    runs = {}
    base = INPUTS / "evidence" / "evidence"
    for name in ("seed-1.json", "seed-2.json", "seed-3.json", "seed-14050714.json", "repeat-14050714.json"):
        raw = (base / name).read_text(encoding="utf-8")
        runs[name] = {"raw": raw.strip(), "parsed": json.loads(raw)}
    log = (base / "run-14050714.txt").read_text(encoding="utf-8")
    runs["log_lines"] = log.rstrip("\n").split("\n")
    return runs


def build_mutant():
    path = INPUTS / "evidence" / "mutant-owner.json"
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    violation = parsed["violations"][0]
    return {"raw": raw.strip(), "parsed": parsed, "violation": violation}


def witness_positions(first_trace):
    """1-based positions of the two witness operations inside trace 0 of the supplied trace file."""
    witness = json.loads((INPUTS / "evidence" / "mutant-owner.json").read_text(encoding="utf-8"))["violations"][0]["trace"]
    return [next(i + 1 for i, op in enumerate(first_trace) if op == w) for w in witness]


def main():
    traces_raw = (INPUTS / "traces.json").read_bytes()
    traces = json.loads(traces_raw.decode("utf-8"))
    data = {
        "excerpts": build_excerpts(),
        "evidence": build_evidence(),
        "runs": build_runs(),
        "mutant": build_mutant(),
        "traces": {
            "sha256": hashlib.sha256(traces_raw).hexdigest(),
            "count": len(traces["traces"]),
            "seed": traces["seed"],
            "min_len": min(len(t) for t in traces["traces"]),
            "max_len": max(len(t) for t in traces["traces"]),
            "distinct": len({json.dumps(t, sort_keys=True) for t in traces["traces"]}),
            "first_ops": [op["op"] for op in traces["traces"][0]],
            "witness_positions": witness_positions(traces["traces"][0]),
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
