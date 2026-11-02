'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GROUPS, normalize, select, changedFromGit } = require('../scripts/pr-regression-gate.cjs');
const includes = (plan, ...tests) => tests.forEach(file =>
  assert.ok(plan.tests.includes('tests/' + file), 'missing cross-feature test ' + file));
test('memory edits include revision, rollback and state consistency', () => {
  const plan = select(['js/memory-workbench-ai.js']);
  assert.ok(plan.groups.includes('memory'));
  includes(plan, 'memory-orchestration-core.cjs', 'story-revision-state-core.cjs',
    'story-rollback-core.cjs', 'status-revision-entry-ownership-core.cjs');
});
test('revision edits carry memory ownership and branch recovery checks', () => {
  const plan = select(['js/story-revision-state.js', 'js/story-branches.js']);
  assert.ok(plan.groups.includes('story-state'));
  includes(plan, 'story-branch-commit-core.cjs', 'memory-summary-ownership-core.cjs');
});
test('model or provider changes test memory and policy outcomes', () => {
  const plan = select(['js/helper-api-routing.js']);
  assert.ok(plan.groups.includes('model-requests'));
  includes(plan, 'api-provider-contracts.cjs', 'provider-policy-guard-core.cjs', 'memory-request-guard-core.cjs');
});
test('worker changes include wallet and provider contracts', () => {
  const plan = select(['workers/bao-lab-credits-api/src/index.js']);
  assert.ok(plan.groups.includes('worker-billing'));
  includes(plan, 'worker-wallet-reservations-core.cjs', 'worker-provider-transport-core.cjs');
});
test('unknown source paths never bypass basic regressions', () => {
  const plan = select(['js/new-feature-without-rule.js']);
  assert.deepEqual(plan.groups, ['baseline']);
  includes(plan, 'story-integrity-core.cjs');
});
test('docs-only PR does not re-run runtime suites', () => {
  const plan = select(['README.md', 'docs/ux-quality-audit-2026-10-22.md']);
  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.tests, []);
});
test('CI configuration edits get integrity regressions', () => {
  const plan = select(['.github/workflows/core-tests.yml']);
  assert.ok(plan.groups.includes('ci-contract'));
  includes(plan, 'e2e-group-runner.test.cjs');
});
test('paths normalize, deduplicate and order stably', () => {
  assert.equal(normalize('.\\js\\memory-core.js'), 'js/memory-core.js');
  const plan = select(['js/memory-core.js', './js/memory-core.js', 'js/memory-core.js']);
  assert.equal(plan.files.length, 1);
  assert.equal(plan.tests.length, new Set(plan.tests).size);
});
test('configured regression files exist in repo', () => {
  for (const group of GROUPS) for (const filename of group.tests) {
    assert.ok(fs.statSync(path.resolve(__dirname, '..', filename), { throwIfNoEntry: true })?.isFile(),
      'missing regression file ' + filename);
  }
});
test('gate workflow always checks all PRs without path filters', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/regression-impact-gate.yml'), 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /^\s+paths(?:-ignore)?:/m);
  assert.match(workflow, /node --test tests\/pr-regression-gate\.test\.cjs/);
  assert.match(workflow, /node scripts\/pr-regression-gate\.cjs/);
});
test('git diff rejects malformed or absent revisions', () => {
  assert.throws(() => changedFromGit([]), /Expected --base/);
  assert.throws(() => changedFromGit(['--base', 'main', '--head', 'HEAD']), /full commit SHA/);
});
