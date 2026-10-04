const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const modulePath = path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/crypto.js"
  );
  const cryptoModule = await import(pathToFileURL(modulePath).href);

  const {
    WorkerCrypto,
    bytesToB64Url,
    b64UrlToBytes,
    newOpaqueToken,
    publicPlayerId,
    newRecoveryCode,
    normalizeRecoveryCode,
    sha256Hex,
    constantTimeStringEqual,
    passwordRecord,
    passwordMatches,
  } = cryptoModule;

  assert.equal(WorkerCrypto.sha256Hex, sha256Hex);
  assert.equal(WorkerCrypto.passwordRecord, passwordRecord);
  assert.equal(WorkerCrypto.passwordMatches, passwordMatches);

  const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
  const encoded = bytesToB64Url(bytes);
  assert.doesNotMatch(encoded, /[+/=]/);
  assert.deepEqual([...b64UrlToBytes(encoded)], [...bytes]);

  assert.match(newOpaqueToken("yb_test_", 16), /^yb_test_[A-Za-z0-9_-]+$/);
  assert.match(publicPlayerId(), /^YR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(
    newRecoveryCode(),
    /^YBRC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/
  );
  assert.equal(
    normalizeRecoveryCode(" ybrc-abcd-2345 efgh "),
    "YBRCABCD2345EFGH"
  );

  assert.equal(
    await sha256Hex("yorubay"),
    "454df51cfd2d1586cdada4bd541ce03f4246691b2273b47db2a3cdc06d077cc0"
  );
  assert.equal(constantTimeStringEqual("same", "same"), true);
  assert.equal(constantTimeStringEqual("same", "diff"), false);
  assert.equal(constantTimeStringEqual("short", "longer"), false);

  const record = await passwordRecord("correct horse battery staple");
  assert.equal(record.password_iterations, 100_000);
  assert.match(record.password_salt, /^[A-Za-z0-9_-]+$/);
  assert.match(record.password_hash, /^[A-Za-z0-9_-]+$/);
  assert.equal(
    await passwordMatches("correct horse battery staple", record),
    true
  );
  assert.equal(
    await passwordMatches("wrong password", record),
    false
  );
  assert.equal(
    await passwordMatches("correct horse battery staple", {
      ...record,
      password_salt: "!",
    }),
    false
  );

  console.log("worker crypto core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
