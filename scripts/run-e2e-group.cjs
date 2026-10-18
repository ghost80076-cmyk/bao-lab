const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function readSpecs(raw, isFile = name => {
  try { return fs.statSync(name).isFile(); } catch { return false; }
}) {
  const specs = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!specs.length) throw new Error('E2E group has no declared test files.');
  const missing = specs.filter(spec => !isFile(spec));
  if (missing.length) throw new Error('E2E group references missing test files:\n' + missing.join('\n'));
  return specs;
}

function main(env = process.env, invoke = spawnSync, report = console.error, isFile) {
  let specs;
  try { specs = readSpecs(env.SPEC_LIST, isFile); }
  catch (error) { report(error.message); return 1; }
  const result = invoke('npm', ['run', 'test:e2e', '--', ...specs, '--project=chromium'], {
    stdio: 'inherit', env
  });
  if (result.error) report('Cannot start Playwright: ' + result.error.message);
  return result.status ?? 1;
}

if (require.main === module) process.exitCode = main();
module.exports = { readSpecs, main };
