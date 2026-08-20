# Signed Operations Verifier

A standalone script that builds a document operation history with cryptographic signatures, then verifies each one. `injectBadOperations()` corrupts one signature and deletes the signer context from another, so the report separates valid operations from tampered and unsigned ones. Both detections are pinned by `should detect tampered signatures` and `should flag unsigned operations` in `src/verify-operations.test.ts`.

## What it demonstrates

Every signature is the 5-tuple `[timestamp, publicKey, actionHash, prevStateHash, signature]`. There are two verification paths, and they are not interchangeable:

- `verifyOperationSignature()` checks one signature tuple at a time, and the caller supplies the callback: the `ActionVerificationHandler`, `(publicKey, signature, data) => Promise<boolean>`. `ecdsaVerificationHandler` in `src/verify-operations.ts` implements it over Web Crypto.
- `createSignatureVerifier()` verifies a whole operation and takes no callback, but it reads `signature[1]` as a DID (decentralized identifier). `buildSignedAction()` stores the raw hex public key there, so the SDK verifier pairs with `RenownCryptoSigner.signAction()` instead. `buildAndVerifyWithSignAction()` runs that path.

## Run

```bash
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
