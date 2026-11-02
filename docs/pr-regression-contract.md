# YoruBay — Cross-feature PR regression contract

## Purpose

This adds a deterministic regression-impact gate *in addition to*, not instead of, existing Core tests, Maintenance core, Fast Browser E2E and scheduled Full Browser E2E. This is not a new world-state engine and does not rely on an AI agent remembering a checklist.

Every pull request targeting main runs the regression-impact job without path-based workflow filters. The gate diffs the *full base/head commit range*, maps changed paths to affected domains, executes connected tests and writes executed tests/results to the GitHub job summary. Missing test files, non-zero test exits, timeouts and invalid git diffs cause failures.

The rules are scripts/pr-regression-gate.cjs; their tests are tests/pr-regression-gate.test.cjs. An unfamiliar source path still receives a baseline story/frontend regression suite. Documentation-only diffs are logged but do not run runtime tests.

## Impact map

| Changed area | Connected contracts |
| --- | --- |
| Memory, Context Pack, Canon, full-story rebuild and maintenance | Memory summary, truncation and context resume **plus story rollback/revision/status ownership** |
| Story revision, branches, world/NPC state | Branch/rollback/state snapshot **plus memory ownership** |
| Model routing, API/provider requests | Request lifecycle/provider contract, policy guard **plus memory request guard** |
| Storage, library and backup | Durability, backup recovery, rollback |
| UI, stage, gameplay and phone | Gameplay engine, user preferences, creator gameplay and story reader |
| Worker, provider settlement and wallet | Reservation, settlement, diagnostics and provider transport |
| Author data/content | Import, character readiness, work package |
| CI, tooling, AGENTS.md | E2E group manifest integrity |
| Unclassified source file | Basic frontend extension and story integrity |

The focused job cannot prove real-device behavior, live provider responses, production cost settlement, migrations or deployment safety. Existing cross-browser E2E and targeted production smoke procedures remain independent evidence. Where coverage is missing, add a named rule and executable tests rather than removing the gate.

## PR handoff contract

1. State the behavior changed and explicitly state excluded behavior.
2. Identify possible effects on memory, statuses, revision, branch/rollback, model routing, wallet, UI, local storage and author tools; explain exclusions.
3. Link actual test evidence; differentiate mocked provider tests from live provider checks. Keep failed, skipped and unverified areas explicit.
4. Note separate Pages, Worker, AWS relay and migration dependencies. Passing tests is not permission to deploy.
5. Explain persisted-data risks and rollback path.

The template at .github/pull_request_template.md provides review prompts, but checkboxes are advisory, not a security boundary.

## Required status checks: repository settings

An administrator must configure main branch rulesets or branch protection to require the **regression-impact** job **and existing key jobs** from Core tests, Maintenance core, and Fast Browser E2E. Select the names of real passing check runs from the PR UI rather than assuming a filename equals a check name. Require an up-to-date branch and do not bypass pending, failed or skipped checks. If desirable, include administrators.

At audit time (2026-11-02), the connected GitHub integration returned 403 Resource not accessible by integration for the branch-protection read, so we **cannot confirm or enable** those admin settings from this connection. Creating a GitHub Actions workflow alone does not make it a required merge check.

The gate does not use paid model requests, expose keys, deploy, merge or mutate production data. Its GitHub Actions permissions are read-only.
