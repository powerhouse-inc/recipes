import { parseArgs } from "node:util";
import { resolve } from "node:path";
import {
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "document-drive";
import { exportWithReactor } from "./export-reactor.js";
import { exportWithClient } from "./export-client.js";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "./output" },
    mode: { type: "string", default: "reactor" },
  },
});

const outDir = resolve(values.out!);
const mode = values.mode as "reactor" | "client";

if (mode !== "reactor" && mode !== "client") {
  console.error(`Unknown mode "${mode}". Use "reactor" or "client".`);
  process.exit(1);
}

async function main() {
  console.log("Document Snapshot Exporter");
  console.log("═════════════════════════\n");
  console.log(`Mode:   ${mode}`);
  console.log(`Output: ${outDir}\n`);

  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ];

  const t0 = performance.now();

  if (mode === "reactor") {
    // Build the low-level reactor directly. This gives us an IReactor
    // and IEventBus — full control over jobs and consistency tokens.
    process.stdout.write("Starting reactor...");
    const reactorModule = await new ReactorBuilder()
      .withDocumentModels(documentModels)
      .buildModule();
    console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

    const result = await exportWithReactor(
      reactorModule.reactor,
      reactorModule.eventBus,
      outDir,
    );

    console.log(`\n✓ Exported ${result.docIds.length} documents + 1 drive`);
    console.log("\n  [reactor mode] You saw consistency tokens passed");
    console.log("  explicitly to every read call. This is the low-level");
    console.log("  API — you control exactly when to wait and what to read.\n");

    reactorModule.reactor.kill();
  } else {
    // Build via ReactorClientBuilder, which wraps IReactor with
    // IReactorClient. The client handles job awaiting, consistency,
    // and signing automatically.
    process.stdout.write("Starting reactor client...");
    const clientModule = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModels(documentModels),
      )
      .buildModule();
    console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

    const result = await exportWithClient(clientModule.client, outDir);

    console.log(`\n✓ Exported ${result.docIds.length} documents + 1 drive`);
    console.log("\n  [client mode] No consistency tokens were needed —");
    console.log("  IReactorClient awaits jobs and manages consistency");
    console.log("  internally. Simpler API, less control.\n");

    clientModule.reactor.kill();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
