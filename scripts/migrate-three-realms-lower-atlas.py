"""Build six reviewed lower-realm atlas supplements from the public author source."""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = "b43bd078-1b19-46e8-bfc8-952660be367d"
GROUPS = [
    ("cities", "下界城市補篇", [101]),
    ("wanderers", "下界散修", [102, 103, 104, 105]),
    ("secret-realms", "下界秘境", [106, 107, 108, 109]),
    ("commerce", "下界商會與情報", [110, 111, 112, 113]),
    ("beasts", "下界妖獸勢力", [114, 115, 116, 117]),
    ("factions", "下界特殊勢力與鬼市", [118, 119, 120, 121, 122, 123, 124]),
]
CONCEPTS = {102: "下界散修", 106: "下界秘境", 110: "下界商會", 114: "下界妖獸", 118: "下界特殊勢力"}
GHOST_HEADINGS = ["鬼市特點", "鬼市結構", "鬼市規則", "鬼市令牌", "鬼市交易物品", "鬼市分區", "鬼市位置", "鬼市傳說", "鬼市著名事件", "鬼市任務"]

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sections(raw, index):
    if index == 124:
        headings = list(re.finditer(r"(?m)^ *(?:" + "|".join(GHOST_HEADINGS) + r") *$", raw))
        if [m.group().strip() for m in headings] != GHOST_HEADINGS:
            raise ValueError("Reviewed ghost-market headings changed")
        starts = [0] + [m.start() for m in headings]
        labels = ["鬼市概念"] + GHOST_HEADINGS
    elif index in {115, 116, 117}:
        headings = list(re.finditer(r"(?m)^### (.+)$", raw))
        labels = [m.group(1) for m in headings]
        starts = [m.start() for m in headings]
        if index == 117:
            starts[0] = 0
        else:
            category = raw.index("## 主要妖獸勢力")
            starts[0] = category
            starts.insert(0, 0)
            labels.insert(0, "萬妖森林地理" if index == 115 else "無盡之海地理")
    else:
        headings = [m for m in re.finditer(r"(?m)^## (.+)$", raw) if m.group(1) != "特殊注意"]
        starts = [m.start() for m in headings]
        labels = [m.group(1) for m in headings]
        if index == 101:
            # Embedded export metadata introduces northern cities within this source.
            marker = "# 條目：下界城市-北方大陸主要城市"
            if labels != ["劍域城", "青雲城", "烏坦城", "古城"] or marker not in raw:
                raise ValueError("Reviewed mixed city source changed")
            starts[2] = raw.index(marker)
    if not starts or starts[0] != 0:
        raise ValueError("Reviewed section boundaries changed")
    return [(start, starts[n + 1] if n + 1 < len(starts) else len(raw), labels[n]) for n, start in enumerate(starts)]

def keywords(index, heading, content):
    if index in CONCEPTS:
        return [CONCEPTS[index] + "概念"] if heading == "基本概念" else [heading]
    if index == 124:
        return ["鬼市概念", "鬼市介紹"] if heading == "鬼市概念" else [heading]
    if heading in {"萬妖森林地理", "無盡之海地理"}:
        return [heading, heading.removesuffix("地理")]
    terms = [heading]
    terms += re.findall(r"(?:城主|盟主|會長|團長|姓名|閣主|行主|宗主|殿主|門主|族長|宮主)：([^（\n]+)", content)
    return list(dict.fromkeys(t.strip() for t in terms if len(t.strip()) >= 2 and t.strip() != "未知"))[:16]

def build(source, root):
    book = source.get("worldbook", {})
    if book.get("id") != BOOK_ID or book.get("visibility") != "公開" or len(source["entries"]) != 191:
        raise ValueError("Only the reviewed public source edition can be published")
    originals = source["entries"]
    manifest_path = root / "data/three-realms-lower-atlas-source-map.json"
    if manifest_path.exists():
        for record in json.loads(manifest_path.read_text())["records"]:
            if digest(originals[record["source_index"]]["content"]) != record["source_sha256"]:
                raise ValueError("Reviewed source content changed; review before updating the map")
    catalog_path = root / "data/worldbook-library.json"
    catalog = json.loads(catalog_path.read_text())
    ids = {"three-realms-atlas-" + key for key, _, _ in GROUPS}
    catalog["packs"] = [p for p in catalog["packs"] if p["meta"]["id"] not in ids]
    records = []
    for key, label, indices in GROUPS:
        pack = {"schema": "yorubay-worldbook-pack", "version": 1, "meta": {
            "id": "three-realms-atlas-" + key, "name": "三界九域｜" + label,
            "world": "three-realms", "classification": "world", "author": "班長／肉包",
            "release": "1.0.0", "visibility": "public",
            "source": "三界九域仙界-修仙｜公開原文下界補篇（2026-10-10）"
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
    print(f"Migrated {len(records)} sources into {manifest['generated_entries']} chapters across six packs.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
