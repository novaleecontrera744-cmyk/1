"""Fixed trusted adapter. Public operations execute the real setuid C helper."""
import json
import os
import re
import subprocess
import admin


class Denied(Exception):
    pass


class EnvironmentError(RuntimeError):
    pass


class ExportService:
    def __init__(self, datasets=None, grants=None):
        admin.reset_fixture(datasets, grants)

    @staticmethod
    def _call(actor, operation, target):
        admin.require_root()
        if actor not in admin.ACTORS or not isinstance(target, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", target):
            raise KeyError("Unknown actor or invalid target")
        entry = admin.account(actor)
        def as_actor():
            os.setgroups([])
            os.setresgid(entry.pw_gid, entry.pw_gid, entry.pw_gid)
            os.setresuid(entry.pw_uid, entry.pw_uid, entry.pw_uid)
        try:
            process = subprocess.run([str(admin.BIN), operation, target], cwd="/",
                                     env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
                                     preexec_fn=as_actor, capture_output=True, text=True,
                                     close_fds=True, timeout=10)
        except (OSError, subprocess.SubprocessError) as error:
            raise EnvironmentError("Cannot execute helper under the fixture UID; use the required VM") from error
        if process.returncode != 0:
            raise EnvironmentError(process.stderr.strip() or "Helper environment/implementation failure")
        try:
            return json.loads(process.stdout)
        except (ValueError, TypeError) as error:
            raise EnvironmentError("Helper returned malformed JSON") from error

    def _operation(self, actor, op, target):
        result = self._call(actor, op, target)
        if result["decision"] == "deny":
            raise Denied()
        if result["decision"] != "allow":
            raise EnvironmentError("Unknown decision")
        return result["value"]

    def read_dataset(self, actor, dataset):
        return self._operation(actor, "read_dataset", dataset)

    def enqueue(self, actor, dataset):
        return self._operation(actor, "enqueue", dataset)

    def clone_job(self, actor, source_job_id):
        return self._operation(actor, "clone_job", source_job_id)

    def run_worker(self, job_id, executor="dave"):
        return self._operation(executor, "run_worker", job_id)

    def fetch_archive(self, actor, archive_id):
        return self._operation(actor, "fetch_archive", archive_id)

    def grant(self, actor, dataset):
        admin.change_grant(actor, dataset, True)

    def revoke(self, actor, dataset):
        admin.change_grant(actor, dataset, False)

    def archive_count(self):
        return len(self.snapshot()["archives"])

    def probe(self, actor):
        return self._call(actor, "probe", "probe_data")

    def snapshot(self):
        admin.require_root()
        # Reading storage is confined to this trusted adapter, not the test harness.
        root = admin.ROOT
        def records(directory):
            return {p.name: p.read_text(encoding="utf-8").split() for p in sorted((root / directory).iterdir())}
        jobs = {key: {"requester": value[0], "dataset": value[1]} for key, value in records("jobs").items()}
        completed = {key: value[0] for key, value in records("completed").items()}
        owners = records("owners")
        archives = {p.name: {"owner": owners[p.name][0], "dataset": owners[p.name][1],
                             "content": p.read_bytes().decode("utf-8")}
                    for p in sorted((root / "archives").iterdir())}
        reads = (root / "meta" / "reads").read_text().splitlines()
        events = []
        for line in (root / "meta" / "audit").read_text().splitlines():
            job, requester, dataset, decision = line.split()
            events.append(dict(job=job, requester=requester, dataset=dataset, decision=decision))
        return dict(jobs=jobs, worker_reads=reads, archives=archives, completed=completed, audit=events)
