# P2a — Local ASR spike (not production)
基準 #992 已 squash merge 至 6a686342b48b67e3f9d2600e62b01599086bcd82；17/17 PR workflows success，正式站 smoke 和實機仍待驗證。本分支只做研究，不接入故事 runtime，也不增加首頁資源。

## Candidate
- Transformers.js: https://huggingface.co/docs/transformers.js/index
- WebGPU ASR: https://huggingface.co/docs/transformers.js/main/en/guides/webgpu
- Multilingual model: https://huggingface.co/onnx-community/whisper-tiny (not whisper-tiny.en).
- Candidate snapshot: https://huggingface.co/onnx-community/whisper-tiny/commit/ff4177021cc41f7db950912b73ea4fdf7d01d8e7
- Quantized encoder ~10.1 MB, merged decoder ~30.7 MB per upstream listing; ~40.8 MB weights alone, not total download or peak RAM. Config/tokenizer/runtime/WASM overhead must be measured.
- Published main file SHA256 values recorded in the local verifier; confirm against immutable snapshot and actual bytes before accepting. No model files downloaded in this PR. Pin exact Transformers.js/ONNX runtime versions, integrity and licenses separately after successful experiment. Base Whisper licensing does not by itself certify converted weights and all dependencies.
- sherpa-onnx WASM: https://k2-fsa.github.io/sherpa/onnx/wasm/index.html; evaluate separately for TTS. Do not claim a single voice/model covers all languages.

## First executable gate
Run `node scripts/voice-p2-verify-weights.cjs <local snapshot directory>` on a developer machine after deliberately obtaining the candidate files from the pinned revision. It reads two local files, computes SHA256 and reports bytes. It neither downloads anything nor installs a package; missing/mismatched files fail. Run `node scripts/voice-p2-verify-weights.cjs --self-test` for an offline verifier fixture test. This verifies two weights only, not a complete model manifest.

## Next browser spike gate
1. Select a pinned Transformers.js browser build with matching WASM files; verify npm integrity, licenses and model config/tokenizer hashes. Serve all files locally on a dedicated research origin, not production. Use explicit start/download; no automatic network calls on page load. Allow only pinned artifacts, no arbitrary author-supplied URLs.
2. Use a dedicated Worker for pipeline('automatic-speech-recognition', ..., { revision: fixedSHA, dtype: 'q8', device: 'wasm' }); compare WebGPU separately where supported. Confirm actual file requests and supported runtime options rather than assuming identical backend artifacts.
3. Use locally supplied consented WAV files, mono 16 kHz PCM, 5/15/30s. Enforce duration/size before decode. Inference returns text only; no remote inference or audio upload. Stop/terminate releases worker; cancellation must not auto restart or switch engines.
4. Test zh-TW (including Taiwan terms and names), ja-JP, ko-KR, en-US; each 5+ clean samples and noisy/mixed language cases; report CER/WER, empty/hallucinated transcript, elapsed and real-time factor. No fabricated samples or results. Benchmark desktop and physical Android/iOS with cold download, warm cache, offline reload, memory, cancel and cleanup. Record actual browser version, backend and failures.
5. Only after real measurements, decide whether local STT is an optional advanced provider. Normal browser keyboard/Web Speech remain available. No speech auto-submit, no prompt/recording persistence or AWS/Worker/Lights costs. TTS and STT independent.
6. Complete #992 production deployment/smoke verification before integrating any P2 runtime. Draft stays unmerged until evidence, full manifest and tests are available.

## Evidence record
PR #992 merged, pre-merge 17/17 workflow success. P2 inference, browser compatibility, latency, memory, complete manifest, supply-chain and production deployment: NOT VERIFIED.

## Isolated browser harness (implemented, inference unverified)
The lab is a Node loopback-only server, separate from the public site. It serves only its embedded UI/worker and an allowlist of explicitly prepared local files. No upload endpoint, CDN fetch, account, microphone, story state, analytics or model fallback. Each run starts a new worker; cancel, timeout (5 min), and page exit terminate it. The WAV parser accepts 16-bit PCM mono 16 kHz up to 30 seconds. Output includes loading/inference time, real-time factor, transcript and browser version, not measured peak memory. Chinese selection does not guarantee Traditional Chinese output.

Preparation (developer machine only):
- Create a dedicated asset directory outside the repository; place the reviewed pinned snapshot under models/whisper-tiny/ (including config/tokenizer files and the two q8 weights). The local folder layout intentionally omits the revision in its URL; the operator must obtain the pinned snapshot, and the server verifies the two weights before serving.
- Place the reviewed @huggingface/transformers 3.8.1 browser distribution transformers.web.min.js and matching ort-wasm*.mjs / .wasm files under runtime/. Verify the complete package and model manifest and licenses independently before inference. Never place unrelated files or credentials in that directory. Runtime version is checked inside the worker, not a substitute for hash verification.
- Run node scripts/voice-p2-browser-lab.cjs <asset-directory>, then open http://127.0.0.1:8787/ on that machine. Start explicitly with a consented WAV. WASM is the default, WebGPU is opt-in and fails without silent fallback. Missing files or unsupported runtime options fail rather than fetching remote assets. The allowlist may need adjustments based on actual runtime requests.
- Run node scripts/voice-p2-browser-lab.cjs --self-test for synthetic PCM, invalid input, asset path and script syntax fixtures. Core CI runs both verifier and lab self-tests. These are not actual ASR or browser E2E tests.
- Cache is intentionally disabled in this initial cold-run harness. Warm cache, offline reload, actual browser/network isolation, reference corpus scores, peak RAM, phone and TTS validation are separate future gates. Loopback only: do not expose to LAN for phone tests; design a separately secured local test origin first.

References checked: https://huggingface.co/docs/transformers.js/v3.8.1/en/api/env and https://huggingface.co/docs/transformers.js/v3.8.1/en/custom_usage ; upstream main weight hashes match the values recorded in the verifier; actual pinned bytes still need verification. No full runtime manifest, model download, inference results, or production verification claimed.
