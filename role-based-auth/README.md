# Role-Based Auth

A custom document model where the creator is promoted to admin on first action, admins can grant or revoke admin and member roles, and a domain action (`writeNote`) is gated on member-or-higher. A document model is a state schema plus the reducer that applies its operations, and all authorization here runs inside that reducer against `action.context.signer.user.address`.

## What it demonstrates

Roles live in the document state, in the `admins` and `members` arrays, rather than in an external policy store. The first `bootstrap` caller becomes the permanent root admin and cannot be demoted. Every authorization failure is a named error class generated into `gen/access/error.ts` from the error list the spec declares for each operation.

## State shape

```graphql
type RoleBasedAuthState {
  creator: String
  admins: [String!]!
  members: [String!]!
  notes: [Note!]!
}

type Note {
  id: OID!
  author: String!
  text: String!
  createdAt: DateTime!
}
```

## Operations

| Operation | Who can call | Effect |
|---|---|---|
| `bootstrap` | anyone, once | Sets the caller as `creator` and pushes them into `admins`. Throws `AlreadyBootstrapped` on a second call. |
| `grantAdmin(address)` | admin | Promotes `address` to admin and removes it from `members` if present. |
| `revokeAdmin(address)` | admin | Removes `address` from admins. Throws `CannotRevokeCreator` on the creator, `LastAdmin` if it would empty the admin set. |
| `addMember(address)` | admin | Adds `address` to `members`. Throws `AddressAlreadyAdmin` if the address is already an admin. |
| `removeMember(address)` | admin | Removes `address` from `members` (no-op if absent). |
| `writeNote({ id, text, createdAt })` | admin or member | Appends `{ id, author, text, createdAt }` to `state.notes`. Throws `NotAuthorized` if the caller has no role. |

Every operation throws `NotAuthorized` if `action.context.signer` is missing.

## Authorization pattern

Each reducer op begins with:

```ts
const address = action.context?.signer?.user?.address;
if (!address) throw new NotAuthorized("User is not authenticated");
```

Role-mutating ops additionally call `requireAdmin(state, address)`, which throws `NotAdmin`. `v1/gen/reducer.ts` wraps the state reducer with `createReducer`, whose default `baseReducer` catches the throw and records `error.message` as `operation.error` on the resulting document. Callers inspect the operation log to detect rejection.

See `document-models/role-based-auth/v1/src/reducers/access.ts` for the full implementation.

## Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

The demo runs in order: Alice bootstraps, Bob is rejected from `writeNote`, Alice adds Bob as a member, Bob writes a note. Then Bob is rejected from `grantAdmin`, Alice promotes Bob, Bob promotes Carol, and Carol is rejected from demoting the creator.

## Tests

```sh
pnpm test
```

The suite in `document-models/role-based-auth/v1/tests/access.test.ts` covers the single-bootstrap invariant, missing-signer rejection, non-admin role-mutation rejection, creator-cannot-be-demoted, grantAdmin moving members to admins, and writeNote gating.

## Regenerating

The document-model spec lives in `document-models/role-based-auth/role-based-auth.json` with the GraphQL schema at `document-models/role-based-auth/v1/schema.graphql`. To regenerate the `gen/` tree after editing either file:

```sh
pnpm run generate
```

The hand-written reducer at `v1/src/reducers/access.ts` is not touched by codegen.

## License

AGPL-3.0-only
