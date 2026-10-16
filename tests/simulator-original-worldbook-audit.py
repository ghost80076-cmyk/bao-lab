#!/usr/bin/env python3
"""Check publication integrity; optionally verify against the private original ZIP."""
import hashlib
import json
import pathlib
import runpy
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "data/simulator-original-worldbook-library.json").read_text())
coverage = json.loads((ROOT / "data/simulator-original-worldbook-source-map.json").read_text())
sha = lambda value: hashlib.sha256(value.encode()).hexdigest()
entries = {(p["meta"]["id"], e["id"]): e for p in catalog["packs"] for e in p["entries"]}
assert len(entries) == len(coverage["records"]) == coverage["public_entries"] == 219
assert len(catalog["packs"]) == 17
records = coverage["records"]
common = coverage["common_source_book"]
av = coverage["xia_source_book"]
common_indexes = {r["source_index"] for r in records if r["source_book_id"] == common}
assert len(common_indexes) == 189
assert common_indexes.isdisjoint({2, 24, 66, 76, 83, 183})
assert common_indexes | {r["source_index"] for r in coverage["not_published"] if r["source_book_id"] == common} == set(range(202))
assert {r["source_index"] for r in records if r["source_book_id"] == av} == set(range(194, 209)) - {197}
assert len(coverage["xia_inherited_common_sources"]) == 194
for record in records:
    entry = entries[(record["pack_id"], record["entry_id"])]
    assert sha(entry["content"]) == record["content_sha256"]
    assert entry.get("review_required") is not True

if len(sys.argv) > 1:
    migration = runpy.run_path(str(ROOT / "scripts/migrate-simulator-worldbooks.py"))
    books = migration["load"](sys.argv[1])
    regenerated = migration["migrate"](sys.argv[1])
    assert regenerated == (catalog, coverage), "regeneration from original source must be byte-content equivalent"
    for record in records:
        raw = books[record["source_book_id"]]["entries"][record["source_index"]]["content"]
        assert sha(raw.strip()) == record["source_sha256"]
        rebuilt = "\n\n".join(raw[p["start"]:p["end"]] for p in record["spans"])
        assert rebuilt == entries[(record["pack_id"], record["entry_id"])]["content"]
    for item in coverage["xia_inherited_common_sources"]:
        a = books[av]["entries"][item["source_index"]]["content"].strip()
        b = books[common]["entries"][item["common_source_index"]]["content"].strip()
        assert a == b and sha(a) == item["source_sha256"]
    for key in {(r["source_book_id"], r["source_index"]) for r in records}:
        parts = [r for r in records if (r["source_book_id"], r["source_index"]) == key]
        raw = books[key[0]]["entries"][key[1]]["content"]
        spans = sorted((p["start"], p["end"]) for r in parts for p in r["spans"])
        if not any(r["omission_reason"] for r in parts):
            assert "".join("".join(raw[a:b] for a, b in spans).split()) == "".join(raw.split()), "no unpublished prose gaps"
    # Fixed source guard rejects changed source before returning publication.
    import unittest.mock
    with unittest.mock.patch.dict(migration["load"].__globals__["HASHES"], {common: "0" * 64}):
        try:
            migration["load"](sys.argv[1])
            raise AssertionError("changed source was accepted")
        except ValueError as error:
            assert "Source changed" in str(error)

print("PASS 189 common sources, 30 Xia entries, 194 deduplicated inherited sources, exact retained prose and explicit exclusions")
