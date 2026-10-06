// Pure numeric guards shared by account, usage, billing and settlement paths.
// Keep these helpers side-effect free so structural refactors cannot change
// storage, provider routing or monetary behavior.
const integer = (n, min, max) =>
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= max;

const safeInt = (n) =>
  integer(n, 0, 1_000_000_000)
    ? n
    : 0;

const usageInt = (n) =>
  integer(n, 0, 1_000_000_000)
    ? n
    : null;

const safeMoneyInt = (n) =>
  integer(n, 0, 9_000_000_000_000)
    ? n
    : 0;

export {
  integer,
  safeInt,
  safeMoneyInt,
  usageInt,
};
