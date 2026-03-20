import { createServer, type Server } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";
import type { SyncHealthMonitor, HealthMetrics } from "./health-monitor.js";

const typeDefs = /* GraphQL */ `
  type SyncError {
    timestamp: Float!
    jobId: String!
    remoteName: String!
    documentId: String!
    error: String!
  }

  type ConnectionEntry {
    remoteName: String!
    state: String!
  }

  type SyncHealthMetrics {
    pendingCount: Int!
    successCount: Int!
    failureCount: Int!
    deadLetterCount: Int!
    connectionStates: [ConnectionEntry!]!
    recentErrors: [SyncError!]!
    healthStatus: String!
    uptimeMs: Float!
  }

  type Query {
    syncHealth: SyncHealthMetrics!
  }
`;

function metricsToGql(m: HealthMetrics) {
  return {
    ...m,
    connectionStates: Object.entries(m.connectionStates).map(
      ([remoteName, state]) => ({ remoteName, state }),
    ),
  };
}

export function createHealthSchema(monitor: SyncHealthMonitor) {
  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        syncHealth: () => metricsToGql(monitor.getMetrics()),
      },
    },
  });
}

/**
 * Start an HTTP server exposing the sync-health GraphQL endpoint.
 * Returns the server instance so the caller can shut it down.
 */
export function startHealthServer(
  monitor: SyncHealthMonitor,
  port: number,
): Server {
  const yoga = createYoga({ schema: createHealthSchema(monitor) });
  const server = createServer(yoga);
  server.listen(port, () => {
    console.log(`Health subgraph ready at http://localhost:${port}/graphql`);
  });
  return server;
}
