// Cryptographic and credential helpers shared by session/account flows.
// Algorithms and work factors are preserved exactly during structural extraction.
const PASSWORD_ITERATIONS = 100_000;
const cryptoEncoder = new TextEncoder();

const cryptoInteger = (n, min, max) =>
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= max;

const WorkerCrypto = (() => {
  function bytesToB64Url(
    bytes
  ) {
    let s = "";
  
    for (
      const b
      of bytes
    ) {
      s +=
        String.fromCharCode(
          b
        );
    }
  
    return btoa(s)
      .replace(
        /\+/g,
        "-"
      )
      .replace(
        /\//g,
        "_"
      )
      .replace(
        /=+$/g,
        ""
      );
  }
  
  function b64UrlToBytes(
    value
  ) {
    const padded =
      value
        .replace(
          /-/g,
          "+"
        )
        .replace(
          /_/g,
          "/"
        ) +
      "===".slice(
        (value.length + 3) %
          4
      );
  
    const raw =
      atob(
        padded
      );
  
    return Uint8Array.from(
      raw,
      (c) =>
        c.charCodeAt(0)
    );
  }
  
  function randomBytes(
    size
  ) {
    return crypto
      .getRandomValues(
        new Uint8Array(
          size
        )
      );
  }
  
  function newOpaqueToken(
    prefix,
    size = 32
  ) {
    return (
      prefix +
      bytesToB64Url(
        randomBytes(
          size
        )
      )
    );
  }
  
  function publicPlayerId() {
    const alphabet =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  
    const bytes =
      randomBytes(8);
  
    let code =
      "";
  
    for (
      let i = 0;
      i < bytes.length;
      i += 1
    ) {
      code +=
        alphabet[
          bytes[i] %
            alphabet.length
        ];
    }
  
    return (
      `YR-${code.slice(
        0,
        4
      )}-${code.slice(4)}`
    );
  }
  
  function newRecoveryCode() {
    const alphabet =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  
    const bytes =
      randomBytes(20);
  
    let code =
      "";
  
    for (
      let i = 0;
      i < bytes.length;
      i += 1
    ) {
      code +=
        alphabet[
          bytes[i] %
            alphabet.length
        ];
    }
  
    return (
      `YBRC-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}-${code.slice(16, 20)}`
    );
  }
  
  function normalizeRecoveryCode(
    value
  ) {
    return String(
      value || ""
    )
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        ""
      );
  }

  async function sha256Hex(
    value
  ) {
    const bytes =
      await crypto.subtle.digest(
        "SHA-256",
        cryptoEncoder.encode(
          value
        )
      );
  
    return [
      ...new Uint8Array(
        bytes
      ),
    ]
      .map(
        (n) =>
          n
            .toString(16)
            .padStart(
              2,
              "0"
            )
      )
      .join("");
  }
  
  async function derivePasswordHash(
    password,
    saltBytes,
    iterations =
      PASSWORD_ITERATIONS
  ) {
    const key =
      await crypto.subtle.importKey(
        "raw",
        cryptoEncoder.encode(
          password
        ),
        "PBKDF2",
        false,
        [
          "deriveBits",
        ]
      );
  
    const bits =
      await crypto.subtle.deriveBits(
        {
          name:
            "PBKDF2",
  
          hash:
            "SHA-256",
  
          salt:
            saltBytes,
  
          iterations,
        },
  
        key,
  
        256
      );
  
    return bytesToB64Url(
      new Uint8Array(
        bits
      )
    );
  }
  
  function constantTimeStringEqual(
    a,
    b
  ) {
    a =
      String(
        a || ""
      );
  
    b =
      String(
        b || ""
      );
  
    if (
      a.length !==
      b.length
    ) {
      return false;
    }
  
    let diff =
      0;
  
    for (
      let i = 0;
      i < a.length;
      i += 1
    ) {
      diff |=
        a.charCodeAt(i) ^
        b.charCodeAt(i);
    }
  
    return (
      diff === 0
    );
  }
  
  async function passwordRecord(
    password
  ) {
    const salt =
      randomBytes(16);
  
    const hash =
      await derivePasswordHash(
        password,
        salt,
        PASSWORD_ITERATIONS
      );
  
    return {
      password_hash:
        hash,
  
      password_salt:
        bytesToB64Url(
          salt
        ),
  
      password_iterations:
        PASSWORD_ITERATIONS,
    };
  }
  
  async function passwordMatches(
    password,
    account
  ) {
    try {
      const iterations =
        cryptoInteger(
          account
            ?.password_iterations,
          50_000,
          1_000_000
        )
          ? account
              .password_iterations
          : PASSWORD_ITERATIONS;
  
      const salt =
        b64UrlToBytes(
          account
            .password_salt
        );
  
      const actual =
        await derivePasswordHash(
          password,
          salt,
          iterations
        );
  
      return constantTimeStringEqual(
        actual,
        account
          .password_hash
      );
    }
  
    catch {
      return false;
    }
  }

  return Object.freeze({
    bytesToB64Url,
    b64UrlToBytes,
    randomBytes,
    newOpaqueToken,
    publicPlayerId,
    newRecoveryCode,
    normalizeRecoveryCode,
    sha256Hex,
    derivePasswordHash,
    constantTimeStringEqual,
    passwordRecord,
    passwordMatches,
  });
})();

const {
  bytesToB64Url,
  b64UrlToBytes,
  randomBytes,
  newOpaqueToken,
  publicPlayerId,
  newRecoveryCode,
  normalizeRecoveryCode,
  sha256Hex,
  derivePasswordHash,
  constantTimeStringEqual,
  passwordRecord,
  passwordMatches,
} = WorkerCrypto;

export {
  WorkerCrypto,
  b64UrlToBytes,
  bytesToB64Url,
  constantTimeStringEqual,
  derivePasswordHash,
  newOpaqueToken,
  newRecoveryCode,
  normalizeRecoveryCode,
  passwordMatches,
  passwordRecord,
  publicPlayerId,
  randomBytes,
  sha256Hex,
};
