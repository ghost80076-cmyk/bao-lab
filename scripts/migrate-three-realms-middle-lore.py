"""Publish reviewed middle-realm geography, resources and factions from the public author source."""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = "b43bd078-1b19-46e8-bfc8-952660be367d"
GROUPS = [
    ("overview", "中界概況", [141]),
    ("herbs", "中界仙藥", [143]),
    ("ores", "中界仙礦", [144]),
    ("beast-materials", "中界仙獸材料", [145]),
    ("stones", "中界仙石", [146]),
    ("factions", "中界仙域勢力", list(range(152, 160))),
    ("alliances", "中界特殊聯盟", [160]),
]
CONCEPTS = {141: "中界概念", 143: "仙藥概念", 144: "仙礦概念", 145: "仙獸材料概念", 146: "仙石概念"}
REGIONS = {153: "西方仙域", 154: "南方仙域", 155: "北方仙域", 156: "東南仙域", 157: "西南仙域", 158: "東北仙域", 159: "西北仙域"}
# These names are shared locations or generic organizations, not unique identity triggers.
QUALIFIED = {"藥王谷", "天庭", "佛門", "仙盟", "散修聯盟", "魔道聯盟", "商盟", "殺手聯盟"}

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sections(raw, index):
    headings = list(re.finditer(r"(?m)^(#{2,3}) (.+)$", raw))
    starts, labels = [], []
    for heading in headings:
        level, label = heading.groups()
        if label == "特殊注意":
            continue
        if level == "##":
            next_heading = next((h for h in headings if h.start() > heading.start()), None)
            if next_heading and next_heading.group(1) == "###" and not raw[heading.end():next_heading.start()].strip():
                continue
        start = heading.start()
        if level == "###":
            previous = next((h for h in reversed(headings) if h.start() < start), None)
            if previous and previous.group(1) == "##" and not raw[previous.end():start].strip():
                start = previous.start()
        starts.append(start)
        labels.append(label)
    if index == 152:
        marker = "# 條目：中界勢力-東方仙域"
        if labels != ["仙帝宮", "天庭", "仙盟", "劍仙宗", "劍閣"] or marker not in raw:
            raise ValueError("Reviewed mixed faction source changed")
        starts[3] = raw.index(marker)
    if not starts or starts[0] != 0:
        raise ValueError("Reviewed section boundaries changed")
    return [(start, starts[n + 1] if n + 1 < len(starts) else len(raw), labels[n]) for n, start in enumerate(starts)]

def keywords(index, heading):
    if heading == "基本概念":
        return [CONCEPTS[index]]
    if heading == "飛升機制":
        return ["中界飛升機制", "飛升中界"]
    if index >= 152:
        region = ("東方仙域" if heading in {"劍仙宗", "劍閣"} else "中央仙域") if index == 152 else REGIONS.get(index)
        terms = ["中界" + heading]
        if region:
            terms.append(region + heading)
        if heading not in QUALIFIED:
            terms.append(heading)
        return terms
    return [heading]

def build(source, root):
    book = source.get("worldbook", {})
    if book.get("id") != BOOK_ID or book.get("visibility") != "公開" or len(source["entries"]) != 191:
        raise ValueError("Only the reviewed public source edition can be published")
    originals = source["entries"]
    manifest_path = root / "data/three-realms-middle-lore-source-map.json"
    if manifest_path.exists():
        for record in json.loads(manifest_path.read_text())["records"]:
            if digest(originals[record["source_index"]]["content"]) != record["source_sha256"]:
                raise ValueError("Reviewed source content changed; review before updating the map")
    catalog_path = root / "data/worldbook-library.json"
    catalog = json.loads(catalog_path.read_text())
    ids = {"three-realms-midlore-" + key for key, _, _ in GROUPS}
    catalog["packs"] = [p for p in catalog["packs"] if p["meta"]["id"] not in ids]
    records = []
    for key, label, indices in GROUPS:
        pack = {"schema": "yorubay-worldbook-pack", "version": 1, "meta": {
            "id": "three-realms-midlore-" + key, "name": "三界九域｜" + label,
            "world": "three-realms", "classification": "world", "author": "班長／肉包",
            "release": "1.0.0", "visibility": "public",
            "source": "三界九域仙界-修仙｜公開原文中界補篇（2026-10-10）"
        }, "entries": []}
        for index in indices:
            original = originals[index]
            if original["category"] != "地點":
                raise ValueError("Allowlisted source category changed")
            raw = original["content"]
            destinations = []
            for n, (start, end, heading) in enumerate(sections(raw, index)):
                content = raw[start:end].strip()
                entry_id = f"source-{index}-{n}"
                pack["entries"].append({"id": entry_id, "title": label + "｜" + heading,
                    "category": "世界資料", "mode": "keyword", "keywords": keywords(index, heading), "content": content})
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
    print(f"Migrated {len(records)} sources into {manifest['generated_entries']} chapters across seven packs.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
