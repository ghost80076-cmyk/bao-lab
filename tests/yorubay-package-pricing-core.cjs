const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const account = fs.readFileSync(path.join(root, "account.html"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin-wallet.html"), "utf8");
const accountPricing = account.split(String.fromCharCode(36)).join("");

const packages = [
  { points: 5000, twd: 250, usd: 8 },
  { points: 10000, twd: 500, usd: 16 },
  { points: 20000, twd: 1000, usd: 32 },
  { points: 50000, twd: 2500, usd: 80 }
];

for (const item of packages) {
  const points = item.points.toLocaleString("en-US");
  const twd = item.twd.toLocaleString("en-US");
  assert.ok(
    accountPricing.includes(`NT${twd} / US${item.usd} → ${points} 燈火`),
    `account package mismatch for ${item.points} points`
  );
  assert.ok(
    admin.includes(`data-pay-twd="${item.twd}" data-pay-usd="${item.usd}" data-points="${item.points}"`),
    `admin package dataset mismatch for ${item.points} points`
  );
  assert.ok(
    admin.includes(`${points} 點<br>NT$${twd} / US$${item.usd}`),
    `admin package label mismatch for ${item.points} points`
  );
}

const base = packages[0];
for (const item of packages.slice(1)) {
  assert.equal(item.twd / item.points, base.twd / base.points, "TWD package pricing must remain linear");
  assert.equal(item.usd / item.points, base.usd / base.points, "USD package pricing must remain linear");
}

for (const stale of ["NT$430 / US$13", "NT$850 / US$26", "NT$2,150 / US$65"]) {
  assert.equal(account.includes(stale), false, `stale player-facing price remains: ${stale}`);
  assert.equal(admin.includes(stale), false, `stale admin price remains: ${stale}`);
}

console.log("YoruBay package pricing consistency test passed");
