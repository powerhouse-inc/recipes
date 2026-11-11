/**
 * The subgraph's types, as `ph` descriptors. Each one is a value: the
 * subgraph's entries reference it with `ph.ref`, and the compiler prints it
 * into the served SDL. TypeScript infers resolver arguments and return types
 * from the same values, so the schema and the resolvers cannot drift apart.
 */
import { ph } from "document-model";

export const Priority = ph.enum("TicketPriority", {
  description: "How soon a ticket needs an answer.",
  values: ["LOW", "NORMAL", "URGENT"],
});

export const Status = ph.enum("TicketStatus", {
  values: ["OPEN", "CLOSED"],
});

export const Ticket = ph.object("Ticket", {
  description: "A support request.",
  fields: {
    id: ph.ID({ required: true }),
    title: ph.String({ required: true }),
    priority: ph.ref(Priority, { required: true }),
    status: ph.ref(Status, { required: true }),
    openedBy: ph.String({ required: true }),
    comments: ph.list(ph.String({ required: true }), { required: true }),
  },
});

export const TicketFilter = ph.input("TicketFilter", {
  fields: {
    status: ph.ref(Status),
    priority: ph.ref(Priority),
  },
});
