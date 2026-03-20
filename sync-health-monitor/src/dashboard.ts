import type { SyncHealthMonitor } from "./health-monitor.js";

const STATUS_ICON: Record<string, string> = {
  healthy: "\x1b[32m HEALTHY \x1b[0m",
  degraded: "\x1b[33m DEGRADED\x1b[0m",
  unhealthy: "\x1b[31mUNHEALTHY\x1b[0m",
};

const CONN_COLOR: Record<string, string> = {
  connected: "\x1b[32m",
  connecting: "\x1b[33m",
  reconnecting: "\x1b[33m",
  disconnected: "\x1b[31m",
  error: "\x1b[31m",
};

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

function renderVisual(monitor: SyncHealthMonitor) {
  const m = monitor.getMetrics();
  const lines: string[] = [];

  // Header
  lines.push("\x1b[2J\x1b[H"); // clear screen + move cursor to top
  lines.push(
    "Sync Health Monitor                            " +
      `uptime ${formatUptime(m.uptimeMs)}`,
  );
  lines.push("=".repeat(60));

  // Overall status
  lines.push(`  Status: ${STATUS_ICON[m.healthStatus] ?? m.healthStatus}`);
  lines.push("");

  // Counters
  lines.push("  Sync Operations");
  lines.push(
    `    pending: ${m.pendingCount}   succeeded: ${m.successCount}   failed: ${m.failureCount}`,
  );
  lines.push(`    dead letters: ${m.deadLetterCount}`);
  lines.push("");

  // Connection states
  const conns = Object.entries(m.connectionStates);
  if (conns.length > 0) {
    lines.push("  Connections");
    for (const [name, state] of conns) {
      const color = CONN_COLOR[state] ?? "";
      lines.push(`    ${name.padEnd(20)} ${color}${state}\x1b[0m`);
    }
  } else {
    lines.push("  Connections: (none)");
  }
  lines.push("");

  // Recent errors
  if (m.recentErrors.length > 0) {
    lines.push("  Recent Errors (last 5)");
    for (const err of m.recentErrors.slice(-5)) {
      const ts = new Date(err.timestamp).toISOString().slice(11, 19);
      lines.push(
        `    ${ts}  ${err.remoteName}  ${err.documentId.slice(0, 8)}..  ${err.error}`,
      );
    }
  }

  lines.push("");
  lines.push("-".repeat(60));
  lines.push("  GraphQL: http://localhost:4001/graphql   Ctrl+C to quit");

  process.stdout.write(lines.join("\n") + "\n");
}

function renderJson(monitor: SyncHealthMonitor) {
  console.log(JSON.stringify(monitor.getMetrics()));
}

/**
 * Start a long-lived dashboard that refreshes every `intervalMs`.
 * Returns a cleanup function.
 *
 * Pass `--json` to emit structured JSON lines instead of the visual dashboard.
 */
export function startDashboard(
  monitor: SyncHealthMonitor,
  intervalMs = 2000,
  json = false,
): () => void {
  const render = json ? renderJson : renderVisual;
  render(monitor);
  const timer = setInterval(() => render(monitor), intervalMs);
  return () => clearInterval(timer);
}
