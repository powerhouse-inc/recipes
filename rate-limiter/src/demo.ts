import {
  ReactorBuilder,
  ReactorClientBuilder,
  JobAwaiter,
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
import { AuthService } from "./auth-service.js";
import { createRateLimiterFactory } from "./rate-limiter-processor.js";

const USER_ADDRESS = "eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

async function main() {
  console.log("Rate Limiter Demo");
  console.log("═════════════════\n");

  // 1. Set up signer so operations carry signer context
  const keyStorage = new MemoryKeyStorage();
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyStorage)
    .build();
  const signer = new RenownCryptoSigner(renownCrypto, "demo-rate-limiter", {
    address: USER_ADDRESS,
    networkId: "eip155",
    chainId: 1,
  });

  // 2. Build reactor client (auto-signs operations)
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

  // 3. Set up AuthService and register rate limiter processor
  const authService = new AuthService();
  await processorManager.registerFactory(
    "rate-limiter",
    createRateLimiterFactory({
      authService,
      maxOperations: 2,
      windowMs: 60_000,
      cooldownMs: 10_000,
      filter: { branch: ["main"] },
    }),
  );
  console.log("Registered rate-limiter (maxOperations: 2, cooldown: 10s)\n");

  // 4. Create a drive
  process.stdout.write("Creating drive...");
  const drive = await client.create(driveCreateDocument());
  const driveId = drive.header.id;
  console.log(` ${driveId}`);

  // 5. Check before — should be allowed
  let check = authService.isAllowed(USER_ADDRESS);
  console.log(`\nBefore operations: allowed=${check.allowed}`);

  // 6. Push operations to trigger rate limit
  console.log("\nCreating documents to exceed rate limit...");
  for (let i = 0; i < 3; i++) {
    const doc = await client.createDocumentInDrive(
      driveId,
      documentModelCreateDocument(),
    );
    console.log(`  Document ${i + 1}: ${doc.header.id}`);

    // Give processor time to handle
    await new Promise<void>((r) => setTimeout(r, 500));

    check = authService.isAllowed(USER_ADDRESS);
    console.log(`    → allowed=${check.allowed}${check.retryAfterMs ? ` retryAfterMs=${check.retryAfterMs}` : ""}`);
  }

  // 7. Summary
  check = authService.isAllowed(USER_ADDRESS);
  console.log(`\n${check.allowed ? "✗ User was NOT rate-limited (unexpected)" : "✓ User rate-limited"} — retryAfterMs=${check.retryAfterMs}`);

  // 8. Cleanup
  clientModule.reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
