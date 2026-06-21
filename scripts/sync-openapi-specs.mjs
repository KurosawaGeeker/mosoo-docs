#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const TRANSLATION_FILE = path.join(SCRIPT_DIR, "openapi.zh-Hans.translations.json");
const VISIBLE_TEXT_KEYS = new Set(["bearerFormat", "description", "summary", "title"]);
const GENERATED_FILES = {
  en: "mosoo-openapi.en.generated.json",
  legacy: "mosoo-openapi.generated.json",
  zhHans: "mosoo-openapi.zh-Hans.generated.json",
};
const DEFAULT_ORIGIN = "https://docs.mosoo.ai";
const MODE = process.argv[2] ?? "write";
const MOSOO_OPENAPI_SOURCES = [
  {
    exportName: "createPublicApiOpenApiDocument",
    importPath: "./apps/api/src/adapters/http/routes/public-api-openapi.ts",
    markerPath: "apps/api/src/adapters/http/routes/public-api-openapi.ts",
  },
  {
    exportName: "createPublishedAgentOpenApiDocument",
    importPath: "./apps/api/src/adapters/http/routes/published-agent-openapi.ts",
    markerPath: "apps/api/src/adapters/http/routes/published-agent-openapi.ts",
  },
];

if (!["check", "write"].includes(MODE)) {
  console.error("Usage: node scripts/sync-openapi-specs.mjs [write|check]");
  process.exit(1);
}

function findMosooOpenApiSource() {
  const candidates = [
    process.env.MOSOO_REPO_DIR,
    path.join(REPO_ROOT, "..", "mosoo"),
    path.join(REPO_ROOT, "..", "..", "mosoo"),
    path.join(REPO_ROOT, "mosoo"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    for (const source of MOSOO_OPENAPI_SOURCES) {
      if (existsSync(path.join(resolved, source.markerPath))) {
        return {
          mosooRepo: resolved,
          source,
        };
      }
    }
  }

  throw new Error(
    [
      "Could not find the Mosoo OpenAPI source.",
      "Set MOSOO_REPO_DIR to the local Mosoo checkout.",
      "Checked for:",
      ...MOSOO_OPENAPI_SOURCES.map((source) => `- ${source.markerPath}`),
    ].join("\n"),
  );
}

function generateSourceOpenApi(mosooRepo, source) {
  const evalSource = `
import { ${source.exportName} as createOpenApiDocument } from ${JSON.stringify(source.importPath)};
console.log(JSON.stringify(createOpenApiDocument(${JSON.stringify(DEFAULT_ORIGIN)}), null, 2));
`;
  const result = spawnSync("bun", ["--eval", evalSource], {
    cwd: mosooRepo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        "Failed to generate OpenAPI from Mosoo source.",
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return JSON.parse(result.stdout);
}

function normalizePublicTerminology(text) {
  return text
    .replace(/\bthe token owner\b/g, "the API token owner")
    .replace(/\bcaller token\b/g, "API token")
    .replace(/\bMosoo Access Tokens\b/g, "Mosoo API tokens")
    .replace(/\bMosoo Access Token\b/g, "Mosoo API token")
    .replace(/\bAccess Tokens\b/g, "API tokens")
    .replace(/\bAccess Token\b/g, "API token")
    .replace(/\baccess tokens\b/g, "API tokens")
    .replace(/\baccess token\b/g, "API token");
}

function normalizeSecuritySchemes(document) {
  const securitySchemes = document.components?.securitySchemes;
  if (securitySchemes?.accessToken) {
    securitySchemes.publicApiBearer ??= securitySchemes.accessToken;
    delete securitySchemes.accessToken;
  }

  visit(document, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }

    if (Array.isArray(value.security)) {
      value.security = value.security.map((requirement) => {
        if (
          requirement &&
          typeof requirement === "object" &&
          !Array.isArray(requirement) &&
          Object.hasOwn(requirement, "accessToken")
        ) {
          return { publicApiBearer: requirement.accessToken };
        }
        return requirement;
      });
    }
  });
}

function visit(value, visitor, pointer = []) {
  visitor(value, pointer);

  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, visitor, pointer.concat(index)));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    visit(child, visitor, pointer.concat(key));
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEnglishSpec(sourceDocument) {
  const document = cloneJson(sourceDocument);
  normalizeSecuritySchemes(document);

  visit(document, (value, pointer) => {
    const key = pointer.at(-1);
    if (typeof value === "string" && VISIBLE_TEXT_KEYS.has(key)) {
      const parent = getParent(document, pointer);
      parent[key] = normalizePublicTerminology(value);
    }
  });

  return document;
}

function getParent(root, pointer) {
  return pointer.slice(0, -1).reduce((current, segment) => current[segment], root);
}

function loadTranslations() {
  return JSON.parse(readFileSync(TRANSLATION_FILE, "utf8"));
}

function createLocalizedSpec(englishDocument, translations) {
  const document = cloneJson(englishDocument);
  const missing = [];

  visit(document, (value, pointer) => {
    const key = pointer.at(-1);
    if (typeof value !== "string" || !VISIBLE_TEXT_KEYS.has(key) || value.length === 0) {
      return;
    }

    const translated = translations[value];
    if (typeof translated !== "string" || translated.length === 0) {
      missing.push({ pointer: toJsonPointer(pointer), value });
      return;
    }

    const parent = getParent(document, pointer);
    parent[key] = translated;
  });

  if (missing.length > 0) {
    const details = missing
      .map((entry) => `${entry.pointer}\n  ${entry.value}`)
      .join("\n\n");
    throw new Error(
      `Missing ${missing.length} zh-Hans OpenAPI translation(s).\n${details}`,
    );
  }

  assertSameStructure(englishDocument, document);
  return document;
}

function stripVisibleText(value, pointer = []) {
  const key = pointer.at(-1);
  if (typeof value === "string" && VISIBLE_TEXT_KEYS.has(key)) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => stripVisibleText(item, pointer.concat(index)));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      stripVisibleText(child, pointer.concat(childKey)),
    ]),
  );
}

function assertSameStructure(englishDocument, localizedDocument) {
  const englishStructure = stableStringify(stripVisibleText(englishDocument));
  const localizedStructure = stableStringify(stripVisibleText(localizedDocument));
  if (englishStructure !== localizedStructure) {
    throw new Error("Localized OpenAPI spec changed non-text structure.");
  }
}

function toJsonPointer(pointer) {
  return `/${pointer
    .map((segment) => String(segment).replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

function formatJson(value) {
  return `${stableStringify(value)}\n`;
}

function buildOutputs() {
  const { mosooRepo, source } = findMosooOpenApiSource();
  const sourceDocument = generateSourceOpenApi(mosooRepo, source);
  const englishDocument = normalizeEnglishSpec(sourceDocument);
  const zhHansDocument = createLocalizedSpec(englishDocument, loadTranslations());

  return {
    [GENERATED_FILES.en]: formatJson(englishDocument),
    [GENERATED_FILES.legacy]: formatJson(englishDocument),
    [GENERATED_FILES.zhHans]: formatJson(zhHansDocument),
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function ensureParentDirectory(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeOutputs(outputs) {
  for (const [relativePath, content] of Object.entries(outputs)) {
    const target = path.join(REPO_ROOT, relativePath);
    ensureParentDirectory(target);
    writeFileSync(target, content);
    console.log(`wrote ${relativePath} ${sha256(content).slice(0, 12)}`);
  }
}

function checkOutputs(outputs) {
  const mismatches = [];
  for (const [relativePath, expected] of Object.entries(outputs)) {
    const target = path.join(REPO_ROOT, relativePath);
    if (!existsSync(target)) {
      mismatches.push(`${relativePath} is missing`);
      continue;
    }

    const actual = readFileSync(target, "utf8");
    if (actual !== expected) {
      mismatches.push(
        `${relativePath} is stale (expected ${sha256(expected).slice(0, 12)}, actual ${sha256(actual).slice(0, 12)})`,
      );
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `OpenAPI generated files are out of sync. Run npm run openapi:sync.\n${mismatches.join("\n")}`,
    );
  }

  console.log("OpenAPI generated files are in sync.");
}

try {
  const outputs = buildOutputs();
  if (MODE === "check") {
    checkOutputs(outputs);
  } else {
    writeOutputs(outputs);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(path.join(tmpdir(), "mosoo-openapi-sync"), {
    force: true,
    recursive: true,
  });
}
