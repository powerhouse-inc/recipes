import { createFileRoute } from "@tanstack/react-router";

// A child of Connect's settings route: staticData.settings adds a tab. The page
// title becomes "Settings · Inventory · <app>" without a head.
export const Route = createFileRoute("/_app/settings/inventory")({
  staticData: {
    settings: {
      label: "Inventory",
      // Connect's own tabs use multiples of 10, from 0 to 90.
      order: 50,
      // The tab is hidden, and its URL redirects to the first tab, while this
      // is false. Connect reads it once, when it builds the tab list, so it
      // must not depend on state that arrives later, such as the drives. This
      // tab shows in studio and is hidden in a production build.
      enabled: () => import.meta.env.DEV,
    },
  },
  component: () => <div>Inventory settings</div>,
});
