/**
 * Each subgraph is served by a real reactor-api host: the code-first class
 * and its schema-first twin, each on its own host. Every check runs against
 * both twins, so a difference between them fails the suite.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { SubgraphClass } from "@powerhousedao/reactor-api";
import { startSubgraphHost, type SubgraphHost } from "./host.js";
import { TicketsSdlSubgraph } from "./schema-first.js";
import { TicketsSubgraph } from "./subgraph.js";

const PACKAGE = "@acme/help-desk";

let hosts: SubgraphHost[] = [];
afterEach(async () => {
  await Promise.all(hosts.map((host) => host.close()));
  hosts = [];
});

async function serve(subgraphs: SubgraphClass[]) {
  const host = await startSubgraphHost(PACKAGE, subgraphs);
  hosts.push(host);
  return host;
}

const sdlOf = async (host: SubgraphHost) =>
  (
    (await host.post("/graphql/tickets", "{ _service { sdl } }")).data as {
      _service: { sdl: string };
    }
  )._service.sdl;

const TWINS: [string, SubgraphClass][] = [
  ["code-first", TicketsSubgraph],
  ["schema-first", TicketsSdlSubgraph],
];

describe("the code-first class and its schema-first twin", () => {
  it("serve the same schema", async () => {
    const codeFirst = await sdlOf(await serve([TicketsSubgraph]));
    const schemaFirst = await sdlOf(await serve([TicketsSdlSubgraph]));
    expect(codeFirst).toContain("commentCount: Int!");
    expect(codeFirst).toContain("ticketChanged(id: ID!): Ticket!");
    expect(codeFirst).toBe(schemaFirst);
  }, 60_000);
});

describe.each(TWINS)("the %s subgraph", (_label, subgraph) => {
  it("answers queries, mutations and computed fields", async () => {
    const host = await serve([subgraph]);
    const opened = await host.post(
      "/graphql/tickets",
      `mutation($title: String!) {
        openTicket(title: $title, priority: URGENT) { id status openedBy }
      }`,
      { title: "Printer on fire" },
    );
    expect(opened).toEqual({
      data: {
        openTicket: { id: "t-1", status: "OPEN", openedBy: "anonymous" },
      },
    });
    await host.post(
      "/graphql/tickets",
      `mutation { openTicket(title: "Typo on pricing page", priority: LOW) { id } }`,
    );
    await host.post(
      "/graphql/tickets",
      `mutation { commentOnTicket(id: "t-1", text: "Extinguisher found") { id } }`,
    );

    expect(
      await host.post(
        "/graphql/tickets",
        `{ tickets(filter: { priority: URGENT }) { id title commentCount } }`,
      ),
    ).toEqual({
      data: {
        tickets: [{ id: "t-1", title: "Printer on fire", commentCount: 1 }],
      },
    });
    expect(
      await host.post("/graphql/tickets", `{ ticket(id: "t-9") { id } }`),
    ).toEqual({ data: { ticket: null } });
  }, 60_000);

  it("reads the host's reactor through BaseSubgraph's readClient", async () => {
    const host = await serve([subgraph]);
    expect(
      await host.post("/graphql/tickets", "{ documentModels }"),
    ).toEqual({
      data: {
        documentModels: ["powerhouse/document-model", "powerhouse/document-drive"],
      },
    });
  }, 60_000);

  it("refuses an argument the schema does not allow", async () => {
    const host = await serve([subgraph]);
    const refused = await host.post(
      "/graphql/tickets",
      `mutation { openTicket(title: "x", priority: SOMEDAY) { id } }`,
    );
    expect(refused.data).toBeUndefined();
    expect(refused.errors?.[0]?.extensions?.code).toBe(
      "GRAPHQL_VALIDATION_FAILED",
    );
  }, 60_000);

  it("delivers subscription events over the WebSocket endpoint", async () => {
    const host = await serve([subgraph]);
    await host.post(
      "/graphql/tickets",
      `mutation { openTicket(title: "VPN down", priority: NORMAL) { id } }`,
    );
    const events = host.subscribe(
      `subscription { ticketChanged(id: "t-1") { status commentCount } }`,
    );
    // Each mutation waits for the event before it, so none can land before
    // the subscription starts or be folded into the next one.
    expect((await events.next()).value).toEqual({
      data: { ticketChanged: { status: "OPEN", commentCount: 0 } },
    });
    await host.post(
      "/graphql/tickets",
      `mutation { commentOnTicket(id: "t-1", text: "Rebooted") { id } }`,
    );
    expect((await events.next()).value).toEqual({
      data: { ticketChanged: { status: "OPEN", commentCount: 1 } },
    });
    await host.post(
      "/graphql/tickets",
      `mutation { closeTicket(id: "t-1") { id } }`,
    );
    expect((await events.next()).value).toEqual({
      data: { ticketChanged: { status: "CLOSED", commentCount: 1 } },
    });
    await events.return?.();
  }, 60_000);
});

describe("TicketDesk.watch", () => {
  it("stops while it waits for a change that never comes", async () => {
    const { TicketDesk } = await import("./desk.js");
    const desk = new TicketDesk();
    desk.open("Idle", "LOW", "anonymous");
    const watch = desk.watch("t-1");
    expect((await watch.next()).value).toMatchObject({ id: "t-1" });
    const waiting = watch.next();
    await expect(watch.return!()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await expect(waiting).resolves.toEqual({ done: true, value: undefined });
  });
});
