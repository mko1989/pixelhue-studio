**Status: DONE (2026-11-09, 87 tests, deterministic regeneration, offline package install/ESM/CJS/CLI smoke; committed and pushed as 9640220)**

## Investigation FIRST

Owner requests a Node.js JSON API library with every API point searchable by AI agents; supersedes further native-web-UI troubleshooting.

- Prior API evidence is spread across WOs 001–010, the supplied 243-page OpenAPI V2.0.1 manual, Companion 2.2.7 model configs/services and 55 original API source files embedded in PixelFlow source maps. No searchable catalog exists.
- Manual extraction finds 33 operation sections, including legacy/v2 firmware variants and different methods on preset routes. PDF line wrapping inserts spaces inside paths; normalize those while retaining exact page/section provenance. Table extraction preserves request/response field cells more accurately than flattening them into invented nested schemas.
- AST investigation of supplied vendor API sources finds 784 request objects, including three dynamic URL expressions. HTTP methods vary in case. Keep all observations, deduplicate by method/canonical path, and preserve payload/query expressions, TypeScript parameter types and source locations. Do not label every vendor/controller endpoint as a verified P20 operation.
- Companion model configs map P10/P20/Q8/P80 routes, but its selectLayer implementation calls a screen selection endpoint with a layer body; preserve conflicts instead of promoting every observed call into a canonical example.
- Current repository is `mvr-app`, main is clean at f614e6d, latest release v1.5.0. Implement an independent dependency-free runtime package in `api-library/`, without changing the app/device behavior or existing release packages. Build-time extraction may use Python pdfplumber and a TypeScript AST parser.

## What was done

- Added independent `mvr-app/api-library` package, version 0.1.0, with 722 deduplicated method/path operations in 27 topic groups. Each operation has a JSON file, stable ID, normalized route, service scope, provenance, observed payload/query expressions, TS parameter references, model evidence and notes. Preserved method/firmware variants rather than overwriting them.
- Preserved all 33 manual sections and 243 pages of original text/field tables. Added 722 type declarations from supplied vendor/Companion sources and 537 explicit referenced-only records for missing source-map DTOs. Ten dynamic/alternate-base calls remain in a searchable unresolved inventory. Coverage accounts for all 786 vendor HTTP call observations and 110 Companion model observations.
- Added curated JSON examples/partial schemas for common Studio operations, authentication/enums, and explicit notes for UMD, EDID frame/interlace conventions, model capacity policy and the Companion layer-selection inconsistency. These distinguish source evidence from device-verified support.
- Dependency-free ESM/CommonJS runtime exposes search, filters, exact lookup, manual/type lookup, JWT generation and fetch-style request planning. All helpers/CLI commands are offline; no device writes or network requests are performed by the library. Added an AI-agent guide and public README link.
- Added reproducible PDF-table and TypeScript-AST extraction scripts. Build dependencies stay outside the runtime package. Created `dist/mko1989-pixelhue-api-catalog-0.1.0.tgz` (378,179 bytes; 2,270 packaged files).

## What was verified

- `npm test` from app root: **87 passing tests**, 0 failures (79 existing app tests plus 8 catalog tests). Final focused library suite also passes all 8, including complete observation accounting, unique/valid/bounded JSON, all manual sections/pages, firmware variants, search/model/group filtering, type availability, query/path encoding, authentication parity, CJS/ESM and CLI failures.
- Repeated catalog regeneration produced the identical SHA-256 fingerprint `33b139dba309e966cd0bcb7a5aed55d692e01c8a78172faf5ba88d5648bee937` across all generated data files.
- Packed library installed successfully using `npm install --offline --omit=dev` in a temporary consumer. Installed ESM, CommonJS, raw catalog JSON and CLI passed lookups/search/manual checks without original sources or runtime dependencies.
- All source/data JSON files checked stay under 500 lines (maximum observed 142). Git whitespace check passed. Existing app behavior and v1.5.0 release packages were not changed.
- Committed/pushed to main as `964022007ec32be65075ade4fdcec0b4cb308f23` (`Add searchable Pixelhue API catalog and Node.js helpers`). Working tree is clean and main tracks origin/main. Public catalog: https://github.com/mko1989/pixelhue-studio/tree/main/api-library.
