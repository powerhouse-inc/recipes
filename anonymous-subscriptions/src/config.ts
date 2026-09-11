// Two Switchboards: one admits anonymous callers, one refuses them.

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

/** The address the demo mints a bearer for. Pass it to Switchboard as ADMINS. */
export const ADMIN_ADDRESS = "0xa11ce00000000000000000000000000000000001";

/** The drive Switchboard creates at boot. Both documents are created under it. */
export const DRIVE = "powerhouse";

/** Only these two documents are watched, so unrelated traffic stays out. */
export const DOCUMENT_TYPE = "powerhouse/reactor-group";

export const open = {
  http: arg("open-http", "http://localhost:4101/graphql"),
  ws: arg("open-ws", "ws://localhost:4101/graphql/subscriptions"),
};

export const requireAuth = {
  http: arg("require-auth-http", "http://localhost:4102/graphql"),
  ws: arg("require-auth-ws", "ws://localhost:4102/graphql/subscriptions"),
};

// A Switchboard without the fix, for the contrast. Off unless a URL is passed.
export const preFix = {
  http: arg("pre-fix-http", ""),
  ws: arg("pre-fix-ws", ""),
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function log(line: string): void {
  console.log(`[${stamp()}] ${line}`);
}
