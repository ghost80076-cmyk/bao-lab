#!/usr/bin/env node

const {
  buildModelDeploymentPlan,
  loadRegistry,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");

function normalizeCsv(value) {
  const items = String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  return {
    entries: items,
    unique: [...new Set(items)],
  };
}

function compareAwsOpenRouterModels(currentValue, expectedEntries) {
  const current = normalizeCsv(currentValue);
  const expected = [...new Set(expectedEntries.map(item => String(item).trim()).filter(Boolean))];

  const currentSet = new Set(current.unique);
  const expectedSet = new Set(expected);

  const missing = expected.filter(item => !currentSet.has(item)).sort();
  const unexpected = current.unique.filter(item => !expectedSet.has(item)).sort();
  const duplicates = current.entries
    .filter((item, index, all) => all.indexOf(item) !== index)
    .filter((item, index, all) => all.indexOf(item) === index)
    .sort();

  return {
    schema: "yorubay-aws-openrouter-model-audit/v1",
    expected_count: expected.length,
    current_count: current.unique.length,
    missing,
    unexpected,
    duplicates,
    expected_csv: expected.join(","),
    ok: missing.length === 0 && unexpected.length === 0 && duplicates.length === 0,
  };
}

function auditAwsOpenRouterModels(options = {}) {
  const registry = options.registry || loadRegistry();
  const plan = options.plan || buildModelDeploymentPlan(registry);
  const currentValue =
    options.currentValue !== undefined
      ? options.currentValue
      : process.env.OPENROUTER_MODELS;

  if (currentValue === undefined || currentValue === null) {
    throw new Error(
      "OPENROUTER_MODELS is required; run this audit in the AWS relay environment or pass the current value explicitly"
    );
  }

  return compareAwsOpenRouterModels(currentValue, plan.aws.entries);
}

function main() {
  const report = auditAwsOpenRouterModels();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = {
  auditAwsOpenRouterModels,
  compareAwsOpenRouterModels,
  normalizeCsv,
};
