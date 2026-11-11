# WO-038 — Push and publish v1.6.0-alpha.2

**Status: DONE (2026-11-11 — main and tag pushed, CI green, pre-release published with nine assets whose sizes and SHA-256 digests match the local files; v1.5.0 remains latest)**

Owner (2026-11-11): "That's enough for now. Push and make a release."

## Investigation FIRST

- `origin` is `https://github.com/mko1989/pixelhue-studio.git`; local `main` is 15 commits ahead (WO-036 and WO-037), working tree clean. GitHub CLI is logged in as mko1989.
- Releases so far: `v1.4.0`, `v1.5.0` (latest, stable MVR/input editor). `package.json` has been `1.6.0-alpha.1` since WO-014 and that version was never published; WO-014…WO-035 built alpha archives into `dist/` only.
- Nothing added in WO-036/037 has been run against hardware (the P20 was unreachable for the whole session), and WO-014…035 also list physical write QA as pending. A stable `v1.6.0` marked "latest" would replace the hardware-proven v1.5.0 as the default download. So this is published as a **pre-release**, `v1.6.0-alpha.2`, and v1.5.0 stays "latest".
- Release procedure follows WO-011: annotated tag, push `main` and the tag, upload to a draft, verify asset hashes against the local files, then publish. Archives come from `npm run build:dist` (pinned Node 22.23.4 runtimes, checksummed) and `npm run verify:dist`; six targets since WO-030.
- CI (`.github/workflows/verify.yml`) runs `check:size`, `npm test` and `build:client` on push; the release waits for it to be green.

## What was done

- `package.json` → `1.6.0-alpha.2`; README intro, download note and test count updated to say what the alpha contains and that it is untested on hardware.
- `npm run build:dist` and `npm run verify:dist` for six targets (macOS Intel, macOS Apple Silicon, Windows x64, Ubuntu x64, Raspberry Pi ARM64, ARMv7).
- Commit `460994d`, annotated tag `v1.6.0-alpha.2`, `git push --atomic origin main v1.6.0-alpha.2` (16 commits: WO-036, WO-037 and this one).
- `gh release create … --draft --prerelease --verify-tag` with the six archives, `SHASUMS256.txt`, `manifest.json`, `verification.json`; published after the asset check with `--latest=false`.
- Release notes state plainly that the additions have not been run against hardware and point to the two checklists.

## What was VERIFIED

- Before tagging: `npm test` 224 passing, `check:size` 149 files, `build:client` pass. `verify:dist`: six archives verified for checksum, source, architecture and contents (re-run after the commit: still six); the macOS Intel launcher/runtime/HTTP smoke ran natively, the other five targets were not executed.
- GitHub Actions "Verify" on `460994d`: both runs (branch and tag push) concluded `success`.
- `git ls-remote`: `refs/heads/main` and the peeled tag both resolve to `460994de9bc7d7fbc53ca4a022b60f54a4485fb9`.
- Draft check: nine assets, each with the same byte size and `sha256` digest as the local file in `dist/`.
- Published: https://github.com/mko1989/pixelhue-studio/releases/tag/v1.6.0-alpha.2 — `isDraft false`, `isPrerelease true`, nine assets. `releases/latest` still returns `v1.5.0`.
- Not done: no hardware QA of the release build; no signed installers (portable folders, as before).
