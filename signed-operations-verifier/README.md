# Signed Operations Verifier

A standalone script that builds a document operation history with cryptographic signatures, then verifies each one. Demonstrates detection of unsigned and tampered operations, plus signer identity chain extraction.

## What it demonstrates

- **`ISigner` interface** via `RenownCryptoSigner` from `@renown/sdk`
- **`RenownCryptoSigner`** construction using `MemoryKeyStorage` + `RenownCryptoBuilder` (no filesystem or network needed)
- **`verifyOperationSignature()`** — low-level per-signature verification with a custom `ActionVerificationHandler`
- **`createSignatureVerifier()`** — higher-level operation verifier from `@renown/sdk`
- **`validateHeader()`** — document header signature validation
- **Signature tuple structure** — `[timestamp, publicKey, actionHash, prevStateHash, signature]`
- **Signer identity chain** — user address/networkId/chainId + app name/key

## Run

```bash
pnpm install
pnpm --filter @powerhousedao/example-signed-operations-verifier test
```

## Key APIs

| Import | API | Purpose |
|--------|-----|---------|
| `document-model/core` | `verifyOperationSignature()` | Verify a single signature tuple |
| `document-model/core` | `buildSignedAction()` | Create a signed operation from an action |
| `document-model/core` | `actionSigner()` | Construct an `ActionSigner` with identity info |
| `@renown/sdk/node` | `RenownCryptoSigner` | `ISigner` implementation using ECDSA P-256 |
| `@renown/sdk/node` | `RenownCryptoBuilder` | Builder for the underlying crypto engine |
| `@renown/sdk/node` | `MemoryKeyStorage` | In-memory key pair storage for demos |
| `@renown/sdk/node` | `createSignatureVerifier()` | Higher-level full-operation verifier |
