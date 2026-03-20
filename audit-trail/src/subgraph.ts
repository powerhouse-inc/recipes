import { createServer, type Server } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";
import type { Kysely } from "kysely";
import type { AuditDB } from "./schema.js";
import { createAuditQuery, type AuditQueryResult } from "./query.js";

const typeDefs = /* GraphQL */ `
  type AuditEntry {
    id: Int!
    signerAddress: String!
    signerNetworkId: String!
    signerChainId: Int!
    appName: String!
    appKey: String!
    actionType: String!
    documentId: String!
    documentType: String!
    timestamp: String!
  }

  type Query {
    auditByUser(address: String!, limit: Int, offset: Int): [AuditEntry!]!
    auditByDocument(documentId: String!, limit: Int, offset: Int): [AuditEntry!]!
    auditByTimeRange(from: String!, to: String!, limit: Int, offset: Int): [AuditEntry!]!
  }
`;

function rowToGql(row: AuditQueryResult) {
  return {
    id: row.id,
    signerAddress: row.signer_address,
    signerNetworkId: row.signer_network_id,
    signerChainId: row.signer_chain_id,
    appName: row.app_name,
    appKey: row.app_key,
    actionType: row.action_type,
    documentId: row.document_id,
    documentType: row.document_type,
    timestamp: row.timestamp.toISOString(),
  };
}

export function createAuditSchema(db: Kysely<AuditDB>) {
  const query = createAuditQuery(db);

  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        auditByUser: async (
          _: unknown,
          args: { address: string; limit?: number; offset?: number },
        ) => {
          const rows = await query.byUser(
            args.address,
            args.limit ?? 50,
            args.offset ?? 0,
          );
          return rows.map(rowToGql);
        },

        auditByDocument: async (
          _: unknown,
          args: { documentId: string; limit?: number; offset?: number },
        ) => {
          const rows = await query.byDocument(
            args.documentId,
            args.limit ?? 50,
            args.offset ?? 0,
          );
          return rows.map(rowToGql);
        },

        auditByTimeRange: async (
          _: unknown,
          args: { from: string; to: string; limit?: number; offset?: number },
        ) => {
          const rows = await query.byTimeRange(
            new Date(args.from),
            new Date(args.to),
            args.limit ?? 50,
            args.offset ?? 0,
          );
          return rows.map(rowToGql);
        },
      },
    },
  });
}

/**
 * Start an HTTP server exposing the audit-trail GraphQL endpoint.
 * Returns the server instance so the caller can shut it down.
 */
export function startAuditServer(db: Kysely<AuditDB>, port: number): Server {
  const yoga = createYoga({ schema: createAuditSchema(db) });
  const server = createServer(yoga);
  server.listen(port, () => {
    console.log(`Audit subgraph ready at http://localhost:${port}/graphql`);
  });
  return server;
}
