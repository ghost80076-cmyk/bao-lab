'use strict';
// Developer-only candidate verification. No downloads, no runtime integration.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const model = require('./voice-p2-research/assets.json').models['whisper-tiny'];
const revision = model.revision;
const candidate = Object.fromEntries(Object.entries(model.files).filter(([name]) => name.endsWith('.onnx')));
async function verify(root, manifest) {
  const realRoot = fs.realpathSync(root);
  const files = [];
  for (const [relative, expected] of Object.entries(manifest)) {
    const absolute = fs.realpathSync(path.join(realRoot, relative));
    if (!absolute.startsWith(realRoot + path.sep)) throw Error('File outside snapshot: ' + relative);
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) throw Error('Not a file: ' + relative);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of fs.createReadStream(absolute)) { hash.update(chunk); bytes += chunk.length; }
    const actual = hash.digest('hex');
    if (actual !== expected || bytes !== stat.size) throw Error('Integrity mismatch: ' + relative);
    files.push({path:relative, bytes, sha256:actual});
  }
  return {files, totalBytes:files.reduce((n,f)=>n+f.bytes,0)};
}
async function selfTest() {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yorubay-p2-'));
  try {
    fs.writeFileSync(path.join(dir,'fixture'),'abc');
    const good = {fixture:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'};
    assert.equal((await verify(dir,good)).totalBytes,3);
    await assert.rejects(verify(dir,{fixture:'0'.repeat(64)}),/Integrity mismatch/);
    await assert.rejects(verify(dir,{missing:good.fixture}),/ENOENT/);
    console.log('Local weight verifier fixture passed');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
async function main(){
  const arg = process.argv[2];
  if (process.argv.length !== 3 || !arg) throw Error('Usage: node scripts/voice-p2-verify-weights.cjs <snapshot directory>|--self-test');
  if (arg === '--self-test') return selfTest();
  console.log(JSON.stringify({candidateRevision:revision,scope:'two weights only; not a full manifest',...await verify(arg,candidate)},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verify};
