#!/usr/bin/env python3
"""Student task: generate, replay, compare and reduce stateful traces."""
import argparse
import importlib
import json
from copy import deepcopy
from pathlib import Path
import random
from policy_model import PolicyModel, InvalidOperation

ACTORS = ("alice", "bob", "carol", "dave")
ALL_OPS = {"read_dataset", "enqueue", "clone_job", "run_worker",
           "fetch_archive", "grant", "revoke"}
PRODUCERS = {"enqueue", "clone_job", "run_worker"}
CONTENT_OPS = {"read_dataset", "fetch_archive"}
COMPONENTS = ("result", "content", "jobs", "reads", "archives", "completion", "events")


def make_fixture(rng):
    datasets = {label: f"dataset {label}\nrecord {rng.randrange(10**6)}\n"
                for label in ("A", "B", "C")}
    grants = {"alice": ["A"], "bob": ["B"], "carol": ["C"], "dave": []}
    return datasets, grants


def pick_operation(rng, model, labels, number):
    choices = ["read_dataset", "enqueue", "grant", "revoke"]
    weights = [1, 3, 1, 1.5]
    if model.job_labels:
        choices += ["clone_job", "run_worker"]
        weights += [1.5, 3.5]
    if model.archive_labels:
        choices.append("fetch_archive")
        weights.append(1.5)
    kind = rng.choices(choices, weights)[0]
    actor = rng.choice(ACTORS)

    if kind == "read_dataset":
        return {"op": kind, "actor": actor, "dataset": rng.choice(labels)}
    if kind == "enqueue":
        owned = sorted(model.grants[actor])
        dataset = rng.choice(owned) if owned and rng.random() < 0.7 else rng.choice(labels)
        return {"op": kind, "actor": actor, "dataset": dataset, "as": f"j{number}"}
    if kind == "clone_job":
        job = rng.choice(sorted(model.job_labels))
        if rng.random() < 0.7:
            actor = model.jobs[model.job_labels[job]]["requester"]
        return {"op": kind, "actor": actor, "job": job, "as": f"j{number}"}
    if kind == "run_worker":
        operation = {"op": kind, "job": rng.choice(sorted(model.job_labels)), "as": f"a{number}"}
        if rng.random() < 0.75:
            operation["executor"] = actor
        return operation
    if kind == "fetch_archive":
        archive = rng.choice(sorted(model.archive_labels))
        if rng.random() < 0.6:
            actor = model.archives[model.archive_labels[archive]]["owner"]
        return {"op": kind, "actor": actor, "archive": archive}
    if kind == "grant":
        missing = [(a, d) for a in ACTORS for d in labels if d not in model.grants[a]]
        if missing and rng.random() < 0.7:
            actor, dataset = rng.choice(missing)
        else:
            dataset = rng.choice(labels)
        return {"op": kind, "actor": actor, "dataset": dataset}
    pending = [model.jobs[j] for j in model.jobs if j not in model.completed]
    held = [(a, d) for a in ACTORS for d in sorted(model.grants[a])]
    roll = rng.random()
    if pending and roll < 0.6:
        record = rng.choice(pending)
        actor, dataset = record["requester"], record["dataset"]
    elif held and roll < 0.9:
        actor, dataset = rng.choice(held)
    else:
        dataset = rng.choice(labels)
    return {"op": "revoke", "actor": actor, "dataset": dataset}


def generate_trace(rng, datasets, grants):
    model = PolicyModel(datasets, grants)
    labels = sorted(datasets)
    trace = []
    for number in range(1, rng.randint(5, 20) + 1):
        operation = pick_operation(rng, model, labels, number)
        model.step(operation)
        trace.append(operation)
    return trace


def model_summary(trace, datasets, grants):
    model = PolicyModel(datasets, grants)
    kinds, decisions = set(), set()
    for operation in trace:
        response = model.step(operation)
        kinds.add(operation["op"])
        if operation["op"] == "run_worker":
            decisions.add(response["decision"])
    return kinds, decisions


def model_valid(trace, datasets, grants):
    model = PolicyModel(datasets, grants)
    try:
        for operation in trace:
            model.step(operation)
    except (InvalidOperation, KeyError):
        return False
    return True


def generate_corpus(seed, count):
    rng = random.Random(seed)
    # TODO: build a deterministic fixture and >=500 distinct model-valid traces.
    # Use only rng and model state for generation, never backend state.
    datasets, grants = make_fixture(rng)
    traces, seen, kinds = [], set(), set()
    allowed = denied = attempts = 0
    while len(traces) < count or allowed < 50 or denied < 50 or kinds != ALL_OPS:
        attempts += 1
        if attempts > 100 * count:
            raise RuntimeError("Cannot generate the required corpus")
        trace = generate_trace(rng, datasets, grants)
        key = json.dumps(trace, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        traces.append(trace)
        trace_kinds, decisions = model_summary(trace, datasets, grants)
        kinds |= trace_kinds
        allowed += "allow" in decisions
        denied += "deny" in decisions
    return {"seed": seed, "datasets": datasets, "grants": grants, "traces": traces}


class Symbols:
    def __init__(self):
        self.ids = {}
        self.names = {}

    def bind(self, operation, response):
        if operation["op"] in PRODUCERS and response["decision"] == "allow":
            value = response["value"]
            self.ids[operation["as"]] = value
            self.names.setdefault(value, operation["as"])

    def name(self, value):
        return self.names.get(value, f"unbound:{value}")


def execute(backend, service, symbols, operation):
    kind = operation["op"]
    try:
        if kind == "read_dataset":
            value = service.read_dataset(operation["actor"], operation["dataset"])
        elif kind == "enqueue":
            value = service.enqueue(operation["actor"], operation["dataset"])
        elif kind == "clone_job":
            value = service.clone_job(operation["actor"], symbols.ids[operation["job"]])
        elif kind == "run_worker":
            job = symbols.ids[operation["job"]]
            if "executor" in operation:
                value = service.run_worker(job, operation["executor"])
            else:
                value = service.run_worker(job)
        elif kind == "fetch_archive":
            value = service.fetch_archive(operation["actor"], symbols.ids[operation["archive"]])
        elif kind == "grant":
            value = service.grant(operation["actor"], operation["dataset"])
        elif kind == "revoke":
            value = service.revoke(operation["actor"], operation["dataset"])
        else:
            raise ValueError(f"unknown operation {kind!r}")
    except backend.Denied:
        return {"decision": "deny"}
    return {"decision": "allow", "value": value}


def observation(operation, response, snapshot, symbols):
    kind = operation["op"]
    result = {"decision": response["decision"]}
    content = None
    if response["decision"] == "allow":
        if kind in CONTENT_OPS:
            content = response["value"]
        elif kind in PRODUCERS:
            result["value"] = symbols.name(response["value"])
        else:
            result["value"] = response["value"]
    name = symbols.name
    return {
        "result": result,
        "content": content,
        "jobs": {name(k): dict(v) for k, v in snapshot["jobs"].items()},
        "reads": list(snapshot["worker_reads"]),
        "archives": {name(k): dict(v) for k, v in snapshot["archives"].items()},
        "completion": {name(k): name(v) for k, v in snapshot["completed"].items()},
        "events": [dict(e, job=name(e["job"])) for e in snapshot["audit"]],
    }


def replay_and_compare(backend, trace, datasets, grants):
    # TODO: reset the model and ExportService for every replay. Keep separate
    # ID-to-symbol maps and compare result/content/jobs/reads/archives/completion/events.
    # Return None, or evidence with class=[op, component], index, expected, observed.
    model = PolicyModel(datasets, grants)
    service = backend.ExportService(deepcopy(datasets), deepcopy(grants))
    model_symbols, backend_symbols = Symbols(), Symbols()
    for index, operation in enumerate(trace):
        expected = model.step(operation)
        model_symbols.bind(operation, expected)
        observed = execute(backend, service, backend_symbols, operation)
        backend_symbols.bind(operation, observed)
        want = observation(operation, expected, model.snapshot(), model_symbols)
        got = observation(operation, observed, service.snapshot(), backend_symbols)
        for component in COMPONENTS:
            if want[component] != got[component]:
                if component == "result":
                    exp_value, obs_value = want[component], got[component]
                else:
                    exp_value, obs_value = {component: want[component]}, {component: got[component]}
                return {"class": [operation["op"], component], "index": index,
                        "expected": exp_value, "observed": obs_value}
    return None


def reduce_witness(backend, trace, datasets, grants, mismatch_class):
    # TODO: preserve stable symbolic labels. Reject deletion candidates with
    # model-unbound references. Reset fixtures and keep only the same mismatch class.
    # Repeat deletion passes until no valid single deletion keeps that class.
    current = list(trace)
    evidence = replay_and_compare(backend, current, datasets, grants)
    changed = True
    while changed:
        changed = False
        for index in range(len(current)):
            candidate = current[:index] + current[index + 1:]
            if not model_valid(candidate, datasets, grants):
                continue
            found = replay_and_compare(backend, candidate, datasets, grants)
            if found is not None and found["class"] == mismatch_class:
                current, evidence = candidate, found
                changed = True
                break
    return current, evidence


def evaluate(backend, corpus):
    # TODO: evaluate all traces, count run coverage by model prediction, reduce
    # one representative per distinct mismatch class, and return coverage/violations.
    datasets, grants = corpus["datasets"], corpus["grants"]
    coverage = {"successful_worker_traces": 0, "denied_worker_traces": 0}
    violations, classes = [], set()
    for index, trace in enumerate(corpus["traces"]):
        _, decisions = model_summary(trace, datasets, grants)
        coverage["successful_worker_traces"] += "allow" in decisions
        coverage["denied_worker_traces"] += "deny" in decisions
        found = replay_and_compare(backend, trace, datasets, grants)
        if found is None or tuple(found["class"]) in classes:
            continue
        classes.add(tuple(found["class"]))
        reduced, evidence = reduce_witness(backend, trace, datasets, grants, found["class"])
        violations.append({"class": evidence["class"], "original_trace_index": index,
                           "trace": reduced, "expected": evidence["expected"],
                           "observed": evidence["observed"], "one_minimal": True,
                           "seed": corpus["seed"], "datasets": datasets, "grants": grants})
    return coverage, violations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="native_backend")
    parser.add_argument("--seed", type=int, default=14050714)
    parser.add_argument("--traces", type=int, default=500)
    args = parser.parse_args()
    if args.traces < 500:
        parser.error("--traces must be at least 500")
    backend = importlib.import_module(args.backend)
    try:
        corpus = generate_corpus(args.seed, args.traces)
        Path("traces.json").write_text(json.dumps(corpus, ensure_ascii=False, indent=2), encoding="utf-8")
        coverage, violations = evaluate(backend, corpus)
        report = dict(backend=args.backend, seed=args.seed,
                      traces_generated=len(corpus["traces"]), datasets=corpus["datasets"],
                      grants=corpus["grants"], coverage=coverage,
                      violations=violations, passed=not violations)
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        return 1 if violations else 0
    except NotImplementedError as error:
        # The scaffold must not pretend to pass before the student completes it.
        print(json.dumps(dict(backend=args.backend, seed=args.seed,
                              traces_generated=0, passed=False, violations=[], error=str(error))))
        return 2
    except Exception as error:
        print(json.dumps(dict(backend=args.backend, seed=args.seed, traces_generated=0,
                              passed=False, violations=[], error=f"{type(error).__name__}: {error}")))
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
