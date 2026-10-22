import { expect, test } from "@playwright/test";
import { APP_READY_TIMEOUT, createLocalDrive } from "./helpers.js";

// Each test gets a fresh browser context, so it starts with no drives.

test("/status is a full page, without Connect's sidebar", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "0 drives" })).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
  await expect(
    page.locator("#sidebar"),
    "status.tsx is outside _app/, so no sidebar",
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Back to Connect" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator("#sidebar"),
    "/ renders in Connect's layout",
  ).toBeVisible();
});

test("/inventory renders in Connect's layout, with a sidebar link", async ({
  page,
}) => {
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
  await expect(
    page.locator("#sidebar"),
    "_app/inventory.tsx renders inside the layout",
  ).toBeVisible();

  // staticData.nav: an icon link, labelled by its tooltip.
  const navLink = page.locator('#sidebar a[href$="/inventory"]');
  await expect(navLink).toHaveAttribute("aria-current", "page");
  await navLink.hover();
  await expect(page.getByRole("tooltip", { name: "Inventory" })).toBeVisible();

  // head() sets the title, with the app name from the router context.
  await expect(page).toHaveTitle(/^Inventory · /);
});

// enabled() returns import.meta.env.DEV, and studio is a dev server, so the
// tab shows with no drives. A production build hides it and redirects.
test("/settings/inventory is a settings tab", async ({ page }) => {
  await page.goto("/settings/inventory");
  await expect(page.getByText("Inventory settings")).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
  await expect(page).toHaveURL(/\/settings\/inventory$/);
  await expect(
    page.locator('a[href$="/settings/inventory"]'),
    "the tab, selected",
  ).toHaveAttribute("aria-current", "page");
  // No head of its own: the settings route titles it from the tab's label.
  await expect(page).toHaveTitle(/^Settings · Inventory · /);
});

test("the loaders read the drives from Connect's store", async ({ page }) => {
  const driveName = "Recipe Drive";
  await createLocalDrive(page, driveName);

  // order: 10 puts the link after the drives.
  const hrefs = await page.locator("#sidebar a").evaluateAll((links) =>
    links.map((a) => a.getAttribute("href") ?? ""),
  );
  const driveIndex = hrefs.findIndex((href) => href.startsWith("/d/"));
  expect(driveIndex, "the drive's sidebar link").toBeGreaterThanOrEqual(0);
  expect(
    hrefs.findIndex((href) => href.endsWith("/inventory")),
  ).toBeGreaterThan(driveIndex);

  await page.locator('#sidebar a[href$="/inventory"]').click();
  await expect(page).toHaveURL(/\/inventory$/);
  // The drive's name and its node count.
  const driveLink = page.getByRole("link", { name: `${driveName} (0)` });
  await expect(driveLink).toBeVisible();
  // makeDriveSlug: the link opens the drive in Connect.
  await expect(driveLink).toHaveAttribute("href", /^\/d\/[^/]+$/);
  await driveLink.click();
  await expect(page).toHaveURL(/\/d\/[^/]+$/);

  // A cold load: the loader waits for the drive to arrive.
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "1 drives" })).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });

  await page.goto("/settings/inventory");
  await expect(page.getByText("Inventory settings")).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
  await expect(page).toHaveTitle(/^Settings · Inventory · /);
});
