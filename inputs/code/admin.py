#!/usr/bin/env python3
"""Trusted installer and fixture management. Run on a fresh dedicated VM."""
import argparse
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess

ROOT = Path("/var/lib/hw01")
BIN = Path("/usr/local/lib/hw01/export-helper")
HERE = Path(__file__).resolve().parent
ACTORS = ("alice", "bob", "carol", "dave")
DEFAULT_DATA = {"A": "experiment A: A-731\n", "B": "experiment B: B-942\n", "C": "experiment C: C-583\n"}
PROBE_DATA = "credential probe: retained descriptor\n"
DEFAULT_GRANTS = {"alice": {"A"}, "bob": {"B"}, "carol": {"C"}, "dave": set()}


def require_root():
    if os.geteuid() != 0:
        raise RuntimeError("Run with sudo on the assignment VM")


def account(actor):
    return pwd.getpwnam("exportsvc" if actor == "service" else "hw01-" + actor)


def ensure_account(name):
    try:
        entry = pwd.getpwnam(name)
    except KeyError:
        subprocess.run(["useradd", "--system", "--user-group", "--no-create-home",
                        "--shell", "/usr/sbin/nologin", name], check=True)
        entry = pwd.getpwnam(name)
    if entry.pw_uid == 0:
        raise RuntimeError("Lab accounts must not be root")
    return entry


def validate_fixture(datasets, grants):
    if set(grants) != set(ACTORS) or len(datasets) < 3:
        raise ValueError("Use four fixture actors and at least three datasets")
    for label, content in datasets.items():
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", label) or not isinstance(content, str) or len(content.encode("utf-8")) > 4096:
            raise ValueError("Dataset labels/content exceed the contract limits")
    if any(set(values) - set(datasets) for values in grants.values()):
        raise ValueError("Unknown dataset in grants")


def owned_write(path, content):
    owner = account("service")
    # Trusted admin paths only; never expose this function to student operations.
    if path.is_symlink():
        raise RuntimeError("Refuse symlink fixture path")
    path.write_text(content, encoding="utf-8")
    os.chown(path, owner.pw_uid, owner.pw_gid)
    path.chmod(0o600)


def reset_fixture(datasets=None, grants=None):
    require_root()
    datasets = dict(DEFAULT_DATA if datasets is None else datasets)
    grants = {k: set(v) for k, v in (DEFAULT_GRANTS if grants is None else grants).items()}
    validate_fixture(datasets, grants)
    if not (ROOT / "meta" / "users").is_file() or ROOT.is_symlink():
        raise RuntimeError("Install the lab before resetting the fixture")
    owner = account("service")
    for directory in ("data", "jobs", "archives", "owners", "completed"):
        dest = ROOT / directory
        if dest.is_symlink():
            raise RuntimeError("Refuse symlink fixture directory")
        shutil.rmtree(dest)
        dest.mkdir(mode=0o700)
        os.chown(dest, owner.pw_uid, owner.pw_gid)
    for name, content in datasets.items():
        owned_write(ROOT / "data" / name, content)
    owned_write(ROOT / "meta" / "grants", "".join(f"{actor} {dataset}\n" for actor in ACTORS for dataset in sorted(grants[actor])))
    owned_write(ROOT / "meta" / "reads", "")
    owned_write(ROOT / "meta" / "audit", "")
    owned_write(ROOT / "meta" / "probe_data", PROBE_DATA)


def rebuild():
    require_root()
    if not (ROOT / "meta" / "users").is_file():
        raise RuntimeError("Run install first")
    subprocess.run(["make", "-B"], cwd=HERE, check=True)
    parent = BIN.parent
    if parent.is_symlink() or BIN.is_symlink():
        raise RuntimeError("Refuse symlink install path")
    parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    os.chown(parent, 0, 0)
    parent.chmod(0o755)
    if BIN.exists():
        BIN.unlink()
    shutil.copyfile(HERE / "export-helper", BIN)
    owner = account("service")
    os.chown(BIN, owner.pw_uid, owner.pw_gid)
    BIN.chmod(0o4755)


def install():
    require_root()
    if ROOT.exists() or ROOT.is_symlink():
        raise RuntimeError("Lab path already exists: use rebuild/reset, not install")
    owner = ensure_account("exportsvc")
    entries = {actor: ensure_account("hw01-" + actor) for actor in ACTORS}
    if len({owner.pw_uid, *(entry.pw_uid for entry in entries.values())}) != 5:
        raise RuntimeError("Lab UIDs must be distinct")
    ROOT.mkdir(mode=0o700)
    os.chown(ROOT, owner.pw_uid, owner.pw_gid)
    for name in ("meta", "data", "jobs", "archives", "owners", "completed"):
        path = ROOT / name
        path.mkdir(mode=0o700)
        os.chown(path, owner.pw_uid, owner.pw_gid)
    owned_write(ROOT / "meta" / "users", "".join(f"{actor} {entries[actor].pw_uid}\n" for actor in ACTORS))
    reset_fixture()
    rebuild()


def change_grant(actor, dataset, allow):
    require_root()
    if actor not in ACTORS or dataset not in {p.name for p in (ROOT / "data").iterdir()}:
        raise KeyError("Unknown actor/dataset")
    pairs = set(tuple(line.split()) for line in (ROOT / "meta" / "grants").read_text().splitlines())
    if allow:
        pairs.add((actor, dataset))
    else:
        pairs.discard((actor, dataset))
    owned_write(ROOT / "meta" / "grants", "".join(f"{a} {d}\n" for a, d in sorted(pairs)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("install", "rebuild", "reset"))
    parser.add_argument("--fixture", type=Path)
    args = parser.parse_args()
    if args.command == "install":
        install()
    elif args.command == "rebuild":
        rebuild()
    elif args.fixture:
        fixture = json.loads(args.fixture.read_text())
        reset_fixture(fixture["datasets"], fixture["grants"])
    else:
        reset_fixture()


if __name__ == "__main__":
    main()
