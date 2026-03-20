import { createServer, type Server } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";
import type { Kysely } from "kysely";
import type { CatalogDB } from "./schema.js";
import { createCatalogQuery, type DocumentResult } from "./query.js";

/**
 * GraphQL SDL for the document catalog subgraph.
 *
 * This is the pattern produced by `ph generate --subgraph`:
 * a schema that exposes the processor's relational data via GraphQL,
 * ready for supergraph composition.
 */
const typeDefs = /* GraphQL */ `
  type Document {
    id: String!
    documentType: String!
    name: String!
    contentSummary: String!
    revision: Int!
    updatedAt: String!
    tags: [String!]!
  }

  type Query {
    documents(limit: Int, offset: Int): [Document!]!
    document(id: String!): Document
    documentsByType(documentType: String!, limit: Int, offset: Int): [Document!]!
    documentsByTag(tag: String!, limit: Int, offset: Int): [Document!]!
  }
`;

function rowToGql(row: DocumentResult) {
  return {
    id: row.document_id,
    documentType: row.document_type,
    name: row.name,
    contentSummary: row.content_summary,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
    tags: row.tags,
  };
}

/**
 * Creates a GraphQL schema backed by the catalog query layer.
 * Can be used standalone or composed into a supergraph.
 */
export function createCatalogSchema(db: Kysely<CatalogDB>) {
  const query = createCatalogQuery(db);

  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        documents: async (
          _: unknown,
          args: { limit?: number; offset?: number },
        ) => {
          const rows = await query.allDocuments(
            args.limit ?? 50,
            args.offset ?? 0,
          );
          return rows.map(rowToGql);
        },

        document: async (_: unknown, args: { id: string }) => {
          const row = await query.documentById(args.id);
          return row ? rowToGql(row) : null;
        },

        documentsByType: async (
          _: unknown,
          args: { documentType: string; limit?: number; offset?: number },
        ) => {
          const rows = await query.documentsByType(
            args.documentType,
            args.limit ?? 50,
            args.offset ?? 0,
          );
          return rows.map(rowToGql);
        },

        documentsByTag: async (
          _: unknown,
          args: { tag: string; limit?: number; offset?: number },
        ) => {
          const rows = await query.documentsByTag(
            args.tag,
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
 * Start an HTTP server exposing the catalog GraphQL endpoint.
 * Returns the server instance so the caller can shut it down.
 */
export function startCatalogServer(db: Kysely<CatalogDB>, port: number): Server {
  const yoga = createYoga({ schema: createCatalogSchema(db) });
  const server = createServer(yoga);
  server.listen(port, () => {
    console.log(`Catalog subgraph ready at http://localhost:${port}/graphql`);
  });
  return server;
}
