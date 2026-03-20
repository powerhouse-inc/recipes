import {
  Mailbox,
  SyncOperation,
  ChannelError,
  ChannelErrorSource,
  type IChannel,
  type IChannelFactory,
  type ConnectionStateSnapshot,
  type ConnectionStateChangeCallback,
  type ConnectionState,
  type ISyncCursorStorage,
  type ChannelConfig,
  type RemoteFilter,
  type IOperationIndex,
} from "@powerhousedao/reactor";

// ---------------------------------------------------------------------------
// InternalChannel — direct in-process bridge between two reactors
// ---------------------------------------------------------------------------

export class InternalChannel implements IChannel {
  readonly inbox = new Mailbox();
  readonly outbox = new Mailbox();
  readonly deadLetter = new Mailbox();

  private stateCallbacks: ConnectionStateChangeCallback[] = [];
  private snapshot: ConnectionStateSnapshot = {
    state: "connected",
    failureCount: 0,
    lastSuccessUtcMs: Date.now(),
    lastFailureUtcMs: 0,
    pushBlocked: false,
    pushFailureCount: 0,
  };

  private sendFn: (items: SyncOperation[]) => void;

  constructor(send: (items: SyncOperation[]) => void) {
    this.sendFn = send;

    this.outbox.onAdded((items) => {
      try {
        this.sendFn(items);
        for (const item of items) {
          item.transported();
          item.executed();
          this.outbox.remove(item);
        }
        this.snapshot = { ...this.snapshot, lastSuccessUtcMs: Date.now() };
      } catch (err) {
        const channelError = new ChannelError(
          ChannelErrorSource.Outbox,
          err instanceof Error ? err : new Error(String(err)),
        );
        for (const item of items) {
          item.failed(channelError);
          this.outbox.remove(item);
          this.deadLetter.add(item);
        }
        this.snapshot = {
          ...this.snapshot,
          failureCount: this.snapshot.failureCount + 1,
          lastFailureUtcMs: Date.now(),
          pushFailureCount: this.snapshot.pushFailureCount + 1,
        };
      }
    });
  }

  /** Deliver operations from the peer into this channel's inbox. */
  receive(items: SyncOperation[]) {
    for (const item of items) {
      const op = new SyncOperation(
        `${item.id}-rx`,
        item.jobId,
        item.jobDependencies,
        item.remoteName,
        item.documentId,
        item.scopes,
        item.branch,
        item.operations,
      );
      this.inbox.add(op);
    }
  }

  /** Get the current send function (useful for save/restore around failures). */
  getSendFn(): (items: SyncOperation[]) => void {
    return this.sendFn;
  }

  /** Replace the send function (useful for simulating failures). */
  setSendFn(fn: (items: SyncOperation[]) => void) {
    this.sendFn = fn;
  }

  /** Simulate a connection state transition for demo purposes. */
  simulateStateChange(state: ConnectionState) {
    this.snapshot = { ...this.snapshot, state };
    for (const cb of this.stateCallbacks) {
      cb(this.snapshot);
    }
  }

  async init() {
    /* no-op for in-process channel */
  }

  async shutdown() {
    /* no-op for in-process channel */
  }

  getConnectionState(): ConnectionStateSnapshot {
    return this.snapshot;
  }

  onConnectionStateChange(callback: ConnectionStateChangeCallback): () => void {
    this.stateCallbacks.push(callback);
    return () => {
      const idx = this.stateCallbacks.indexOf(callback);
      if (idx >= 0) this.stateCallbacks.splice(idx, 1);
    };
  }
}

// ---------------------------------------------------------------------------
// Factory + registry for wiring two reactors together
// ---------------------------------------------------------------------------

/**
 * Creates a shared IChannelFactory that bridges two reactors via
 * InternalChannel instances. Channels register themselves in the shared
 * registry; the peerMapping determines which remote name delivers to which.
 *
 * Usage:
 *   const registry = new Map();
 *   const peerMap  = new Map([["remoteB","remoteA"],["remoteA","remoteB"]]);
 *   const factory  = createInternalChannelFactory(registry, peerMap);
 *   // pass `factory` to SyncBuilder.withChannelFactory() for both reactors
 */
export function createInternalChannelFactory(
  registry: Map<string, InternalChannel>,
  peerMapping: Map<string, string>,
): IChannelFactory {
  return {
    instance(
      _remoteId: string,
      remoteName: string,
      _config: ChannelConfig,
      _cursorStorage: ISyncCursorStorage,
      _collectionId: string,
      _filter: RemoteFilter,
      _operationIndex: IOperationIndex,
    ): InternalChannel {
      const channel = new InternalChannel((items) => {
        const peerName = peerMapping.get(remoteName);
        const peer = peerName ? registry.get(peerName) : undefined;
        if (!peer) {
          throw new Error(
            `Peer channel '${peerName}' not found for remote '${remoteName}'`,
          );
        }
        peer.receive(items);
      });
      registry.set(remoteName, channel);
      return channel;
    },
  };
}
