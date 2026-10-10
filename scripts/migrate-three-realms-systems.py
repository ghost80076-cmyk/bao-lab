"""Publish reviewed faith, karma and ascension background without state mutations."""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = "b43bd078-1b19-46e8-bfc8-952660be367d"
GROUPS = [
    ("faith", "神官體系信仰與神職", list(range(71, 76))),
    ("karma", "三界業力與功德", list(range(76, 79))),
    ("heart-fall", "三界心魔與墮落", [79, 80]),
    ("ascension", "神官體系飛升與降臨", list(range(81, 85))),
]
PREFIXES = {
    71: "神官信仰", 72: "神官信徒", 73: "神官神職", 74: "神官權柄", 75: "神官信仰戰爭",
    76: "三界業力", 77: "三界業力積累", 78: "三界業力消除", 79: "三界心魔", 80: "三界墮落",
    81: "下界飛升中界", 82: "中界飛升上界", 83: "三界飛升適應", 84: "三界降臨",
}

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sections(raw, index):
    tokens = [(m.start(), m.group(1)) for m in re.finditer(r"(?m)^## (.+)$", raw) if m.group(1) != "特殊注意"]
    if not tokens or tokens[0][0] != 0:
        raise ValueError("Reviewed section boundaries changed")
    return [(start, tokens[n + 1][0] if n + 1 < len(tokens) else len(raw), heading) for n, (start, heading) in enumerate(tokens)]

def keywords(index, heading, content):
    label = "概念" if heading == "基本概念" else heading
    if index == 71:
        return ["神官信仰概念" if heading == "基本概念" else "神官" + heading]
    if index == 72:
        return ["神官信徒獲取方式" if heading == "獲取方式" else "神官" + heading]
    if index in [73, 74]:
        return ["神官神職概念" if heading == "基本概念" else "神官" + heading]
    if index == 75:
        return ["神官信仰戰爭" + label.removeprefix("戰爭")]
    if index == 76:
        return ["三界業力概念" if heading == "基本概念" else "三界" + heading]
    if index == 77:
        return ["三界" + heading]
    if index == 78:
        return ["三界業力消除方式" if heading == "消除方式" else "三界" + heading]
    if index == 79:
        return ["三界心魔概念" if heading == "基本概念" else "三界心魔失敗後果" if heading == "失敗後果" else "三界" + heading]
    if index == 80:
        return ["三界墮落概念" if heading == "基本概念" else "三界墮落回歸可能" if heading == "回歸可能" else "三界" + heading]
    if index == 81:
        return ["下界" + heading] if heading in ["鬥宗渡劫", "元嬰飛升"] else ["下界飛升" + label.removeprefix("飛升")]
    if index == 82:
        return ["中界" + heading] if heading in ["渡劫條件", "九重天劫", "渡劫過程", "成功飛升"] else ["中界飛升" + label.removeprefix("飛升")]
    if index == 83:
        return [{"下界飛升中界後": "神官體系中界適應", "中界飛升上界後": "神官體系上界適應", "飛升者的優勢": "神官體系飛升者優勢", "飛升者的劣勢": "神官體系飛升者劣勢"}[heading]]
    return ["三界" + heading] if heading != "基本概念" else ["三界降臨概念"]

def build(source, root):
    book = source.get("worldbook", {})
    if book.get("id") != BOOK_ID or book.get("visibility") != "公開" or len(source["entries"]) != 191:
        raise ValueError("Only the reviewed public source edition can be published")
    originals = source["entries"]
    manifest_path = root / "data/three-realms-systems-source-map.json"
    if manifest_path.exists():
        for record in json.loads(manifest_path.read_text())["records"]:
            if digest(originals[record["source_index"]]["content"]) != record["source_sha256"]:
                raise ValueError("Reviewed source content changed; review before updating the map")
    catalog_path = root / "data/worldbook-library.json"
    catalog = json.loads(catalog_path.read_text())
    ids = {"three-realms-systems-" + key for key, _, _ in GROUPS}
    catalog["packs"] = [p for p in catalog["packs"] if p["meta"]["id"] not in ids]
    records = []
    for key, label, indices in GROUPS:
        pack = {"schema": "yorubay-worldbook-pack", "version": 1, "meta": {
            "id": "three-realms-systems-" + key, "name": "三界九域｜" + label,
            "world": "three-realms", "classification": "world", "author": "班長／肉包",
            "release": "1.0.0", "visibility": "public",
            "source": "三界九域仙界-修仙｜公開原文信仰業力飛升補篇（2026-10-10）"
        }, "entries": []}
        for index in indices:
            original = originals[index]
            expected = "自訂"
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
    print(f"Migrated {len(records)} sources into {manifest['generated_entries']} chapters across four packs.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
