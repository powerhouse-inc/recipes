import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ph-cli writes both files from hosts/connect/routes/ (see global-setup.ts).
// They are read as text: importing them would load the route components.
const generated = (file: string) =>
  readFileSync(new URL(`../.ph/${file}`, import.meta.url), "utf-8");

describe("the generated route tree", () => {
  it("places each route file under the parent the README names", () => {
    // The routes this package offers: { route, id, path, parentId } entries.
    const entries = [
      ...generated("connect-routes.package.ts").matchAll(
        /\{ route: \w+, id: "([^"]+)", path: "([^"]+)", parentId: "([^"]+)" \}/g,
      ),
    ].map(([, id, path, parentId]) => ({ id, path, parentId }));

    expect(entries).toEqual(
      expect.arrayContaining([
        // Outside _app/: a full page, a direct child of the root.
        { id: "/status", path: "/status", parentId: "__root__" },
        // In _app/: inside Connect's layout.
        { id: "/_app/inventory", path: "/inventory", parentId: "/_app" },
        // A child of Connect's settings route: a settings tab.
        {
          id: "/_app/settings/inventory",
          path: "/inventory",
          parentId: "/_app/settings",
        },
      ]),
    );
    expect(entries).toHaveLength(3);
  });

  it("mounts the routes at their URLs beside Connect's own", () => {
    const tree = generated("connect-routes.gen.ts");
    const body = /interface FileRoutesByFullPath \{\n([\s\S]*?)\n\}/.exec(
      tree,
    )?.[1];
    expect(body, "FileRoutesByFullPath in connect-routes.gen.ts").toBeDefined();
    const urls = [...body!.matchAll(/^\s*"([^"]+)":/gm)].map(([, url]) => url);

    expect(urls).toEqual(
      expect.arrayContaining([
        "/status",
        "/inventory",
        "/settings/inventory",
        // Connect's own routes are still there.
        "/",
        "/settings",
        "/d/$driveSlug/{-$nodeSlug}",
      ]),
    );
  });
});
