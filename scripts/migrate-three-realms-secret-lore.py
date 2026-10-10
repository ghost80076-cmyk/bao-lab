"""Publish reviewed cross-realm secret realm concepts and named sites."""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = "b43bd078-1b19-46e8-bfc8-952660be367d"
GROUPS = [
    ("system", "三界秘境系統", [161]),
    ("sites", "三界著名秘境", [162]),
]
LEAF_AREAS = {161: "秘境等級"}
LOWER_SITES = {"劍仙洞府", "丹王遺跡", "萬獸山谷", "上古戰場"}

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sections(raw, index):
    # Only bracket names under reviewed type headings are entities. Other brackets
    # (grades, methods and effects) remain inside their concept chapter.
    tokens = []
    areas = LEAF_AREAS.get(index, set())
    areas = {areas} if isinstance(areas, str) else areas
    current = None
    for match in re.finditer(r"(?m)^(#{2,3}) (.+)$|^【([^】]+)】$", raw):
        level, heading, bracket = match.groups()
        if level == "##":
            current = heading
        if bracket and current not in areas:
            continue
        tokens.append((match.start(), match.end(), heading or bracket, level or "bracket"))
    starts, labels = [], []
    for n, (start, end, label, level) in enumerate(tokens):
        if label == "特殊注意":
            continue
        next_token = tokens[n + 1] if n + 1 < len(tokens) else None
        is_container = next_token and not raw[end:next_token[0]].strip() and (
            level == "##" and next_token[3] in {"###", "bracket"} or
            level == "###" and next_token[3] == "bracket")
        if is_container:
            continue
        boundary = start
        previous = n - 1
        child_level = level
        while previous >= 0:
            parent = tokens[previous]
            if raw[parent[1]:boundary].strip() or not (
                parent[3] == "##" and child_level in {"###", "bracket"} or
                parent[3] == "###" and child_level == "bracket"):
                break
            boundary = parent[0]
            child_level = parent[3]
            previous -= 1
        starts.append(boundary)
        labels.append(label)
    if not starts or starts[0] != 0:
        raise ValueError("Reviewed section boundaries changed")
    return [(start, starts[n + 1] if n + 1 < len(starts) else len(raw), labels[n]) for n, start in enumerate(starts)]

def keywords(index, heading, content):
    if index == 161:
        if heading == "基本概念":
            return ["三界秘境概念"]
        return ["三界" + heading + ("秘境" if heading.endswith("類") else "")]
    realm = "下界" if heading in LOWER_SITES else "中界"
    return [heading, realm + heading]

def build(source, root):
    book = source.get("worldbook", {})
    if book.get("id") != BOOK_ID or book.get("visibility") != "公開" or len(source["entries"]) != 191:
        raise ValueError("Only the reviewed public source edition can be published")
    originals = source["entries"]
    manifest_path = root / "data/three-realms-secret-lore-source-map.json"
    if manifest_path.exists():
        for record in json.loads(manifest_path.read_text())["records"]:
            if digest(originals[record["source_index"]]["content"]) != record["source_sha256"]:
                raise ValueError("Reviewed source content changed; review before updating the map")
    catalog_path = root / "data/worldbook-library.json"
    catalog = json.loads(catalog_path.read_text())
    ids = {"three-realms-secret-" + key for key, _, _ in GROUPS}
    catalog["packs"] = [p for p in catalog["packs"] if p["meta"]["id"] not in ids]
    records = []
    for key, label, indices in GROUPS:
        pack = {"schema": "yorubay-worldbook-pack", "version": 1, "meta": {
            "id": "three-realms-secret-" + key, "name": "三界九域｜" + label,
            "world": "three-realms", "classification": "world", "author": "班長／肉包",
            "release": "1.0.0", "visibility": "public",
            "source": "三界九域仙界-修仙｜公開原文秘境補篇（2026-10-10）"
        }, "entries": []}
        for index in indices:
            original = originals[index]
            expected = "地點"
            if original["category"] != expected:
                raise ValueError("Allowlisted source category changed")
            raw = original["content"]
            destinations = []
            for n, (start, end, heading) in enumerate(sections(raw, index)):
                content = raw[start:end].strip()
                entry_id = f"source-{index}-{n}"
                title = heading
                pack["entries"].append({"id": entry_id, "title": label + "｜" + title,
                    "category": "世界資料", "mode": "keyword", "keywords": keywords(index, heading, content), "content": content})
                destinations.append({"pack_id": pack["meta"]["id"], "entry_id": entry_id,
                    "start": start, "end": end, "content_sha256": digest(content)})
            records.append({"source_index": index, "source_title": original["title"],
                "source_sha256": digest(raw), "source_chars": len(raw), "destinations": destinations})
        catalog["packs"].append(pack)
    manifest = {"schema": "yorubay-worldbook-source-map", "version": 1,
        "source_book_id": BOOK_ID, "source_visibility": "公開", "source_entry_count": 191,
        "migrated_source_entries": len(records), "generated_entries": sum(len(r["destinations"]) for r in records), "records": records}
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Migrated {len(records)} sources into {manifest['generated_entries']} chapters across two packs.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
