#!/usr/bin/env python3
import argparse
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--seed", type=int, default=14050714)
parser.add_argument("--traces", type=int, default=500)
args = parser.parse_args()
here = Path(__file__).resolve().parent
public = subprocess.run([sys.executable, "-m", "unittest", "-v", "test_public"], cwd=here)
if public.returncode != 0:
    raise SystemExit(public.returncode)
stateful = subprocess.run([sys.executable, "test_stateful.py", "--backend", "native_backend",
                           "--seed", str(args.seed), "--traces", str(args.traces)], cwd=here)
raise SystemExit(stateful.returncode)
