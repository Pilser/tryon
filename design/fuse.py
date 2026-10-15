#!/usr/bin/env python3
"""Single-source guard: figcraft exports are truth, main.css must match.

Re-extracts tokens + component code with --extract, then asserts values.
Usage: python3 design/fuse.py [--extract]
Exit 1 on any drift.
"""
import json
import re
import subprocess
import sys

ROOT = "/home/pilser/AAA-PROJECTS/tryon"
FIG = f"{ROOT}/design/shop.figcraft"
CSS = f"{ROOT}/client/styles/main.css"
EXTRACTS = [(12, "card"), (22, "landing")]

# var name -> must appear in main.css :root (whitespace-insensitive)
TOKEN_VARS = ["--bg", "--surface", "--line", "--text", "--muted", "--primary",
              "--primary-hover", "--primary-pressed", "--complement", "--wa", "--danger", "--radius"]
# design value -> css value that implements it
VALUE_MAP = [
    ("20px title", ".productcard .title"),
    ("16px price", ".productcard .price"),
    ("300px card", ".productcard{position:relative;width:300px"),
    ("inset 72px", ".model-inset{position:absolute;left:216px"),
    ("badge 6px", "border-radius:6px"),
    ("img top round", "border-radius:16px 16px 0 0"),
    ("10px button radius", "border-radius:10px"),
    ("44px button height", "min-height:44px"),
    ("search focus violet", "2px solid var(--complement)"),
]


def norm(s):
    return re.sub(r"\s+", "", s).lower()


def run_extract():
    for nid, name in EXTRACTS:
        q = json.dumps([{"command": "inspect.code", "params": {"id": nid, "language": "html"}}])
        open("/tmp/opencode/fc1.json", "w").write(q)
        r = subprocess.run(
            ["figcraft-cli", "run", "/tmp/opencode/fc1.json", "--in", FIG],
            capture_output=True, text=True,
        )
        code = json.loads(r.stdout)["result"]["code"]
        open(f"{ROOT}/design/out/{name}.html", "w").write(code)
        print(f"extracted {name}.html ({len(code)} chars)")


def main():
    if "--extract" in sys.argv:
        run_extract()
    css = open(CSS).read()
    tokens = open(f"{ROOT}/design/out/tokens.css").read()
    ncss, ntok = norm(css), norm(tokens)
    fails = []

    for var in TOKEN_VARS:
        m = re.search(re.escape(var) + r":([^;]+);", ntok)
        if not m:
            print("FAIL token missing in tokens.css:", var)
            fails.append(var)
            continue
        val = m.group(1)
        if var == "--radius":
            val = val.rstrip("px") + "px"  # tokens.css stores unitless numbers
        want = var + ":" + val + ";"
        ok = want in ncss
        print(("PASS " if ok else "FAIL ") + "token " + want)
        if not ok:
            fails.append(var)

    for label, needle in VALUE_MAP:
        ok = norm(needle) in ncss
        print(("PASS " if ok else "FAIL ") + label + " -> " + needle)
        if not ok:
            fails.append(label)

    if fails:
        print(f"\nDRIFT: {len(fails)} mismatches: {fails}")
        sys.exit(1)
    print("\nFUSED: no drift")


if __name__ == "__main__":
    main()
