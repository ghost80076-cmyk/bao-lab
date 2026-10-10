"""Publish reviewed fire and artifact lore with explicit omitted instruction spans."""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = "b43bd078-1b19-46e8-bfc8-952660be367d"
GROUPS = [("fire", "三界異火與神火", list(range(62, 66))), ("artifacts", "神官體系法寶與煉器", list(range(66, 71)))]
LEAF_AREAS = {63: "前十異火（示例）", 64: "天地靈火種類", 65: "神火種類"}
OMITTED_LINES = {63: "（AI 可以根據劇情需要創造其他異火）", 64: "（AI 可以根據劇情需要創造其他天地靈火）", 65: "（AI 可以根據劇情需要創造其他神火）"}

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
    label = "概念" if heading == "基本概念" else heading
    if index == 62:
        return ["三界異火" + label.removeprefix("異火")]
    if index == 63:
        return ["異火榜" + (heading.split("：", 1)[1] if "：" in heading else heading)]
    if index == 64:
        return ["天地靈火體系" + label.removeprefix("天地靈火")]
    if index == 65:
        return ["神官神火體系" + label.removeprefix("神火")]
    if index == 66:
        return ["神官體系器靈" if heading == "器靈" else "神官體系法寶" + label.removeprefix("法寶")]
    if index in [67, 68, 69]:
        return [{67: "下界", 68: "中界", 69: "上界"}[index] + "神官體系" + heading]
    return ["神官體系" + heading]

def source_segments(raw, index, start, end):
    omitted = OMITTED_LINES.get(index)
    if not omitted or omitted not in raw[start:end]:
        return [{"start": start, "end": end}]
    position = raw.index(omitted, start, end)
    return [{"start": start, "end": position}, {"start": position + len(omitted), "end": end}]

def build(source, root):
    book = source.get("worldbook", {})
    if book.get("id") != BOOK_ID or book.get("visibility") != "公開" or len(source["entries"]) != 191:
        raise ValueError("Only the reviewed public source edition can be published")
    originals = source["entries"]
    manifest_path = root / "data/three-realms-fire-artifact-source-map.json"
    if manifest_path.exists():
        for record in json.loads(manifest_path.read_text())["records"]:
            if digest(originals[record["source_index"]]["content"]) != record["source_sha256"]:
                raise ValueError("Reviewed source content changed; review before updating the map")
    catalog_path = root / "data/worldbook-library.json"
    catalog = json.loads(catalog_path.read_text())
    ids = {"three-realms-fire-artifact-" + key for key, _, _ in GROUPS}
    catalog["packs"] = [p for p in catalog["packs"] if p["meta"]["id"] not in ids]
    records = []
    for key, label, indices in GROUPS:
        pack = {"schema": "yorubay-worldbook-pack", "version": 1, "meta": {
            "id": "three-realms-fire-artifact-" + key, "name": "三界九域｜" + label,
            "world": "three-realms", "classification": "world", "author": "班長／肉包",
            "release": "1.0.0", "visibility": "public",
            "source": "三界九域仙界-修仙｜公開原文異火法寶補篇（2026-10-10）"
        }, "entries": []}
        for index in indices:
            original = originals[index]
            expected = "自訂"
            if original["category"] != expected:
                raise ValueError("Allowlisted source category changed")
            raw = original["content"]
            destinations = []
            omissions = []
            if index in OMITTED_LINES:
                line = OMITTED_LINES[index]
                if raw.count(line) != 1:
                    raise ValueError("Reviewed non-factual instruction changed")
                start = raw.index(line)
                omissions.append({"start": start, "end": start + len(line), "source_sha256": digest(line), "reason": "native-story-instruction-not-world-fact"})
            for n, (start, end, heading) in enumerate(sections(raw, index)):
                segments = source_segments(raw, index, start, end)
                content = "".join(raw[p["start"]:p["end"]] for p in segments).strip()
                entry_id = f"source-{index}-{n}"
                title = heading
                pack["entries"].append({"id": entry_id, "title": label + "｜" + title,
                    "category": "世界資料", "mode": "keyword", "keywords": keywords(index, heading, content), "content": content})
                destinations.append({"pack_id": pack["meta"]["id"], "entry_id": entry_id,
                    "start": start, "end": end, "source_segments": segments, "content_sha256": digest(content)})
            records.append({"source_index": index, "source_title": original["title"],
                "source_sha256": digest(raw), "source_chars": len(raw), "destinations": destinations, "omissions": omissions})
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
