import assert from "node:assert/strict";

import {
  providerCumulativeSpendMicrousd,
} from "../workers/bao-lab-credits-api/modules/provider-control.js";

const queries = [];
const db = {
  prepare(sql) {
    return {
      bind(...values) {
        queries.push({
          sql,
          values,
        });

        return {
          async first() {
            return {
              spent_microusd: 321,
            };
          },
        };
      },
    };
  },
};

assert.equal(
  await providerCumulativeSpendMicrousd(
    db,
    "openrouter"
  ),
  321
);

assert.equal(
  queries.length,
  1
);

assert.deepEqual(
  queries[0].values,
  [
    "openrouter",
    "cost_usd_v2",
  ],
  "the standalone provider-control ES module must import its billing mode dependency"
);

console.log(
  "worker provider control standalone ES module test passed"
);
