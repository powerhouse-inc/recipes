import {
  SyncEventTypes,
  type IEventBus,
  type Unsubscribe,
  type SyncPendingEvent,
  type SyncSucceededEvent,
  type SyncFailedEvent,
  type DeadLetterAddedEvent,
  type ConnectionStateChangedEvent,
  type ConnectionState,
} from "@powerhousedao/reactor";

export type SyncError = {
  timestamp: number;
  jobId: string;
  remoteName: string;
  documentId: string;
  error: string;
};

export type HealthMetrics = {
  pendingCount: number;
  successCount: number;
  failureCount: number;
  deadLetterCount: number;
  connectionStates: Record<string, ConnectionState>;
  recentErrors: SyncError[];
  healthStatus: HealthStatus;
  uptimeMs: number;
};

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

const MAX_RECENT_ERRORS = 50;

export class SyncHealthMonitor {
  private readonly unsubscribes: Unsubscribe[] = [];
  private readonly startTime = Date.now();

  private readonly pendingJobs = new Set<string>();
  private successCount = 0;
  private failureCount = 0;
  private deadLetterCount = 0;
  private readonly connectionStates = new Map<string, ConnectionState>();
  private readonly recentErrors: SyncError[] = [];

  constructor(eventBus: IEventBus) {
    this.unsubscribes.push(
      eventBus.subscribe<SyncPendingEvent>(
        SyncEventTypes.SYNC_PENDING,
        (_type, event) => this.onSyncPending(event),
      ),
      eventBus.subscribe<SyncSucceededEvent>(
        SyncEventTypes.SYNC_SUCCEEDED,
        (_type, event) => this.onSyncSucceeded(event),
      ),
      eventBus.subscribe<SyncFailedEvent>(
        SyncEventTypes.SYNC_FAILED,
        (_type, event) => this.onSyncFailed(event),
      ),
      eventBus.subscribe<DeadLetterAddedEvent>(
        SyncEventTypes.DEAD_LETTER_ADDED,
        (_type, event) => this.onDeadLetterAdded(event),
      ),
      eventBus.subscribe<ConnectionStateChangedEvent>(
        SyncEventTypes.CONNECTION_STATE_CHANGED,
        (_type, event) => this.onConnectionStateChanged(event),
      ),
    );
  }

  private onSyncPending(event: SyncPendingEvent) {
    this.pendingJobs.add(event.jobId);
  }

  private onSyncSucceeded(event: SyncSucceededEvent) {
    this.pendingJobs.delete(event.jobId);
    this.successCount++;
  }

  private onSyncFailed(event: SyncFailedEvent) {
    this.pendingJobs.delete(event.jobId);
    this.failureCount++;
    for (const err of event.errors) {
      this.pushError({
        timestamp: Date.now(),
        jobId: event.jobId,
        remoteName: err.remoteName,
        documentId: err.documentId,
        error: err.error,
      });
    }
  }

  private onDeadLetterAdded(_event: DeadLetterAddedEvent) {
    this.deadLetterCount++;
  }

  private onConnectionStateChanged(event: ConnectionStateChangedEvent) {
    this.connectionStates.set(event.remoteName, event.current);
  }

  private pushError(error: SyncError) {
    this.recentErrors.push(error);
    if (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
  }

  getHealthStatus(): HealthStatus {
    for (const state of this.connectionStates.values()) {
      if (state === "error") return "unhealthy";
    }

    for (const state of this.connectionStates.values()) {
      if (state === "disconnected" || state === "reconnecting")
        return "degraded";
    }

    const total = this.successCount + this.failureCount;
    if (total > 0 && this.failureCount / total > 0.1) return "degraded";

    if (this.deadLetterCount > 0) return "degraded";

    return "healthy";
  }

  getMetrics(): HealthMetrics {
    return {
      pendingCount: this.pendingJobs.size,
      successCount: this.successCount,
      failureCount: this.failureCount,
      deadLetterCount: this.deadLetterCount,
      connectionStates: Object.fromEntries(this.connectionStates),
      recentErrors: [...this.recentErrors],
      healthStatus: this.getHealthStatus(),
      uptimeMs: Date.now() - this.startTime,
    };
  }

  shutdown() {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
  }
}
