// Admin access intentionally remains a separate bearer-token contract from
// player sessions and account authentication.
function adminBearerTokenFrom(request) {
  const header = request.headers.get("authorization") || "";

  return header.startsWith("Bearer ")
    ? header.slice(7)
    : "";
}

function adminAuthorized(request, env) {
  return Boolean(
    env.ADMIN_TOKEN &&
    adminBearerTokenFrom(request) === env.ADMIN_TOKEN
  );
}

const WorkerAdminAuth = Object.freeze({
  adminAuthorized,
});

export {
  WorkerAdminAuth,
  adminAuthorized,
};
