# WO-038 — Push and publish v1.6.0-alpha.2

**Status: IN PROGRESS**

Owner (2026-11-11): "That's enough for now. Push and make a release."

## Investigation FIRST

- `origin` is `https://github.com/mko1989/pixelhue-studio.git`; local `main` is 15 commits ahead (WO-036 and WO-037), working tree clean. GitHub CLI is logged in as mko1989.
- Releases so far: `v1.4.0`, `v1.5.0` (latest, stable MVR/input editor). `package.json` has been `1.6.0-alpha.1` since WO-014 and that version was never published; WO-014…WO-035 built alpha archives into `dist/` only.
- Nothing added in WO-036/037 has been run against hardware (the P20 was unreachable for the whole session), and WO-014…035 also list physical write QA as pending. A stable `v1.6.0` marked "latest" would replace the hardware-proven v1.5.0 as the default download. So this is published as a **pre-release**, `v1.6.0-alpha.2`, and v1.5.0 stays "latest".
- Release procedure follows WO-011: annotated tag, push `main` and the tag, upload to a draft, verify asset hashes against the local files, then publish. Archives come from `npm run build:dist` (pinned Node 22.23.4 runtimes, checksummed) and `npm run verify:dist`; six targets since WO-030.
- CI (`.github/workflows/verify.yml`) runs `check:size`, `npm test` and `build:client` on push; the release waits for it to be green.

## What was done

(filled in below)

## What was VERIFIED

(filled in below)
