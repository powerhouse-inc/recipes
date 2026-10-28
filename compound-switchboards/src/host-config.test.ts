import { checkHost, loadHost } from "@powerhousedao/host-core";
import {
  checkBoot,
  declaredHostSchema,
  hostSchema,
  type SwitchboardHost,
} from "@powerhousedao/ph-cli/runners/switchboard";
import { describe, expect, it } from "vitest";
import { projectRoot } from "./stack.js";

// Nothing here starts a server: checkHost runs `ph run`'s pipeline up to the
// verb, and the switchboard runner's schemas and checkBoot are what that
// pipeline calls for each member.

type Env = Record<string, string>;

// hosts/sb-a/host.js as `ph run` loads it, before any token is resolved.
const sbA = (await loadHost(projectRoot, "sb-a")).host as SwitchboardHost;

const stackIssues = async (env: Env) =>
  (await checkHost("stack", { projectRoot, env })).issues.map((i) => ({
    stage: i.stage,
    file: i.file,
    path: i.path,
    message: i.message,
  }));

/** sb-a with `config.switchboard` extended by `extra`. */
function withSwitchboard(extra: Record<string, unknown>) {
  return {
    ...sbA,
    config: { switchboard: { ...sbA.config?.switchboard, ...extra } },
  };
}

/** `{ a: { b: value } }` from `"a.b"`. */
function nested(dotted: string, value: unknown): Record<string, unknown> {
  return dotted
    .split(".")
    .reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Record<
    string,
    unknown
  >;
}

describe("checkHost on the compound reads both member files", () => {
  it("reports nothing for the stack under an empty env", async () => {
    expect(await stackIssues({})).toEqual([]);
  });

  it("reports an env that contradicts a member's protocol against that member", async () => {
    expect(await stackIssues({ CREATE_SIGNATURE_POLICY: "v2-required" })).toEqual([
      {
        stage: "boot",
        file: "hosts/sb-a/host.js",
        path: "reactor.protocol",
        message: expect.stringContaining(
          'CREATE_SIGNATURE_POLICY is "v2-required" in the environment but "legacy"',
        ),
      },
    ]);
    expect(await stackIssues({ REACTOR_DOCUMENT_DECISIONS: "true" })).toEqual([
      {
        stage: "boot",
        file: "hosts/sb-b/host.js",
        path: "reactor.protocol",
        message: expect.stringContaining(
          'REACTOR_DOCUMENT_DECISIONS is "true" in the environment but "false"',
        ),
      },
    ]);
  });

  it("accepts an env that matches the protocol, or sets a key no member's protocol sets", async () => {
    // a says legacy; b sets no createSignaturePolicy, so the env value is b's.
    expect(await stackIssues({ CREATE_SIGNATURE_POLICY: "legacy" })).toEqual([]);
    expect(await stackIssues({ REACTOR_AUTH_ENFORCEMENT: "true" })).toEqual([]);
  });
});

describe("config.switchboard is strict", () => {
  it.each([
    "declared",
    "resolved",
  ] as const)("accepts the sb-a fixture (%s schema)", (which) => {
    const schema = which === "declared" ? declaredHostSchema : hostSchema;
    expect(schema.safeParse(sbA).success).toBe(true);
  });

  // The keys the reactor block or the runner owns, or that are process-wide.
  it.each([
    ["logLevel", "debug"],
    ["server.port", 4001],
    ["server.dev", true],
    ["storage.reactor", { url: "/tmp/reactor" }],
    ["storage.readModel", { url: "/tmp/read-model" }],
    ["protocol", { createSignaturePolicy: "legacy" }],
    ["packages.dynamic", true],
    ["drive", { id: "x" }],
    ["remoteDrives", []],
    ["features.pluginHost", true],
    ["processorConfig", {}],
  ])("rejects config.switchboard.%s", (dotted, value) => {
    const result = hostSchema.safeParse(withSwitchboard(nested(dotted, value)));
    expect(result.success).toBe(false);
    const parts = dotted.split(".");
    const leaf = parts.pop();
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        code: "unrecognized_keys",
        path: ["config", "switchboard", ...parts],
        keys: [leaf],
      }),
    );
  });

  it("rejects a misspelled key instead of ignoring it", () => {
    const result = hostSchema.safeParse(
      withSwitchboard({ inspektion: { enabled: true } }),
    );
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ code: "unrecognized_keys", keys: ["inspektion"] }),
    );
  });

  it("types values: inspection.enabled is a boolean, not an env string", () => {
    const result = hostSchema.safeParse(
      withSwitchboard({ inspection: { enabled: "false" } }),
    );
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["config", "switchboard", "inspection", "enabled"],
        code: "invalid_type",
      }),
    );
  });

  it("refuses a key the reactor block also sets", () => {
    // sb-a's reactor block sets workflows: false, which is features.workflows.
    const result = hostSchema.safeParse(
      withSwitchboard({ features: { workflows: true } }),
    );
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["config", "switchboard"],
        message:
          "config.switchboard.features.workflows is also set by the reactor block; set it in one place.",
      }),
    );
  });

  // in-process.test.ts shows the env's PH_USER_DATA_DIR winning over it.
  it("accepts storage.userDataDir", () => {
    expect(
      hostSchema.safeParse(
        withSwitchboard({ storage: { userDataDir: "/tmp/sb-a" } }),
      ).success,
    ).toBe(true);
  });
});

describe("checkBoot on a member", () => {
  it("warns when readModel.url has no storage beside it", async () => {
    const legacy = hostSchema.parse({
      ...sbA,
      reactor: {
        ...sbA.reactor,
        backends: {
          main: { kind: "in-process", readModel: { url: "/tmp/read-model" } },
        },
      },
    });
    const issues = await checkBoot(legacy, {
      projectRoot,
      verb: "run",
      env: { PH_NO_DOTENV: "1" },
      file: "hosts/legacy/host.js",
    });
    expect(issues).toEqual([
      {
        path: "reactor.backends",
        message: expect.stringContaining(
          "reactor readModel.url (/tmp/read-model) also holds the reactor store, because no storage names one. This is deprecated",
        ),
      },
    ]);
  });
});
