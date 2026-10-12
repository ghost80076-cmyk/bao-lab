"""Read-only author-source reconciliation. Emits metadata, never private bodies."""
import argparse
import hashlib
import json
import pathlib
import zipfile

BOOKS = {
    "f604df12-4eb7-48c0-b2f0-6c942d6204fa": 209,
    "572f3222-5746-43cc-ae16-60239eac041c": 251,
    "59d9fbcd-d5f8-47aa-99fb-a101675230e4": 202,
}
SELECTED = {41: "fantasy", 42: "cultivation", 44: "urban", 46: "competition", 47: "apocalypse", 48: "scifi"}

def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def audit(archive, root):
    published = json.loads((root / "data/world-simulator-general-library.json").read_text())
    entries = {e["id"]: (p["meta"]["id"], e) for p in published["packs"] for e in p["entries"]}
    with zipfile.ZipFile(archive) as bundle:
        books = [json.loads(bundle.read(n)) for n in bundle.namelist() if n.endswith(".json")]
    books = [b for b in books if b["worldbook"]["id"] in BOOKS]
    if len(books) != 3:
        raise ValueError("Expected exactly three author-selected sources")
    canonical = next(b for b in books if len(b["entries"]) == 209)
    records, inventory = [], []
    for book in books:
        bid = book["worldbook"]["id"]
        if len(book["entries"]) != BOOKS[bid]:
            raise ValueError("Source revision changed")
        adopted = []
        for index, source in enumerate(book["entries"]):
            matches = [i for i in SELECTED if source["content"].strip() == canonical["entries"][i]["content"].strip()]
            if not matches:
                continue
            entry_id = SELECTED[matches[0]]
            pack_id, entry = entries[entry_id]
            adopted.append(index)
            records.append({"book_id": bid, "source_index": index,
                            "source_sha256": sha(source["content"].strip()),
                            "pack_id": pack_id, "entry_id": entry_id,
                            "published_sha256": sha(entry["content"]),
                            "status": "partial-adaptation", "not_verbatim": True})
        if len(adopted) != 6:
            raise ValueError("Reviewed common source no longer matches")
        inventory.append({"book_id": bid, "source_count": len(book["entries"]),
                          "adapted_indices": adopted,
                          "pending_indices": [i for i in range(len(book["entries"])) if i not in adopted]})
    approved = root / "data/world-simulator-general-source-map.json"
    if approved.exists():
        old = json.loads(approved.read_text())
        if [(r["book_id"], r["source_index"], r["source_sha256"]) for r in records] != [
                (r["book_id"], r["source_index"], r["source_sha256"]) for r in old["records"]]:
            raise ValueError("Reviewed source changed; review before updating")
    return {"schema": "yorubay-world-simulator-general-review", "version": 1,
            "source_count": 662, "adopted_occurrences": 18, "unique_adapted_sources": 6,
            "pack_count": 2, "chapter_count": 6,
            "scope": "First batch only. No full-book migration or model-dialogue evaluation claimed.",
            "books": inventory, "records": records}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=pathlib.Path)
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    print(json.dumps(audit(args.archive, args.root), ensure_ascii=False, indent=2))
