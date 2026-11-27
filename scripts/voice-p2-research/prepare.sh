#!/usr/bin/env bash
# Opt-in developer download into a private research directory, outside the site.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(realpath -m "${1:?usage: prepare.sh ASSET_DIRECTORY [MODEL]}")
model=${2:-whisper-tiny}
case "$model" in whisper-tiny|whisper-tiny-mixed|whisper-base|moonshine-tiny) ;; *) exit 2 ;; esac
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
cp "$here/package.json" "$here/package-lock.json" "$build/"
cd "$build"
npm ci --ignore-scripts --no-audit --no-fund
mkdir -p "$root/runtime"
dist=node_modules/@huggingface/transformers/dist
node_modules/.bin/esbuild "$dist/transformers.web.min.js" --bundle --platform=browser --format=esm --target=es2022 --outfile="$root/runtime/transformers.web.min.js"
for name in $(node -p 'Object.keys(require(process.argv[1]).runtime).filter(x=>x.startsWith("ort-")).join(" ")' "$here/assets.json"); do
  asset="$dist/$name"
  if [[ ! -f $asset ]]; then asset="node_modules/onnxruntime-web/dist/$name"; fi
  cp "$asset" "$root/runtime/$name"
done
node - "$here" "$root" "$model" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const [here, root, profile] = process.argv.slice(2);
const {verify} = require(path.join(here, '../voice-p2-verify-weights.cjs'));
const manifest = require(path.join(here, 'assets.json'));
const {model, source, revision, files} = require(path.join(here, 'candidate.cjs')).candidateFor(profile);
async function prepare() {
  await verify(path.join(root, 'runtime'), manifest.runtime);
  const dir = path.join(root, 'models', model);
  for (const file of Object.keys(files)) {
    const dest = path.join(dir, file);
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    const url = 'https://huggingface.co/'+source+'/resolve/'+revision+'/'+file;
    execFileSync('curl', ['--fail','--silent','--show-error','--location','--retry','2','--max-time','180','--proto','=https','--proto-redir','=https',url,'-o',dest], {stdio:'inherit'});
  }
  const report = await verify(dir, files);
  console.log(JSON.stringify({model, source, revision, ...report}, null, 2));
}
prepare().catch(e => {console.error(e.message); process.exitCode=1;});
JS
