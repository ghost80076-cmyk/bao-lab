(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOContentPreferencesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const defaults = Object.freeze({
    adultContentEnabled: false,
    adultAgeConfirmed: false
  });

  const normalize = input => {
    const value = input && typeof input === "object" ? input : {};
    return {
      adultContentEnabled: value.adultContentEnabled === true,
      adultAgeConfirmed: value.adultAgeConfirmed === true
    };
  };

  const isAdult = item => {
    const value = item && typeof item === "object" ? item : {};
    return String(value.category || "").toLowerCase() === "r18" ||
      String(value.rating || "").toLowerCase() === "adult" ||
      value.adult_content === true;
  };

  const canExpose = (item, preferences) => !isAdult(item) || normalize(preferences).adultContentEnabled;

  return Object.freeze({ defaults, normalize, isAdult, canExpose });
});
