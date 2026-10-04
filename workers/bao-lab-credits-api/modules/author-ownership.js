import {
  base64ToUtf8,
  plainObject,
  publishError,
} from "./publication-format.js";

import {
  githubApi,
  githubSettings,
} from "./github-publication-transport.js";

// Author identity ownership and claim persistence.
const WorkerAuthorOwnership = (() => {
  function prepareAuthorIdentityClaim(
    body
  ) {
    const authorId =
      String(
        body?.author_id ||
        ""
      )
        .trim()
        .toLowerCase()
        .slice(
          0,
          64
        );
  
    if (
      !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(
        authorId
      )
    ) {
      throw publishError(
        "invalid_author_id"
      );
    }
  
    return {
      authorId,
    };
  }
  
  async function ensureAuthorOwnerships(
    db
  ) {
    await db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS author_ownerships (
          author_id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        `
      )
      .run();
  
    await db
      .prepare(
        `
        CREATE INDEX IF NOT EXISTS idx_author_ownerships_player
        ON author_ownerships (
          player_id,
          created_at
        )
        `
      )
      .run();
  }
  
  async function ownedAuthorIdentities(
    db,
    playerId
  ) {
    await ensureAuthorOwnerships(
      db
    );
  
    const result =
      await db
        .prepare(
          `
          SELECT
            author_id,
            created_at
  
          FROM author_ownerships
  
          WHERE
            player_id = ?
  
          ORDER BY
            datetime(created_at) ASC,
            author_id ASC
          `
        )
        .bind(
          playerId
        )
        .all();
  
    return Array.isArray(
      result?.results
    )
      ? result.results
      : [];
  }
  
  async function publicAuthorIdExists(
    env,
    authorId
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
  
    try {
      const file =
        await githubApi(
          env,
          "/contents/data/authors.json?ref=" +
            encodeURIComponent(
              settings.baseBranch
            )
        );
  
      const parsed =
        JSON.parse(
          base64ToUtf8(
            file?.content ||
            ""
          )
        );
  
      return Boolean(
        plainObject(
          parsed
        ) &&
        Array.isArray(
          parsed.authors
        ) &&
        parsed.authors.some(
          (item) =>
            plainObject(
              item
            ) &&
            String(
              item.id ||
              ""
            )
              .trim()
              .toLowerCase() ===
              authorId
        )
      );
    }
  
    catch (error) {
      if (
        error?.githubStatus ===
          404
      ) {
        return false;
      }
  
      throw error;
    }
  }
  
  async function claimAuthorIdentity(
    env,
    db,
    player,
    body
  ) {
    const prepared =
      prepareAuthorIdentityClaim(
        body
      );
  
    await ensureAuthorOwnerships(
      db
    );
  
    const existing =
      await db
        .prepare(
          `
          SELECT
            author_id,
            player_id,
            created_at
  
          FROM author_ownerships
  
          WHERE
            author_id = ?
  
          LIMIT 1
          `
        )
        .bind(
          prepared.authorId
        )
        .first();
  
    if (
      existing
    ) {
      if (
        existing.player_id ===
          player.id
      ) {
        return {
          author_id:
            existing.author_id,
  
          created_at:
            existing.created_at,
  
          existing:
            true,
        };
      }
  
      throw publishError(
        "author_id_taken",
        409
      );
    }
  
    const currentOwned =
      await ownedAuthorIdentities(
        db,
        player.id
      );
  
    if (
      currentOwned.length >=
        1
    ) {
      throw publishError(
        "author_identity_limit_reached",
        409
      );
    }
  
    if (
      await publicAuthorIdExists(
        env,
        prepared.authorId
      )
    ) {
      throw publishError(
        "author_id_reserved",
        409
      );
    }
  
    await db
      .prepare(
        `
        INSERT INTO author_ownerships (
          author_id,
          player_id,
          created_at
        )
  
        VALUES (
          ?,
          ?,
          CURRENT_TIMESTAMP
        )
        `
      )
      .bind(
        prepared.authorId,
        player.id
      )
      .run();
  
    const saved =
      await db
        .prepare(
          `
          SELECT
            author_id,
            created_at
  
          FROM author_ownerships
  
          WHERE
            author_id = ?
  
          LIMIT 1
          `
        )
        .bind(
          prepared.authorId
        )
        .first();
  
    return {
      author_id:
        saved?.author_id ||
        prepared.authorId,
  
      created_at:
        saved?.created_at ||
        new Date().toISOString(),
  
      existing:
        false,
    };
  }

  return Object.freeze({
    prepareAuthorIdentityClaim,
    ensureAuthorOwnerships,
    ownedAuthorIdentities,
    publicAuthorIdExists,
    claimAuthorIdentity,
  });
})();

const {
  prepareAuthorIdentityClaim,
  ensureAuthorOwnerships,
  ownedAuthorIdentities,
  publicAuthorIdExists,
  claimAuthorIdentity,
} = WorkerAuthorOwnership;

export {
  WorkerAuthorOwnership,
  claimAuthorIdentity,
  ensureAuthorOwnerships,
  ownedAuthorIdentities,
  prepareAuthorIdentityClaim,
  publicAuthorIdExists,
};
