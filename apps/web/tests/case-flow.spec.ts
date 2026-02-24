import { expect, test } from "@playwright/test";

import { ensureAdminAndLogin } from "./helpers/auth";

test.setTimeout(90_000);

test("create case from queue and land in workspace", async ({ page }) => {
  await ensureAdminAndLogin(page);

  await Promise.all([
    page.waitForURL("**/cases/new", { timeout: 60_000 }),
    page.getByRole("link", { name: "New case" }).first().click(),
  ]);

  await expect(page.getByRole("heading", { name: "Create prior auth case" })).toBeVisible();

  await page.getByLabel("Patient").selectOption({ index: 0 });
  await page.getByLabel("Payer").fill("Aetna Gold");
  await expect(page.getByLabel("Service line template")).toHaveValue("MRI Lumbar Spine");

  await page.getByRole("button", { name: "Create case" }).click();

  await expect(page).toHaveURL(/\/case\/\d+$/);
  await expect(page.getByRole("heading", { name: /Case #\d+/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Requirements" })).toBeVisible();
});
