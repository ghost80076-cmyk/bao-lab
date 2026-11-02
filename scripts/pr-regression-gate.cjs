'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
// Cross-feature contracts augment (never replace) the normal core and browser jobs.
const GROUPS = [
  { id: 'baseline', patterns: [], tests: [
    'tests/frontend-extension-contract.cjs',
    'tests/story-integrity-core.cjs'
  ] },
  { id: 'memory', patterns: [
    /^js\/(?:memory-|context-|canon-|episodic-memory|full-story-memory|story-tools|story-maintenance|story-data-task|helper-context|reader-context)/,
    /^tests\/(?:memory-|context-|canon-|episodic-memory|full-story-memory|story-maintenance|story-data-task)/
  ], tests: [
    'tests/memory-orchestration-core.cjs',
    'tests/memory-truncation-recovery-core.cjs',
    'tests/memory-summary-ownership-core.cjs',
    'tests/context-pack-resume-core.cjs',
    'tests/story-revision-state-core.cjs',
    'tests/story-rollback-core.cjs',
    'tests/status-revision-entry-ownership-core.cjs',
    'tests/story-maintenance-send-gate-core.cjs'
  ] },
  { id: 'story-state', patterns: [
    /^js\/(?:story-(?:branches|rollback|revision|history|library|integrity|timeline|helper|persona|actor)|world-state|state(?:\.|\/)|state-tracker|character-status|npc-|same-model-state-merge|global-bridge)/,
    /^tests\/(?:story-(?:branch|rollback|revision|history|library|integrity|timeline|helper|persona|actor)|world-state|state-|character-status|npc-|same-model-state)/
  ], tests: [
    'tests/story-revision-state-core.cjs',
    'tests/story-branch-commit-core.cjs',
    'tests/story-rollback-core.cjs',
    'tests/state-snapshot-continuity-core.cjs',
    'tests/status-revision-entry-ownership-core.cjs',
    'tests/memory-summary-ownership-core.cjs'
  ] },
  { id: 'model-requests', patterns: [
    /^js\/(?:api\.js|helper-api|model-|provider-|request-|chat-api|story-data-task|world-state|memory-core)/,
    /^tests\/(?:api-|helper-api|model-|provider-|request-|chat-api|story-data-task)/
  ], tests: [
    'tests/api-send-pipeline-core.cjs',
    'tests/api-provider-contracts.cjs',
    'tests/request-lifecycle-core.cjs',
    'tests/provider-policy-guard-core.cjs',
    'tests/memory-request-guard-core.cjs'
  ] },
  { id: 'storage', patterns: [
    /^js\/(?:storage|story-library|story-backup|story-rollback)/,
    /^tests\/(?:storage-|story-library|story-backup|story-restore|story-recovery)/
  ], tests: [
    'tests/storage-fallback-integrity-core.cjs',
    'tests/story-library-durability-core.cjs',
    'tests/story-backup-recovery-core.cjs',
    'tests/story-rollback-core.cjs'
  ] },
  { id: 'ui', patterns: [
    /^(?:css\/|index\.html$|(?:gameplay-ui-preview|character-studio|author|account|lights)\.html$)/,
    /^js\/(?:gameplay-ui|stage-capability|phone-|site-ui|character-studio|experience-preferences|story-reader|chat-reading|app\.js)/,
    /^tests\/(?:gameplay-ui|stage-capability|phone-|experience-preferences|story-reader|chat-reading)/
  ], tests: [
    'tests/gameplay-ui-engine-core.cjs',
    'tests/experience-preferences-core.cjs',
    'tests/character-studio-gameplay-ui-core.cjs',
    'tests/story-reader-core.cjs'
  ] },
  { id: 'worker-billing', patterns: [
    /^workers\//,
    /^scripts\/(?:deploy-worker|apply-worker|apply-production-model|build-aws-relay)/,
    /^tests\/(?:worker-|per-request-cost|credits-pilot|provider-control|request-ledger)/
  ], tests: [
    'tests/worker-wallet-reservations-core.cjs',
    'tests/worker-cost-chat-settlement-core.cjs',
    'tests/worker-usage-diagnostics-core.cjs',
    'tests/worker-provider-transport-core.cjs',
    'tests/provider-policy-guard-core.cjs'
  ] },
  { id: 'author-content', patterns: [
    /^(?:works\/|data\/|js\/(?:character-import|character-studio|author-|work-package|worldbook))/,
    /^tests\/(?:character-import|character-readiness|work-package|admin-work-package|author-)/
  ], tests: [
    'tests/character-import-core.cjs',
    'tests/character-readiness-core.cjs',
    'tests/work-package-core.cjs'
  ] },
  { id: 'ci-contract', patterns: [
    /^\.github\/(?:workflows\/|actions\/|pull_request_template\.md$)/,
    /^(?:AGENTS\.md|scripts\/pr-regression-gate\.cjs|tests\/pr-regression-gate\.test\.cjs|docs\/pr-regression-contract\.md)$/
  ], tests: ['tests/e2e-group-runner.test.cjs'] }
];
function normalize(file) { return file.replace(/\\/g, '/').replace(/^\.\//, ''); }
function select(changedFiles) {
  const files = [...new Set(changedFiles.filter(Boolean).map(normalize))].sort();
  const groups = GROUPS.filter(group => group.patterns.some(pattern => files.some(file => pattern.test(file))));
  const isSource = file => /^(?:js\/|workers\/|scripts\/|css\/|tests\/|works\/|data\/|assets\/)/.test(file)
    || /\.(?:html|js|cjs|mjs)$/.test(file);
  if (files.some(isSource)) groups.unshift(GROUPS[0]);
  const unique = [...new Map(groups.map(group => [group.id, group])).values()];
  return { files, groups: unique.map(group => group.id),
    tests: [...new Set(unique.flatMap(group => group.tests))] };
}
function changedFromGit(argv) {
  const baseIndex = argv.indexOf('--base');
  const headIndex = argv.indexOf('--head');
  if (baseIndex < 0 || headIndex < 0) throw new Error('Expected --base <40-character SHA> --head <40-character SHA>');
  const base = argv[baseIndex + 1], head = argv[headIndex + 1];
  if (![base, head].every(ref => /^[a-f0-9]{40}$/i.test(ref || ''))) {
    throw new Error('Base and head must be full commit SHA values');
  }
  const diff = spawnSync('git', ['diff', '--name-only', '-z', '--no-ext-diff', base, head], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  if (diff.error || diff.status !== 0) throw new Error('git diff failed: ' + (diff.error?.message || diff.stderr || diff.status));
  return diff.stdout.split('\0').filter(Boolean);
}
function appendSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
function runGate(files) {
  if (!files.length) throw new Error('No changed paths; cannot establish PR impact');
  const plan = select(files);
  console.log('Changed paths:', plan.files.join(', '));
  console.log('Selected groups:', plan.groups.join(', ') || '(docs-only)');
  console.log('Selected tests:', plan.tests.join(', ') || '(no runtime tests)');
  const results = [];
  for (const test of plan.tests) {
    const absolute = path.resolve(ROOT, test);
    const stat = absolute.startsWith(ROOT + path.sep) ? fs.statSync(absolute, { throwIfNoEntry: true }) : null;
    if (!stat?.isFile()) { results.push({ test, ok: false, reason: 'missing test file' }); continue; }
    console.log('\n=== ' + test + ' ===');
    const proc = spawnSync(process.execPath, [absolute], {
      cwd: ROOT, stdio: 'inherit', timeout: 180000, env: process.env
    });
    results.push({ test, ok: !proc.error && proc.status === 0,
      reason: proc.error?.message || (proc.signal ? 'signal ' + proc.signal : 'exit ' + proc.status) });
  }
  appendSummary('## PR regression impact\n\n' +
    '**Groups:** ' + (plan.groups.join(', ') || 'Documentation only') + '\n\n' +
    '| Test | Result |\n| --- | --- |\n' +
    (results.map(item => '| ' + item.test + ' | ' + (item.ok ? 'PASS' : 'FAIL: ' + item.reason) + ' |').join('\n') ||
      '| None (no executable paths changed) | Not required |') +
    '\n\n**Changed files:** ' + plan.files.length + '\n');
  const failed = results.filter(item => !item.ok);
  if (failed.length) throw new Error(failed.length + ' regression test(s) failed: ' + failed.map(x => x.test).join(', '));
  return plan;
}
if (require.main === module) {
  try { runGate(changedFromGit(process.argv.slice(2))); }
  catch (error) { console.error('Regression impact gate FAILED:', error.stack || error.message); process.exitCode = 1; }
}
module.exports = { GROUPS, normalize, select, changedFromGit, runGate };
