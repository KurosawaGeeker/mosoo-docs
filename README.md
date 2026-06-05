# Mosoo Docs

Documentation source for the Mosoo API docs site.

- Live docs: [docs.mosoo.ai](https://docs.mosoo.ai)
- Mosoo repository: [langgenius/mosoo](https://github.com/langgenius/mosoo)

## About

This repository contains the Mintlify documentation for calling published Mosoo Agents. The API Reference is generated from the local OpenAPI snapshot:

```text
mosoo-openapi.generated.json
```

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
- `mosoo-openapi.generated.json` is the OpenAPI snapshot used by the API Reference.
- `images/` contains brand and documentation assets.
