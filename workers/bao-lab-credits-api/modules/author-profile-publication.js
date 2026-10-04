import {
  base64ToUtf8,
  mergeAuthorProfile,
  plainObject,
  publishError,
  utf8ToBase64,
} from "./publication-format.js";

import {
  githubApi,
  githubSettings,
} from "./github-publication-transport.js";

// Author-profile GitHub PR publication boundary.
// It performs no player RP, D1, billing or provider work.
const WorkerAuthorProfilePublication = (() => {
async function createAuthorProfilePr(
  env,
  prepared
) {
  const settings =
    githubSettings(
      env
    );

  if (
    !settings
      .configured
  ) {
    throw publishError(
      "github_publish_not_configured",
      503
    );
  }

  const baseRef =
    await githubApi(
      env,
      "/git/ref/heads/" +
        encodeURIComponent(
          settings.baseBranch
        )
    );

  const baseSha =
    baseRef
      ?.object
      ?.sha;

  if (!baseSha) {
    throw new Error(
      "github_base_ref_missing"
    );
  }

  const authorDirectoryPath =
    "data/authors.json";

  let authorDirectoryFile =
    null;

  let directory = {
    schema_version:
      1,

    authors:
      [],
  };

  try {
    authorDirectoryFile =
      await githubApi(
        env,
        "/contents/" +
          authorDirectoryPath +
          "?ref=" +
          encodeURIComponent(
            settings.baseBranch
          )
      );

    const parsed =
      JSON.parse(
        base64ToUtf8(
          authorDirectoryFile
            ?.content ||
          ""
        )
      );

    if (
      !plainObject(
        parsed
      ) ||
      !Array.isArray(
        parsed.authors
      )
    ) {
      throw new Error(
        "github_author_directory_invalid"
      );
    }

    directory = {
      schema_version:
        1,

      authors:
        parsed.authors
          .filter(
            (item) =>
              plainObject(
                item
              ) &&
              typeof item.id ===
                "string"
          ),
    };
  }

  catch (error) {
    if (
      error?.githubStatus !==
        404
    ) {
      throw error;
    }
  }

  const matches =
    directory.authors
      .map(
        (item, index) => ({
          item,
          index,
        })
      )
      .filter(
        ({ item }) =>
          item.id ===
          prepared.authorId
      );

  if (
    matches.length >
      1
  ) {
    throw new Error(
      "github_author_directory_duplicate"
    );
  }

  const existing =
    matches[0] ||
    null;

  const timestamp =
    new Date().toISOString();

  const merged =
    mergeAuthorProfile(
      existing?.item ||
        null,
      prepared.profile,
      timestamp
    );

  // This endpoint edits the author profile itself, so explicit blank values
  // mean removal instead of "preserve the old work-publication metadata".
  merged.bio =
    prepared.profile.bio;

  merged.support_links =
    prepared.profile
      .support_links;

  if (
    existing
  ) {
    directory
      .authors[
        existing.index
      ] =
        merged;
  }

  else {
    directory.authors.push(
      merged
    );
  }

  const mode =
    existing
      ? "update"
      : "create";

  const branch =
    "author/" +
    prepared.authorId +
    "-" +
    Date.now()
      .toString(
        36
      );

  let branchCreated =
    false;

  try {
    await githubApi(
      env,
      "/git/refs",
      {
        method:
          "POST",

        body: {
          ref:
            "refs/heads/" +
            branch,

          sha:
            baseSha,
        },
      }
    );

    branchCreated =
      true;

    await githubApi(
      env,
      "/contents/" +
        authorDirectoryPath,
      {
        method:
          "PUT",

        body: {
          message:
            (
              mode ===
                "update"
                ? "Update author profile "
                : "Create author profile "
            ) +
            prepared.authorId,

          content:
            utf8ToBase64(
              JSON.stringify(
                directory,
                null,
                2
              ) +
              "\n"
            ),

          ...(authorDirectoryFile?.sha
            ? {
                sha:
                  authorDirectoryFile.sha,
              }
            : {}),

          branch,
        },
      }
    );

    const pr =
      await githubApi(
        env,
        "/pulls",
        {
          method:
            "POST",

          body: {
            title:
              (
                mode ===
                  "update"
                  ? "Update author: "
                  : "Create author: "
              ) +
              prepared.profile.name,

            head:
              branch,

            base:
              settings.baseBranch,

            body:
              [
                "Admin author profile request.",
                "",
                "- Author ID: " +
                  prepared.authorId,
                "- Author name: " +
                  prepared.profile.name,
                "- Mode: " +
                  mode,
                "- Direct support link: " +
                  (
                    prepared.profile.support_links[0]?.url
                      ? "provided (external; YoruBay does not process the payment)"
                      : "not provided"
                  ),
                "- Work catalog / published versions: unchanged",
                "",
                "Please review the public author copy and external support link before merging.",
              ].join(
                "\n"
              ),
          },
        }
      );

    return {
      pr_number:
        pr?.number ||
        null,

      pr_url:
        pr?.html_url ||
        null,

      branch,

      author_id:
        prepared.authorId,

      author_name:
        prepared.profile.name,

      author_profile_mode:
        mode,

      author_directory_path:
        authorDirectoryPath,

      repository:
        settings.fullName,

      base_branch:
        settings.baseBranch,
    };
  }

  catch (error) {
    if (
      branchCreated
    ) {
      try {
        await githubApi(
          env,
          "/git/refs/heads/" +
            encodeURIComponent(
              branch
            ),
          {
            method:
              "DELETE",
          }
        );
      }

      catch {}
    }

    if (
      error?.httpStatus
    ) {
      throw error;
    }

    console.error(
      "github_author_profile_error",
      String(
        error?.message ||
        error
      ).slice(
        0,
        500
      )
    );

    throw publishError(
      "github_publish_failed",
      502
    );
  }
}

  return Object.freeze({
    createAuthorProfilePr,
  });
})();

const {
  createAuthorProfilePr,
} = WorkerAuthorProfilePublication;

export {
  WorkerAuthorProfilePublication,
  createAuthorProfilePr,
};
