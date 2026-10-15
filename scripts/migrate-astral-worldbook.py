#!/usr/bin/env python3
"""Publish reviewed, work-specific original-text lore from the author's archive.

This is a fixed-source migration, not an unrestricted archive publisher.
Unselected source bodies are never copied to the public catalog.
"""
import argparse
import hashlib
import json
import pathlib
import zipfile

BOOK_ID = "572f3222-5746-43cc-ae16-60239eac041c"
SOURCE_SET_SHA256 = "4259eb8bd377771530fc23cf96eda6ffa4fdd71da2a647bf03a85188ab13afb1"
NAME = "世界模擬器－AV異世界（部分搬入）"
WORLD = "astral-continent"
CHAPTERS = {
    "geography": "世界與地理",
    "characters": "人物檔案",
    "magic": "魔法與道具",
    "mysteries": "勢力與暗線",
}


def sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_book(archive):
    with zipfile.ZipFile(archive) as bundle:
        books = [json.loads(bundle.read(n)) for n in bundle.namelist() if n.endswith(".json")]
    selected = [b for b in books if isinstance(b, dict) and b.get("worldbook", {}).get("id") == BOOK_ID]
    if len(selected) != 1 or len(selected[0].get("entries", [])) != 251:
        raise ValueError("Expected the author's 251-entry AV fantasy source")
    book = selected[0]
    digest = sha("\n".join(sha(e["content"].strip()) for e in book["entries"]))
    if digest != SOURCE_SET_SHA256:
        raise ValueError("Source changed; review the changed source before publishing")
    return book


def migrate(archive):
    book = load_book(archive)
    source = book["entries"]
    packs = {key: {
        "schema": "yorubay-worldbook-pack", "version": 1,
        "meta": {
            "id": "astral-world-" + key, "name": NAME + "｜" + label,
            "world": WORLD, "classification": "world", "author": "班長",
            "release": "0.1.0", "visibility": "public",
            "source": "作者 AV 異世界專用原文分層搬運；非全量原書，未實作完整玩法與狀態系統",
        }, "entries": [],
    } for key, label in CHAPTERS.items()}
    records = {}

    def add(index, chapter, keywords, suffix="", start=0, end=None, requires=(), foundation=False, title=None):
        raw = source[index]["content"]
        end = len(raw) if end is None else end
        excerpt = raw[start:end]
        content = excerpt.strip()
        if not content:
            raise ValueError("Empty source segment")
        left = start + len(excerpt) - len(excerpt.lstrip())
        right = end - (len(excerpt) - len(excerpt.rstrip()))
        identity = "source-" + str(index) + ("-" + suffix if suffix else "")
        entry = {
            "id": identity, "title": title or source[index]["title"],
            "category": source[index]["category"],
            "mode": "foundation" if foundation else "keyword",
            "keywords": keywords, "content": content,
        }
        if requires:
            entry["requires"] = list(requires)
        packs[chapter]["entries"].append(entry)
        record = records.setdefault(index, {
            "source_index": index, "source_position": source[index].get("index"),
            "source_title": source[index]["title"],
            "source_sha256": sha(raw.strip()), "source_chars": len(raw.strip()), "segments": [],
        })
        record["segments"].append({
            "pack_id": packs[chapter]["meta"]["id"], "entry_id": identity,
            "start": left, "end": right, "content_sha256": sha(content),
            "requires": list(requires),
        })

    # Preserve the world/civilization introduction, excluding the original
    # sexual-age thresholds. No character is aged up or otherwise rewritten.
    add(209, "geography", ["阿斯特拉大陸"],
        end=source[209]["content"].index("**成年年齡：**"), foundation=True)
    add(210, "magic", ["六大魔法系統", "生命精華", "性魔法理論"])
    add(211, "geography", ["阿斯特拉種族", "冰霜精靈", "海族", "妖精之森"])
    family = source[212]["content"].index("**家族秘密：**")
    add(212, "geography", ["暗夜聖殿", "永夜領"], "public", end=family)
    add(212, "geography", ["暗夜聖殿", "慾望聖典"], "private", start=family,
        requires=["已確認家族秘寶"], title="暗夜聖殿家族內情")
    add(213, "magic", ["慾望聖典", "慾望印記", "諾克提斯"], requires=["已確認家族秘寶"])
    for index, name in enumerate(["夏洛特·涅槃", "艾絲特·凜冬", "索拉娜·曦光", "芙蕾雅·雷鳴",
                                  "希爾薇·風語", "米蕾雅·海潮", "伊格妮絲·炎華", "櫻花·涅槃"], 214):
        add(index, "characters", [name, name.split("·")[0]])
    add(230, "geography", ["永夜領", "北方冰原", "冰霜森林", "慾望之泉", "封印之塔"])
    add(231, "geography", ["七大勢力", "神聖帝國", "冰霜聯邦", "精靈王國", "海族王國", "天使族聖域"])
    add(235, "magic", ["慾望印記", "生命精華瓶", "魔力裝備", "靈魂項圈"])
    add(236, "magic", ["宿命對手", "印記共鳴", "命運回聲"])
    for index, name in [(237, "加雷斯·聖裁"), (238, "維克多·夜炎"), (239, "莉莉絲·殘月")]:
        split = source[index]["content"].index("**性格：**")
        keys = [name, name.split("·")[0]]
        add(index, "characters", keys, "public", end=split, title=name)
        add(index, "characters", keys, "private", start=split,
            requires=["已確認" + name.split("·")[0] + "的內情"], title=name + "｜內情")
    divinity = source[240]["content"].index("**現有/潛在神化路線角色：**")
    add(240, "magic", ["神化系統", "神格化", "半神覺醒", "神格確立"], "public", end=divinity)
    add(240, "magic", ["神化系統", "諾克提斯", "神格轉移"], "private", start=divinity,
        requires=["已確認神化內情"], title="神化路線內情")
    truth = source[241]["content"].index("**三線交會的隱藏真相")
    add(241, "mysteries", ["家族復活派", "神化取代派", "舊神復甦派"], "factions", end=truth,
        requires=["已察覺三大暗潮"])
    add(241, "mysteries", ["三大暗潮", "世界真相"], "truth", start=truth,
        requires=["已得知世界真相"], title="三線交會的內情")
    add(242, "geography", ["冒險者公會", "性魔法師公會", "暗夜聖殿分部"])
    add(243, "geography", ["日常委託", "採集委託", "遺跡調查", "星隕祭", "新月典禮"])
    add(244, "mysteries", ["世界真相", "後花園", "造園者"], requires=["已得知世界真相"])
    add(246, "mysteries", ["暗夜元老會", "家族復活派", "地下派系"], requires=["已確認元老會內情"])
    add(247, "magic", ["六大魔法", "魔法專精", "性魔法分支", "古代魔法"])

    for index, record in records.items():
        ordered = sorted(record["segments"], key=lambda part: part["start"])
        covered = "".join(source[index]["content"][p["start"]:p["end"]] for p in ordered)
        full = "".join(covered.split()) == "".join(source[index]["content"].split())
        record["coverage"] = "complete-original-text" if full else "partial-original-text"
        if full:
            record["joins"] = [source[index]["content"][a["end"]:b["start"]]
                               for a, b in zip(ordered, ordered[1:])]
            if any(gap.strip() for gap in record["joins"]):
                raise ValueError("A source section was lost between segments")
        if not full:
            record["omitted_scope"] = "Original sexual-age thresholds; not re-aged, rewritten or published"
    unpublished = []
    for index in range(209, 251):
        if index in records:
            continue
        if index in range(222, 227):
            reason = "underage-sexual-material-not-published"
        elif index in [227, 228, 229, 232, 234]:
            reason = "mixed-underage-sexual-objectives-not-published"
        else:
            reason = "work-configuration-and-state-protocol-not-implemented"
        unpublished.append({"source_index": index, "source_title": source[index]["title"],
                            "source_sha256": sha(source[index]["content"].strip()), "reason": reason})
    catalog = {"schema": "yorubay-worldbook-library-catalog", "version": 1, "packs": list(packs.values())}
    coverage = {
        "schema": "yorubay-work-worldbook-publication", "version": 1,
        "source_book_id": BOOK_ID, "source_book_name": book["worldbook"].get("name") or book["worldbook"]["title"],
        "source_book_entries": 251, "scoped_source_entries": 42,
        "scope": "Only the 42 work-specific additions are in scope; the 209 inherited templates and other books are not migrated by this publication. Original-text lore is not a complete game implementation.",
        "world": WORLD, "public_entries": sum(len(p["entries"]) for p in packs.values()),
        "complete_sources": sum(r["coverage"] == "complete-original-text" for r in records.values()),
        "partial_sources": sum(r["coverage"] == "partial-original-text" for r in records.values()),
        "records": list(records.values()), "not_published": unpublished,
    }
    return catalog, coverage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=pathlib.Path)
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    catalog, coverage = migrate(args.archive)
    for name, value in [("astral-worldbook-library.json", catalog), ("astral-worldbook-source-map.json", coverage)]:
        (args.root / "data" / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: coverage[k] for k in ["scoped_source_entries", "public_entries", "complete_sources", "partial_sources"]}))


if __name__ == "__main__":
    main()
