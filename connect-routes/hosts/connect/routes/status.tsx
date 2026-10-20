import { createFileRoute, Link } from "@tanstack/react-router";

// Outside _app/: a full page at /status, without Connect's sidebar.
export const Route = createFileRoute("/status")({
  loader: ({ context }) => ({ driveCount: context.store.drives?.length ?? 0 }),
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
