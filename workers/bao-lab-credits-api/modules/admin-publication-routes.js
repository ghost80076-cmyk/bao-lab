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


// License terms describe reuse by third parties; they do not alter the
// platform's limited hosting grant in creator-policy.html.
const LICENSE_PERMISSIONS = ["prohibited", "permission_required", "allowed"];
const FALLBACK_AUTHOR_LICENSE = Object.freeze({
  redistribution: "permission_required",
  adaptations: "permission_required",
  commercial_use: "prohibited",
  attribution_required: true
});

function licenseError(code) {
  const error = new Error(code);
  error.httpStatus = 400;
  return error;
}

function validLicenseAuthorId(value) {
  return typeof value === "string" &&
    /^[a-z0-9][a-z0-9_-]{1,63}$/.test(value);
}

function validateLicensePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw licenseError("invalid_license_policy");
  }
  const keys = ["redistribution", "adaptations", "commercial_use", "attribution_required"];
  if (Object.keys(value).length !== keys.length ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      !LICENSE_PERMISSIONS.includes(value.redistribution) ||
      !LICENSE_PERMISSIONS.includes(value.adaptations) ||
      !LICENSE_PERMISSIONS.includes(value.commercial_use) ||
      typeof value.attribution_required !== "boolean") {
    throw licenseError("invalid_license_policy");
  }
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

async function ensureLicenseTables(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS author_license_defaults (" +
    "author_id TEXT PRIMARY KEY, policy_json TEXT NOT NULL, " +
    "revision INTEGER NOT NULL DEFAULT 1, " +
    "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS work_license_submissions (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
    "pr_number INTEGER NOT NULL UNIQUE, pr_url TEXT, " +
    "work_id TEXT NOT NULL, author_id TEXT NOT NULL, " +
    "published_version INTEGER NOT NULL, snapshot_json TEXT NOT NULL, " +
    "status TEXT NOT NULL DEFAULT 'pending_review', " +
    "submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

async function readAuthorLicense(db, authorId) {
  const row = await db.prepare(
    "SELECT policy_json, revision, updated_at FROM author_license_defaults WHERE author_id = ?"
  ).bind(authorId).first();
  return {
    policy: row ? validateLicensePolicy(JSON.parse(row.policy_json)) : { ...FALLBACK_AUTHOR_LICENSE },
    revision: row ? Number(row.revision) : 0,
    updated_at: row?.updated_at || null,
    saved: Boolean(row)
  };
}

const ADMIN_PUBLICATION_MAX_BODY_BYTES = 26_000_000;

// Admin publication HTTP subroutes.
const WorkerAdminPublicationRoutes = (() => {
async function adminPublicationRoute(
  request,
  path,
  env,
  db
) {
  if (path === "/admin/characters/license-submissions") {
    if (request.method !== "GET") {
      const denied = fail("method_not_allowed", 405); denied.headers.set("allow", "GET"); return denied;
    }
    const params = new URL(request.url).searchParams;
    const integer = (name, fallback) => {
      if (!params.has(name)) return fallback;
      const raw = params.get(name);
      if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw licenseError("invalid_submission_cursor");
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) throw licenseError("invalid_submission_cursor");
      return value;
    };
    try {
      const after = integer("after_id", 0), limit = integer("limit", 100);
      let bound = integer("as_of_id", null);
      if (limit < 1 || limit > 200 || (after > 0 && bound === null) || (bound !== null && after > bound)) throw licenseError("invalid_submission_cursor");
      // No CREATE/INSERT/UPDATE, including on a never-initialized database.
      if (bound === null) {
        const max = await db.prepare("SELECT MAX(id) AS max_id FROM work_license_submissions").first();
        bound = max?.max_id ?? 0;
        if (!Number.isSafeInteger(bound) || bound < 0) throw new Error("Invalid range");
      }
      const result = await db.prepare(
        "SELECT id, pr_number, work_id, author_id, published_version, status, submitted_at " +
        "FROM work_license_submissions WHERE id > ? AND id <= ? ORDER BY id ASC LIMIT ?"
      ).bind(after, bound, limit + 1).all();
      if (result?.success === false || !Array.isArray(result?.results)) throw new Error("Invalid query result");
      let previous = after;
      const rows = result.results.map(row => {
        if (!Number.isSafeInteger(row.id) || row.id <= previous || row.id > bound ||
            !Number.isSafeInteger(row.pr_number) || row.pr_number < 1 ||
            typeof row.work_id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,179}$/i.test(row.work_id) ||
            !validLicenseAuthorId(row.author_id) || !Number.isSafeInteger(row.published_version) || row.published_version < 1 ||
            typeof row.status !== "string" || !row.status.trim() || row.status.length > 64 ||
            typeof row.submitted_at !== "string" || row.submitted_at.length > 100) throw new Error("Invalid submission metadata");
        previous = row.id;
        return Object.fromEntries(["id", "pr_number", "work_id", "author_id", "published_version", "status", "submitted_at"].map(key => [key, row[key]]));
      });
      const hasMore = rows.length > limit, page = rows.slice(0, limit);
      return json({ schema_version: 1, rows: page, as_of_id: bound,
        has_more: hasMore, next_after_id: hasMore ? page.at(-1).id : null,
        captured_at: new Date().toISOString() });
    } catch (error) {
      if (error?.httpStatus === 400 && error.message === "invalid_submission_cursor") return fail(error.message, 400);
      if (/no such table: (?:main\.)?work_license_submissions/i.test(String(error?.message))) return fail("publication_submissions_not_initialized", 409);
      return fail("publication_submissions_unavailable", 503);
    }
  }

  if (path === "/admin/authors/license-default" &&
      (request.method === "GET" || request.method === "POST")) {
    try {
      const body = request.method === "POST"
        ? await readJsonWithLimit(request, 4096)
        : null;
      const authorId = request.method === "POST"
        ? body?.author_id
        : new URL(request.url).searchParams.get("author_id");
      if (!validLicenseAuthorId(authorId)) throw licenseError("invalid_author_id");
      await ensureLicenseTables(db);
      if (request.method === "POST") {
        const policy = validateLicensePolicy(body.policy);
        await db.prepare(
          "INSERT INTO author_license_defaults (author_id, policy_json, revision) " +
          "VALUES (?, ?, 1) ON CONFLICT(author_id) DO UPDATE SET " +
          "policy_json = excluded.policy_json, revision = author_license_defaults.revision + 1, " +
          "updated_at = CURRENT_TIMESTAMP"
        ).bind(authorId, JSON.stringify(policy)).run();
      }
      const saved = await readAuthorLicense(db, authorId);
      return json({ author_id: authorId, ...saved });
    } catch (error) {
      if (error?.httpStatus) return fail(error.message, error.httpStatus);
      throw error;
    }
  }

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
            ADMIN_PUBLICATION_MAX_BODY_BYTES
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

  if (path === "/admin/characters/publish-pr" && request.method === "POST") {
    let publication;
    let snapshot = null;
    try {
      const body = await readJsonWithLimit(request, ADMIN_PUBLICATION_MAX_BODY_BYTES);
      publication = prepareCharacterPublication(body);
      const mode = body.license_mode || "inherit";
      if (!["inherit", "custom"].includes(mode)) throw licenseError("invalid_license_mode");
      // Never trust a license copied from an imported card.
      delete publication.card.meta.license;
      delete publication.catalogEntry.license;
      if (!publication.authorId && mode === "custom") {
        throw licenseError("author_id_required_for_license");
      }
      if (publication.authorId) {
        await ensureLicenseTables(db);
        const authorDefault = await readAuthorLicense(db, publication.authorId);
        const policy = mode === "custom"
          ? validateLicensePolicy(body.license_policy)
          : authorDefault.policy;
        snapshot = {
          schema_version: 1,
          policy,
          source: mode === "custom" ? "work_override" : "author_default",
          default_revision: authorDefault.revision
        };
        publication.card.meta.license = snapshot;
        publication.catalogEntry.license = snapshot;
      }
    } catch (error) {
      if (error?.httpStatus) return fail(error.message, error.httpStatus);
      throw error;
    }

    try {
      const result = await createCharacterPublicationPr(env, publication);
      let licenseAuditSaved = !snapshot;
      let warning = null;
      if (snapshot) {
        try {
          // PR submission only. Published rights remain the versioned
          // static card/catalog snapshot after the review PR is merged.
          await db.prepare(
            "INSERT INTO work_license_submissions " +
            "(pr_number, pr_url, work_id, author_id, published_version, snapshot_json, status) " +
            "VALUES (?, ?, ?, ?, ?, ?, 'pending_review')"
          ).bind(
            result.pr_number, result.pr_url || "",
            publication.id, publication.authorId,
            Number(result.published_version || 1),
            JSON.stringify(snapshot)
          ).run();
          licenseAuditSaved = true;
        } catch (error) {
          // PR already exists: do NOT return a 500 that invites a duplicate PR.
          warning = "license_audit_write_failed";
        }
      }
      return json({
        created: true,
        ...result,
        license_audit_saved: licenseAuditSaved,
        ...(warning ? { warning } : {})
      }, 201);
    } catch (error) {
      if (error?.httpStatus) return fail(error.message, error.httpStatus);
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
  WorkerAdminPublicationRoutes,
  adminPublicationRoute,
};
