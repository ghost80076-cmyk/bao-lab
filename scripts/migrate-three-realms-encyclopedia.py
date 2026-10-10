"""Publish the reviewed item encyclopedia from the author's public source JSON."""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = "b43bd078-1b19-46e8-bfc8-952660be367d"
GROUPS = [
    ("pills", "丹藥與煉丹", [125, 126, 127]),
    ("formations", "陣法", [128, 129, 130]),
    ("talismans", "符籙", [131, 132, 133]),
    ("artifacts", "法寶與煉器", [134, 135, 136, 137]),
    ("spirit-beasts", "靈獸與契約", [138]),
]
NAMED = {126, 127, 129, 130, 132, 133, 136, 137}
CONCEPTS = {125: "丹藥概念", 128: "陣法概念", 131: "符籙概念", 134: "煉器概念", 138: "靈獸概念"}
BEAST_HEADINGS = ["靈獸等級", "靈獸血脈", "契約類型", "簽訂契約方法", "契約步驟", "靈獸空間", "靈獸培養", "靈獸能力", "靈獸天賦", "靈獸進化"]

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sections(raw, index):
    if index in NAMED:
        headings = list(re.finditer(r"(?m)^### (.+)$", raw))
        starts = []
        # A category heading travels with its first named item, never the prior item.
        categories = list(re.finditer(r"(?m)^## (.+)$", raw))
        for heading in headings:
            start = heading.start()
            for category in categories:
                if category.end() <= start and not raw[category.end():start].strip():
                    start = category.start()
            starts.append(start)
        labels = [m.group(1).strip() for m in headings]
    elif index == 138:
        headings = list(re.finditer(r"(?m)^ *(?:" + "|".join(BEAST_HEADINGS) + r") *$", raw))
        if [m.group().strip() for m in headings] != BEAST_HEADINGS:
            raise ValueError("Reviewed spirit-beast headings changed")
        starts = [0] + [m.start() for m in headings]
        labels = ["基本概念"] + BEAST_HEADINGS
    else:
        headings = [m for m in re.finditer(r"(?m)^## (.+)$", raw) if m.group(1) != "特殊注意"]
        starts = [m.start() for m in headings]
        labels = [m.group(1).strip() for m in headings]
    if not starts:
        raise ValueError("No reviewed section boundaries")
    starts[0] = 0
    return [(start, starts[n + 1] if n + 1 < len(starts) else len(raw), labels[n]) for n, start in enumerate(starts)]

def keywords(index, label, content):
    if index in NAMED:
        if index == 136 and label == "不滅金身甲":
            return ["下界不滅金身甲", "法寶不滅金身甲"]
        return [label]
    if index == 135 and label == "器靈":
        return ["下界器靈", "法寶器靈"]
    if label == "基本概念":
        return [CONCEPTS[index]]
    if index == 138 and label in {"契約類型", "簽訂契約方法", "契約步驟"}:
        terms = ["靈獸" + label]
        if label != "契約步驟":
            terms += re.findall(r"【([^】]+契約|血契)】", content)
        return terms
    return [label]

def build(source, root):
    book = source.get("worldbook", {})
    if book.get("id") != BOOK_ID or book.get("visibility") != "公開" or len(source["entries"]) != 191:
        raise ValueError("Only the reviewed public source edition can be published")
    originals = source["entries"]
    manifest_path = root / "data/three-realms-encyclopedia-source-map.json"
    if manifest_path.exists():
        for record in json.loads(manifest_path.read_text())["records"]:
            if digest(originals[record["source_index"]]["content"]) != record["source_sha256"]:
                raise ValueError("Reviewed source content changed; review before updating the map")
    catalog_path = root / "data/worldbook-library.json"
    catalog = json.loads(catalog_path.read_text())
    ids = {"three-realms-encyclopedia-" + key for key, _, _ in GROUPS}
    catalog["packs"] = [p for p in catalog["packs"] if p["meta"]["id"] not in ids]
    records = []
    for key, label, indices in GROUPS:
        pack = {"schema": "yorubay-worldbook-pack", "version": 1, "meta": {
            "id": "three-realms-encyclopedia-" + key, "name": "三界九域｜" + label,
            "world": "three-realms", "classification": "world", "author": "班長／肉包",
            "release": "1.0.1" if key == "artifacts" else "1.0.0", "visibility": "public",
            "source": "三界九域仙界-修仙｜公開原文百科分章（2026-10-10）"
        }, "entries": []}
        for index in indices:
            original = originals[index]
            if original["category"] != "物品":
                raise ValueError("Allowlisted source category changed")
            raw = original["content"]
            destinations = []
            for n, (start, end, heading) in enumerate(sections(raw, index)):
                content = raw[start:end].strip()
                entry_id = f"source-{index}-{n}"
                pack["entries"].append({"id": entry_id, "title": original["title"] + "｜" + heading,
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
    print(f"Migrated {len(records)} sources into {manifest['generated_entries']} chapters across five packs.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
