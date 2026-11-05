'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function discover(project, shard) {
  const args = [require.resolve('@playwright/test/cli'), 'test', '--list', '--reporter=json', '--project=' + project];
  if (shard) args.push('--shard=' + shard + '/4');
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Discovery did not complete');
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.errors, [], 'Discovery errors must not remove tests from acceptance');
  const ids = [];
  function visit(suites) {
    for (const suite of suites || []) {
      for (const spec of suite.specs || []) for (const test of spec.tests || []) {
        assert.equal(test.projectName, project);
        ids.push(spec.id);
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  assert.ok(ids.length, 'Empty discovery cannot pass');
  return ids;
}
for (const browser of ['chromium', 'firefox', 'webkit']) {
  const full = discover(browser), shards = [1, 2, 3, 4].map(n => discover(browser, n));
  const union = shards.flat();
  assert.equal(new Set(full).size, full.length, 'Full discovery contains duplicate identities');
  assert.equal(new Set(union).size, union.length, 'A test appears in more than one shard');
  assert.deepEqual(union.slice().sort(), full.slice().sort(), browser + ' sharding lost or added tests');
  const line = browser + ': ' + full.length + ' discovered tests, disjoint shards [' + shards.map(s => s.length).join(', ') + ']';
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n\n');
}
