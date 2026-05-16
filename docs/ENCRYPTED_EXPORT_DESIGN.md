# Encrypted Export — Design

**Status:** Approved 2026-05-16, awaiting implementation under M7.8.
**Crypto choices (settled 2026-05-16):**
- KDF: **Argon2id** (interactive parameters)
- Symmetric cipher: **XSalsa20-Poly1305** (`crypto_secretbox`)
- Library: **`react-native-libsodium`** (single audited dependency)

## 1. Goals

1. The user can produce a single self-contained file that captures the entire app state.
2. That file is unreadable without the user's passphrase.
3. The user can restore the file on a fresh install of the same major schema version and recover their data byte-identically.
4. We never see the file or the passphrase.

Non-goals for v1:
- Cloud sync. The export is a one-shot file the user moves through OS share sheet / iCloud Drive / Google Drive.
- Differential backups. Always a full snapshot.
- Multi-device merge. Restore is wipe-and-replace.

## 2. UX flow

### Export

1. Settings → "Export encrypted backup".
2. App explains: "This file is encrypted with a passphrase you choose. If you lose the passphrase, the backup cannot be restored. We cannot recover it for you."
3. User enters passphrase + confirmation. We enforce ≥ 12 chars and a single zxcvbn-style strength meter, but do not impose composition rules.
4. App generates the encrypted blob in memory (see §4).
5. Hand the blob to the OS share sheet (`expo-sharing`) as `sfm-backup-YYYY-MM-DD-HHmm.sfmbak`. The user picks a destination (Files, Drive, email, AirDrop).

### Restore

Only offered when the SQLite database is empty (i.e., fresh install before any sync). Restoring into a non-empty database is destructive; we gate it behind a typed confirmation.

1. Onboarding → "Restore from backup".
2. File picker (`expo-document-picker`) returns the `.sfmbak`.
3. Prompt for passphrase. Decrypt in memory.
4. Verify header (magic, format version, schema version).
5. If schema version > current app understands → block with "Update the app and try again".
6. If schema version < current → run forward migrations (none yet; rely on inline DDL re-bootstrap).
7. Wipe SQLite, then bulk-insert every table from the decrypted payload inside a single transaction.
8. Restart the app to re-bootstrap React Query caches.

## 3. File format (binary)

```
+--------+-----------+----------------------------------------------------+
| Offset | Length    | Field                                              |
+--------+-----------+----------------------------------------------------+
| 0      | 8         | Magic: ASCII "SFMBAK\0\0"                          |
| 8      | 2         | Format version (u16, big-endian). Currently 1.     |
| 10     | 2         | Reserved (must be 0).                              |
| 12     | 4         | Header length N (u32, big-endian).                 |
| 16     | N         | Header JSON, UTF-8. See §3.1.                      |
| 16+N   | 24        | XSalsa20-Poly1305 nonce.                           |
| 40+N   | remainder | Ciphertext + 16-byte Poly1305 tag.                 |
+--------+-----------+----------------------------------------------------+
```

The header is unencrypted on purpose: it carries the KDF parameters so the restore flow knows how to re-derive the key from the passphrase, and the schema version so we can fail-fast on version mismatch before asking for the passphrase. The header contains **no user data** — only crypto parameters and a schema version.

### 3.1 Header JSON

```json
{
  "appBundleId": "com.elyscom.standalonefinancemanagement",
  "createdAt": 1747353600000,
  "schemaVersion": 1,
  "payloadCompression": "gzip",
  "kdf": {
    "algorithm": "argon2id",
    "saltBase64": "<16 random bytes, base64>",
    "opsLimit": 2,
    "memLimitBytes": 67108864,
    "keyLengthBytes": 32
  },
  "cipher": {
    "algorithm": "xsalsa20-poly1305"
  }
}
```

Argon2id parameters are libsodium's `crypto_pwhash_OPSLIMIT_INTERACTIVE` (2) / `MEMLIMIT_INTERACTIVE` (64 MiB). Restore reads these from the header so future builds can ratchet the cost without breaking older files.

## 4. Crypto pipeline

### Encrypt (export)

```
salt        = randombytes_buf(16)
key         = crypto_pwhash(
                outlen = 32,
                passwd = user passphrase (UTF-8 NFC),
                salt   = salt,
                opslimit = 2,
                memlimit = 64 MiB,
                alg = crypto_pwhash_ALG_ARGON2ID13)
nonce       = randombytes_buf(crypto_secretbox_NONCEBYTES = 24)
payload     = gzip(JSON.stringify(snapshot))
ciphertext  = crypto_secretbox_easy(payload, nonce, key)
file        = magic || version || reserved || len(header) || header || nonce || ciphertext
```

Zeroise `key`, `payload`, and the passphrase string after use via `sodium_memzero` where the binding exposes it.

### Decrypt (restore)

Read header → derive key with stored parameters → `crypto_secretbox_open_easy` → ungzip → `JSON.parse` → validate.

## 5. Snapshot shape

A flat JSON object keyed by SQLite table name. Every row is included verbatim from the schema in [apps/mobile/src/db/schema.ts](../apps/mobile/src/db/schema.ts), with one transform: `boolean` columns serialise as `true`/`false` (matching Drizzle's `{ mode: "boolean" }` reads) rather than the raw 0/1.

```jsonc
{
  "schemaVersion": 1,
  "exportedAt": 1747353600000,
  "tables": {
    "users":                 [ /* UserRow[] */ ],
    "accounts":              [ /* AccountRow[] */ ],
    "transactions":          [ /* TransactionRow[] */ ],
    "categories":            [ /* CategoryRow[] */ ],
    "liabilities":           [ /* LiabilityRow[] */ ],
    "importBatches":         [ /* ImportBatchRow[] */ ],
    "balanceSnapshots":      [ /* BalanceSnapshotRow[] */ ],
    "recurringSubscriptions":[ /* RecurringSubscriptionRow[] */ ],
    "incomeStreams":         [ /* IncomeStreamRow[] */ ],
    "expenseProfiles":       [ /* ExpenseProfileRow[] */ ],
    "fxRates":               [ /* FxRateRow[] */ ]
  }
}
```

We deliberately **do not** include:
- Tink OAuth tokens. Tokens live in SecureStore, not SQLite, and a backup file that's been emailed to oneself should not carry a long-lived bank credential. After restoring, the user reconnects the bank.
- The device Ed25519 signing keypair. Same reason; the bridge will mint a new identity on the new install.
- `mirroredAt` timestamps are kept but get rewritten on insert to "now".

## 6. Schema version policy

- Current `schemaVersion`: **1**.
- Increment whenever a column is added, removed, or its type changes in a way the row-bulk-insert path can't tolerate.
- Backward-compatible additions (a new nullable column): readers can ignore unknown fields. No version bump needed in v1, but if the schema becomes load-bearing for other apps, we will bump.
- Forward incompatibility (decoded `schemaVersion` > app's supported max): refuse restore with a clear message pointing at the App Store / Play Store.

## 7. Implementation plan

### Files to add

- `apps/mobile/src/services/export/format.ts` — binary header read/write, magic/version validation. Pure, unit-tested with synthetic buffers.
- `apps/mobile/src/services/export/crypto.ts` — thin wrapper around `react-native-libsodium`: `deriveKey(passphrase, salt, params)`, `encryptPayload(plaintext, key)`, `decryptPayload(ciphertext, nonce, key)`. Pure where the binding allows; everything async because libsodium init is.
- `apps/mobile/src/services/export/snapshot.ts` — `buildSnapshot(db)` and `applySnapshot(db, snapshot)`. The applier wraps everything in a single `db.transaction()`.
- `apps/mobile/src/services/export/index.ts` — `exportEncryptedBackup({ db, passphrase, now })` and `restoreEncryptedBackup({ db, passphrase, fileBytes })`. Returns the file bytes and consumes them.
- `apps/mobile/src/screens/SettingsScreen.tsx` — "Backup & restore" section: export button, restore button, danger copy.
- `apps/mobile/src/screens/OnboardingScreen.tsx` — "Restore from backup" link on the connect-bank screen, only when the SQLite is empty.

### Dependencies

```
expo install react-native-libsodium expo-sharing expo-document-picker expo-file-system pako
```

(`pako` for gzip in JS; libsodium does not expose a portable compression primitive. Alternative: ship raw JSON and accept ~3-5x larger files; gzip wins.)

### Tests

- `format.test.ts` — round-trip header encode/decode, magic check, version check, header-length bounds.
- `crypto.test.ts` — derive→encrypt→decrypt round-trip; wrong passphrase → MAC failure; tampered nonce → MAC failure; tampered ciphertext → MAC failure.
- `snapshot.test.ts` — populate in-memory SQLite, build, wipe, apply, compare table contents byte-for-byte (ignoring `mirroredAt`).
- `index.test.ts` — top-level export/restore round-trip with a mocked passphrase entry, then a wrong-passphrase failure case.

### Known foot-guns

- **Argon2id at `MEMLIMIT_INTERACTIVE` = 64 MiB will OOM on low-RAM Android devices.** If we see field reports, drop to `crypto_pwhash_MEMLIMIT_MIN` (8 MiB) with `OPSLIMIT_MODERATE` (3) as a fallback, and surface the choice in the header so old files still decrypt.
- **Passphrase normalisation matters.** Always `String.prototype.normalize("NFC")` before passing to the KDF; otherwise the same visual passphrase on iOS and Android can produce different keys.
- **Don't log the passphrase.** Never include the passphrase or derived key in error messages, telemetry (which we don't have anyway), or `console.log`.
- **Large `transactions` tables.** Single-pass JSON.stringify is fine up to ~100k rows; if profiling later shows memory pressure, switch to a streaming JSON writer.

## 8. Threat model

| Threat | Mitigation |
|---|---|
| Backup file in attacker hands (cloud-leak, lost device) | XSalsa20-Poly1305 with an Argon2id-derived key. Attacker must brute-force the passphrase against a memory-hard KDF. |
| Wrong passphrase | Poly1305 MAC verification fails fast; we surface "Wrong passphrase" with no oracle (no specific failure mode distinguishes wrong key from corrupted file). |
| Tampered file | Poly1305 MAC covers nonce + ciphertext; any flip fails verification. |
| Header tampering (e.g., attacker changes Argon2id parameters to make brute force easier) | The MAC does not cover the header, but the header only carries parameters used to *derive the key the attacker doesn't know yet* — tampering with `opsLimit` does not weaken the attack on the actual passphrase. We re-validate header bounds (KDF algo == argon2id, key length == 32) on read and refuse weaker-than-spec parameters. |
| Cipher downgrade | Format version + cipher field in the header are both validated; v1 only accepts `xsalsa20-poly1305`. |
| Replay / restoring a stale backup on a wrong device | Out of scope. The whole point is portability. |
| Side-channel timing on Poly1305 verify | libsodium constant-time. |

## 9. Out of scope for M7

- Cloud sync of the encrypted blob (would require a key-derivation-from-passphrase + per-device public keys design; defer to v2).
- Selective table export (e.g., transactions only).
- Decrypting old format versions on a future app build — there is no "old version" yet.
