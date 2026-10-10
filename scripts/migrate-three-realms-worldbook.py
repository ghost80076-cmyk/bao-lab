"""Build reviewed public world data; run with the author's original JSON path.

Only the allowlisted geography entries are published. No original archive or
private/archetype/rule entries are copied into this repository.
"""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = "b43bd078-1b19-46e8-bfc8-952660be367d"
GROUPS = [
    ("lower-geography", "下界地理", list(range(85, 91))),
    ("lower-sects", "下界宗門", list(range(91, 96))),
    ("lower-families", "下界家族", list(range(96, 99))),
    ("lower-cities", "下界城市", [99, 100]),
    ("middle-regions", "九大仙域", [142]),
    ("upper-factions", "三十三重天勢力", [187]),
]
MAP_TERMS = {
    85: ["下界地圖", "下界地理", "無盡之海", "內海", "秘境海域", "靈脈"],
    86: ["中央大陸", "天柱山脈", "蒼龍山脈", "赤焰山脈", "寒冰山脈", "天河", "靈溪", "萬妖森林", "迷霧森林", "天心湖", "天柱峰", "龍淵", "火焰谷", "寒冰洞"],
    87: ["東方大陸", "劍域", "劍峰山脈", "青雲山脈", "劍河", "劍塚", "劍意峰", "劍氣海"],
    88: ["西方大陸", "丹域", "藥山", "藥王山脈", "下界藥王谷", "西方大陸藥王谷", "丹火山"],
    89: ["南方大陸", "器域", "神鐵礦", "煉器火山"],
    90: ["北方大陸", "鬥域", "冰原", "鬥技塔", "冰火兩儀洞"],
    96: ["下界家族", "修仙家族", "鬥氣家族", "煉丹世家", "煉器世家", "商業家族"],
    99: ["下界城市", "坊市", "城衛軍", "城主府", "傳送陣", "任務大廳"],
}

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sections(raw):
    starts = [m.start() for m in re.finditer(r"(?m)^## ", raw)]
    # Non-entity advice belongs to the preceding entity/group, not a generic trigger.
    starts = [start for start in starts if not raw[start:].startswith("## 特殊注意")]
    if not starts or starts[0] != 0:
        raise ValueError("Reviewed entry no longer has the expected section boundaries")
    return [(start, starts[n + 1] if n + 1 < len(starts) else len(raw))
            for n, start in enumerate(starts)]

def build(source, root):
    book = source.get("worldbook", {})
    if book.get("id") != BOOK_ID or book.get("visibility") != "公開":
        raise ValueError("Only the reviewed public source edition can be published")
    originals = source["entries"]
    if len(originals) != 191:
        raise ValueError("Source revision changed; review the allowlist again")
    manifest_path = root / "data/three-realms-worldbook-source-map.json"
    if manifest_path.exists():
        approved = json.loads(manifest_path.read_text())
        for record in approved["records"]:
            if digest(originals[record["source_index"]]["content"]) != record["source_sha256"]:
                raise ValueError("Reviewed source content changed; review before updating the approval map")
    catalog_path = root / "data/worldbook-library.json"
    catalog = json.loads(catalog_path.read_text())
    generated_ids = {"three-realms-" + key for key, _, _ in GROUPS}
    catalog["packs"] = [p for p in catalog["packs"] if p["meta"]["id"] not in generated_ids]
    records = []
    for key, label, indices in GROUPS:
        pack = {"schema": "yorubay-worldbook-pack", "version": 1, "meta": {
            "id": "three-realms-" + key, "name": "三界九域｜" + label,
            "world": "three-realms", "classification": "world", "author": "班長／肉包",
            "release": "1.0.1" if key == "lower-geography" else "1.0.0", "visibility": "public",
            "source": "三界九域仙界-修仙｜公開原文分章（2026-10-10）"
        }, "entries": []}
        for index in indices:
            original = originals[index]
            if original["category"] != "地點":
                raise ValueError("Allowlisted source category changed")
            raw = original["content"]
            spans = [(0, len(raw))] if index in MAP_TERMS else sections(raw)
            destinations = []
            for n, (start, end) in enumerate(spans):
                content = raw[start:end].strip()
                heading = content.splitlines()[0].removeprefix("## ")
                title = original["title"] if index in MAP_TERMS else original["title"] + "｜" + heading
                terms = MAP_TERMS.get(index)
                if terms is None:
                    if index == 187:
                        terms = re.findall(r"(?m)^### (.+)$|^【([^】]+)】$", content)
                        terms = [(a if a.endswith("-玄天") else a.split("-", 1)[-1]) if a else b for a, b in terms]
                    else:
                        terms = [heading.split("（", 1)[0]]
                        # Named city/family leaders are background data, never automatically NPC state.
                        terms += re.findall(r"(?:家主|族長|城主)：([^（\n]+)", content)
                    terms = list(dict.fromkeys(terms))[:16]
                entry_id = "source-" + str(index) + "-" + str(n)
                pack["entries"].append({"id": entry_id, "title": title,
                    "category": "世界資料", "mode": "keyword", "keywords": terms,
                    "content": content})
                destinations.append({"pack_id": pack["meta"]["id"], "entry_id": entry_id,
                    "start": start, "end": end, "content_sha256": digest(content)})
            records.append({"source_index": index, "source_title": original["title"],
                "source_sha256": digest(raw), "source_chars": len(raw), "destinations": destinations})
        catalog["packs"].append(pack)
    selected = {r["source_index"] for r in records}
    manifest = {"schema": "yorubay-worldbook-source-map", "version": 1,
        "source_book_id": BOOK_ID, "source_visibility": "公開", "source_entry_count": 191,
        "migrated_source_entries": len(records), "generated_entries": sum(len(r["destinations"]) for r in records),
        "records": records,
        "deferred_source_indices": [i for i in range(191) if i not in selected]}
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Migrated {len(records)} source entries into {manifest['generated_entries']} entries across six packs.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
