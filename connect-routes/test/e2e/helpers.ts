import { expect, type Page } from "@playwright/test";

// Adapted from @powerhousedao/e2e-utils (createLocalDrive), which is not on npm.

/** The first visible element waits on the dev server and the browser reactor,
 * about 3s on a warm machine. Kept short so a Connect that never starts fails
 * the run inside the recipes CI job's 600s. */
export const APP_READY_TIMEOUT = 45_000;

/** Creates a drive in the browser's own storage, from Connect's home page. */
export async function createLocalDrive(page: Page, driveName: string) {
  await page.goto("/");
  const createDrive = page.getByText("Create New Drive");
  await expect(createDrive).toBeVisible({ timeout: APP_READY_TIMEOUT });
  await createDrive.click();

  const form = page.locator('form[name="add-local-drive"]').last();
  await form.getByPlaceholder("Drive name").fill(driveName);
  await form
    .getByText("Create new drive")
    .and(page.locator("button[type=submit]"))
    .click();
  await expect(
    page.locator(`#sidebar a[href^="/d/"]`),
    "the new drive's sidebar link",
  ).toHaveCount(1);
}
