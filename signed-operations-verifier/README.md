# Signed Operations Verifier

A standalone script that signs a document operation history with `RenownCryptoSigner`, then verifies each operation with the checks a reactor runs when it stores a write. `injectBadOperations()` corrupts one signature, edits the input of another, and deletes the signer context from a third, so the report separates valid operations from tampered, edited and unsigned ones.

## What it demonstrates

Every signature is the 5-tuple `[timestamp, signerKey, actionHash, prevStateHash, signature]`. `signFor()` signs with `ISigner.signAction(action, { documentId, branch })`: the target names the document and branch whose log stores the action. `verifyOperation()` in `src/verify-operations.ts` then checks, in order:

1. An action with no `context.signer`, or an empty `signer.app.key`, is unsigned.
2. Element [1] must equal `signer.app.key` (`KEY_MISMATCH`).
3. A `v2:` hash is recomputed: `v2:` plus the unpadded base64url SHA-256 of the sorted-key JSON (`canonicalJson()`) of `["v2", documentId, branch, scope, type, id, timestampUtcMs, input, user.address, user.networkId, user.chainId, app.key]`. A 44-character hash is the legacy `RenownCryptoSigner` hash, SHA-256 over scope, type and input. Any other hash is `MALFORMED_TUPLE`, and a hash that does not recompute is `HASH_MISMATCH`.
4. The ECDSA P-256 signature over `\x19Signed Operation:\n{length}` and elements [0] to [3] must verify under the `did:key` in element [1] (`BAD_SIGNATURE`).

A v2 tuple is bound to one document and one signer, so checking operation #0 against another document fails with `HASH_MISMATCH`. A legacy tuple binds neither, and passes. `buildLegacyOperation()` signs a legacy tuple directly, so both schemes are verified on every release.

A reactor runs these checks itself, together with its document's signature policy and the host's trust policy, so a host does not wire a verifier. Releases after 6.2.3-dev.11 export the same integrity check as `verifyActionSignature` from `@powerhousedao/reactor`. On 6.2.3-dev.11, `signAction` emits the legacy tuple and the reactor does not verify by default.

## Run

```bash
pnpm --filter @powerhousedao/example-signed-operations-verifier test
pnpm --filter @powerhousedao/example-signed-operations-verifier start
```

## Key APIs

| Import | API | Purpose |
|--------|-----|---------|
| `@renown/sdk/node` | `RenownCryptoSigner` | `ISigner` implementation using ECDSA P-256 and a `did:key` |
| `@renown/sdk/node` | `RenownCryptoBuilder` | Builder for the underlying crypto engine |
| `@renown/sdk/node` | `MemoryKeyStorage` | In-memory key pair storage for demos |
| `document-model` | `ISigner.signAction()` | Produces the signature tuple for an action and its target |
