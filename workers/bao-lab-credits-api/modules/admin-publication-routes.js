import {
  fail,
  json,
  readJsonWithLimit,
} from "./http.js";

import {
  prepareAuthorProfileUpdate,
  prepareCharacterPublication,
} from "./publication-format.js";

import {
  createCharacterPublicationPr,
  githubSettings,
} from "./github-publication-transport.js";

import {
  createAuthorProfilePr,
} from "./author-profile-publication.js";

const MAX_ADMIN_PUBLISH_BODY_BYTES = 2_500_000;

// Admin publication HTTP subroutes.
const WorkerAdminPublicationRoutes = (() => {
async function adminPublicationRoute(
  request,
  path,
  env
) {
  if (
    path ===
      "/admin/characters/publish-status" &&
    request.method ===
      "GET"
  ) {
    const settings =
      githubSettings(
        env
      );

    return json({
      configured:
        settings
          .configured,

      repository:
        settings
          .fullName,

      base_branch:
        settings
          .baseBranch,

      mode:
        "pull_request_only",
    });
  }

  if (
    path ===
      "/admin/authors/profile-pr" &&
    request.method ===
      "POST"
  ) {
    let prepared;

    try {
      prepared =
        prepareAuthorProfileUpdate(
          await readJsonWithLimit(
            request,
            MAX_ADMIN_PUBLISH_BODY_BYTES
          )
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

  if (
    path ===
      "/admin/characters/publish-pr" &&
    request.method ===
      "POST"
  ) {
    let publication;

    try {
      publication =
        prepareCharacterPublication(
          await readJsonWithLimit(
            request,
            MAX_ADMIN_PUBLISH_BODY_BYTES
          )
        );
    }

    catch (error) {
      if (
        error
          ?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }

    try {
      const result =
        await createCharacterPublicationPr(
          env,
          publication
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
        error
          ?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }
  }

  return null;
}

  return Object.freeze({
    adminPublicationRoute,
  });
})();

const {
  adminPublicationRoute,
} = WorkerAdminPublicationRoutes;

export {
  MAX_ADMIN_PUBLISH_BODY_BYTES,
  WorkerAdminPublicationRoutes,
  adminPublicationRoute,
};
