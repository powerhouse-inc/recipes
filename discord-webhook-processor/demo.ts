import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  ReactorBuilder,
  JobAwaiter,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";
import { createDiscordWebhookFactory } from "./discord-webhook-processor.js";

const WEBHOOK_PORT = 9123;
const WEBHOOK_SECRET = "demo-secret";

// --- Mock Discord webhook server ---
function startMockWebhook(): Promise<ReturnType<typeof createServer>> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        const payload = JSON.parse(body);
        const signature = req.headers["x-reactor-signature"];
        console.log(`\n  Webhook received (signature: ${String(signature).slice(0, 16)}...):`);
        for (const embed of payload.embeds) {
          const docId = embed.fields.find((f: { name: string }) => f.name === "Document ID")?.value ?? "?";
          const docType = embed.fields.find((f: { name: string }) => f.name === "Document Type")?.value ?? "?";
          console.log(`    ${embed.title} — doc=${docId} type=${docType}`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    });
    server.listen(WEBHOOK_PORT, () => resolve(server));
  });
}

async function main() {
  console.log("Discord Webhook Processor Demo");
  console.log("══════════════════════════════\n");

  // 1. Start mock webhook server
  const server = await startMockWebhook();
  console.log(`Mock Discord webhook listening on port ${WEBHOOK_PORT}`);

  // 2. Build reactor
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const reactorModule = await new ReactorBuilder()
    .withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ])
    .buildModule();
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  const { reactor, eventBus, processorManager } = reactorModule;
  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  // 3. Register discord webhook processor
  await processorManager.registerFactory(
    "discord-webhook",
    createDiscordWebhookFactory({
      webhookUrl: `http://localhost:${WEBHOOK_PORT}`,
      secret: WEBHOOK_SECRET,
      filter: { branch: ["main"] },
    }),
  );
  console.log("Registered discord-webhook processor");

  // 4. Create a drive (triggers processor)
  process.stdout.write("\nCreating drive...");
  const driveDoc = driveCreateDocument();
  const driveJob = await reactor.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);
  console.log(` ${driveDoc.header.id}`);

  // 5. Wait for async processor delivery
  await new Promise<void>((r) => setTimeout(r, 1000));

  // 6. Summary
  console.log("\n✓ Demo complete — webhook payloads printed above");

  // 7. Cleanup
  jobAwaiter.shutdown();
  server.close();
  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
