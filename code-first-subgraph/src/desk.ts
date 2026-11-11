/**
 * The help desk both subgraphs serve: an in-memory ticket list with a change
 * feed. Both twins resolve through this class, so any difference between
 * their answers comes from the subgraph layer, not from the data.
 */

export type TicketPriority = "LOW" | "NORMAL" | "URGENT";
export type TicketStatus = "OPEN" | "CLOSED";

export type TicketRecord = {
  id: string;
  title: string;
  priority: TicketPriority;
  status: TicketStatus;
  openedBy: string;
  comments: string[];
};

export type TicketQuery = {
  status?: TicketStatus | null;
  priority?: TicketPriority | null;
};

export class TicketDesk {
  readonly #tickets = new Map<string, TicketRecord>();
  readonly #listeners = new Set<(id: string) => void>();
  #next = 1;

  list(filter: TicketQuery | null | undefined): TicketRecord[] {
    return [...this.#tickets.values()].filter(
      (ticket) =>
        (filter?.status == null || ticket.status === filter.status) &&
        (filter?.priority == null || ticket.priority === filter.priority),
    );
  }

  get(id: string): TicketRecord | null {
    return this.#tickets.get(id) ?? null;
  }

  open(title: string, priority: TicketPriority, openedBy: string): TicketRecord {
    const ticket: TicketRecord = {
      id: `t-${this.#next++}`,
      title,
      priority,
      status: "OPEN",
      openedBy,
      comments: [],
    };
    this.#tickets.set(ticket.id, ticket);
    this.#notify(ticket.id);
    return ticket;
  }

  comment(id: string, text: string): TicketRecord {
    const ticket = this.#require(id);
    ticket.comments.push(text);
    this.#notify(id);
    return ticket;
  }

  close(id: string): TicketRecord {
    const ticket = this.#require(id);
    ticket.status = "CLOSED";
    this.#notify(id);
    return ticket;
  }

  /**
   * The ticket now, then again after each change to it, until the consumer
   * calls `return()`. A change that lands while the consumer is busy is not
   * lost: the next read sees the latest state.
   *
   * A hand-written iterator rather than an async generator: a generator
   * parked on `await` ignores `return()` until its next `yield`, so a
   * subscription to an idle ticket could never be stopped, and the host's
   * shutdown waits on that `return()`.
   */
  watch(id: string): AsyncIterableIterator<TicketRecord> {
    let pending = true; // the first read is the current state
    let stopped = false;
    let wake: (() => void) | undefined;
    const listener = (changedId: string) => {
      if (changedId !== id) return;
      pending = true;
      wake?.();
    };
    this.#listeners.add(listener);

    const iterator: AsyncIterableIterator<TicketRecord> = {
      next: async () => {
        while (!stopped) {
          if (pending) {
            pending = false;
            const ticket = this.get(id);
            if (ticket) {
              return {
                done: false,
                value: { ...ticket, comments: [...ticket.comments] },
              };
            }
            continue;
          }
          await new Promise<void>((resolve) => (wake = resolve));
          wake = undefined;
        }
        return { done: true, value: undefined };
      },
      return: async () => {
        stopped = true;
        this.#listeners.delete(listener);
        wake?.();
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]: () => iterator,
    };
    return iterator;
  }

  #require(id: string): TicketRecord {
    const ticket = this.#tickets.get(id);
    if (!ticket) throw new Error(`No ticket ${id}`);
    return ticket;
  }

  #notify(id: string) {
    for (const listener of this.#listeners) listener(id);
  }
}
