import {
  base64ToUtf8,
  mergeAuthorProfile,
  mergePublishedCatalogEntry,
  plainObject,
  publishError,
  utf8ToBase64,
} from "./publication-format.js";

// GitHub publication transport for author/card PR creation.
// Keep this module outside player RP, D1, billing and provider routing.
const COMMUNITY_CATALOG_PAGE_SIZE = 48;

const githubPublicationSafeInt = (n) =>
  Number.isSafeInteger(n) &&
  n >= 0 &&
  n <= 1_000_000_000
    ? n
    : 0;

const WorkerGithubPublicationTransport = (() => {
function githubSettings(
  env
) {
  const repo =
    String(
      env.GITHUB_REPO ||
      "ghost80076-cmyk/bao-lab"
    )
      .trim();

  const baseBranch =
    String(
      env.GITHUB_BASE_BRANCH ||
      "main"
    )
      .trim();

  const parts =
    repo.split(
      "/"
    );

  return {
    configured:
      Boolean(
        env.GITHUB_TOKEN &&
        parts.length ===
          2 &&
        parts[0] &&
        parts[1] &&
        /^[A-Za-z0-9._-]+$/.test(
          parts[0]
        ) &&
        /^[A-Za-z0-9._-]+$/.test(
          parts[1]
        ) &&
        /^[A-Za-z0-9._\/-]+$/.test(
          baseBranch
        )
      ),

    token:
      env.GITHUB_TOKEN ||
      "",

    owner:
      parts[0] ||
      "",

    repo:
      parts[1] ||
      "",

    fullName:
      repo,

    baseBranch,
  };
}

async function githubApi(
  env,
  path,
  options = {}
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

  const headers =
    new Headers(
      options.headers ||
      {}
    );

  headers.set(
    "authorization",
    "Bearer " +
      settings.token
  );

  headers.set(
    "accept",
    "application/vnd.github+json"
  );

  headers.set(
    "x-github-api-version",
    "2022-11-28"
  );

  headers.set(
    "user-agent",
    "yorubay-admin-character-publisher"
  );

  let body =
    options.body;

  if (
    body !==
      undefined &&
    body !==
      null &&
    typeof body !==
      "string"
  ) {
    headers.set(
      "content-type",
      "application/json"
    );

    body =
      JSON.stringify(
        body
      );
  }

  const response =
    await fetch(
      "https://api.github.com/repos/" +
        settings.owner +
        "/" +
        settings.repo +
        path,
      {
        ...options,
        headers,
        body,
      }
    );

  const text =
    await response.text();

  let payload =
    null;

  if (
    text
  ) {
    try {
      payload =
        JSON.parse(
          text
        );
    }

    catch {
      payload =
        null;
    }
  }

  if (
    !response.ok
  ) {
    const error =
      new Error(
        "github_http_" +
        response.status
      );

    error.githubStatus =
      response.status;

    throw error;
  }

  return payload;
}

async function createCharacterPublicationPr(
  env,
  publication
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

  const mode =
    publication?.mode ===
      "update"
      ? "update"
      : "create";

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

  const officialCatalogPath =
    "data/characters.json";

  const officialCatalogFile =
    await githubApi(
      env,
      "/contents/" +
        officialCatalogPath +
        "?ref=" +
        encodeURIComponent(
          settings.baseBranch
        )
    );

  const officialCatalog =
    JSON.parse(
      base64ToUtf8(
        officialCatalogFile
          ?.content ||
        ""
      )
    );

  if (
    !Array.isArray(
      officialCatalog
    )
  ) {
    throw new Error(
      "github_catalog_invalid"
    );
  }

  const manifestPath =
    "data/character-catalog/community/manifest.json";

  let manifestFile =
    null;

  let manifest = {
    schema_version:
      1,

    page_size:
      COMMUNITY_CATALOG_PAGE_SIZE,

    total:
      0,

    pages:
      [],
  };

  try {
    manifestFile =
      await githubApi(
        env,
        "/contents/" +
          manifestPath +
          "?ref=" +
          encodeURIComponent(
            settings.baseBranch
          )
      );

    const parsed =
      JSON.parse(
        base64ToUtf8(
          manifestFile
            ?.content ||
          ""
        )
      );

    if (
      plainObject(
        parsed
      ) &&
      Array.isArray(
        parsed.pages
      )
    ) {
      manifest = {
        schema_version:
          1,

        page_size:
          COMMUNITY_CATALOG_PAGE_SIZE,

        total:
          githubPublicationSafeInt(
            Number(
              parsed.total
            )
          ),

        pages:
          parsed.pages
            .filter(
              (page) =>
                plainObject(
                  page
                ) &&
                Number.isSafeInteger(
                  Number(
                    page.page
                  )
                ) &&
                Number(
                  page.page
                ) >
                  0 &&
                typeof page.file ===
                  "string"
            )
            .map(
              (page) => ({
                page:
                  Number(
                    page.page
                  ),

                file:
                  String(
                    page.file
                  ),

                count:
                  githubPublicationSafeInt(
                    Number(
                      page.count
                    )
                  ),
              })
            ),
      };
    }
  }

  catch (error) {
    if (
      error?.githubStatus !==
        404
    ) {
      throw error;
    }
  }

  const officialIndex =
    officialCatalog.findIndex(
      (entry) =>
        entry?.id ===
        publication.id
    );

  const loadedCommunityPages =
    [];

  let communityMatch =
    null;

  for (
    const pageMeta of
      manifest.pages
  ) {
    let pageFile =
      null;

    let entries =
      [];

    try {
      pageFile =
        await githubApi(
          env,
          "/contents/" +
            pageMeta.file +
            "?ref=" +
            encodeURIComponent(
              settings.baseBranch
            )
        );

      const parsed =
        JSON.parse(
          base64ToUtf8(
            pageFile
              ?.content ||
            ""
          )
        );

      entries =
        Array.isArray(
          parsed
        )
          ? parsed
          : [];
    }

    catch (error) {
      if (
        error?.githubStatus !==
          404
      ) {
        throw error;
      }
    }

    const entryIndex =
      entries.findIndex(
        (entry) =>
          entry?.id ===
          publication.id
      );

    const loaded = {
      pageMeta,
      pageFile,
      entries,
    };

    loadedCommunityPages.push(
      loaded
    );

    if (
      entryIndex >=
        0
    ) {
      if (
        communityMatch
      ) {
        throw new Error(
          "github_catalog_duplicate_character"
        );
      }

      communityMatch = {
        ...loaded,
        entryIndex,
        entry:
          entries[
            entryIndex
          ],
      };
    }
  }

  const existsOfficial =
    officialIndex >=
      0;

  const existsCommunity =
    Boolean(
      communityMatch
    );

  if (
    existsOfficial &&
    existsCommunity
  ) {
    throw new Error(
      "github_catalog_duplicate_character"
    );
  }

  const exists =
    existsOfficial ||
    existsCommunity;

  if (
    mode ===
      "create" &&
    exists
  ) {
    throw publishError(
      "character_already_published",
      409
    );
  }

  if (
    mode ===
      "update" &&
    !exists
  ) {
    throw publishError(
      "character_not_published",
      404
    );
  }

  const publicationTimestamp =
    String(
      publication
        .catalogEntry
        ?.updated_at ||
      new Date().toISOString()
    );

  let finalCatalogEntry =
    publication.catalogEntry;

  let characterPath =
    publication
      .catalogEntry
      .file;

  let characterFile =
    null;

  let targetCatalogPath =
    null;

  let targetCatalogFile =
    null;

  let targetCatalogEntries =
    null;

  let targetPageMeta =
    null;

  let shouldWriteManifest =
    false;

  if (
    mode ===
      "update"
  ) {
    const existingEntry =
      existsOfficial
        ? officialCatalog[
            officialIndex
          ]
        : communityMatch
            .entry;

    if (
      existingEntry?.author_id &&
      publication.authorId &&
      existingEntry.author_id !==
        publication.authorId
    ) {
      throw publishError(
        "author_identity_mismatch",
        409
      );
    }

    const resolvedAuthorId =
      publication.authorId ||
      String(
        existingEntry?.author_id ||
        ""
      );

    if (
      resolvedAuthorId
    ) {
      publication.catalogEntry.author_id =
        resolvedAuthorId;

      publication.card.meta.creator_id =
        resolvedAuthorId;
    }

    if (
      !publication.catalogEntry.author &&
      existingEntry?.author
    ) {
      publication.catalogEntry.author =
        existingEntry.author;

      publication.card.meta.creator =
        publication.card.meta.creator ||
        existingEntry.author;
    }

    finalCatalogEntry =
      mergePublishedCatalogEntry(
        existingEntry,
        publication
          .catalogEntry,
        publicationTimestamp
      );

    characterPath =
      finalCatalogEntry.file;

    if (
      !characterPath
    ) {
      throw publishError(
        "published_character_metadata_invalid",
        409
      );
    }

    try {
      characterFile =
        await githubApi(
          env,
          "/contents/" +
            characterPath +
            "?ref=" +
            encodeURIComponent(
              settings.baseBranch
            )
        );
    }

    catch (error) {
      if (
        error?.githubStatus ===
          404
      ) {
        throw publishError(
          "published_character_file_missing",
          409
        );
      }

      throw error;
    }

    if (
      existsOfficial
    ) {
      officialCatalog[
        officialIndex
      ] =
        finalCatalogEntry;

      targetCatalogPath =
        officialCatalogPath;

      targetCatalogFile =
        officialCatalogFile;

      targetCatalogEntries =
        officialCatalog;
    }

    else {
      communityMatch
        .entries[
          communityMatch
            .entryIndex
        ] =
          finalCatalogEntry;

      communityMatch
        .pageMeta
        .count =
          communityMatch
            .entries
            .length;

      targetCatalogPath =
        communityMatch
          .pageMeta
          .file;

      targetCatalogFile =
        communityMatch
          .pageFile;

      targetCatalogEntries =
        communityMatch
          .entries;

      targetPageMeta =
        communityMatch
          .pageMeta;
    }
  }

  else {
    try {
      await githubApi(
        env,
        "/contents/" +
          characterPath +
          "?ref=" +
          encodeURIComponent(
            settings.baseBranch
          )
      );

      throw publishError(
        "character_already_published",
        409
      );
    }

    catch (error) {
      if (
        error?.httpStatus ||
        error?.githubStatus !==
          404
      ) {
        throw error;
      }
    }

    let pageState =
      loadedCommunityPages[
        loadedCommunityPages.length -
        1
      ] ||
      null;

    if (
      !pageState ||
      pageState.entries.length >=
        COMMUNITY_CATALOG_PAGE_SIZE
    ) {
      const lastPage =
        manifest.pages[
          manifest.pages.length -
          1
        ] ||
        null;

      const pageNumber =
        lastPage
          ? lastPage.page +
            1
          : 1;

      const pageMeta = {
        page:
          pageNumber,

        file:
          "data/character-catalog/community/page-" +
          String(
            pageNumber
          ).padStart(
            4,
            "0"
          ) +
          ".json",

        count:
          0,
      };

      manifest.pages.push(
        pageMeta
      );

      pageState = {
        pageMeta,
        pageFile:
          null,
        entries:
          [],
      };
    }

    pageState
      .entries
      .push(
        finalCatalogEntry
      );

    pageState
      .pageMeta
      .count =
        pageState
          .entries
          .length;

    manifest.total =
      Math.max(
        0,
        Number(
          manifest.total ||
          0
        )
      ) +
      1;

    targetCatalogPath =
      pageState
        .pageMeta
        .file;

    targetCatalogFile =
      pageState
        .pageFile;

    targetCatalogEntries =
      pageState
        .entries;

    targetPageMeta =
      pageState
        .pageMeta;

    shouldWriteManifest =
      true;
  }

  const authorDirectoryPath =
    "data/authors.json";

  let authorDirectoryFile =
    null;

  let authorDirectory =
    {
      schema_version:
        1,

      authors:
        [],
    };

  let shouldWriteAuthorDirectory =
    false;

  if (
    publication.authorProfile
  ) {
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
        plainObject(
          parsed
        ) &&
        Array.isArray(
          parsed.authors
        )
      ) {
        authorDirectory = {
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

      else {
        throw new Error(
          "github_author_directory_invalid"
        );
      }
    }

    catch (error) {
      if (
        error?.githubStatus !==
          404
      ) {
        throw error;
      }
    }

    const authorMatches =
      authorDirectory.authors
        .map(
          (item, index) => ({
            item,
            index,
          })
        )
        .filter(
          ({ item }) =>
            item.id ===
            publication.authorId
        );

    if (
      authorMatches.length >
        1
    ) {
      throw new Error(
        "github_author_directory_duplicate"
      );
    }

    const authorIndex =
      authorMatches[0]?.index ??
      -1;

    const mergedAuthor =
      mergeAuthorProfile(
        authorIndex >=
          0
          ? authorDirectory
              .authors[
                authorIndex
              ]
          : null,
        publication.authorProfile,
        publicationTimestamp
      );

    if (
      authorIndex >=
        0
    ) {
      authorDirectory
        .authors[
          authorIndex
        ] =
          mergedAuthor;
    }

    else {
      authorDirectory
        .authors
        .push(
          mergedAuthor
        );
    }

    shouldWriteAuthorDirectory =
      true;
  }

  const branch =
    (
      mode ===
        "update"
        ? "update/"
        : "publish/"
    ) +
    publication.id +
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
        characterPath,
      {
        method:
          "PUT",

        body: {
          message:
            (
              mode ===
                "update"
                ? "Update character "
                : "Add character "
            ) +
            publication.id,

          content:
            utf8ToBase64(
              JSON.stringify(
                publication.card,
                null,
                2
              ) +
              "\n"
            ),

          ...(characterFile?.sha
            ? {
                sha:
                  characterFile.sha,
              }
            : {}),

          branch,
        },
      }
    );

    if (
      publication.cover
    ) {
      let coverFile =
        null;

      if (
        mode ===
          "update"
      ) {
        try {
          coverFile =
            await githubApi(
              env,
              "/contents/" +
                publication
                  .cover
                  .path +
                "?ref=" +
                encodeURIComponent(
                  settings.baseBranch
                )
            );
        }

        catch (error) {
          if (
            error?.githubStatus !==
              404
          ) {
            throw error;
          }
        }
      }

      await githubApi(
        env,
        "/contents/" +
          publication
            .cover
            .path,
        {
          method:
            "PUT",

          body: {
            message:
              (
                mode ===
                  "update"
                  ? "Update cover for "
                  : "Add cover for "
              ) +
              publication.id,

            content:
              publication
                .cover
                .base64,

            ...(coverFile?.sha
              ? {
                  sha:
                    coverFile.sha,
                }
              : {}),

            branch,
          },
        }
      );
    }

    await githubApi(
      env,
      "/contents/" +
        targetCatalogPath,
      {
        method:
          "PUT",

        body: {
          message:
            (
              mode ===
                "update"
                ? "Update published catalog entry "
                : "Update community catalog page "
            ) +
            publication.id,

          content:
            utf8ToBase64(
              JSON.stringify(
                targetCatalogEntries,
                null,
                2
              ) +
              "\n"
            ),

          ...(targetCatalogFile?.sha
            ? {
                sha:
                  targetCatalogFile.sha,
              }
            : {}),

          branch,
        },
      }
    );

    if (
      shouldWriteManifest
    ) {
      await githubApi(
        env,
        "/contents/" +
          manifestPath,
        {
          method:
            "PUT",

          body: {
            message:
              "Update community catalog manifest",

            content:
              utf8ToBase64(
                JSON.stringify(
                  manifest,
                  null,
                  2
                ) +
                "\n"
              ),

            ...(manifestFile?.sha
              ? {
                  sha:
                    manifestFile.sha,
                }
              : {}),

            branch,
          },
        }
      );
    }

    if (
      shouldWriteAuthorDirectory
    ) {
      await githubApi(
        env,
        "/contents/" +
          authorDirectoryPath,
        {
          method:
            "PUT",

          body: {
            message:
              "Update author profile " +
              publication.authorId,

            content:
              utf8ToBase64(
                JSON.stringify(
                  authorDirectory,
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
    }

    const version =
      Number(
        finalCatalogEntry
          .published_version ||
        1
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
                  ? "Update character: "
                  : "Publish character: "
              ) +
              publication
                .card
                .meta
                .title +
              (
                mode ===
                  "update"
                  ? " · v" +
                    version
                  : ""
              ),

            head:
              branch,

            base:
              settings
                .baseBranch,

            body:
              [
                mode ===
                  "update"
                  ? "Admin character update request."
                  : "Admin character publication request.",
                "",
                "- Character ID: " +
                  publication.id,
                "- Publication mode: " +
                  mode,
                "- Published version: v" +
                  version,
                "- Bucket: " +
                  publication.bucket,
                "- Catalog path: " +
                  targetCatalogPath,
                "- Author label: " +
                  (
                    publication.author ||
                    finalCatalogEntry.author ||
                    "not provided"
                  ),
                "- Author ID: " +
                  (
                    finalCatalogEntry.author_id ||
                    "not provided"
                  ),
                "- Direct support link: " +
                  (
                    publication.authorProfile?.support_links?.[0]?.url
                      ? "provided (external; YoruBay does not process the payment)"
                      : "not provided"
                  ),
                "- Rights confirmation: confirmed by operator",
                "- Original embedded card payload: not published",
                "- Cover metadata: stripped/re-encoded before submission",
                "",
                mode ===
                  "update"
                  ? "The original published_at value is preserved; updated_at and version_published_at advance only in this review PR."
                  : "This creates the first public version.",
                "",
                "Please review content and automated checks before merging.",
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

      publication_mode:
        mode,

      published_version:
        version,

      bucket:
        publication.bucket,

      catalog_page:
        targetPageMeta
          ?.page ||
        null,

      catalog_page_path:
        targetPageMeta
          ?.file ||
        targetCatalogPath,

      catalog_manifest_path:
        manifestPath,

      character_path:
        characterPath,

      asset_path:
        publication
          .cover
          ?.path ||
        null,

      author_id:
        finalCatalogEntry
          .author_id ||
        null,

      author_directory_path:
        shouldWriteAuthorDirectory
          ? authorDirectoryPath
          : null,

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
      error
        ?.httpStatus
    ) {
      throw error;
    }

    console.error(
      "github_character_publish_error",
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
    githubSettings,
    githubApi,
    createCharacterPublicationPr,
  });
})();

const {
  githubSettings,
  githubApi,
  createCharacterPublicationPr,
} = WorkerGithubPublicationTransport;

export {
  WorkerGithubPublicationTransport,
  createCharacterPublicationPr,
  githubApi,
  githubSettings,
};
