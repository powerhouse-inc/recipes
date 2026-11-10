/**
 * The same tickets subgraph written schema first: SDL in `typeDefs` and a
 * resolver map in `resolvers`, on `BaseSubgraph`. This is the style
 * `ph migrate --subgraphs` starts from, and it keeps working beside
 * code-first subgraphs in the same package.
 *
 * Set it beside `subgraph.ts` to see what moves. The argument types here
 * (`TicketQuery`, the `{ id: string }` literals) are written by hand and
 * nothing checks them against the SDL; in the code-first class they are
 * inferred from the `ph` descriptors that also print the schema.
 */
import { BaseSubgraph, type Context } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import {
  TicketDesk,
  type TicketPriority,
  type TicketQuery,
  type TicketRecord,
} from "./desk.js";

export class TicketsSdlSubgraph extends BaseSubgraph {
  override name = "tickets";

  readonly desk = new TicketDesk();

  override typeDefs: DocumentNode = gql`
    type Query {
      "Tickets matching the filter, oldest first."
      tickets(filter: TicketFilter): [Ticket!]!
      ticket(id: ID!): Ticket
      "The document model types the host's reactor serves."
      documentModels: [String!]!
    }

    type Mutation {
      openTicket(title: String!, priority: TicketPriority!): Ticket!
      commentOnTicket(id: ID!, text: String!): Ticket!
      closeTicket(id: ID!): Ticket!
    }

    type Subscription {
      ticketChanged(id: ID!): Ticket!
    }

    input TicketFilter {
      status: TicketStatus
      priority: TicketPriority
    }

    enum TicketStatus {
      OPEN
      CLOSED
    }

    "How soon a ticket needs an answer."
    enum TicketPriority {
      LOW
      NORMAL
      URGENT
    }

    "A support request."
    type Ticket {
      id: ID!
      title: String!
      priority: TicketPriority!
      status: TicketStatus!
      openedBy: String!
      comments: [String!]!
      commentCount: Int!
    }
  `;

  // A schema-first subgraph that serves subscriptions says so itself; the
  // code-first constructor derives it from the entries.
  hasSubscriptions = true;

  override resolvers = {
    Query: {
      tickets: (_: unknown, args: { filter?: TicketQuery | null }) =>
        this.desk.list(args.filter),
      ticket: (_: unknown, args: { id: string }) => this.desk.get(args.id),
      documentModels: async () => {
        const modules = await this.readClient.getDocumentModelModules();
        return modules.results.map((module) => module.documentModel.global.id);
      },
    },
    Mutation: {
      openTicket: (
        _: unknown,
        args: { title: string; priority: TicketPriority },
        ctx: Context,
      ) =>
        this.desk.open(
          args.title,
          args.priority,
          this.viewSubject(ctx).address ?? "anonymous",
        ),
      commentOnTicket: (_: unknown, args: { id: string; text: string }) =>
        this.desk.comment(args.id, args.text),
      closeTicket: (_: unknown, args: { id: string }) =>
        this.desk.close(args.id),
    },
    Subscription: {
      ticketChanged: {
        subscribe: (_: unknown, args: { id: string }) =>
          this.desk.watch(args.id),
        resolve: (ticket: TicketRecord) => ticket,
      },
    },
    Ticket: {
      commentCount: (ticket: TicketRecord) => ticket.comments.length,
    },
  };
}
