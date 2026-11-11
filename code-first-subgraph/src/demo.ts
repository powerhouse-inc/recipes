/**
 * Serves the code-first tickets subgraph from a real reactor-api host, prints
 * the schema the host compiled from its entries, then runs a query, two
 * mutations and a subscription against it.
 */
import { startSubgraphHost } from "./host.js";
import { TicketsSubgraph } from "./subgraph.js";

async function main() {
  console.log("Code-First Subgraph Demo");
  console.log("════════════════════════\n");

  process.stdout.write("Starting reactor and GraphQL host...");
  const started = performance.now();
  const host = await startSubgraphHost("@acme/help-desk", [TicketsSubgraph]);
  console.log(` done (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  console.log(`Serving ${TicketsSubgraph.subgraphName} at ${host.origin}/graphql/tickets\n`);

  try {
    const sdl = (
      (await host.post("/graphql/tickets", "{ _service { sdl } }")).data as {
        _service: { sdl: string };
      }
    )._service.sdl;
    // The host prepends its shared scalars and document types to every
    // subgraph; the subgraph's own part starts at its Query type.
    console.log("Schema compiled from TicketsSubgraph.getSchema:\n");
    console.log(sdl.slice(sdl.indexOf("type Query")).replace(/^/gm, "  "));
    console.log();

    const opened = await host.post(
      "/graphql/tickets",
      `mutation { openTicket(title: "Printer on fire", priority: URGENT) { id status } }`,
    );
    console.log("openTicket →", JSON.stringify(opened.data));

    const events = host.subscribe(
      `subscription { ticketChanged(id: "t-1") { status commentCount } }`,
    );
    console.log("ticketChanged →", JSON.stringify((await events.next()).value));

    await host.post(
      "/graphql/tickets",
      `mutation { commentOnTicket(id: "t-1", text: "Extinguisher found") { id } }`,
    );
    console.log("ticketChanged →", JSON.stringify((await events.next()).value));
    await events.return?.();

    const listed = await host.post(
      "/graphql/tickets",
      `{ tickets(filter: { status: OPEN }) { id title commentCount } documentModels }`,
    );
    console.log("tickets, documentModels →", JSON.stringify(listed.data));
  } finally {
    await host.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
