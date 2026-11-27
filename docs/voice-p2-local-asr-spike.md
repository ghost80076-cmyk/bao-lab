# P2a — Local ASR research (not production)
基準 #992 已 squash merge 至 6a686342b48b67e3f9d2600e62b01599086bcd82；17/17 PR workflows success。正式站 smoke 與實機仍未驗證。#993 只做獨立研究，不接入故事 runtime，不增加首頁依賴。

## Verified evidence
Head 69455c9142d6a6af7b134464627792c4b506009f: 10/10 PR workflows success. Real WASM workflow https://github.com/ghost80076-cmyk/bao-lab/actions/runs/45958753714 : Chromium, Firefox, WebKit 皆成功。
- Baseline q8 encoder + q8 decoder without timestamps: earlier run 45949217122, raw and padded synthetic English WER 25%, both omitted "Hello world."
- Current tiny mixed: q8 encoder + fp32 decoder, timestamps enabled. Raw and padded same synthetic English fixtures: all three browsers WER 0%. PCM SHA256 and frame count match ffmpeg reference. Greeting presence checked separately. Because decoder precision and decoding options both changed, this is evidence for the combined profile, not proof of a single root cause.
- Model assets 133,068,237 bytes, excluding runtime. Previous q8 weights alone 40,844,231 bytes. Do not compare weights-only size with full runtime size.
- Chromium 153: raw load 2765 ms, inference 2084 ms; Firefox 155: 2265 / 1930 ms; WebKit 26.6: 6698 / 2045 ms. Audio 3.425375 s. Desktop Linux CI, not physical mobile measurements.
- No blocked external HTTP requests observed in the harness; CSP same-origin, loopback GET-only server. Two tabs, cancel, navigation and offline failure checked. Offline cache is disabled, so offline reload is NOT supported yet.
- Runtime and selected model files verified against pinned asset manifest; npm lockfile used for the research build. Model licenses and complete distribution/legal review still required before release.

## Candidates
- Transformers.js 3.8.1 https://huggingface.co/docs/transformers.js/v3.8.1/en/api/env
- Whisper Tiny q8, Tiny mixed, Whisper Base q8; immutable revision and SHA256 in scripts/voice-p2-research/assets.json. Moonshine Tiny is English-only research comparator, not multilingual.
- sherpa-onnx WASM remains separate P2b research: https://k2-fsa.github.io/sherpa/onnx/wasm/index.html.
- No default provider decision yet; evaluate actual quality and resource costs rather than choosing a larger model by default.

## Reproduce isolated lab
From repository root, run bash scripts/voice-p2-research/prepare.sh PRIVATE_ASSET_DIRECTORY whisper-tiny-mixed. Downloads explicitly, verifies pinned assets, bundles runtime using locked dependencies. Use a dedicated directory outside repository. Then run node scripts/voice-p2-browser-lab.cjs PRIVATE_ASSET_DIRECTORY whisper-tiny-mixed and open http://127.0.0.1:8787/. WAV PCM16 mono 16kHz, max 30s. Manual start, cancel, timeout, page exit release worker. No player audio upload, storage, auto-send, fallback or platform inference.
Run node scripts/voice-p2-verify-weights.cjs --self-test and node scripts/voice-p2-browser-lab.cjs --self-test for offline contract fixtures.

## Human speech comparison (new; evidence pending)
Separate workflow Voice P2 human speech comparison, keeps prior three-browser full-transcript gate unchanged. FLEURS https://huggingface.co/datasets/google/fleurs, pinned revision 8d6448449ef85cacf10301f85c215be519e08061, CC-BY-4.0, Conneau et al. 2022 https://arxiv.org/abs/2205.12446. First five eligible rows in each pinned test parquet (cmn_hans_cn, ja_jp, ko_kr, en_us); deterministic duration filter and SHA256 recorded; decoded to local PCM16 WAV. Compare Tiny q8, Tiny mixed, Base q8; Moonshine only English. Chromium WASM cold worker per sample; report per-sample transcript, CER, WER for whitespace-delimited English/Korean, load/inference time, runtime failures, empty results, asset bytes, blocked requests. Upload reports and attribution only; no raw audio. Dataset download is bounded to 1 GB per locale and 300 seconds, in research runner only.
The comparison is a descriptive measurement, NOT a production quality gate or automatic selection. Mandarin corpus is mainland Chinese, not zh-TW. Script normalization does not equate traditional/simplified variants. Five clean samples per locale cannot establish quality across accents, noise, long/mixed speech. No fabricated results; pending CI.

## Remaining integration gates
- Complete #992 production smoke and confirm deployment separately.
- Additional consented Taiwanese Mandarin/traditional Chinese references, RP vocabulary and names, noisy/mixed/short/long cases; predeclare quality acceptance criteria using wider corpus and compare all candidates.
- Measure actual total downloads, physical Android/iOS and desktop RAM, warm startup/cache/reload, offline use, cancellation/download/delete/low storage, WebGPU if supported.
- Full license and supply-chain review before release; present source, size, permission and explicit download in UI.
- Preserve existing device STT (not necessarily offline), manual draft confirmation, optional local provider, no hidden paid fallback, no homepage impact or platform GPU cost.
- Keep #993 draft until evidence reviewed. Production integration belongs in a separate PR after selecting candidate. P2b TTS remains independent.

## Taiwan-first correction and distribution contract
FLEURS run 45968982305 completed four language jobs, but success only means measurements completed. Mainland Mandarin five-sample aggregate strict CER: Tiny q8 83/195 (42.6%), Tiny mixed 395/195 (202.6%), Base q8 73/195 (37.4%). CER can exceed 100% due to insertions/repetition. These results do not justify recommending any model, especially not the 133 MB mixed candidate. zh-TW is now the primary selection gate. Official Mozilla Common Voice zh-TW release 27: https://mozilladatacollective.com/datasets/cmu5wkw5i00c6o107jnm3t51u. Respect source access and no-redistribution terms; obtain locally, never publish corpus/audio/transcripts. New prepare-zh-tw.py accepts authorized extracted official test.tsv + clips, chooses 30 distinct speaker/sentence samples, retains traditional reference without simplified folding. Existing benchmark accepts private corpus and exports aggregate only, rejects GitHub Actions. No authorized source bytes available yet; no zh-TW result claimed. Run locally with Python 3.11+, ffmpeg and prepared assets. Do not upload private data. Secondary FLEURS evidence remains historical/comparative.

Asset-manager-core.cjs is a research-only shared STT/TTS/runtime lifecycle contract: injected catalog, storage, fetch, digest, quota and cross-context lock adapters; explicit confirmation; unapproved candidates rejected; fixed HTTPS upstream URLs, file size/hash checks, transaction, cancellation, import, deletion. No startup requests, no production script import, no default model. Fixtures exercise fake adapters only. Real bounded streaming (including redirect allowlist), OPFS/IndexedDB/native private storage, atomic commit, lock, progress bytes, license UI, cached inference, deletion/active-worker coordination, physical mobile RAM and app integration remain pending. Do not distribute weights through AWS/Worker or bundle App; direct approved upstream or user import first. No promise of free bandwidth or verified CORS.
