#!/usr/bin/env python3
"""Fixed-source, original-text migration of the author's common and Xia books.

Run against the original export ZIP. The archive itself is never published.
Coverage records exact retained spans, including every exclusion.
"""
import argparse
import hashlib
import json
import pathlib
import re
import zipfile

COMMON = "59d9fbcd-d5f8-47aa-99fb-a101675230e4"
AV = "f604df12-4eb7-48c0-b2f0-6c942d6204fa"
HASHES = {
    COMMON: "362f7cb974c7a26a1bee637107e809e893c1ab2e53b11269d45f8e945e5fc101",
    AV: "1716b6bce0933d7e17fcb75bee9279f91ee372cea44b93d357a2d458237ff1d6",
}
EXCLUDED = {2, 24, 66, 76, 83, 183}
STYLES = {64: "純文字", 85: "YA", 86: "NA", 87: "Romantasy", 88: "情慾奇幻",
          89: "Erotica", 90: "Porn", 93: "章回體"}


def sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load(archive):
    books = {}
    with zipfile.ZipFile(archive) as bundle:
        for path in bundle.namelist():
            if path.endswith(".json"):
                data = json.loads(bundle.read(path))
                if isinstance(data, dict) and data.get("worldbook", {}).get("id") in HASHES:
                    books[data["worldbook"]["id"]] = data
    for key, expected in HASHES.items():
        actual = sha("\n".join(sha(e["content"].strip()) for e in books[key]["entries"]))
        if actual != expected:
            raise ValueError("Source changed; review changed text before publication")
    return books


def pack(identity, name, world="general", selection_group=""):
    meta = dict(id=identity, name=name, world=world, classification="reference", author="班長",
                release="1.0.0", visibility="public", source="作者原文搬運；保留段落，來源與例外見 source map")
    if selection_group:
        meta["selection_group"] = selection_group
    return dict(schema="yorubay-worldbook-pack", version=1, meta=meta, entries=[])


def retained_spans(raw, excluded):
    result, start = [], 0
    for left, right in sorted(excluded):
        if left < start:
            raise ValueError("Overlapping source exclusions")
        result.append((start, left))
        start = right
    result.append((start, len(raw)))
    return [(a + len(raw[a:b]) - len(raw[a:b].lstrip()), b - len(raw[a:b]) + len(raw[a:b].rstrip()))
            for a, b in result if raw[a:b].strip()]


def migrate(archive):
    books = load(archive)
    common, av = books[COMMON]["entries"], books[AV]["entries"]
    names = set()
    for entry in common[:32]:
        first = entry["content"].splitlines()[0].removeprefix("演員：")
        names.update(x for x in re.split(r"[（）()]", first) if x)
    common_packs = {
        key: pack("simulator-original-" + key, "通用世界模擬器｜" + label)
        for key, label in [("core", "楚門世界與 NPC 運作"), ("characters", "人物模板"),
                           ("genres", "題材與劇本"), ("commands", "世界查詢與整理"),
                           ("intimacy", "親密描寫與細節")]
    }
    styles = {i: pack("simulator-style-" + str(i), "通用世界模擬器｜文風：" + label,
                      selection_group="simulator-prose") for i, label in STYLES.items()}
    xia_packs = {key: pack("xia-yuhan-worldbook-" + key, "夏語涵專用世界書｜" + label,
                           world="xia-yuhan-av-industry")
                 for key, label in [("character", "夏語涵"), ("npcs", "片場人物模板"),
                                    ("career", "任務與職涯"), ("scenes", "拍攝場景與企劃")]
    }
    records = []

    def add(book, index, target, mode="keyword", excluded=(), reason="", raw_range=None, title=None, keys=None):
        source = books[book]["entries"][index]
        raw = source["content"]
        spans = retained_spans(raw, excluded)
        if raw_range:
            left, right = raw_range
            spans = [(max(a, left), min(b, right)) for a, b in spans if max(a, left) < min(b, right)]
            spans = [(a + len(raw[a:b]) - len(raw[a:b].lstrip()), b - len(raw[a:b]) + len(raw[a:b].rstrip()))
                     for a, b in spans if raw[a:b].strip()]
        content = "\n\n".join(raw[a:b] for a, b in spans)
        identity = "source-" + str(index) + ("-" + str(raw_range[0]) if raw_range else "")
        keywords = list(dict.fromkeys(keys if keys is not None else source.get("keywords", [])))
        target["entries"].append(dict(id=identity, title=title or source["title"], category=source.get("category", ""),
                                      mode=mode, keywords=keywords, content=content))
        records.append(dict(source_book_id=book, source_index=index, source_title=source["title"],
                            source_sha256=sha(raw.strip()), source_chars=len(raw.strip()),
                            pack_id=target["meta"]["id"], entry_id=identity,
                            spans=[dict(start=a, end=b) for a, b in spans], content_sha256=sha(content),
                            coverage="complete-original-text" if content == raw.strip() else "original-text-segments",
                            omission_reason=reason))

    not_published = []
    for i, entry in enumerate(common):
        if i in EXCLUDED or i >= 195:
            not_published.append(dict(source_book_id=COMMON, source_index=i, source_title=entry["title"],
                                      source_sha256=sha(entry["content"].strip()),
                                      reason="underage-sexual-framing-not-published" if i in EXCLUDED
                                      else "LunaTalk-renderer-protocol-not-portable-to-native-YoruBay-UI"))
            continue
        raw = entry["content"]
        omitted, cursor = [], 0
        for line in raw.splitlines(keepends=True):
            # Deidentify fictional templates: never publish a named real person
            # as the subject of the source's sexual profile or casting pool.
            if any(name in line for name in names) or (i == 80 and "蘿莉" in line):
                omitted.append((cursor, cursor + len(line)))
            cursor += len(line)
        reason = "real-person-casting-links-excluded; fictional-template-prose-retained" if omitted else ""
        if i == 80:
            reason = "child-coded-harem-template-line-excluded"
        if i in STYLES:
            add(COMMON, i, styles[i], "constant", omitted, reason)
        else:
            key = "core" if 33 <= i <= 37 else "characters" if i < 32 or i == 52 else \
                  "commands" if i == 32 or 53 <= i <= 63 else "intimacy" if 100 <= i or 38 <= i <= 40 else "genres"
            add(COMMON, i, common_packs[key], "constant" if key == "core" else "keyword", omitted, reason)

    for i in range(194, 209):
        entry, omitted, reason = av[i], [], ""
        raw = entry["content"]
        if i == 197:
            not_published.append(dict(source_book_id=AV, source_index=i, source_title=entry["title"],
                                      source_sha256=sha(raw.strip()), reason="mapped-to-existing-native-gameplay-panels-and-world-modules"))
            continue
        if i == 194:
            omitted = [(0, raw.index("\n") + 1)]
            reason = "real-person-casting-link-excluded"
        if i == 199:
            line = next(line for line in raw.splitlines(keepends=True) if "真實演員參考" in line)
            left = raw.index(line)
            omitted = [(left, left + len(line))]
            reason = "real-person-casting-link-excluded"
        if i == 208:
            left = raw.index("### **👥 企劃 002")
            right = raw.index("### **🔄 企劃 003")
            omitted = [(left, right)]
            reason = "mixed-underage-sexual-assault-plan-excluded"
        key = "character" if i <= 196 else "npcs" if i <= 199 else "career" if i <= 202 else "scenes"
        if key != "scenes":
            add(AV, i, xia_packs[key], excluded=omitted, reason=reason)
        else:
            headings = list(re.finditer(r"^### \*\*[^\n]*(?:場景|企劃) \d{3}[^\n]*", raw, re.M))
            for position, match in enumerate(headings):
                end = headings[position + 1].start() if position + 1 < len(headings) else len(raw)
                if any(a <= match.start() < b for a, b in omitted):
                    continue
                title = re.sub(r"[\*#]", "", match.group()).strip()
                terms = re.split(r"[：/（(]|系列|[）)]", re.sub(r"^.*?(?:場景|企劃) \d{3}：?\s*", "", title))
                keys = [t.strip() for t in terms if len(t.strip()) >= 2]
                add(AV, i, xia_packs[key], excluded=omitted, reason=reason,
                    raw_range=(match.start(), end), title=title, keys=keys or entry["keywords"])

    packs = list(common_packs.values()) + list(styles.values()) + list(xia_packs.values())
    common_hashes = {sha(e["content"].strip()): i for i, e in enumerate(common)}
    inherited = [dict(source_index=i, common_source_index=common_hashes[sha(e["content"].strip())],
                      source_sha256=sha(e["content"].strip())) for i, e in enumerate(av[:194])]
    catalog = dict(schema="yorubay-worldbook-library-catalog", version=1, packs=packs)
    coverage = dict(schema="yorubay-simulator-original-publication", version=1,
                    common_source_book=COMMON, xia_source_book=AV,
                    scope="Common source 202 entries; Xia-specific additions 194–208 (zero-based). Shared AV entries deduplicated against the common source by text hash. AV fantasy is separate and its matching work has not been imported.",
                    constant_core_chars=sum(len(e["content"]) for e in common_packs["core"]["entries"]),
                    public_entries=sum(len(p["entries"]) for p in packs),
                    records=records, not_published=not_published, xia_inherited_common_sources=inherited)
    return catalog, coverage


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "data")
    args = parser.parse_args()
    catalog, coverage = migrate(args.archive)
    for name, data in [("simulator-original-worldbook-library.json", catalog),
                       ("simulator-original-worldbook-source-map.json", coverage)]:
        (args.output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"packs": len(catalog["packs"]), "entries": coverage["public_entries"],
                      "constant_core_chars": coverage["constant_core_chars"]}))
