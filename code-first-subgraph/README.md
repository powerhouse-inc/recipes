# Code-First Subgraph

A subgraph written as a `Subgraph` class whose schema is a list of typed `ph` entries, served by a real reactor-api host beside its schema-first twin. The two serve the same schema and the same answers. In the code-first class, TypeScript infers every resolver's arguments, parent and return type from the descriptors that also print the schema.

`Subgraph`, `SchemaBuilder` and `SubgraphSchemaEntry` are `@experimental` in `@powerhousedao/reactor-api` (powerhouse#3394).

## What it does

`TicketsSubgraph` in `src/subgraph.ts` serves a small help desk under `/graphql/tickets`:

- queries `tickets(filter)`, `ticket(id)` and `documentModels`, the last read from the host's reactor through `BaseSubgraph`'s `readClient`;
- mutations `openTicket`, `commentOnTicket` and `closeTicket`;
- a computed field `Ticket.commentCount`;
- a subscription `ticketChanged(id)`, served over the host's WebSocket endpoint.

`TicketsSdlSubgraph` in `src/schema-first.ts` is the same subgraph written schema first, on `BaseSubgraph` with SDL and a resolver map. `ph migrate --subgraphs` converts a subgraph of that style into the code-first one.

## The class

```ts
export class TicketsSubgraph extends Subgraph {
  static override readonly subgraphName = "tickets";

  readonly desk = new TicketDesk();

  static override getSchema(schema: SchemaBuilder<TicketsSubgraph>) {
    return [
      schema.query("tickets", {
        args: { filter: ph.ref(TicketFilter) },
        type: ph.list(ph.ref(Ticket, { required: true }), { required: true }),
        resolve: ({ args, subgraph }) => subgraph.desk.list(args.filter),
      }),
      schema.field(Ticket, "commentCount", {
        type: ph.Int({ required: true }),
        resolve: ({ parent }) => parent.comments.length,
      }),
      // ...
    ];
  }
}
```

- `static subgraphName` is the name the host serves the subgraph under. It must be lowercase kebab-case.
- `static getSchema(schema)` returns the entries. The builders are `schema.query`, `schema.mutation`, `schema.subscription`, `schema.field` (a computed field on an object type), `schema.resolveType` (for a union or interface) and `schema.type` (a type no field reaches).
- The types are `ph` descriptors in `src/schema.ts`: `ph.enum`, `ph.object`, `ph.input`, and field uses such as `ph.String({ required: true })`, `ph.list(...)` and `ph.ref(SomeType)`.
- Every resolver receives one object: `args`, `parent`, `request` (the host's `Context`), `info`, and `subgraph`, the served instance. Instance state (`subgraph.desk`) and `BaseSubgraph`'s members (`subgraph.readClient`, `subgraph.viewSubject(request)`, the `assertCan*` checks) are reached through `subgraph`.
- The constructor compiles the entries into `name`, `typeDefs`, `resolvers` and `hasSubscriptions`, the fields a schema-first subgraph assigns by hand. The host loads both styles through the same path, and refuses an instance that changes any of the four after construction.

### What the types check

Each line below is a compile error in the code-first class. In the schema-first twin, the same mistake compiles and fails only when the field is queried.

| Mistake | Error |
|---|---|
| `args.filter?.status === "PENDING"` | `"OPEN" \| "CLOSED" \| null \| undefined` and `"PENDING"` have no overlap |
| A `Ticket` resolver returning `{ id, title }` | the object is missing `priority`, `status`, `openedBy` and `comments` |
| A subscription that yields tickets without a `resolve` | each event must be `{ ticketChanged: ... }`, the shape GraphQL expects without `resolve` |

## Converting a schema-first subgraph

In a Powerhouse project, `ph migrate --subgraphs` converts every schema-first subgraph under `subgraphs/` into a code-first class. It then checks that the class serves the same schema, and restores the files if it does not. A subgraph it cannot convert, such as one that uses `JSONObject`, is left as it is, with the reason.

```sh
ph migrate --subgraphs --dry-run                 # print the diff, write nothing
ph migrate --subgraph tickets                    # convert subgraphs/tickets only
ph generate subgraph --name tickets --code-first # scaffold a new code-first subgraph
```

The two files in this recipe are the before and after of that conversion, written by hand. The test serves each one on its own host and compares the schemas the host serves.

## Files

| File | Contents |
|---|---|
| `src/schema.ts` | The `ph` type descriptors: `TicketPriority`, `TicketStatus`, `Ticket`, `TicketFilter` |
| `src/subgraph.ts` | `TicketsSubgraph`, the code-first class |
| `src/schema-first.ts` | `TicketsSdlSubgraph`, the schema-first twin |
| `src/desk.ts` | `TicketDesk`, the in-memory tickets and change feed both twins resolve through |
| `src/host.ts` | `startSubgraphHost`: a reactor, reactor-api's `GraphQLManager` on Express with the Apollo gateway, and a WebSocket endpoint |
| `src/subgraph.test.ts` | Schema parity between the twins, then queries, mutations, validation and subscriptions against each |
| `src/demo.ts` | Prints the compiled schema, then runs a mutation, a subscription and a query |

## Running it

```sh
pnpm test
pnpm start
```

The host binds an ephemeral port on 127.0.0.1, so no switchboard or database is needed. Auth is disabled, as on a switchboard without `AUTH_ENABLED`, so every caller is anonymous.

## Limits

- A code-first subgraph cannot yet reference document-model types or declare federation entities.
- There is no JSON scalar for code-first subgraphs. A subgraph that uses `JSONObject` stays schema-first.
