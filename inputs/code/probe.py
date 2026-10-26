#!/usr/bin/env python3
import argparse
import json
import admin
from native_backend import ExportService

parser = argparse.ArgumentParser()
parser.add_argument("--actor", choices=admin.ACTORS, required=True)
args = parser.parse_args()
# ExportService starts a fresh fixture, as it does for every test trace.
print(json.dumps(ExportService().probe(args.actor), sort_keys=True))
