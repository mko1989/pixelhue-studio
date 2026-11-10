# WO-030 — Raspberry Pi portable distributions

**Status: DONE (2026-11-10; six archives and 138 tests verified; native Raspberry Pi execution owner QA)**

## Investigation FIRST

Owner requests a Raspberry Pi distribution in addition to the existing desktop targets. Follows WO-005/014; package current source, bundled runtime/license, launcher and verified provenance.

- `scripts/build-dist.mjs` has four hard-coded targets (macOS x64/arm64, Windows x64, Linux x64). The app has no native npm dependencies; Raspberry Pi requires a Linux ARM Node runtime and the existing Unix launcher.
- `scripts/verify-dist.mjs` assumes exactly four targets, has no ARM Linux format/native mapping and chooses the shell launcher only for ubuntu-x64. Update target definitions together rather than weakening architecture/count checks.
- Official pinned Node v22.23.4 SHASUMS includes both `linux-arm64.tar.gz` and `linux-armv7l.tar.gz`. Its [platform/toolchain documentation](https://github.com/nodejs/node/blob/v22.23.4/BUILDING.md#platform-list) lists Linux arm64 and armv7 with kernel >=4.18, glibc >=2.28; armv7 additionally needs libstdc++ GLIBCXX_3.4.28, available in Debian 11+. Package 64-bit and 32-bit ARMv7 versions, with Raspberry Pi OS Bullseye-or-newer guidance and OS bitness selection. No ARMv6 build.
- Existing Unix launcher executes bundled Node, supports HOST/PORT and no-browser overrides, and works for desktop or headless use. No installer or service changes needed. Build host is Intel macOS; verify ARM architecture, hashes, app contents and executable modes but do not claim Raspberry Pi execution.

## What was done

- Added shared `packaging/targets.mjs`: the original four platforms plus `raspberry-pi-arm64` (official linux-arm64 runtime) and `raspberry-pi-armv7` (official linux-armv7l runtime), each with the Unix launcher. Builder and verifier share launcher/architecture/native-target mappings, including Linux ARM64 and ARM32 native execution selection.
- Builder emits all six current-source archives, labelled manifest entries, checksums, runtime/application provenance and a generated dist index with Pi desktop/headless launch instructions.
- Verifier requires exactly the configured target set without duplicates, validates ARM64/ARM EABI5 ELF formats and Unix executable modes, and checks the live-edit client module during the native launcher smoke.
- README/package instructions explain OS bitness via `getconf LONG_BIT`, compatible OS/CPU requirements, bundled runtime, desktop use and HOST/no-browser settings for headless access. Packaging README also reflects current presets and live Programming edits.

## What was VERIFIED

- `npm run build:dist` built all six archives, using official Node v22.23.4 SHA-256 verification before extraction. Pi runtimes matched hashes f7a1e486… (ARM64) and 4318e0c6… (ARMv7). Both ARM application manifests contain `lib/program-geometry.js` and `public/program-sync.js` from the latest live-edit implementation.
- `npm run verify:dist` passed all six archives: checksums, current-source hashes, architecture, contents, license, fonts and executable modes. ARM64 is ELF64 ARM aarch64 with `/lib/ld-linux-aarch64.so.1`; ARMv7 is ELF32 ARM EABI5 with `/lib/ld-linux-armhf.so.3`. The extracted Intel Mac launcher/runtime/HTTP smoke passes. `dist/verification.json` explicitly lists the five non-native targets as not executed.
- All **138/138** regression tests pass using the bundled Intel Node v22.23.4 runtime; static client, source-size (90 files), Node syntax, shell syntax and diff whitespace checks pass. Native-target selection was checked for Linux arm64/arm/x64.
- Produced local `dist/Pixelhue-Studio-1.6.0-alpha.1-raspberry-pi-arm64.tar.gz` (~42 MiB) and `raspberry-pi-armv7.tar.gz` (~37 MiB), with the existing four desktop archives refreshed to the same current source. Dist/cache remain ignored; no GitHub release or tag created.
- Logs: `/private/tmp/pixelhue-full-client/wo030-build.log`, `wo030-verify.log`, `wo030-tests.log`. Native Raspberry Pi launch, browser, discovery and physical control remain owner QA; the Intel Mac cannot execute those ARM binaries.
