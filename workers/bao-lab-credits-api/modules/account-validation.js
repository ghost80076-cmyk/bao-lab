// Pure account credential/profile input validation shared by registration,
// login and recovery routes. Keep this module independent of runtime bindings,
// storage, session policy and provider routing.
function validUsername(value) {
  const username = String(value || "").trim().toLowerCase();

  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)
    ? username
    : null;
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 10 && value.length <= 128;
}

function validDisplayName(value) {
  const name = String(value || "").trim();

  return name.length >= 1 && name.length <= 50 ? name : null;
}

const WorkerAccountValidation = Object.freeze({
  validUsername,
  validPassword,
  validDisplayName,
});

export {
  WorkerAccountValidation,
  validDisplayName,
  validPassword,
  validUsername,
};
