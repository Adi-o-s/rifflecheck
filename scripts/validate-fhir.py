#!/usr/bin/env python3
"""Validate the example FHIR bundles with the official HL7 validator service
(validator.fhir.org). Usage: python3 scripts/validate-fhir.py [files...]"""
import glob, json, sys, urllib.request
from collections import Counter

files = sys.argv[1:] or sorted(glob.glob("examples/*.fhir.json"))
failed = False
for path in files:
    body = {
        "cliContext": {"sv": "4.0.1", "locale": "en"},
        "filesToValidate": [{"fileName": path.split("/")[-1], "fileContent": open(path).read(), "fileType": "json"}],
    }
    request = urllib.request.Request(
        "https://validator.fhir.org/validate",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    outcome = json.loads(urllib.request.urlopen(request, timeout=300).read())["outcomes"][0]
    issues = outcome.get("issues", [])
    counts = Counter(i["level"] for i in issues)
    print(f"{path}: {counts.get('ERROR', 0) + counts.get('FATAL', 0)} errors, {counts.get('WARNING', 0)} warnings, {counts.get('INFORMATION', 0)} notes")
    kinds = Counter((i["level"], i["message"].split("'")[0][:110]) for i in issues if i["level"] != "INFORMATION")
    for (level, message), n in sorted(kinds.items()):
        print(f"   {level:8} x{n}  {message}")
    failed = failed or counts.get("ERROR", 0) + counts.get("FATAL", 0) > 0
sys.exit(1 if failed else 0)
