# Using this API catalog

Start with `data/catalog.json` or `node api-library/cli.cjs stats` from the repository root.

1. Search by intent: `node api-library/cli.cjs search "MVR window" --method PUT`.
2. Read a complete operation: `node api-library/cli.cjs show put-layers-window`.
3. Inspect `vendorEvidence`, `companionEvidence`, `manualSections`, `support`, `serverKind` and `notes` before implementing it.
4. Use `types` / `type` for payload references and `manual <page>` for original parameter/response tables. A `referenced-only` type is missing evidence, not an empty schema.
5. Read device IDs, model, firmware and current state. The catalog's examples contain placeholders.

GET/PUT/POST variants of the same route can have different contracts. Legacy screen/preset manual sections apply before firmware 1.7.0. Controller and keyboard APIs must not be assumed to exist on the device. Model search filters combine documented/configured/Studio scope, not tested compatibility.

Keep unresolved expressions and conflicts explicit. Do not infer object nesting from PDF branch glyphs or silently resolve conflicting UMD casing. Do not call a type-2 input and a type-3/4 screen with the same numerical ID the same source.

Search/lookups/buildRequest are offline. Actual networking belongs in the consuming application. Apply the intended operation's source contract and verify device readback after writes.

Generated `data/` files are produced by `scripts/build.mjs` and `scripts/extract-manual.py`. Correct extraction or `scripts/curated.mjs`, regenerate, and run `npm --prefix api-library test`. Keep runtime free of parser/Python dependencies. Original sources are referenced by filenames, pages, lines and hashes in `data/sources.json`.
