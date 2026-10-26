## Files you must complete

| File | Student task |
| --- | --- |
| `policy.c` | Five policy functions, including requester/executor and ownership decisions |
| `credentials.c` | Real UID identity and temporary/restore/permanent transitions |
| `policy_model.py` | Independent symbolic state model |
| `test_stateful.py` | Generation, comparison, model coverage, and one-minimal witnesses |

Leave `engine.c`, both headers, `native_backend.py`, `admin.py`, `test_public.py`,
`run.py`, `probe.py` and `Makefile` unchanged. The C scaffold compiles initially;
functional tests and the stateful runner intentionally fail until completed.

## Required execution environment

Use a **fresh dedicated Ubuntu 24.04 VM**, Python 3.10+, GCC and Make.
Do not use an environment with disabled setuid or unavailable UID transitions.
Environment failures are not passing tests. Run operations sequentially; only one active native
`ExportService` exists, and constructing another resets its fixture.

From this directory:

```sh
make
sudo python3 admin.py install
sudo python3 admin.py rebuild
sudo python3 -m unittest -v test_public
sudo python3 probe.py --actor alice > probe-alice.json
sudo python3 probe.py --actor bob > probe-bob.json
sudo python3 run.py --seed 14050714 --traces 500
```

`install` is for the first installation only. Use `rebuild` after C edits.

## Stateful entry point and output

The instructor invokes:

```sh
python3 test_stateful.py --backend MODULE --seed 14050714 --traces 500
```

Use `importlib.import_module` to load `MODULE`. In-memory evaluation backends
need neither sudo nor native installation. Do not branch on backend name, a particular user, or a special seed.
Your own stateful generator/model must remain independent of the implementation.

Write `traces.json` as:

```json
{
  "seed": 14050714,
  "datasets": {"A": "...", "B": "...", "C": "..."},
  "grants": {"alice": ["A"], "bob": ["B"], "carol": ["C"], "dave": []},
  "traces": []
}
```

Fill `traces` with the required model-valid operation sequences. Fixture content
is a UTF-8 string of at most 4096 bytes per dataset, and dataset labels match
`[A-Za-z0-9_-]{1,32}`. Preserve content exactly, including newlines.
The final stdout line is a JSON report containing `backend`, `seed`,
`traces_generated`, `datasets`, `grants`, `coverage`, `passed` and `violations`.
`coverage` has `successful_worker_traces` and `denied_worker_traces`.
Use the actual fixture and counts; `violations` is empty when the backend agrees
with the model.

A mismatch report uses `passed: false` and at least one witness per found class
with these fields (replace the empty example trace with the reduced witness):

```json
{
  "class": ["run_worker", "result"],
  "original_trace_index": 0,
  "trace": [],
  "expected": {"decision": "allow", "value": "a1"},
  "observed": {"decision": "deny"},
  "one_minimal": true
}
```

`expected`/`observed` contain the first different result or snapshot component,
not a free-text explanation. Exit 0 for acceptance, 1 for a detected mismatch,
and a different nonzero status for incomplete code or environment failure.

## Student submission

Submit this directory with your four completed files, `traces.json`, additional
seeds and outputs, probe evidence, reduced witnesses, a report of at most two pages,
and the 3–5 minute video described in the assignment. Disclose LLM help as required in `Assignment 1.pdf`.

## Operations and outcomes

| Trace `op` | Arguments | Success value |
| --- | --- | --- |
| `read_dataset` | `actor`, `dataset` | Dataset content |
| `enqueue` | `actor`, `dataset`, `as` | New job ID |
| `clone_job` | `actor`, `job`, `as` | New job ID |
| `run_worker` | `job`, `as`, optional `executor` (default `dave`) | Archive ID |
| `fetch_archive` | `actor`, `archive` | Archive content |
| `grant` | `actor`, `dataset` | `None` |
| `revoke` | `actor`, `dataset` | `None` |

`ExportService(datasets, grants)` starts each trace from a fresh fixture.
In the Python API a success returns the value above; a policy denial raises
`Denied`. Normalized replay responses are `{"decision":"allow","value":...}`
or `{"decision":"deny"}`.

Any of the four fixture users may execute any existing job. For a pending job,
only its immutable requester's current dataset grant controls execution.
Both a first successful run and a repeated run return the archive ID.
Once complete, the job returns the same ID even after revocation, without
another read, archive or audit event. The archive belongs to the requester.
Only `run_worker` produces audit events: one `deny` per rejected run and one
`allow` for the first successful run. Archive fetching checks ownership alone,
including after the source dataset grant is revoked.

## Observation and comparison

All implementation observations use operation return values and `snapshot()`.
Never read internal files, private attributes or native logs directly. Observation
is not a trace operation, does not count towards length and is side-effect free.

`snapshot()` has `jobs`, `worker_reads`, `archives`, `completed`, `audit`.
`worker_reads` records dataset labels read during successful first executions
only; direct reads are excluded. Archive content equals the fixture dataset
string, with no timestamps or randomness.

Compare after each operation using this fixed order:

| Class component | Compared value |
| --- | --- |
| `result` | allow/deny, and non-content return values (IDs normalized to symbols) |
| `content` | returned string of `read_dataset` or `fetch_archive`, if allowed |
| `jobs` | `snapshot()["jobs"]` |
| `reads` | `snapshot()["worker_reads"]` |
| `archives` | `snapshot()["archives"]` (including content and ownership) |
| `completion` | `snapshot()["completed"]` |
| `events` | `snapshot()["audit"]` |

The mismatch class is a JSON pair `[operation_type, component]`, e.g.
`["run_worker","result"]`. Use the earliest differing operation, then the first
differing component in the table. IDs are opaque; maintain separate symbolic
mappings for model and backend, including IDs in snapshots and audit events.

## Corpus and reduction

Generate at least 500 distinct traces, each containing 5–20 of the seven
operations. All seven must occur across the corpus. Distinctness compares the
ordered lists of operation objects and their argument values; JSON key order
is irrelevant. Count the >=50 traces with allowed `run_worker` and >=50 with
denied `run_worker` using the independent model only. A trace may count in both.

Each successful ID-producing operation has a fresh stable `as` label.
Later `job` and `archive` fields reference those labels.

Multiple symbolic aliases for an existing archive are allowed, but labels cannot be reassigned. A denied producer
binds nothing. A trace is valid only when every job/archive reference is already
bound by a successful preceding operation in the model. Actors and datasets must
belong to the fixture. Missing IDs are out of scope. On deletion preserve labels;
do not renumber or retarget references. Reset the fixture on every replay.

Produce at least one reduced witness for every distinct mismatch class found in
the corpus, rather than reducing every failing trace. A witness is one-minimal
when no valid single-operation deletion reproduces the same mismatch class.
Reduced witnesses may be shorter than five operations. Include the fixture,
seed, `original_trace_index`, `trace`, `class`, `expected`, `observed` and
`one_minimal: true` in the existing report contract.

The grading process has a 180-second limit per backend.
