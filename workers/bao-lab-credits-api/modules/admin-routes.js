import {
  adminAuthorized,
} from "./admin-auth.js";

import {
  adminPlayerDirectoryRoute,
} from "./admin-player-directory-routes.js";

import {
  adminPlayerMutationRoute,
} from "./admin-player-mutation-routes.js";

import {
  adminProviderControlRoute,
} from "./admin-provider-control-routes.js";

import {
  adminPublicationRoute,
} from "./admin-publication-routes.js";

import {
  adminUsageRoute,
} from "./admin-usage-routes.js";

import {
  fail,
} from "./http.js";

// Authenticated admin HTTP surface. Publication formatting, provider control
// calculations and chat settlement remain in their own boundaries.
const WorkerAdminRoutes = (() => {
async function ensureAdminPlayerEvents(
  db
) {
  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS admin_player_events (
        event_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      `
    )
    .run();
}

async function adminRoute(
  request,
  url,
  env,
  db
) {
  if (
    !adminAuthorized(
      request,
      env
    )
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  const path =
    url.pathname;

  const publicationResponse =
    await adminPublicationRoute(
      request,
      path,
      env
    );

  if (publicationResponse) {
    return publicationResponse;
  }


  await ensureAdminPlayerEvents(
    db
  );

  const providerControlResponse =
    await adminProviderControlRoute(
      request,
      path,
      env,
      db
    );

  if (providerControlResponse) {
    return providerControlResponse;
  }

  const playerDirectoryResponse =
    await adminPlayerDirectoryRoute(
      request,
      path,
      env,
      db
    );

  if (playerDirectoryResponse) {
    return playerDirectoryResponse;
  }

  const playerMutationResponse =
    await adminPlayerMutationRoute(
      request,
      path,
      db
    );

  if (playerMutationResponse) {
    return playerMutationResponse;
  }

  const usageResponse =
    await adminUsageRoute(
      request,
      path,
      url,
      db
    );

  if (usageResponse) {
    return usageResponse;
  }

  return fail(
    "not_found",
    404
  );
}

  return Object.freeze({
    ensureAdminPlayerEvents,
    adminRoute,
  });
})();

const {
  ensureAdminPlayerEvents,
  adminRoute,
} = WorkerAdminRoutes;

export {
  WorkerAdminRoutes,
  adminRoute,
  ensureAdminPlayerEvents,
};

