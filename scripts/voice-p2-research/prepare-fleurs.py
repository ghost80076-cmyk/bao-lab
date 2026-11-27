#!/usr/bin/env python3
"""Deterministic, public FLEURS test corpus preparation. No player recordings."""
import hashlib
import json
import pathlib
import subprocess
import sys
import wave

import pyarrow.parquet as pq

REVISION = "8d6448449ef85cacf10301f85c215be519e08061"
LANGUAGES = {"cmn_hans_cn": "chinese", "ja_jp": "japanese", "ko_kr": "korean", "en_us": "english"}
COUNT = 5

def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def main():
    if len(sys.argv) != 3 or sys.argv[1] not in LANGUAGES:
        raise SystemExit("usage: prepare-fleurs.py CONFIG PRIVATE_DIRECTORY")
    config, directory = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/datasets/google/fleurs/resolve/{REVISION}/{config}/test-00000-of-00001.parquet"
    parquet = directory / "source.parquet"
    subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "2",
                    "--max-time", "300", "--max-filesize", "1000000000", "--proto", "=https",
                    "--proto-redir", "=https", url, "-o", str(parquet)], check=True)
    source_hash = digest(parquet)
    data = pq.ParquetFile(parquet)
    samples = []
    skipped = []
    row_index = 0
    for batch in data.iter_batches(batch_size=8, columns=["id", "audio", "transcription"]):
        for row in batch.to_pylist():
            index = row_index
            row_index += 1
            ref = row["transcription"]
            audio = row["audio"].get("bytes") if isinstance(row["audio"], dict) else None
            if not isinstance(ref, str) or not ref.strip() or not audio:
                skipped.append({"row": index, "reason": "missing audio or reference"})
                continue
            if len(audio) > 20_000_000:
                skipped.append({"row": index, "reason": "source exceeds input byte limit"})
                continue
            name = f"{index:05d}.wav"
            dest = directory / name
            # Decode at most 31s, then reject (never silently clip a reference).
            decoded = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "pipe:0",
                "-t", "31", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dest)],
                input=audio, capture_output=True, timeout=30)
            if decoded.returncode:
                raise RuntimeError(f"Audio decode failed at row {index}: {decoded.stderr[:300]!r}")
            with wave.open(str(dest), "rb") as w:
                frames = w.getnframes()
            if not 16000 <= frames <= 480000:
                dest.unlink()
                skipped.append({"row": index, "reason": "duration outside 1-30s"})
                continue
            samples.append({"row": index, "id": str(row["id"]), "file": name, "reference": ref,
                            "sha256": digest(dest), "seconds": frames / 16000})
            if len(samples) == COUNT:
                break
        if len(samples) == COUNT:
            break
    if len(samples) != COUNT:
        raise RuntimeError("Insufficient eligible test samples")
    manifest = {"dataset": "google/fleurs", "revision": REVISION, "source": url,
                "sourceSha256": source_hash, "license": "CC-BY-4.0",
                "attribution": "Conneau et al. (2022), FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech, https://arxiv.org/abs/2205.12446",
                "config": config, "language": LANGUAGES[config],
                "selection": "first five eligible rows in fixed test parquet order; converted to PCM16 mono 16kHz",
                "samples": samples, "skipped": skipped}
    (directory / "corpus.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    parquet.unlink()
    print(json.dumps({"config": config, "samples": len(samples), "sourceSha256": source_hash}))

if __name__ == "__main__":
    main()
