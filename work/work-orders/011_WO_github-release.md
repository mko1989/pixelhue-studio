**Status: DONE (2026-11-09, main/tag pushed and public latest v1.5.0 release verified with seven SHA-256-matching assets)**

## Investigation FIRST

Owner explicitly authorizes connecting the project to https://github.com/mko1989/pixelhue-studio, committing/pushing, and publishing v1.5.0.

- Workspace and `mvr-app` have no Git repository. GitHub main is nonempty and contains the application directly at its root (`README.md`, `lib`, `public`, `server.js`, tests, packaging and scripts). Connect `mvr-app` rather than moving that remote structure or publishing vendor reference material from the parent workspace.
- GitHub CLI authentication succeeds as mko1989 with ADMIN permission when network/keychain access is available. Repository is public, main is its default branch, and v1.4.0 is the latest existing release.
- Current application/package and four verified archives are v1.5.0. WO-010 records 79 tests, browser checks and current-source/archive verification. `mvr-app/.gitignore` already excludes distribution output and Node runtime cache. Packages/checksums belong in release assets.
- Fetch remote history without overwriting the current files, compare remote/local trees for any independently changed content, and create an ordinary descendant commit on main. Preserve existing history and tags.

## What was done

- Initialized Git in `mvr-app`, fetched origin/main and existing v1.4.0, and attached the current files to that history without overwriting them. Set main to track origin/main and configured local GitHub CLI credentials.
- Added `.gitignore` for distribution/runtime caches, Finder metadata and node_modules. Updated README clone instructions and GitHub release download links; replaced references to private parent-workspace documents with public verification details.
- Committed 15 changed/new files as `f614e6d` (`Fix screen-source and UMD aspect ratios for v1.5.0`), directly descending from the existing `61d62b3` commit. Created annotated tag v1.5.0 and atomically pushed main and the tag.
- Published [Pixelhue Studio v1.5.0](https://github.com/mko1989/pixelhue-studio/releases/tag/v1.5.0) as the latest stable release, including four platform archives plus SHASUMS256.txt, manifest.json and verification.json. Uploaded to a draft first, verified assets, then published.

## What was verified

- Repeated `npm test`: 79 passing tests, 0 failures.
- Repeated `npm run verify:dist`: all four packages match current application source, checksums, architectures and expected contents; native Intel Mac launcher/runtime/HTTP smoke passed.
- `git diff --check` passed; the working tree was clean after commit. Confirmed caches/dist/Finder metadata are ignored. Push preserved existing main history and the v1.4.0 tag.
- GitHub main and the annotated tag both resolve to `f614e6d8420973968379073ce152d55202a17cd8`. GitHub asset sizes and SHA-256 digests match all seven local files exactly.
- GitHub latest-release API confirms tag v1.5.0, draft=false, prerelease=false, seven assets, published at 2026-11-09 09:33:05 UTC.
