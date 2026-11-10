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
   * stops iterating. A change that lands while the consumer is busy is not
   * lost: the next read sees the latest state.
   */
  async *watch(id: string): AsyncGenerator<TicketRecord> {
    let changed = Promise.resolve();
    let wake = () => {};
    const listener = (changedId: string) => {
      if (changedId === id) wake();
    };
    this.#listeners.add(listener);
    try {
      for (;;) {
        await changed;
        changed = new Promise<void>((resolve) => (wake = resolve));
        const ticket = this.get(id);
        if (ticket) yield { ...ticket, comments: [...ticket.comments] };
      }
    } finally {
      this.#listeners.delete(listener);
    }
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
