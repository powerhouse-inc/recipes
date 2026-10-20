import { createFileRoute } from "@tanstack/react-router";

// A child of Connect's settings route: staticData.settings adds a tab. The page
// title becomes "Settings · Inventory · <app>" without a head.
export const Route = createFileRoute("/_app/settings/inventory")({
  staticData: {
    settings: {
      label: "Inventory",
      // Connect's own tabs use multiples of 10, from 0 to 90.
      order: 50,
      // The tab is hidden, and its URL redirects to the first tab, while this is false.
      enabled: (context) => !!context.store.drives?.length,
    },
  },
  component: () => <div>Inventory settings</div>,
});
