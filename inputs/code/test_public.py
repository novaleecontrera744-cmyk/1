"""Fixed public tests: five policy tests and four native credential tests."""
import errno
import unittest
import admin
import native_backend as backend

DATA = {"A": "public A\n", "B": "public B\n", "C": "public C\n"}
GRANTS = {"alice": {"A"}, "bob": {"B"}, "carol": {"C"}, "dave": set()}


class PublicPolicyTests(unittest.TestCase):
    def setUp(self):
        self.service = backend.ExportService(DATA, GRANTS)

    def test_read_and_enqueue_require_current_grant(self):
        s = self.service
        self.assertEqual(s.read_dataset("alice", "A"), DATA["A"])
        with self.assertRaises(backend.Denied):
            s.read_dataset("bob", "A")
        with self.assertRaises(backend.Denied):
            s.enqueue("bob", "A")
        job = s.enqueue("alice", "A")
        self.assertEqual(s.snapshot()["jobs"][job], dict(requester="alice", dataset="A"))
        self.assertEqual(s.snapshot()["audit"], [])
        self.assertEqual(s.snapshot()["worker_reads"], [])

    def test_worker_checks_requester_and_preserves_owner(self):
        s = self.service
        job = s.enqueue("alice", "A")
        archive = s.run_worker(job, executor="bob")
        snap = s.snapshot()
        self.assertEqual(snap["archives"][archive], dict(owner="alice", dataset="A", content=DATA["A"]))
        self.assertEqual(snap["completed"], {job: archive})
        self.assertEqual(snap["worker_reads"], ["A"])
        self.assertEqual(snap["audit"], [dict(job=job, requester="alice", dataset="A", decision="allow")])

    def test_denied_worker_has_no_read_archive_or_completion(self):
        s = self.service
        job = s.enqueue("alice", "A")
        s.revoke("alice", "A")
        s.grant("bob", "A")
        with self.assertRaises(backend.Denied):
            s.run_worker(job, executor="bob")
        snap = s.snapshot()
        self.assertEqual(snap["worker_reads"], [])
        self.assertEqual(snap["archives"], {})
        self.assertEqual(snap["completed"], {})
        self.assertEqual(snap["audit"], [dict(job=job, requester="alice", dataset="A", decision="deny")])
        s.grant("alice", "A")
        s.run_worker(job, executor="dave")
        self.assertEqual([e["decision"] for e in s.snapshot()["audit"]], ["deny", "allow"])

    def test_pending_clone_needs_owner_and_current_grant(self):
        s = self.service
        job = s.enqueue("alice", "A")
        clone = s.clone_job("alice", job)
        self.assertNotEqual(job, clone)
        self.assertEqual(s.snapshot()["jobs"][job], s.snapshot()["jobs"][clone])
        s.grant("bob", "A")
        with self.assertRaises(backend.Denied):
            s.clone_job("bob", job)
        s.revoke("alice", "A")
        with self.assertRaises(backend.Denied):
            s.clone_job("alice", job)
        self.assertEqual(s.snapshot()["audit"], [])

    def test_fetch_owner_only_and_non_run_does_not_log(self):
        s = self.service
        job = s.enqueue("alice", "A")
        archive = s.run_worker(job, executor="dave")
        before = s.snapshot()
        s.grant("bob", "A")
        with self.assertRaises(backend.Denied):
            s.fetch_archive("bob", archive)
        self.assertEqual(s.fetch_archive("alice", archive), DATA["A"])
        s.read_dataset("alice", "A")
        self.assertEqual(s.snapshot(), before)


class PublicCredentialTests(unittest.TestCase):
    def setUp(self):
        self.service = backend.ExportService(DATA, GRANTS)
        self.probes = {actor: self.service.probe(actor) for actor in ("alice", "bob")}

    def test_initial_execution_really_is_setuid_nonroot(self):
        owner = admin.account("service").pw_uid
        self.assertNotEqual(owner, 0)
        for actor, probe in self.probes.items():
            uid = admin.account(actor).pw_uid
            self.assertEqual(probe["initial"], [uid, owner, owner])

    def test_temporary_drop_and_restore(self):
        owner = admin.account("service").pw_uid
        for actor, probe in self.probes.items():
            uid = admin.account(actor).pw_uid
            self.assertEqual(probe["temporary"], [uid, uid, owner])
            self.assertEqual(probe["restored"], [uid, owner, owner])

    def test_permanent_drop_prevents_privilege_regain(self):
        for actor, probe in self.probes.items():
            uid = admin.account(actor).pw_uid
            self.assertEqual(probe["permanent"], [uid, uid, uid])
            self.assertEqual(probe["restore_errno"], errno.EPERM)

    def test_open_descriptor_survives_but_reopen_is_denied(self):
        for probe in self.probes.values():
            self.assertEqual(probe["held_content"], admin.PROBE_DATA)
            self.assertEqual(probe["reopen_errno"], errno.EACCES)
        self.assertEqual(self.service.snapshot()["worker_reads"], [])
        self.assertEqual(self.service.snapshot()["audit"], [])


if __name__ == "__main__":
    unittest.main()
