#!/usr/bin/env python3
"""Verify every number shown in the video against the supplied evidence files.

This script only reads inputs/. It imports the student's pure-python model and
trace helpers (no backend, no setuid helper) to cross-check the coverage counts
from the supplied traces.json. It never re-executes the original test run.
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
INPUTS = ROOT / "inputs"
EVIDENCE = INPUTS / "evidence"
RUNS = EVIDENCE / "evidence"
REPORT = ROOT / "assignment-video" / "output" / "evidence-verification.txt"

RECORDED_SHA256 = "0a5ff31fcbed68c8e70c3dc8f53ab128358dda1f91c18b00231a1211c81e6fc8"
EXPECTED_PROBES = {
    "probe-alice.json": {"service": 999, "caller": 998,
                         "initial": [998, 999, 999], "temporary": [998, 998, 999],
                         "restored": [998, 999, 999], "permanent": [998, 998, 998]},
    "probe-bob.json": {"service": 999, "caller": 997,
                       "initial": [997, 999, 999], "temporary": [997, 997, 999],
                       "restored": [997, 999, 999], "permanent": [997, 997, 997]},
}

lines, failures = [], []


def check(label, ok, detail=""):
    lines.append(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f" -- {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def verify_probes():
    for name, exp in EXPECTED_PROBES.items():
        probe = json.loads((EVIDENCE / name).read_text(encoding="utf-8"))
        for phase in ("initial", "temporary", "restored", "permanent"):
            check(f"{name} {phase} == {exp[phase]}", probe[phase] == exp[phase], str(probe[phase]))
        check(f"{name} service uid (initial EUID and SUID) == 999",
              probe["initial"][1] == probe["initial"][2] == exp["service"])
        check(f"{name} caller uid (RUID) == {exp['caller']}", probe["initial"][0] == exp["caller"])
        check(f"{name} restore_errno == 1 (EPERM)", probe["restore_errno"] == 1)
        check(f"{name} reopen_errno == 13 (EACCES)", probe["reopen_errno"] == 13)
        check(f"{name} held_content readable", probe["held_content"] == "credential probe: retained descriptor\n")
        check(f"{name} temporary changes only EUID",
              [a != b for a, b in zip(probe["initial"], probe["temporary"])] == [False, True, False])
        check(f"{name} restored equals initial", probe["restored"] == probe["initial"])


def verify_runs():
    log = (RUNS / "run-14050714.txt").read_text(encoding="utf-8")
    ok_lines = [l for l in log.splitlines() if l.rstrip().endswith("... ok")]
    check("log: 9 public tests reported ok", len(ok_lines) == 9, f"{len(ok_lines)} lines")
    check("log: 'Ran 9 tests' and 'OK'", "Ran 9 tests" in log and re.search(r"^OK$", log, re.M) is not None)
    check("log: no runtime/exit-code line inside the saved log",
          re.search(r"^(real|user|sys)\s+\d|exit (code|status)|elapsed", log, re.I | re.M) is None)
    final = json.loads(log.strip().splitlines()[-1])
    main = json.loads((RUNS / "seed-14050714.json").read_text(encoding="utf-8"))
    check("log final JSON equals seed-14050714.json", final == main)
    check("seed 14050714 passed true, violations []", main["passed"] is True and main["violations"] == [])
    check("seed 14050714 traces_generated == 500", main["traces_generated"] == 500)
    check("seed 14050714 coverage 327 successful / 111 denied",
          main["coverage"] == {"successful_worker_traces": 327, "denied_worker_traces": 111})
    check("repeat-14050714.json byte-identical to seed-14050714.json",
          (RUNS / "repeat-14050714.json").read_bytes() == (RUNS / "seed-14050714.json").read_bytes())
    for seed in (1, 2, 3):
        data = json.loads((RUNS / f"seed-{seed}.json").read_text(encoding="utf-8"))
        check(f"seed {seed}: passed, 500 traces, no violations",
              data["passed"] is True and data["traces_generated"] == 500 and data["violations"] == [],
              json.dumps(data["coverage"], sort_keys=True))
        check(f"seed {seed}: seed field matches", data["seed"] == seed)


def verify_traces():
    raw = (INPUTS / "traces.json").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    check("sha256(inputs/traces.json) equals the value recorded in the terminal evidence",
          digest == RECORDED_SHA256, digest)
    data = json.loads(raw.decode("utf-8"))
    traces = data["traces"]
    check("traces.json seed == 14050714", data["seed"] == 14050714)
    check("traces.json holds 500 traces", len(traces) == 500)
    check("traces.json: 500 distinct traces", len({json.dumps(t, sort_keys=True) for t in traces}) == 500)
    lengths = [len(t) for t in traces]
    check("traces.json: every trace has 5-20 operations", min(lengths) >= 5 and max(lengths) <= 20,
          f"min={min(lengths)} max={max(lengths)}")

    sys.path.insert(0, str(INPUTS / "code"))
    import test_stateful  # noqa: E402  (pure python; the backend is imported only inside main())

    allowed = denied = both = 0
    for trace in traces:
        _, decisions = test_stateful.model_summary(trace, data["datasets"], data["grants"])
        allowed += "allow" in decisions
        denied += "deny" in decisions
        both += decisions == {"allow", "deny"}
    check("model-only recount of traces.json: allowed run_worker traces == 327", allowed == 327, str(allowed))
    check("model-only recount of traces.json: denied run_worker traces == 111", denied == 111, str(denied))
    lines.append(f"[INFO] traces with BOTH an allowed and a denied run_worker (model-only recount): {both}")
    lines.append(f"[INFO] 327 + 111 = {327 + 111}; union = {allowed + denied - both} of 500 (counts overlap)")
    return data, test_stateful


def verify_witness(data, test_stateful):
    witness = json.loads((EVIDENCE / "mutant-owner.json").read_text(encoding="utf-8"))
    violation = witness["violations"][0]
    check("witness: backend is mutant_backend and passed is false",
          witness["backend"] == "mutant_backend" and witness["passed"] is False)
    check("witness: exactly one violation, one_minimal true",
          len(witness["violations"]) == 1 and violation["one_minimal"] is True)
    check("witness: class == [run_worker, archives]", violation["class"] == ["run_worker", "archives"])
    trace = violation["trace"]
    check("witness: reduced trace has 2 operations", len(trace) == 2, json.dumps(trace, sort_keys=True))
    check("witness: owner expected alice, observed carol",
          violation["expected"]["archives"]["a7"]["owner"] == "alice"
          and violation["observed"]["archives"]["a7"]["owner"] == "carol")
    datasets, grants = violation["datasets"], violation["grants"]
    valid = test_stateful.model_valid
    check("witness: full 2-op trace is model-valid", valid(trace, datasets, grants))
    check("witness: dropping the enqueue leaves an unbound job reference (model-invalid)",
          not valid(trace[1:], datasets, grants))
    check("witness: dropping run_worker leaves a model-valid trace with no archive",
          valid(trace[:1], datasets, grants))
    model = test_stateful.PolicyModel(datasets, grants)
    model.step(trace[0])
    check("witness: model alone creates no archive after the enqueue", model.archives == {})
    model.step(trace[1])
    owners = {v["owner"] for v in model.archives.values()}
    check("witness: model assigns the archive to the requester alice", owners == {"alice"})
    index = violation["original_trace_index"]
    original = data["traces"][index]
    positions = [i + 1 for i, op in enumerate(original) if op in trace]
    lines.append(f"[INFO] supplied traces.json trace {index} has {len(original)} operations; "
                 f"the two witness operations appear there as operations {positions} (shown in the video as a schematic strip)")


def main():
    verify_probes()
    verify_runs()
    data, test_stateful = verify_traces()
    verify_witness(data, test_stateful)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\n{len(failures)} failed checks")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
