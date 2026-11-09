# Pixelhue API catalog for Node.js and AI agents

Searchable JSON contracts extracted from the supplied PixelFlow OpenAPI V2.0.1 manual, PixelFlow source maps, Companion 2.2.7, and the tested Studio integration. The catalog contains **722 distinct HTTP method/path operations in 27 groups**, all **33 manual operation sections**, and **243 manual pages with original field tables**.

Each operation has a stable ID, method, canonical path, service scope, source locations and available payload/query evidence. Frequently used Studio operations also include curated examples and partial JSON Schemas. Type lookup includes **722 declarations** plus explicit records for **537 referenced types whose definitions were unavailable**. Runtime imports, searches and request planning are offline and have no dependencies.

## Quick search

From the repository root:

```sh
node api-library/cli.cjs search "MVR window" --method PUT
node api-library/cli.cjs search "EDID" --model P20
node api-library/cli.cjs search "UMD height" --group node
node api-library/cli.cjs show put-layers-window
node api-library/cli.cjs show "GET /unico/v1/screen/list-detail" --manual
node api-library/cli.cjs manual 178
node api-library/cli.cjs types LayerUMD
node api-library/cli.cjs type LayerUMD
node api-library/cli.cjs auth
```

All output is JSON. `show --manual` expands the referenced pages; `manual <number>` gives a bounded page read. `list` and `search` support `--method`, `--model`, `--group`, `--scope`, `--limit` and `--offset`. `--scope` accepts `device`, `discovery`, `controller` or `keyboard`. `unresolved` exposes calls that could not be turned into a canonical route without guessing. `stats` prints coverage and indexes.

## Node.js

CommonJS works directly from this repository:

```js
const { searchEndpoints, getEndpoint, getType } = require('./api-library');

console.log(searchEndpoints('input EDID', { method: 'PUT', model: 'P20' }));
const endpoint = getEndpoint('put-layers-window');
console.log(endpoint.requestSchema, endpoint.exampleBody, endpoint.vendorEvidence);
console.log(getType('LayerUMD')); // An array: the same symbol can exist in several sources.
```

ES modules:

```js
import { searchEndpoints, getEndpoint } from './api-library/index.js';

const endpoint = getEndpoint('PUT', '/unico/v1/layers/window');
console.log(searchEndpoints('preset', { method: 'POST', limit: 10 }));
```

To use it in another Node project, install the local folder or its packed tarball:

```sh
npm install /path/to/pixelhue-studio/api-library
```

Then import/require `@mko1989/pixelhue-api-catalog`. Its `pixelhue-api` CLI is also available. Raw JSON can be imported through `@mko1989/pixelhue-api-catalog/catalog.json` and `@mko1989/pixelhue-api-catalog/data/*`.

## Prepare a request

```js
const { makeToken, buildRequest } = require('./api-library');

// openDetail is the result of GET /unico/v1/node/open-detail.
const token = makeToken(openDetail.data.sn, openDetail.data.startTime);
const request = buildRequest('get-layers-list-detail', {
  host: '192.0.2.10', // Replace with the actual device address.
  apiPort: 8088,      // Prefer the advertised/known API port.
  token,
  query: { attachScreenId: 7 }, // Replace IDs with current device IDs.
});

console.log(request.url, request.init, request.responseType);
// Your application can send it explicitly: fetch(request.url, request.init).
```

`buildRequest` only prepares a URL and fetch-style options. It encodes query/path values, retains array bodies, uses the raw token in `Authorization`, and never sends the request. It does not validate arbitrary device payloads or infer defaults from opaque vendor expressions. Use the source contract, current device state and firmware capabilities when implementing writes.

`makeToken(sn, startTime)` follows Companion: HS256, payload `{SN: sn}`, secret `String(startTime)`, no `iat`/`exp`, no Bearer prefix. See `getAuthentication()` for discovery, alternative login and response-envelope details. Discovery uses HTTPS port 19998 and a self-signed certificate; configure your transport accordingly. XML configuration responses can exceed 8 MB.

## JSON layout

| Location | Contents |
| --- | --- |
| [data/catalog.json](data/catalog.json) | Coverage, group indexes and source-policy notes |
| `data/groups/*.json` | Searchable operation summaries, symbols, keywords and file references |
| `data/endpoints/<id>.json` | One operation: path, method, examples/schema when known, source contracts, firmware variants and notes |
| `data/manual/001.json` … `243.json` | Original page text and table cells, with context before each table |
| `data/types/*.json` | Type declarations or explicitly unavailable references |
| [data/authentication.json](data/authentication.json) | Discovery, authentication and device model IDs |
| [data/enums.json](data/enums.json) | Source types, aspect modes, capacities, timing standards and connector types |
| [data/unresolved.json](data/unresolved.json) | Dynamic or alternate-base calls that were not guessed into routes |
| [data/sources.json](data/sources.json) | Manual/source-map hashes and source provenance |

Canonical paths include `/unico/v1`. Manual `/v1/...` paths and vendor relative paths are normalized to it; the original spelling remains in the evidence. Operations are keyed by **method plus path**, so POST and PUT variants remain separate. Template expressions become named path parameters where possible; their original expressions remain visible.

Read-only helper API: `getCatalog`, `listEndpoints`, `searchEndpoints`, `getEndpoint`, `getManualPage`, `searchTypes`, `getType`, `searchUnresolved`, `getAuthentication`, `getEnums`, `getSources`, `makeToken`, `buildRequest`. Lookups return copies so callers cannot modify the cached catalog.

## Evidence and limits

- **Device/controller scope matters.** The vendor app includes controller aggregation, keyboard and features for other models. A source-defined operation is evidence of a call, not proof it is supported on a P20. Controller/keyboard ports must be supplied explicitly when planning requests.
- **Model filters are discovery aids.** `support` separates the manual's document scope, Companion model configuration, and Studio usage. They are not a firmware compatibility guarantee. `deviceVerified` is false for the generated catalog records.
- **Manual variants remain separate observations.** Screen/preset v1 sections target firmware before 1.7.0; v2 sections target 1.7.0 and later. The manual repeats one section number, so use method/path/page rather than section number alone.
- **Table hierarchy is preserved, not invented.** PDF tables lose reliable nesting information. Original cells and required/default/remark columns remain available; they are not advertised as complete nested JSON Schemas. Shared pages can include adjacent operations; use the referenced section/title and context.
- **Missing DTOs are explicit.** Some type-only modules were omitted from the source maps. `getType` returns `availability: "referenced-only"` for a known missing definition, with references. It does not fabricate fields.
- **Conflicts are searchable.** For example, Companion's `selectLayer` sends a layer payload to `screen/select`; the catalog flags that discrepancy. UMD field casing must be checked against the relevant vendor DTO/source instead of assuming `UMD` and `umd` are interchangeable.
- **Examples use placeholder IDs.** Read current screens/interfaces/layers before constructing writes. UMD height comes from device XML; the checked P20 reports 24 px, which is not a universal device constant. Studio's capacity restrictions are app policy, not an API-wide model promise.

## Regenerate and test

The generated JSON is committed, so normal use needs no PDF tools, vendor checkout or parser. Regeneration from a source checkout requires the original supplied manual, source maps and Companion files. Paths default to the parent workspace layout; overrides are available.

```sh
python3 -m pip install pdfplumber
npm --prefix api-library install
python3 api-library/scripts/extract-manual.py "/path/to/PixelFlow-OpenAPI Manual-V2.0.1-2.pdf"
npm --prefix api-library run build -- \
  --vendor=/path/to/extracted-source/web/unicos/static \
  --companion=/path/to/companion-module-pixelhue-switcher-2.2.7
npm --prefix api-library test
```

Build scripts parse TypeScript syntax; they do not execute vendor code. Curated wire examples/notes live in `scripts/curated.mjs`. Change that input and regenerate rather than editing endpoint JSON by hand. Repeated builds from the same sources are deterministic. The installed runtime package contains the generated data and helpers; build tools stay in the repository.
