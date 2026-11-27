#!/usr/bin/env python3
"""Prepare a private Taiwan Mandarin test corpus from an authorized official download.
No network, no player data, no upload. Only local Common Voice test.tsv and clips.
"""
import csv
import hashlib
import json
import pathlib
import subprocess
import sys
import wave

def digest(p):
    with p.open("rb") as f:
        return hashlib.file_digest(f,"sha256").hexdigest()

def main():
    if len(sys.argv)!=4 or sys.argv[3]!="--authorized-local-use":
        raise SystemExit("usage: prepare-zh-tw.py OFFICIAL_EXTRACTED_ZH_TW PRIVATE_OUTPUT --authorized-local-use")
    root=pathlib.Path(sys.argv[1]).resolve(strict=True)
    out=pathlib.Path(sys.argv[2]).resolve()
    out.mkdir(parents=True,exist_ok=True)
    if any(out.iterdir()):
        raise SystemExit("Use a new empty private output directory")
    tsv=root/"test.tsv"
    clips=(root/"clips").resolve(strict=True)
    samples=[]; speakers=set(); sentences=set()
    with tsv.open(encoding="utf-8",newline="") as f:
        for index,row in enumerate(csv.DictReader(f,delimiter="\t")):
            if row.get("locale")!="zh-TW": continue
            sentence=row.get("sentence","").strip()
            speaker=row.get("client_id","")
            name=row.get("path","")
            if not sentence or not speaker or speaker in speakers or sentence in sentences: continue
            if not name or pathlib.Path(name).name!=name: continue
            src=(clips/name).resolve()
            if not src.is_relative_to(clips) or not src.is_file() or src.stat().st_size>20_000_000: continue
            dest=out/f"{index:06d}.wav"
            subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-i",str(src),"-t","31","-ac","1","-ar","16000","-c:a","pcm_s16le",str(dest)],check=True,timeout=30)
            with wave.open(str(dest),"rb") as w: frames=w.getnframes()
            if not 16000<=frames<=480000:
                dest.unlink();continue
            samples.append({"row":index,"file":dest.name,"reference":sentence,"sha256":digest(dest),"seconds":frames/16000})
            speakers.add(speaker);sentences.add(sentence)
            if len(samples)==30: break
    if len(samples)<30: raise RuntimeError("Need 30 distinct speaker/sentence samples in official test split")
    manifest={"dataset":"Mozilla Common Voice zh-TW official test","config":"zh-TW","language":"chinese",
        "source":"https://mozilladatacollective.com/datasets/cmu5wkw5i00c6o107jnm3t51u",
        "sourceSha256":digest(tsv),"selection":"first 30 eligible distinct speaker/sentence rows; no speaker identifiers retained",
        "samples":samples,"privateOnly":True,"referenceScript":"Traditional Chinese as supplied, no simplified folding"}
    (out/"corpus.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Prepared 30 private zh-TW samples. Do not upload corpus, recordings, or individual transcripts.")

if __name__=="__main__": main()
