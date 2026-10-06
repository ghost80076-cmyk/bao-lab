import {
  createAuthorProfilePr,
} from "./author-profile-publication.js";

import {
  claimAuthorIdentity,
  ensureAuthorOwnerships,
  ownedAuthorIdentities,
} from "./author-ownership.js";

import {
  fail,
  json,
  readJson,
  readJsonWithLimit,
} from "./http.js";

import {
  prepareAuthorProfileUpdate,
} from "./publication-format.js";

import {
  playerFor,
} from "./session-auth.js";

const MAX_ADMIN_PUBLISH_BODY_BYTES = 2_500_000;

// Authenticated author-account route boundary. It owns `/me/authors` request
// dispatch while ownership rules remain in WorkerAuthorOwnership.
const WorkerAccountAuthorRoutes = (() => {
async function accountAuthorRoute(
  request,
  url,
  env,
  db
) {
  const player =
    await playerFor(
      request,
      db
    );

  if (
    !player ||
    !player.enabled
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  if (
    player.auth_type !==
      "session" ||
    !player.username
  ) {
    return fail(
      "account_required",
      403
    );
  }

  if (
    url.pathname ===
      "/me/authors" &&
    request.method ===
      "GET"
  ) {
    return json({
      authors:
        await ownedAuthorIdentities(
          db,
          player.id
        ),
    });
  }

  if (
    url.pathname ===
      "/me/authors/claim" &&
    request.method ===
      "POST"
  ) {
    try {
      const claimed =
        await claimAuthorIdentity(
          env,
          db,
          player,
          await readJson(
            request
          )
        );

      return json(
        {
          claimed:
            true,

          ...claimed,
        },
        claimed.existing
          ? 200
          : 201
      );
    }

    catch (error) {
      if (
        error?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }
  }

  if (
    url.pathname ===
      "/me/authors/profile-pr" &&
    request.method ===
      "POST"
  ) {
    const body =
      await readJsonWithLimit(
        request,
        MAX_ADMIN_PUBLISH_BODY_BYTES
      );

    let prepared;

    try {
      prepared =
        prepareAuthorProfileUpdate(
          body
        );
    }

    catch (error) {
      if (
        error?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }

    await ensureAuthorOwnerships(
      db
    );

    const owned =
      await db
        .prepare(
          `
          SELECT
            author_id

          FROM author_ownerships

          WHERE
            author_id = ?

            AND
            player_id = ?

          LIMIT 1
          `
        )
        .bind(
          prepared.authorId,
          player.id
        )
        .first();

    if (
      !owned
    ) {
      return fail(
        "author_identity_not_owned",
        403
      );
    }

    try {
      const result =
        await createAuthorProfilePr(
          env,
          prepared
        );

      return json(
        {
          created:
            true,

          ...result,
        },
        201
      );
    }

    catch (error) {
      if (
        error?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }
  }

  return fail(
    "not_found",
    404
  );
}

  return Object.freeze({
    accountAuthorRoute,
  });
})();

const {
  accountAuthorRoute,
} = WorkerAccountAuthorRoutes;

export {
  WorkerAccountAuthorRoutes,
  accountAuthorRoute,
};
