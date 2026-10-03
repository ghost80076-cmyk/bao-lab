const assert = require("node:assert/strict");
const core = require("../js/content-preferences-core.js");

assert.deepEqual(core.normalize({}), {
  adultContentEnabled: false,
  adultAgeConfirmed: false
});
assert.deepEqual(core.normalize({ adultContentEnabled: 1, adultAgeConfirmed: true }), {
  adultContentEnabled: false,
  adultAgeConfirmed: true
});

const general = { category: "male", rating: "general" };
const adultByCategory = { category: "r18", rating: "general" };
const adultByRating = { category: "female", rating: "adult" };
const adultModule = { adult_content: true };

assert.equal(core.isAdult(general), false);
assert.equal(core.isAdult(adultByCategory), true);
assert.equal(core.isAdult(adultByRating), true);
assert.equal(core.isAdult(adultModule), true);
assert.equal(core.canExpose(general, {}), true);
assert.equal(core.canExpose(adultByCategory, {}), false);
assert.equal(core.canExpose(adultByRating, { adultContentEnabled: true }), true);
assert.equal(core.canExpose(adultModule, { adultContentEnabled: true }), true);

console.log("content preferences core test passed");
