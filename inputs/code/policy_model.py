"""Student task: implement an independent abstract state machine.

Do not import native_backend, instructor reference code, or backend internals.
The seven-operation contract and fixed comparison order are in README.md.
"""
from copy import deepcopy


class InvalidOperation(ValueError):
    pass


def _allow(value):
    return {"decision": "allow", "value": value}


def _deny():
    return {"decision": "deny"}


class PolicyModel:
    def __init__(self, datasets, grants):
        self.datasets = deepcopy(datasets)
        self.grants = {actor: set(values) for actor, values in grants.items()}
        self.jobs = {}
        self.archives = {}
        self.completed = {}
        self.worker_reads = []
        self.audit = []
        self.job_labels = {}
        self.archive_labels = {}
        self._job_counter = 0
        self._archive_counter = 0

    def _actor(self, actor):
        if actor not in self.grants:
            raise InvalidOperation(f"unknown actor {actor!r}")
        return actor

    def _dataset(self, dataset):
        if dataset not in self.datasets:
            raise InvalidOperation(f"unknown dataset {dataset!r}")
        return dataset

    def _fresh(self, label):
        if not isinstance(label, str) or label in self.job_labels or label in self.archive_labels:
            raise InvalidOperation(f"label {label!r} is not fresh")
        return label

    def _bound(self, table, label):
        if label not in table:
            raise InvalidOperation(f"label {label!r} is not bound")
        return table[label]

    def _granted(self, actor, dataset):
        return dataset in self.grants[actor]

    def _new_job(self, label, requester, dataset):
        self._job_counter += 1
        job = f"model-job-{self._job_counter}"
        self.jobs[job] = {"requester": requester, "dataset": dataset}
        self.job_labels[label] = job
        return _allow(job)

    def _event(self, job, decision):
        record = self.jobs[job]
        self.audit.append({"job": job, "requester": record["requester"],
                           "dataset": record["dataset"], "decision": decision})

    def step(self, operation):
        """Apply one symbolic operation; return the predicted decision/value.

        Bind successful producer results to operation['as']. Implement the
        requester/executor distinction, revocation, cloning and completed jobs.
        """
        kind = operation.get("op")

        if kind == "read_dataset":
            actor = self._actor(operation["actor"])
            dataset = self._dataset(operation["dataset"])
            if not self._granted(actor, dataset):
                return _deny()
            return _allow(self.datasets[dataset])

        if kind == "enqueue":
            actor = self._actor(operation["actor"])
            dataset = self._dataset(operation["dataset"])
            label = self._fresh(operation["as"])
            if not self._granted(actor, dataset):
                return _deny()
            return self._new_job(label, actor, dataset)

        if kind == "clone_job":
            actor = self._actor(operation["actor"])
            base = self._bound(self.job_labels, operation["job"])
            label = self._fresh(operation["as"])
            source = self.jobs[base]
            if source["requester"] != actor or not self._granted(actor, source["dataset"]):
                return _deny()
            return self._new_job(label, actor, source["dataset"])

        if kind == "run_worker":
            job = self._bound(self.job_labels, operation["job"])
            label = self._fresh(operation["as"])
            self._actor(operation.get("executor", "dave"))
            if job in self.completed:
                archive = self.completed[job]
                self.archive_labels[label] = archive
                return _allow(archive)
            requester = self.jobs[job]["requester"]
            dataset = self.jobs[job]["dataset"]
            if not self._granted(requester, dataset):
                self._event(job, "deny")
                return _deny()
            self._archive_counter += 1
            archive = f"model-archive-{self._archive_counter}"
            self.worker_reads.append(dataset)
            self.archives[archive] = {"owner": requester, "dataset": dataset,
                                      "content": self.datasets[dataset]}
            self.completed[job] = archive
            self._event(job, "allow")
            self.archive_labels[label] = archive
            return _allow(archive)

        if kind == "fetch_archive":
            actor = self._actor(operation["actor"])
            archive = self._bound(self.archive_labels, operation["archive"])
            if self.archives[archive]["owner"] != actor:
                return _deny()
            return _allow(self.archives[archive]["content"])

        if kind in ("grant", "revoke"):
            actor = self._actor(operation["actor"])
            dataset = self._dataset(operation["dataset"])
            if kind == "grant":
                self.grants[actor].add(dataset)
            else:
                self.grants[actor].discard(dataset)
            return _allow(None)

        raise InvalidOperation(f"unknown operation {kind!r}")

    def snapshot(self):
        """Return model observations in the documented backend shape."""
        return deepcopy({"jobs": self.jobs, "worker_reads": self.worker_reads,
                         "archives": self.archives, "completed": self.completed,
                         "audit": self.audit})
