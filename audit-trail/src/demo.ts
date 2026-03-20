import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import {
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  documentModelCreateDocument,
} from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import type { AuditDB } from "./schema.js";
import { up } from "./migrations.js";
import { createAuditTrailFactory } from "./processor.js";
import { createAuditQuery } from "./query.js";

const USER_ADDRESS = "eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

async function main() {
  console.log("Audit Trail Demo");
  console.log("═════════════════\n");

  // 1. Set up PGlite + Kysely for audit log
  const pglite = new KyselyPGlite();
  const db = new Kysely<AuditDB>({ dialect: pglite.dialect });
  await up(db);
  console.log("Audit log schema created");

  // 2. Set up signer so operations carry signer context
  const keyStorage = new MemoryKeyStorage();
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyStorage)
    .build();
  const signer = new RenownCryptoSigner(renownCrypto, "demo-audit-app", {
    address: USER_ADDRESS,
    networkId: "eip155",
    chainId: 1,
  });

  // 3. Build reactor client (auto-signs operations)
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const clientModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModels([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
      ]),
    )
    .withSigner(signer)
    .buildModule();
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  const { client, reactorModule } = clientModule;
  const processorManager = reactorModule!.processorManager;

  // 4. Register audit trail processor
  await processorManager.registerFactory(
    "audit-trail",
    createAuditTrailFactory({
      db,
      filter: { branch: ["main"] },
    }),
  );
  console.log("Registered audit-trail processor");

  // 5. Create a drive and some documents (auto-signed, triggers audit logging)
  process.stdout.write("\nCreating drive...");
  const drive = await client.create(driveCreateDocument());
  const driveId = drive.header.id;
  console.log(` ${driveId}`);

  console.log("Creating documents...");
  for (let i = 0; i < 3; i++) {
    const doc = await client.createDocumentInDrive(
      driveId,
      documentModelCreateDocument(),
    );
    console.log(`  Document ${i + 1}: ${doc.header.id}`);
  }

  // 6. Wait for processor to handle operations
  await new Promise<void>((r) => setTimeout(r, 1000));

  // 7. Query audit log
  const query = createAuditQuery(db);
  const entries = await query.byUser(USER_ADDRESS);
  console.log(`\nAudit log entries for ${USER_ADDRESS}: ${entries.length}`);
  for (const entry of entries) {
    console.log(`  [${entry.timestamp.toISOString()}] ${entry.action_type} on ${entry.document_id} (${entry.document_type})`);
    console.log(`    app: ${entry.app_name}  signer: ${entry.signer_address}`);
  }

  if (entries.length === 0) {
    console.log("  (no entries — processor may not have received signed operations)");
  }

  console.log("\n✓ Demo complete");

  // 8. Cleanup
  await db.destroy();
  clientModule.reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
