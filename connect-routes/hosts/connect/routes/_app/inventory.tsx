import { getDriveName, makeDriveSlug } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BoxIcon } from "lucide-react";
import { loadDrives } from "../-drives.js";

// In _app/, so the page renders inside Connect's layout. The route id starts
// with /_app; the URL is /inventory.
export const Route = createFileRoute("/_app/inventory")({
  // Lists the page in the sidebar, after the drives.
  staticData: { nav: { label: "Inventory", icon: BoxIcon, order: 10 } },
  // The loader reads Connect's store from the router context.
  loader: async ({ context, abortController }) => ({
    drives: (await loadDrives(context, abortController.signal)).map(
      (drive) => ({
        id: drive.header.id,
        // Not header.slug, which can be empty or an opaque id.
        slug: makeDriveSlug(drive),
        name: getDriveName(drive),
        nodes: drive.state.global.nodes.length,
      }),
    ),
  }),
  head: ({ match }) => ({
    meta: [{ title: `Inventory · ${match.context.appName || "Connect"}` }],
  }),
  component: Inventory,
});

function Inventory() {
  const { drives } = Route.useLoaderData();
  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-lg font-semibold">Inventory</h1>
      <ul>
        {drives.map((drive) => (
          <li key={drive.id}>
            <Link to="/d/$driveSlug/{-$nodeSlug}" params={{ driveSlug: drive.slug }}>
              {drive.name} ({drive.nodes})
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
