# WO-037 — Remaining PixelFlow features for the P20

**Status: IN PROGRESS**

Owner (2026-11-11, after WO-036): "start implementing all the missing items". Scope is the list in `docs/pixelflow-parity/README.md` "Still shown by PixelFlow on a P20 and not yet in Studio". Screen audio is excluded by owner decision (routing only). Items PixelFlow hides on a P20 stay out. The P20 is still unreachable from this Mac, so each unit is proven against PixelFlow's source, the captured live XML/JSON and a mock that enforces the known device rules; hardware QA goes to `work/checklist-wo037.md`.

## Investigation FIRST

### Unit 1 — Source backup (DEVICE-09)
- Gate: feature.xml:1496 `<SourceBackup Support="1" Editable="1">`; `SwitchStrategy Value="1"` (primary → backup, not mutual), `CapacityStrategy Value="0"` (same capacity only), `SwitchMode` 0/1, `BackupPrimaryFirst Level="1"` (per pair), `AutoCropSourceConfig Support="0"`.
- API (`src/api/device/deviceInfo.ts:555-585`): `GET system/ctrl/source-backup` → `{ sourceBackup }`; `PUT system/ctrl/source-backup` body `{ sourceBackup: <whole object> }`. Every edit is read-modify-write of the whole object.
- Object (`inputSourceBackup/HotBackupPanel.tsx:886-905 createBackupList`): `{ enable, primaryFirst, backup: [{ id, parentId, primarySourceId, primarySourceType, primarySourceState, backupSourceId, backupSourceType, backupSourceState, switchMode, usingSourceId, usingSourceType, primaryFirst, primarySourceName, backupSourceName }] }`. Input source type is 2. New id = max id + 1 (`getMaxId`, :919).
- Behaviour traced:
  - Enable switch: `{ ...obj, enable }` with only complete pairs (`handleBackupChange` :632). Pairs can be edited only while enabled (`handleSelect` returns when `!backupData.enable`).
  - Primary preferred: sets top-level `primaryFirst` and every pair's `primaryFirst` (`mainSourceChange` :657).
  - Auto/manual: `switchMode = Number(!auto)`; switching to auto resets `usingSource*` to the primary (:1008-1010). In manual the operator picks primary or backup as the source in use.
  - A new auto pair where either source has no signal is sent with `usingSourceId: 0, usingSourceType: 0` (:907-911).
  - Capacity: with `CapacityStrategy` ≠ 1 the backup must have the same capacity as the primary (`index.tsx:211-232`).
  - Device code 8297: backup is refused for sources used by Cut & Fill / cutout (`handleSourceBackupReq` :648).
- No live sample of `system/ctrl/source-backup` exists in the captures, so the response shape is from the source only.

## What was done

(filled in as units land)

## What was VERIFIED

(filled in as units land)
