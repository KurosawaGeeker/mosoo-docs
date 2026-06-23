# Mosoo Docs

Documentation source for the Mosoo API docs site.

- Live docs: [docs.mosoo.ai](https://docs.mosoo.ai)
- Mosoo repository: [langgenius/mosoo](https://github.com/langgenius/mosoo)

## About

This repository contains the Mintlify documentation for calling published Mosoo Agents. The API Reference is generated from localized OpenAPI snapshots:

```text
mosoo-openapi.en.generated.json
mosoo-openapi.zh-Hans.generated.json
```

`mosoo-openapi.generated.json` is kept as an English compatibility copy for older links or tooling.

## Local Development

Install the Mintlify CLI:

```bash
npm i -g mint
```

Run the docs locally:

```bash
mint dev
```

The preview runs at `http://localhost:3000`.

## Project Structure

- `docs.json` configures the Mintlify site, navigation, theme, and API reference.
- `*.mdx` contains the English documentation pages.
- `zh-Hans/` contains the Simplified Chinese documentation pages.
- `mosoo-openapi.en.generated.json` is the English OpenAPI snapshot used by the English API Reference.
- `mosoo-openapi.zh-Hans.generated.json` is the Simplified Chinese OpenAPI snapshot used by the Chinese API Reference.
- `mosoo-openapi.generated.json` is a compatibility copy of the English snapshot.
- `scripts/sync-openapi-specs.mjs` regenerates and validates the localized OpenAPI snapshots from the Mosoo source repo.
- `scripts/openapi.zh-Hans.translations.json` stores the Simplified Chinese translations keyed by the English source text.
- `images/` contains brand and documentation assets.

## OpenAPI Sync

Mosoo is the source of truth. By default, the sync script fetches `https://github.com/langgenius/mosoo.git` into a temporary directory and generates from that online Git source.

```bash
npm run openapi:sync
```

Check whether generated snapshots are stale:

```bash
npm run openapi:check
```

Generate from a specific online branch, tag, or SHA:

```bash
MOSOO_REPO_REF=<branch-or-sha> npm run openapi:sync
```

The sync script:

- fetches the Mosoo source from GitHub unless `MOSOO_REPO_DIR` is explicitly set for a local debugging override;
- imports Mosoo's public OpenAPI document factory from the source repo;
- normalizes public-facing token wording to `API token`;
- generates English and Simplified Chinese OpenAPI snapshots;
- fails if any visible `title`, `summary`, `description`, or `bearerFormat` string lacks a Chinese translation;
- verifies the Chinese snapshot has the same non-text structure as the English snapshot.

Optional source controls:

- `MOSOO_REPO_REF`: online branch, tag, or SHA to fetch. Defaults to `main`.
- `MOSOO_REPO_URL`: source repository URL. Defaults to `https://github.com/langgenius/mosoo.git`.
- `MOSOO_REPO_TOKEN`: token for private repository or private submodule access.
- `MOSOO_REPO_DIR`: explicit local checkout override for debugging only.

The docs workflow `.github/workflows/sync-openapi.yml` can run manually, nightly, or from a Mosoo `repository_dispatch` event named `mosoo-openapi-changed`. When generated snapshots change, it commits them back to this repo so the configured docs host can redeploy.

Secrets used by the sync workflow:

- `MOSOO_REPO_TOKEN`: optional token for checking out a private Mosoo source repo.
- `MINTLIFY_API_KEY` and `MINTLIFY_PROJECT_ID`: optional; triggers Mintlify's deployment API after a generated commit.
- `NETLIFY_BUILD_HOOK_URL`: optional; triggers a Netlify build hook after a generated commit.

The Mosoo source repo should include `.github/workflows/docs-openapi-dispatch.yml` and configure `MOSOO_DOCS_DISPATCH_TOKEN` with permission to dispatch workflows in `KurosawaGeeker/mosoo-docs`. That workflow listens to OpenAPI source paths and sends the current Mosoo SHA to this repo.
