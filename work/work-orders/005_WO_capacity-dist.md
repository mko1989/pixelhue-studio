**Status: DONE (2026-11-06, 48 passing tests, browser capacity checks, four verified archives and native Intel Mac launcher smoke; other target/hardware QA pending)**

## Investigation FIRST

Owner specifies capacity choices: P20 DL/4K, P10 SL/4K, P80 4K only. Prepare portable distributions for Intel Mac, Apple Silicon Mac, Windows x64 and Ubuntu x64.

- `mvr-app/lib/inputs.js` currently treats every numeric capacity 0/1/2 as selectable regardless of the connected model. `public/inputs.js` separately hard-codes SL/DL/4K in row and bulk selectors. Restrict both selectors from server-provided model policy and enforce the same policy before any device write. Keep unknown/device-managed current values unchanged for name/EDID edits.
- WOs 001–004 document app behavior, model maps, session guards and readback. Preserve P20 MVR and input-only P10/P80 behavior. Existing mock P20/P80 SL defaults are inconsistent with the newly specified supported capacities; update fixtures while adding explicit unsupported-write tests.
- The application uses Node built-ins only and has no packaging/build pipeline. Bundle an official maintained Node 22 runtime with app files and platform launchers so users do not need Node/npm installed. Pin the runtime, verify downloaded runtime archives against official SHA-256 hashes, retain its license, and publish archive checksums/build metadata locally.
- Build host is Intel macOS. Intel Mac can be smoke-tested natively; other target binaries can be checked for correct format/architecture and contents, with OS-specific execution explicitly left to target QA. Do not imply code signing/notarization or native execution on unavailable OSes.

## What was done

- `lib/input-models.js` defines capacity policies P20=[DL,4K], P10=[SL,4K], P80=[4K]. Input responses supply row and bulk choices; `lib/inputs.js` rejects unsupported changes before assessment/writes. Existing legacy values may be retained for name/EDID changes, but cannot be sent during a new port configuration. Device-managed values remain protected.
- `public/inputs.js` renders row/bulk choices from server policy, clears incompatible bulk selections on model changes, and displays unexpected current values as disabled entries. Removed the hard-coded three-choice bulk list from HTML.
- Updated mock defaults to valid capacities and added capacity-policy regression coverage. Version advanced to 1.1.0.
- Added `packaging/` launchers and portable-user README. Launchers use bundled Node, open a browser and print the local URL, allow fixed-port/no-browser overrides, and shut down on Ctrl+C. Default port 3210 falls back through 3220 if occupied.
- Added `scripts/build-dist.mjs` and `npm run build:dist`: downloads pinned official Node v22.23.4 archives, verifies official SHA-256 hashes before extraction, retains Node's license, and packages a strict application-file whitelist. Build/runtime provenance, per-file application hashes, archive manifest and SHA-256 checksums are emitted in `mvr-app/dist`. Build cache/output are ignored by `.gitignore`.
- Prepared `Pixelhue-Studio-1.1.0-macos-intel.zip`, `macos-silicon.zip`, `windows-x64.zip`, and `ubuntu-x64.tar.gz`, each with runtime, app, launcher and README. These are portable folders, not installers or signed/notarized .app bundles.
- Added `scripts/verify-dist.mjs` / `npm run verify:dist`, README build/download instructions and owner QA checklist entries. Prior generic-capacity assumptions in WO-004 are superseded by this owner-specified policy.

## What was VERIFIED to work

- `npm test`: **48 passing tests**, 0 failed. Added per-model choice/readback assertions, rejection of every unsupported capacity before writes, and preservation of legacy values only when no unsupported mode write is needed. Existing discovery, input batching, SDI protection, P10/P80 guards and P20 MVR tests remain green.
- Chrome against sequential mock connections to P20, P10 and P80 verified exact enabled row/bulk option values ([1,2], [0,2], [2]), reset of old bulk choices during model switches, 4K bulk Apply/readback, managed-capacity preservation and no browser errors.
- Both builds completed; final refresh used verified cached runtimes so all four archives contain the final application/package metadata. `npm run verify:dist` passed archive checksum, current-source hash, binary architecture/format, license, launcher and web-content checks for all four outputs.
- Extracted Intel Mac ZIP to a fresh temporary directory and invoked its actual `.command` launcher using its bundled runtime: runtime version v22.23.4, server HTTP 200, JS asset HTTP 200, initial unconnected API state 409, and termination all passed. The application suite also passed under that bundled runtime (48 dots, exit 0).
- Other binary formats verified: arm64 Mach-O for Apple Silicon, x86-64 PE32+ for Windows, x86-64 ELF for Ubuntu. `dist/verification.json` explicitly records the three targets not executed natively.
- All code files remain below 500 lines; syntax and shell parsing checks passed. Workspace is not a Git repository, so no commit was possible. No vendor sources changed; QA servers closed.
- **Not proven:** native launch/browser/OS behavior on Apple Silicon, Windows or Ubuntu, and physical Pixelhue hardware acceptance. The Intel Mac host cannot establish those. Runtime requirements follow the [official Node 22 platform list](https://github.com/nodejs/node/blob/v22.23.4/BUILDING.md#platform-list); Node version was selected from the official release index and all runtime archive hashes matched its official SHASUMS256.txt.
