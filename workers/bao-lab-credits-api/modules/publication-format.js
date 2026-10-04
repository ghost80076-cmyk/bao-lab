// Publication validation and public-card shaping.
// Keep this module independent of D1, player sessions, billing and providers.
const MAX_PUBLISH_CARD_BYTES = 500_000;
const MAX_PUBLISH_COVER_BYTES = 1_200_000;
const publicationEncoder = new TextEncoder();

const publicationSafeInt = (n) =>
  Number.isSafeInteger(n) &&
  n >= 0 &&
  n <= 1_000_000_000
    ? n
    : 0;

const WorkerPublicationFormat = (() => {
  function publishError(
    code,
    status = 400
  ) {
    const error =
      new Error(
        code
      );
  
    error.httpStatus =
      status;
  
    return error;
  }
  
  function plainObject(
    value
  ) {
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(
        value
      )
    );
  }
  
  function utf8ToBase64(
    value
  ) {
    const bytes =
      publicationEncoder.encode(
        String(
          value ?? ""
        )
      );
  
    let binary =
      "";
  
    for (
      const byte
      of bytes
    ) {
      binary +=
        String.fromCharCode(
          byte
        );
    }
  
    return btoa(
      binary
    );
  }
  
  function base64ToUtf8(
    value
  ) {
    const raw =
      atob(
        String(
          value || ""
        ).replace(
          /\s/g,
          ""
        )
      );
  
    return new TextDecoder()
      .decode(
        Uint8Array.from(
          raw,
          (char) =>
            char.charCodeAt(
              0
            )
        )
      );
  }
  
  function redactPublishSecrets(
    value,
    redacted = []
  ) {
    if (
      Array.isArray(
        value
      )
    ) {
      return value.map(
        (item) =>
          redactPublishSecrets(
            item,
            redacted
          )
      );
    }
  
    if (
      !plainObject(
        value
      )
    ) {
      return value;
    }
  
    const out =
      {};
  
    for (
      const [
        key,
        item,
      ]
      of Object.entries(
        value
      )
    ) {
      if (
        key ===
          "preserved_source"
      ) {
        continue;
      }
  
      if (
        /(api[_-]?key|authorization|password|secret|access[_-]?token|refresh[_-]?token)/i.test(
          key
        )
      ) {
        redacted.push(
          key
        );
  
        out[key] =
          "[REDACTED]";
      }
  
      else {
        out[key] =
          redactPublishSecrets(
            item,
            redacted
          );
      }
    }
  
    return out;
  }
  
  function cleanStringList(
    value,
    maxItems,
    maxLength
  ) {
    const list =
      Array.isArray(
        value
      )
        ? value
        : [];
  
    return list
      .map(
        (item) =>
          String(
            item || ""
          )
            .trim()
            .slice(
              0,
              maxLength
            )
      )
      .filter(
        Boolean
      )
      .slice(
        0,
        maxItems
      );
  }
  
  function characterBucket(
    value
  ) {
    const input =
      String(
        value || ""
      );
  
    let hash =
      2166136261;
  
    for (
      let i = 0;
      i < input.length;
      i += 1
    ) {
      hash ^=
        input.charCodeAt(
          i
        );
  
      hash =
        Math.imul(
          hash,
          16777619
        ) >>>
        0;
    }
  
    return (
      (
        hash >>>
        24
      ) &
      255
    )
      .toString(16)
      .padStart(
        2,
        "0"
      );
  }
  
  function prepareCharacterPublication(
    body
  ) {
    const publicationTimestamp =
      new Date().toISOString();
  
    const publicationMode =
      String(
        body?.publication_mode ||
        "create"
      )
        .trim()
        .toLowerCase();
  
    if (
      ![
        "create",
        "update",
      ].includes(
        publicationMode
      )
    ) {
      throw publishError(
        "invalid_publication_mode"
      );
    }
  
    if (
      !plainObject(
        body
      ) ||
      body.rights_confirmed !==
        true
    ) {
      throw publishError(
        "rights_confirmation_required"
      );
    }
  
    if (
      !plainObject(
        body.card
      )
    ) {
      throw publishError(
        "invalid_character_card"
      );
    }
  
    const cardBytes =
      publicationEncoder.encode(
        JSON.stringify(
          body.card
        )
      ).length;
  
    if (
      cardBytes >
      MAX_PUBLISH_CARD_BYTES
    ) {
      throw publishError(
        "character_card_too_large",
        413
      );
    }
  
    const raw =
      JSON.parse(
        JSON.stringify(
          body.card
        )
      );
  
    const meta =
      plainObject(
        raw.meta
      )
        ? raw.meta
        : {};
  
    const content =
      plainObject(
        raw.content
      )
        ? raw.content
        : {};
  
    const gameplay =
      plainObject(
        raw.gameplay
      )
        ? raw.gameplay
        : {};
  
    const presentation =
      plainObject(
        raw.presentation
      )
        ? raw.presentation
        : {};
  
    const id =
      String(
        meta.id ||
        raw.id ||
        ""
      )
        .trim();
  
    const name =
      String(
        meta.name ||
        raw.name ||
        ""
      )
        .trim()
        .slice(
          0,
          100
        );
  
    const title =
      String(
        meta.title ||
        raw.title ||
        name
      )
        .trim()
        .slice(
          0,
          160
        );
  
    const rawCategory =
      String(
        meta.category ||
        raw.category ||
        "general"
      )
        .trim()
        .toLowerCase();

    const rawRating =
      String(
        meta.rating ||
        raw.rating ||
        "general"
      )
        .trim()
        .toLowerCase();

    const category =
      rawCategory ===
        "r18"
        ? "general"
        : rawCategory;

    const rating =
      rawCategory ===
        "r18" ||
      rawRating ===
        "adult"
        ? "adult"
        : "general";
  
    const description =
      String(
        meta.description ||
        raw.description ||
        ""
      )
        .trim()
        .slice(
          0,
          3000
        );
  
    const greeting =
      String(
        content.greeting ||
        raw.greeting ||
        ""
      )
        .trim();
  
    const systemPrompt =
      String(
        content.system_prompt ||
        raw.system_prompt ||
        ""
      )
        .trim();
  
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(
        id
      )
    ) {
      throw publishError(
        "invalid_character_id"
      );
    }
  
    if (
      !name ||
      !greeting ||
      !systemPrompt
    ) {
      throw publishError(
        "character_required_fields_missing"
      );
    }
  
    if (
      ![
        "general",
        "male",
        "female",
      ].includes(
        category
      )
    ) {
      throw publishError(
        "invalid_character_category"
      );
    }

    if (
      ![
        "general",
        "adult",
      ].includes(
        rawRating
      )
    ) {
      throw publishError(
        "invalid_character_rating"
      );
    }
  
    if (
      greeting.length >
        50_000 ||
      systemPrompt.length >
        100_000
    ) {
      throw publishError(
        "character_text_too_large",
        413
      );
    }
  
    const author =
      String(
        body.author_name ||
        meta.creator ||
        ""
      )
        .trim()
        .slice(
          0,
          80
        );
  
    const authorId =
      String(
        body.author_id ||
        meta.creator_id ||
        ""
      )
        .trim()
        .toLowerCase()
        .slice(
          0,
          64
        );
  
    if (
      authorId &&
      !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(
        authorId
      )
    ) {
      throw publishError(
        "invalid_author_id"
      );
    }
  
    const authorBio =
      String(
        body.author_bio ||
        ""
      )
        .trim()
        .slice(
          0,
          1200
        );
  
    const authorSupportLabel =
      String(
        body.author_support_label ||
        "支持作者"
      )
        .trim()
        .slice(
          0,
          40
        ) ||
      "支持作者";
  
    const authorSupportUrl =
      String(
        body.author_support_url ||
        ""
      )
        .trim()
        .slice(
          0,
          600
        );
  
    if (
      authorSupportUrl &&
      !authorId
    ) {
      throw publishError(
        "author_id_required_for_support"
      );
    }
  
    if (
      authorSupportUrl
    ) {
      let parsedSupportUrl =
        null;
  
      try {
        parsedSupportUrl =
          new URL(
            authorSupportUrl
          );
      }
  
      catch {}
  
      if (
        !parsedSupportUrl ||
        parsedSupportUrl.protocol !==
          "https:" ||
        parsedSupportUrl.username ||
        parsedSupportUrl.password
      ) {
        throw publishError(
          "invalid_author_support_url"
        );
      }
    }
  
    const authorProfile =
      authorId
        ? {
            id:
              authorId,
  
            name:
              author ||
              authorId,
  
            ...(authorBio
              ? {
                  bio:
                    authorBio,
                }
              : {}),
  
            ...(authorSupportUrl
              ? {
                  support_links: [
                    {
                      label:
                        authorSupportLabel,
  
                      url:
                        authorSupportUrl,
                    },
                  ],
                }
              : {}),
          }
        : null;
  
    const tags =
      cleanStringList(
        meta.tags ||
        raw.tags,
        24,
        50
      );
  
    let cover =
      null;
  
    let avatar =
      String(
        meta.avatar ||
        raw.avatar ||
        ""
      )
        .trim();
  
    const coverDataUrl =
      String(
        body.cover_data_url ||
        ""
      )
        .trim();
  
    if (
      coverDataUrl
    ) {
      const match =
        coverDataUrl.match(
          /^data:image\/(webp|png);base64,([A-Za-z0-9+/=\s]+)$/i
        );
  
      if (!match) {
        throw publishError(
          "invalid_cover_image"
        );
      }
  
      const base64 =
        match[2].replace(
          /\s/g,
          ""
        );
  
      let binary;
  
      try {
        binary =
          atob(
            base64
          );
      }
  
      catch {
        throw publishError(
          "invalid_cover_image"
        );
      }
  
      const byteLength =
        binary.length;
  
      if (
        byteLength <=
          0 ||
        byteLength >
          MAX_PUBLISH_COVER_BYTES
      ) {
        throw publishError(
          "cover_image_too_large",
          413
        );
      }
  
      const extension =
        match[1]
          .toLowerCase();
  
      const isPng =
        binary.length >=
          8 &&
        binary.charCodeAt(0) ===
          137 &&
        binary.slice(
          1,
          4
        ) ===
          "PNG" &&
        binary.charCodeAt(4) ===
          13 &&
        binary.charCodeAt(5) ===
          10 &&
        binary.charCodeAt(6) ===
          26 &&
        binary.charCodeAt(7) ===
          10;
  
      const isWebp =
        binary.length >=
          12 &&
        binary.slice(
          0,
          4
        ) ===
          "RIFF" &&
        binary.slice(
          8,
          12
        ) ===
          "WEBP";
  
      if (
        (
          extension ===
            "png" &&
          !isPng
        ) ||
        (
          extension ===
            "webp" &&
          !isWebp
        )
      ) {
        throw publishError(
          "invalid_cover_image"
        );
      }
  
      const bucket =
        characterBucket(
          id
        );
  
      const assetPath =
        "assets/community/" +
        bucket +
        "/" +
        id +
        "." +
        extension;
  
      cover = {
        extension,
        base64,
        path:
          assetPath,
        mime:
          "image/" +
          extension,
      };
  
      avatar =
        assetPath;
    }
  
    if (
      !cover &&
      !/^(https:\/\/|assets\/)/i.test(
        avatar
      )
    ) {
      avatar =
        "assets/bao-bun.svg";
    }
  
    const redacted =
      [];
  
    const sanitized =
      redactPublishSecrets(
        raw,
        redacted
      );
  
    const sourceMetadata =
      plainObject(
        raw.import_metadata
      )
        ? raw.import_metadata
        : {};
  
    const safeImportMetadata =
      {};
  
    const sourceFormat =
      String(
        sourceMetadata.source_format ||
        body.source_format ||
        ""
      )
        .trim()
        .slice(
          0,
          80
        );
  
    if (
      sourceFormat
    ) {
      safeImportMetadata.source_format =
        sourceFormat;
    }
  
    safeImportMetadata.source_origin =
      "admin-publish";
  
    const unmapped =
      cleanStringList(
        sourceMetadata.unmapped_fields,
        50,
        100
      );
  
    if (
      unmapped.length
    ) {
      safeImportMetadata.unmapped_fields =
        unmapped;
    }
  
    const unavailable =
      cleanStringList(
        sourceMetadata.unavailable_features,
        50,
        300
      );
  
    if (
      unavailable.length
    ) {
      safeImportMetadata.unavailable_features =
        unavailable;
    }
  
    const redactedFields =
      [
        ...new Set(
          [
            ...cleanStringList(
              sourceMetadata.redacted_fields,
              50,
              100
            ),
            ...redacted,
          ]
        ),
      ];
  
    if (
      redactedFields.length
    ) {
      safeImportMetadata.redacted_fields =
        redactedFields;
    }
  
    const cleanMeta =
      plainObject(
        sanitized.meta
      )
        ? sanitized.meta
        : {};
  
    const cleanContent =
      plainObject(
        sanitized.content
      )
        ? sanitized.content
        : {};
  
    const cleanGameplay =
      plainObject(
        sanitized.gameplay
      )
        ? sanitized.gameplay
        : {};
  
    const cleanPresentation =
      plainObject(
        sanitized.presentation
      )
        ? sanitized.presentation
        : {};
  
    const publishedCard = {
      schema_version:
        "1.5",
  
      meta: {
        ...cleanMeta,
        id,
        name,
        title,
        avatar,
        category,
        rating,
  
        description,
        tags,
  
        creator:
          author ||
          cleanMeta.creator ||
          "",
  
        creator_id:
          authorId ||
          cleanMeta.creator_id ||
          "",
      },
  
      content: {
        ...cleanContent,
        greeting,
        system_prompt:
          systemPrompt,
      },
  
      gameplay:
        cleanGameplay,
  
      presentation:
        cleanPresentation,
  
      import_metadata:
        safeImportMetadata,
    };
  
    const catalogEntry = {
      id,
  
      file:
        "data/characters/community/" +
        characterBucket(
          id
        ) +
        "/" +
        id +
        ".json",
  
      name,
      title,
      avatar,
      category,
      rating,
  
      gender:
        String(
          cleanMeta.gender ||
          ""
        )
          .trim()
          .slice(
            0,
            40
          ),
  
      tags,
      description,
  
      published_at:
        publicationTimestamp,
  
      updated_at:
        publicationTimestamp,
  
      published_version:
        1,
  
      version_published_at:
        publicationTimestamp,
  
      supported_modes:
        plainObject(
          cleanGameplay
            .supported_modes
        )
          ? cleanGameplay
              .supported_modes
          : {
              immersive:
                true,
  
              world:
                false,
            },
  
      supported_display:
        plainObject(
          cleanPresentation
            .supported_display
        )
          ? cleanPresentation
              .supported_display
          : {
              text:
                true,
  
              ui:
                false,
            },
    };
  
    if (
      author
    ) {
      catalogEntry.author =
        author;
    }
  
    if (
      authorId
    ) {
      catalogEntry.author_id =
        authorId;
    }
  
    return {
      id,
  
      mode:
        publicationMode,
  
      bucket:
        characterBucket(
          id
        ),
  
      author,
  
      authorId,
  
      authorProfile,
  
      card:
        publishedCard,
      catalogEntry,
      cover,
    };
  }
  
  function mergePublishedCatalogEntry(
    existingEntry,
    nextEntry,
    publicationTimestamp
  ) {
    if (
      !plainObject(
        existingEntry
      ) ||
      !plainObject(
        nextEntry
      ) ||
      String(
        existingEntry.id ||
        ""
      ) !==
        String(
          nextEntry.id ||
          ""
        )
    ) {
      throw publishError(
        "published_character_metadata_invalid",
        409
      );
    }
  
    const timestamp =
      String(
        publicationTimestamp ||
        nextEntry.updated_at ||
        new Date().toISOString()
      )
        .trim();
  
    const previousVersion =
      Math.max(
        1,
        publicationSafeInt(
          Number(
            existingEntry.published_version ||
            1
          )
        )
      );
  
    return {
      ...existingEntry,
      ...nextEntry,
  
      id:
        existingEntry.id,
  
      file:
        String(
          existingEntry.file ||
          nextEntry.file ||
          ""
        ),
  
      published_at:
        String(
          existingEntry.published_at ||
          timestamp
        ),
  
      updated_at:
        timestamp,
  
      published_version:
        previousVersion +
        1,
  
      version_published_at:
        timestamp,
    };
  }
  
  function mergeAuthorProfile(
    existingProfile,
    nextProfile,
    timestamp
  ) {
    if (
      !plainObject(
        nextProfile
      ) ||
      !nextProfile.id
    ) {
      throw publishError(
        "invalid_author_profile"
      );
    }
  
    const existing =
      plainObject(
        existingProfile
      )
        ? existingProfile
        : {};
  
    if (
      existing.id &&
      existing.id !==
        nextProfile.id
    ) {
      throw publishError(
        "author_identity_mismatch",
        409
      );
    }
  
    const stamp =
      String(
        timestamp ||
        new Date().toISOString()
      );
  
    const supportLinks =
      Array.isArray(
        nextProfile.support_links
      ) &&
      nextProfile.support_links.length
        ? nextProfile.support_links
        : Array.isArray(
            existing.support_links
          )
          ? existing.support_links
          : [];
  
    return {
      ...existing,
  
      id:
        nextProfile.id,
  
      name:
        String(
          nextProfile.name ||
          existing.name ||
          nextProfile.id
        )
          .trim()
          .slice(
            0,
            80
          ),
  
      ...(nextProfile.bio
        ? {
            bio:
              String(
                nextProfile.bio
              )
                .trim()
                .slice(
                  0,
                  1200
                ),
          }
        : existing.bio
          ? {
              bio:
                existing.bio,
            }
          : {}),
  
      support_links:
        supportLinks,
  
      created_at:
        String(
          existing.created_at ||
          stamp
        ),
  
      updated_at:
        stamp,
    };
  }
  
  function prepareAuthorProfileUpdate(
    body
  ) {
    if (
      !plainObject(
        body
      )
    ) {
      throw publishError(
        "invalid_author_profile"
      );
    }
  
    const authorId =
      String(
        body.author_id ||
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
  
    const name =
      String(
        body.author_name ||
        ""
      )
        .trim()
        .slice(
          0,
          80
        );
  
    if (!name) {
      throw publishError(
        "author_name_required"
      );
    }
  
    const bio =
      String(
        body.author_bio ||
        ""
      )
        .trim()
        .slice(
          0,
          1200
        );
  
    const suppliedSupportLinks =
      Array.isArray(
        body.support_links
      )
        ? body.support_links
        : null;
  
    if (
      suppliedSupportLinks &&
      suppliedSupportLinks.length >
        5
    ) {
      throw publishError(
        "author_support_limit_reached"
      );
    }
  
    const legacySupportUrl =
      String(
        body.author_support_url ||
        ""
      )
        .trim()
        .slice(
          0,
          600
        );
  
    const rawSupportLinks =
      suppliedSupportLinks ||
      (
        legacySupportUrl
          ? [
              {
                label:
                  body.author_support_label,
                url:
                  legacySupportUrl,
              },
            ]
          : []
      );
  
    const supportLinks =
      [];
    const seenSupportUrls =
      new Set();
  
    for (
      const rawLink of
        rawSupportLinks
    ) {
      if (
        !plainObject(
          rawLink
        )
      ) {
        throw publishError(
          "invalid_author_support_url"
        );
      }
  
      const supportLabel =
        String(
          rawLink.label ||
          "支持作者"
        )
          .trim()
          .slice(
            0,
            40
          ) ||
        "支持作者";
  
      const supportUrl =
        String(
          rawLink.url ||
          ""
        )
          .trim()
          .slice(
            0,
            600
          );
  
      if (!supportUrl) {
        continue;
      }
  
      let parsed =
        null;
  
      try {
        parsed =
          new URL(
            supportUrl
          );
      }
  
      catch {}
  
      if (
        !parsed ||
        parsed.protocol !==
          "https:" ||
        parsed.username ||
        parsed.password
      ) {
        throw publishError(
          "invalid_author_support_url"
        );
      }
  
      const normalizedUrl =
        parsed.href;
  
      if (
        seenSupportUrls.has(
          normalizedUrl
        )
      ) {
        continue;
      }
  
      seenSupportUrls.add(
        normalizedUrl
      );
  
      supportLinks.push({
        label:
          supportLabel,
        url:
          normalizedUrl,
      });
    }
  
    return {
      authorId,
  
      profile: {
        id:
          authorId,
  
        name,
  
        bio,
  
        support_links:
          supportLinks,
      },
    };
  }

  return Object.freeze({
    publishError,
    plainObject,
    utf8ToBase64,
    base64ToUtf8,
    redactPublishSecrets,
    cleanStringList,
    characterBucket,
    prepareCharacterPublication,
    mergePublishedCatalogEntry,
    mergeAuthorProfile,
    prepareAuthorProfileUpdate,
  });
})();

const {
  publishError,
  plainObject,
  utf8ToBase64,
  base64ToUtf8,
  redactPublishSecrets,
  cleanStringList,
  characterBucket,
  prepareCharacterPublication,
  mergePublishedCatalogEntry,
  mergeAuthorProfile,
  prepareAuthorProfileUpdate,
} = WorkerPublicationFormat;

export {
  WorkerPublicationFormat,
  publishError,
  plainObject,
  utf8ToBase64,
  base64ToUtf8,
  redactPublishSecrets,
  cleanStringList,
  characterBucket,
  prepareCharacterPublication,
  mergePublishedCatalogEntry,
  mergeAuthorProfile,
  prepareAuthorProfileUpdate,
};
