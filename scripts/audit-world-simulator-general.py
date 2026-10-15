"""Read-only author-source reconciliation. Emits metadata, never private bodies."""
import argparse
import hashlib
import json
import pathlib
import re
import zipfile

BOOKS = {
    "f604df12-4eb7-48c0-b2f0-6c942d6204fa": 209,
    "572f3222-5746-43cc-ae16-60239eac041c": 251,
    "59d9fbcd-d5f8-47aa-99fb-a101675230e4": 202,
}
SELECTED = {41: "fantasy", 42: "cultivation", 44: "urban", 46: "competition", 47: "apocalypse", 48: "scifi"}
SELECTED.update({12: "lively-friend", 13: "listening-friend", 14: "principled-rival",
                 15: "experienced-mentor", 16: "gentle-mentor", 17: "sunny-companion",
                 18: "gentle-companion", 19: "reserved-companion"})
SELECTED.update({68: "bl-romance", 69: "gl-romance", 70: "nl-romance",
                 71: "character-contrast", 73: "hidden-identity", 74: "love-triangle",
                 76: "executive-romance", 77: "age-gap-romance", 78: "comeback",
                 80: "pure-romance", 81: "relationship-repair", 86: "romantasy",
                 91: "court-intrigue"})
SELECTED.update({43: "campus", 84: "ya-growth", 85: "na-independence"})
SELECTED.update({30: "strategic-friend", 31: "principled-rival", 185: "closeness-distance",
                 186: "control-tension", 187: "possessive-tension", 188: "challenge-drive"})
SELECTED.update({0: "caring-leader", 1: "off-duty-professional", 3: "gentle-optimist",
                 4: "assertive-perfectionist", 6: "reserved-professional", 9: "gentle-optimist",
                 10: "poised-informal", 11: "cultured-person", 21: "executive-romance",
                 22: "mature-companion"})
SELECTED.update({5: "sunny-companion", 7: "dedicated-performer", 8: "confident-performer",
                 20: "courteous-controller", 25: "lonely-committed", 26: "confident-performer",
                 27: "reserved-professional", 28: "character-contrast", 29: "independent-enthusiast"})
SELECTED.update({93: "gender-expression", 97: "negotiated-power", 98: "abo-social-romance"})
SELECTED.update({49: "commitment-betrayal", 94: "commitment-betrayal", 50: "socially-constrained-romance", 83: "insecure-attachment"})
SOURCE_SPECIFIC = {"572f3222-5746-43cc-ae16-60239eac041c": {
    232: ("fragile-peace", "d10d669b781d759c831366eda9919e7df07f0734678b4efe1002fa2266e2cde5"),
    242: ("guild-commissions", "d31e47b40dfad99fdc0cf91aaea4bc9105b5d7e9e8ee41d310dcfbd203de9871"),
    243: ("everyday-quests", "901b407cb9503ddd691945d6cc8eb58416d5b7cf7c4d75251b57f9833eac6730"),
    245: ("recurring-npc", "b9991a3e6fc456dee7263bf2a31c87304825b326f5bd3cbdb160be6413f5c394"),
    247: ("magic-specialization", "41afe03b037cb97a4fd0322dc66708a6756077db75ba360ed3147dcafd29ff3c"),
}}

# These sources occur in two selected books, not all three.
CAREER_SOURCES = {200: ('career-commissions', '0503328b8961831d039592c25ec04e476480f3d6d44ced6386158e94c8393465'),
 201: ('work-deadlines', '95743125e36511a59e3945eec5df8db4ed036ff86bb2d4dde83ce3bf48695df7'),
 202: ('reward-recovery', 'acbdc603b8d871c7fc3b822dd5a16c8e44f04be6cb2891b7b7779d295a5e085f')}
for _bid in ['f604df12-4eb7-48c0-b2f0-6c942d6204fa', '572f3222-5746-43cc-ae16-60239eac041c']:
    SOURCE_SPECIFIC.setdefault(_bid, {}).update(CAREER_SOURCES)

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
    by_id = {b["worldbook"]["id"]: b for b in books}
    if set(by_id) != set(BOOKS) or any(len(by_id[bid]["entries"]) != count for bid, count in BOOKS.items()):
        raise ValueError("Source revision changed")
    canonical = by_id[next(iter(BOOKS))]
    adapted_hashes = {sha(canonical["entries"][i]["content"].strip()) for i in SELECTED}
    specific_hashes = {}
    common_hashes = set(adapted_hashes)
    for bid, sources in SOURCE_SPECIFIC.items():
        for index, (entry_id, digest) in sources.items():
            if entry_id not in entries or sha(by_id[bid]["entries"][index]["content"].strip()) != digest:
                raise ValueError("Reviewed book-specific adaptation changed")
            if digest in common_hashes or (digest in specific_hashes and specific_hashes[digest] != entry_id):
                raise ValueError("Duplicate book-specific adaptation")
            specific_hashes[digest] = entry_id
            adapted_hashes.add(digest)
    decisions = json.loads((root / "data/world-simulator-layer-review.json").read_text())["decisions"]
    routes = {}
    for decision in decisions:
        bid = decision.get("source_book_id", canonical["worldbook"]["id"])
        index = decision.get("canonical_source_index", decision.get("source_index"))
        if bid not in by_id or not isinstance(index, int) or not 0 <= index < BOOKS[bid]:
            raise ValueError("Invalid layer source reference")
        digest = sha(by_id[bid]["entries"][index]["content"].strip())
        if decision["decision_id"] != f"{bid}:{index}" or digest != decision["source_sha256"]:
            raise ValueError("Reviewed layer source changed")
        method = decision.get("review_method", "manual-layer-review")
        if method not in {"manual-layer-review", "structure-and-routing"}:
            raise ValueError("Unknown source review method")
        if method == "structure-and-routing":
            body = by_id[bid]["entries"][index]["content"].strip()
            signature = {"source_chars": len(body), "section_marker_count": len(re.findall(r'^\s*(?:#{1,6}\s|【)', body, re.M))}
            if decision.get("structure") != signature or not signature["section_marker_count"]:
                raise ValueError("Source structure signature changed")
            if "not full prose review" not in decision.get("review_scope", ""):
                raise ValueError("Structural routing must disclose its review limit")
        if digest in routes or digest in adapted_hashes:
            raise ValueError("Duplicate or overlapping source routing")
        routes[digest] = decision
    records, review_records, inventory = [], [], []
    for book in books:
        bid = book["worldbook"]["id"]
        if len(book["entries"]) != BOOKS[bid]:
            raise ValueError("Source revision changed")
        adopted, reviewed = [], []
        for index, source in enumerate(book["entries"]):
            matches = [i for i in SELECTED if source["content"].strip() == canonical["entries"][i]["content"].strip()]
            specific = SOURCE_SPECIFIC.get(bid, {}).get(index)
            if not matches and not specific:
                route = routes.get(sha(source["content"].strip()))
                if route:
                    reviewed.append(index)
                    review_records.append({"book_id": bid, "source_index": index,
                                           "source_sha256": sha(source["content"].strip()),
                                           "decision_id": route["decision_id"],
                                           "review_method": route.get("review_method", "manual-layer-review"),
                                           "status": "reviewed-not-published", "route": route["route"],
                                           "automatic_recall": False})
                continue
            entry_id = SELECTED[matches[0]] if matches else specific[0]
            pack_id, entry = entries[entry_id]
            adopted.append(index)
            records.append({"book_id": bid, "source_index": index,
                            "source_sha256": sha(source["content"].strip()),
                            "pack_id": pack_id, "entry_id": entry_id,
                            "published_sha256": sha(entry["content"]),
                            "status": "partial-adaptation", "not_verbatim": True})
        if len(adopted) != len(SELECTED) + len(SOURCE_SPECIFIC.get(bid, {})):
            raise ValueError("Reviewed common source no longer matches")
        inventory.append({"book_id": bid, "source_count": len(book["entries"]),
                          "adapted_indices": adopted,
                          "reviewed_unpublished_indices": reviewed,
                          "pending_indices": [i for i in range(len(book["entries"])) if i not in adopted and i not in reviewed]})
    for decision in decisions:
        if sum(r["decision_id"] == decision["decision_id"] for r in review_records) != decision["expected_occurrences"]:
            raise ValueError("Reviewed layer occurrence count changed")
    approved = root / "data/world-simulator-general-source-map.json"
    if approved.exists():
        old = json.loads(approved.read_text())
        current = {(r["book_id"], r["source_index"]): r["source_sha256"] for r in records + review_records}
        if any(current.get((r["book_id"], r["source_index"])) != r["source_sha256"]
               for r in old["records"] + old.get("review_records", [])):
            raise ValueError("Reviewed source changed; review before updating")
    pending_count = sum(len(book["pending_indices"]) for book in inventory)
    return {"schema": "yorubay-world-simulator-general-review", "version": 17,
            "source_count": sum(BOOKS.values()), "adopted_occurrences": len(records),
            "unique_adapted_sources": len({r["source_sha256"] for r in records}),
            "reviewed_unpublished_occurrences": len(review_records),
            "unique_reviewed_unpublished_sources": len({r["source_sha256"] for r in review_records}),
            "review_methods": {method: sum(r["review_method"] == method for r in review_records)
                               for method in sorted({r["review_method"] for r in review_records})},
            "pending_occurrences": pending_count, "source_routing_complete": pending_count == 0,
            "pack_count": len(published["packs"]), "chapter_count": len(entries),
            "scope": "Historical source-routing snapshot for the general-reference catalog only, not current overall migration status. Structural routing is not full prose review. Work-specific original-text publication is tracked separately in data/astral-worldbook-source-map.json.",
            "books": inventory, "records": records, "review_records": review_records,
            "work_specific_publication_map": "data/astral-worldbook-source-map.json"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=pathlib.Path)
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    print(json.dumps(audit(args.archive, args.root), ensure_ascii=False, indent=2))
