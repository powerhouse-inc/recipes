import { createFileRoute, Link } from "@tanstack/react-router";
import { loadDrives } from "./-drives.js";

// Outside _app/: a full page at /status, without Connect's sidebar.
export const Route = createFileRoute("/status")({
  loader: async ({ context, abortController }) => ({
    driveCount: (await loadDrives(context, abortController.signal)).length,
  }),
  component: Status,
});

function Status() {
  const { driveCount } = Route.useLoaderData();
  return (
    <div className="p-6">
      <h1>{driveCount} drives</h1>
      <Link to="/">Back to Connect</Link>
    </div>
  );
}
