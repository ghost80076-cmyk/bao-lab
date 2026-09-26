const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const account = read('account.html');
const admin = read('admin-wallet.html');
const worker = read('workers/bao-lab-credits-api/worker.js');

test('player account presents internal wallet as YoruBay points', () => {
  assert.match(account, /YoruBay AI 點數/);
  assert.match(account, /NT\$220 或 US\$7<br>→ 5,000 點/);
  assert.match(account, /NT\$430 或 US\$13<br>→ 10,000 點/);
  assert.match(account, /NT\$850 或 US\$26<br>→ 20,000 點/);
  assert.match(account, /NT\$2,150 或 US\$65<br>→ 50,000 點/);
  assert.match(account, /wallet_balance_points/);
  assert.match(account, /\/me\/wallet-ledger/);
  assert.match(account, /setInterval\([\s\S]*30000/);
  assert.doesNotMatch(account, /NT\$190 → US\$5 額度/);
});

test('admin supports point packages and player-visible ledger labels', () => {
  assert.match(admin, /data-pay-twd="220" data-pay-usd="7" data-points="5000"/);
  assert.match(admin, /data-pay-twd="430" data-pay-usd="13" data-points="10000"/);
  assert.match(admin, /加入 YoruBay 點數/);
  assert.match(admin, /贈送點數/);
  assert.match(admin, /活動獎勵/);
  assert.match(admin, /補償點數/);
  assert.match(admin, /microusdFromPoints/);
  assert.match(admin, /Math\.round\(n\*1000\)/);
});

test('Worker exposes point balance and authenticated wallet ledger without changing USD settlement', () => {
  assert.match(worker, /wallet_balance_points:[\s\S]*walletBalance \/[\s\S]*1_000/);
  assert.match(worker, /async function walletLedgerRoute/);
  assert.match(worker, /FROM wallet_ledger/);
  assert.match(worker, /"\/me\/wallet-ledger"/);
  assert.match(worker, /row\.amount_microusd[\s\S]*\/\s*1_000/);
  assert.match(worker, /wallet_balance_usd:/);
});

test('point denomination stays 1 USD internal cost unit = 1000 points', () => {
  const points = 5000;
  const microusd = Math.round(points * 1000);
  assert.equal(microusd, 5_000_000);
  assert.equal(microusd / 1_000_000, 5);
  assert.equal(0.0245 * 1000, 24.5);
});
