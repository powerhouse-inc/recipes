import { describe, it, expect, beforeEach } from "vitest";
import {
  EventBus,
  SyncEventTypes,
  type SyncPendingEvent,
  type SyncSucceededEvent,
  type SyncFailedEvent,
  type DeadLetterAddedEvent,
  type ConnectionStateChangedEvent,
  ChannelErrorSource,
} from "@powerhousedao/reactor";
import { SyncHealthMonitor } from "./health-monitor.js";

describe("SyncHealthMonitor", () => {
  let eventBus: EventBus;
  let monitor: SyncHealthMonitor;

  beforeEach(() => {
    eventBus = new EventBus();
    monitor = new SyncHealthMonitor(eventBus);
  });

  it("starts healthy with zero counters", () => {
    const m = monitor.getMetrics();
    expect(m.healthStatus).toBe("healthy");
    expect(m.pendingCount).toBe(0);
    expect(m.successCount).toBe(0);
    expect(m.failureCount).toBe(0);
    expect(m.deadLetterCount).toBe(0);
    expect(m.recentErrors).toHaveLength(0);
  });

  it("tracks SYNC_PENDING → pendingCount increases", async () => {
    await eventBus.emit(SyncEventTypes.SYNC_PENDING, {
      jobId: "job-1",
      syncOperationCount: 2,
      remoteNames: ["remoteB"],
    } satisfies SyncPendingEvent);

    expect(monitor.getMetrics().pendingCount).toBe(1);
  });

  it("tracks SYNC_SUCCEEDED → pendingCount decreases, successCount increases", async () => {
    await eventBus.emit(SyncEventTypes.SYNC_PENDING, {
      jobId: "job-1",
      syncOperationCount: 1,
      remoteNames: ["remoteB"],
    } satisfies SyncPendingEvent);

    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, {
      jobId: "job-1",
      syncOperationCount: 1,
    } satisfies SyncSucceededEvent);

    const m = monitor.getMetrics();
    expect(m.pendingCount).toBe(0);
    expect(m.successCount).toBe(1);
  });

  it("tracks SYNC_FAILED → failureCount increases, errors recorded", async () => {
    await eventBus.emit(SyncEventTypes.SYNC_PENDING, {
      jobId: "job-2",
      syncOperationCount: 1,
      remoteNames: ["remoteB"],
    } satisfies SyncPendingEvent);

    await eventBus.emit(SyncEventTypes.SYNC_FAILED, {
      jobId: "job-2",
      successCount: 0,
      failureCount: 1,
      errors: [
        {
          remoteName: "remoteB",
          documentId: "doc-1",
          error: "connection refused",
        },
      ],
    } satisfies SyncFailedEvent);

    const m = monitor.getMetrics();
    expect(m.pendingCount).toBe(0);
    expect(m.failureCount).toBe(1);
    expect(m.recentErrors).toHaveLength(1);
    expect(m.recentErrors[0].error).toBe("connection refused");
  });

  it("tracks DEAD_LETTER_ADDED → deadLetterCount increases", async () => {
    await eventBus.emit(SyncEventTypes.DEAD_LETTER_ADDED, {
      id: "dl-1",
      jobId: "job-3",
      remoteName: "remoteB",
      documentId: "doc-1",
      errorSource: ChannelErrorSource.Outbox,
    } satisfies DeadLetterAddedEvent);

    expect(monitor.getMetrics().deadLetterCount).toBe(1);
  });

  it("tracks CONNECTION_STATE_CHANGED → connectionStates updated", async () => {
    await eventBus.emit(SyncEventTypes.CONNECTION_STATE_CHANGED, {
      remoteName: "remoteB",
      remoteId: "r-1",
      previous: "connected",
      current: "disconnected",
      snapshot: {
        state: "disconnected",
        failureCount: 1,
        lastSuccessUtcMs: 0,
        lastFailureUtcMs: Date.now(),
        pushBlocked: false,
        pushFailureCount: 0,
      },
    } satisfies ConnectionStateChangedEvent);

    const m = monitor.getMetrics();
    expect(m.connectionStates["remoteB"]).toBe("disconnected");
  });

  it("returns degraded when a connection is disconnected", async () => {
    await eventBus.emit(SyncEventTypes.CONNECTION_STATE_CHANGED, {
      remoteName: "remoteB",
      remoteId: "r-1",
      previous: "connected",
      current: "disconnected",
      snapshot: {
        state: "disconnected",
        failureCount: 1,
        lastSuccessUtcMs: 0,
        lastFailureUtcMs: Date.now(),
        pushBlocked: false,
        pushFailureCount: 0,
      },
    } satisfies ConnectionStateChangedEvent);

    expect(monitor.getHealthStatus()).toBe("degraded");
  });

  it("returns unhealthy when a connection is in error state", async () => {
    await eventBus.emit(SyncEventTypes.CONNECTION_STATE_CHANGED, {
      remoteName: "remoteB",
      remoteId: "r-1",
      previous: "connected",
      current: "error",
      snapshot: {
        state: "error",
        failureCount: 1,
        lastSuccessUtcMs: 0,
        lastFailureUtcMs: Date.now(),
        pushBlocked: false,
        pushFailureCount: 0,
      },
    } satisfies ConnectionStateChangedEvent);

    expect(monitor.getHealthStatus()).toBe("unhealthy");
  });

  it("returns degraded when failure ratio exceeds 10%", async () => {
    // 1 success, then 1 failure → 50% failure rate
    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, {
      jobId: "j-1",
      syncOperationCount: 1,
    } satisfies SyncSucceededEvent);

    await eventBus.emit(SyncEventTypes.SYNC_FAILED, {
      jobId: "j-2",
      successCount: 0,
      failureCount: 1,
      errors: [
        { remoteName: "remoteB", documentId: "doc-1", error: "timeout" },
      ],
    } satisfies SyncFailedEvent);

    expect(monitor.getHealthStatus()).toBe("degraded");
  });

  it("returns degraded when dead letters exist", async () => {
    await eventBus.emit(SyncEventTypes.DEAD_LETTER_ADDED, {
      id: "dl-1",
      jobId: "j-1",
      remoteName: "remoteB",
      documentId: "doc-1",
      errorSource: ChannelErrorSource.Outbox,
    } satisfies DeadLetterAddedEvent);

    expect(monitor.getHealthStatus()).toBe("degraded");
  });

  it("shutdown unsubscribes from all events", async () => {
    monitor.shutdown();

    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, {
      jobId: "j-1",
      syncOperationCount: 1,
    } satisfies SyncSucceededEvent);

    // Should not have been incremented
    expect(monitor.getMetrics().successCount).toBe(0);
  });
});
