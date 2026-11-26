"use strict";
const { createHash } = require("node:crypto");
// Hash-only deployed Worker module comparison; never print source or secrets.
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const required = (value, name) => {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(name + " is required");
  return result;
};

function decodeModuleBase64(source, name) {
  const encoded = required(source, "Cloudflare module content_base64 for " + name);
  const compact = encoded.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new Error("Cloudflare module contains invalid base64: " + name);
  }
  const bytes = Buffer.from(compact, "base64");
  if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== compact.replace(/=+$/, "")) {
    throw new Error("Cloudflare module cannot be decoded safely: " + name);
  }
  return bytes;
}

function compareWorkerModules(graph, deployed) {
  if (!graph || !Array.isArray(graph.modules) || !graph.mainModule) {
    throw new Error("Local Worker module graph is incomplete");
  }
  if (!deployed || !Array.isArray(deployed.modules)) {
    throw new Error("Cloudflare version did not include modules; unable to prove code parity");
  }
  const expected = new Map();
  for (const m of graph.modules) {
    const name = required(m.name, "Local Worker module name");
    if (expected.has(name)) throw new Error("Duplicate local Worker module: " + name);
    expected.set(name, { sha256: digest(Buffer.from(m.content, "utf8")), content_type: m.contentType });
  }
  const actual = new Map();
  for (const m of deployed.modules) {
    const name = required(m.name, "Cloudflare Worker module name");
    if (actual.has(name)) throw new Error("Duplicate live Worker module: " + name);
    actual.set(name, { sha256: digest(decodeModuleBase64(m.content_base64, name)), content_type: m.content_type });
  }
  const missing = [...expected.keys()].filter(name => !actual.has(name)).sort();
  const extra = [...actual.keys()].filter(name => !expected.has(name)).sort();
  const different = [...expected.keys()].filter(name =>
    actual.has(name) && expected.get(name).sha256 !== actual.get(name).sha256
  ).sort().map(name => ({
    module: name,
    expected_sha256_prefix: expected.get(name).sha256.slice(0, 12),
    deployed_sha256_prefix: actual.get(name).sha256.slice(0, 12),
  }));
  const mainModule = String(deployed.main_module || "");
  const main_match = mainModule === graph.mainModule;
  return {
    ok: main_match && missing.length === 0 && extra.length === 0 && different.length === 0,
    main_module_matches: main_match,
    expected_main_module: graph.mainModule,
    deployed_main_module: mainModule,
    expected_modules: expected.size,
    deployed_modules: actual.size,
    missing_modules: missing,
    extra_modules: extra,
    differing_modules: different,
  };
}


module.exports = { compareWorkerModules, decodeModuleBase64 };
