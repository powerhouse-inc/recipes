/**
 * The tickets subgraph, written code first.
 *
 * `static subgraphName` is the name the host serves it under
 * (`/graphql/tickets`). `static getSchema` returns its entries: each root
 * field, computed field and subscription carries its type and its resolver
 * together. The constructor the host calls compiles them into the same
 * `name`, `typeDefs`, `resolvers` and `hasSubscriptions` a schema-first
 * `BaseSubgraph` assigns by hand, so loading, the gateway and auth do not
 * change.
 *
 * Every resolver receives one object: `args` (typed from the `ph` argument
 * descriptors), `parent`, `request` (the host's `Context`), `info`, and
 * `subgraph`, the served instance. Through `subgraph` a resolver reaches
 * instance state and `BaseSubgraph`'s helpers, such as `readClient` and
 * the `assertCan*` checks.
 */
import {
  Subgraph,
  type SchemaBuilder,
  type SubgraphSchemaEntry,
} from "@powerhousedao/reactor-api";
import { ph } from "document-model";
import { TicketDesk } from "./desk.js";
import { Priority, Ticket, TicketFilter } from "./schema.js";

export class TicketsSubgraph extends Subgraph {
  static override readonly subgraphName = "tickets";

  readonly desk = new TicketDesk();

  static override getSchema(
    schema: SchemaBuilder<TicketsSubgraph>,
  ): readonly SubgraphSchemaEntry<TicketsSubgraph>[] {
    return [
      schema.query("tickets", {
        description: "Tickets matching the filter, oldest first.",
        args: { filter: ph.ref(TicketFilter) },
        type: ph.list(ph.ref(Ticket, { required: true }), { required: true }),
        // `args.filter` is typed `{ status?: "OPEN" | "CLOSED" | null, ... }`
        // from TicketFilter: no hand-written argument type.
        resolve: ({ args, subgraph }) => subgraph.desk.list(args.filter),
      }),
      schema.query("ticket", {
        args: { id: ph.ID({ required: true }) },
        type: ph.ref(Ticket),
        resolve: ({ args, subgraph }) => subgraph.desk.get(args.id),
      }),
      schema.query("documentModels", {
        description: "The document model types the host's reactor serves.",
        type: ph.list(ph.String({ required: true }), { required: true }),
        // `readClient` is BaseSubgraph's own field, reached through the
        // instance like any other.
        resolve: async ({ subgraph }) => {
          const modules = await subgraph.readClient.getDocumentModelModules();
          return modules.results.map(
            (module) => module.documentModel.global.id,
          );
        },
      }),
      schema.mutation("openTicket", {
        args: {
          title: ph.String({ required: true }),
          priority: ph.ref(Priority, { required: true }),
        },
        type: ph.ref(Ticket, { required: true }),
        resolve: ({ args, request, subgraph }) =>
          subgraph.desk.open(
            args.title,
            args.priority,
            subgraph.viewSubject(request).address ?? "anonymous",
          ),
      }),
      schema.mutation("commentOnTicket", {
        args: {
          id: ph.ID({ required: true }),
          text: ph.String({ required: true }),
        },
        type: ph.ref(Ticket, { required: true }),
        resolve: ({ args, subgraph }) =>
          subgraph.desk.comment(args.id, args.text),
      }),
      schema.mutation("closeTicket", {
        args: { id: ph.ID({ required: true }) },
        type: ph.ref(Ticket, { required: true }),
        resolve: ({ args, subgraph }) => subgraph.desk.close(args.id),
      }),
      // A computed field: added to Ticket in the served schema, resolved
      // from the parent record. `parent` is typed from Ticket's fields.
      schema.field(Ticket, "commentCount", {
        type: ph.Int({ required: true }),
        resolve: ({ parent }) => parent.comments.length,
      }),
      // A subscription is served over the host's WebSocket endpoint and the
      // subgraph's SSE stream with no other wiring. `subscribe` yields
      // tickets, so `resolve` passes each one through as the field's value.
      // Without `resolve`, each event would have to be the GraphQL payload
      // `{ ticketChanged: ticket }`, and the types require that.
      schema.subscription("ticketChanged", {
        args: { id: ph.ID({ required: true }) },
        type: ph.ref(Ticket, { required: true }),
        subscribe: ({ args, subgraph }) => subgraph.desk.watch(args.id),
        resolve: ({ parent }) => parent,
      }),
    ];
  }
}
