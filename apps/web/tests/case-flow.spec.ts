import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

async function ensureAdminAndLogin(page: import("@playwright/test").Page) {
  await page.goto("/onboarding/admin");

  const bootstrapHeading = page.getByRole("heading", { name: "Create first admin account" });
  const initializedHeading = page.getByRole("heading", { name: "Workspace already initialized" });

  await expect(
    page
      .getByRole("heading")
      .filter({ hasText: /Create first admin account|Workspace already initialized/ }),
  ).toBeVisible();

  if (await bootstrapHeading.isVisible()) {
    await page.getByLabel("Organization name").fill("Northwind Clinic");
    await page.getByLabel("Full name").fill("Alex Kim");
    await page.getByLabel("Email").fill("admin@northwind.com");
    await page.getByLabel("Password").fill("super-secret-123");
    await page.getByRole("button", { name: "Create admin" }).click();
    await page.waitForURL("**/onboarding/done");
  } else if (await initializedHeading.isVisible()) {
    await page.getByRole("link", { name: "Go to login" }).click();
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@northwind.com");
  await page.getByLabel("Password").fill("super-secret-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/queue");
}

test("create case from queue and land in workspace", async ({ page }) => {
  await ensureAdminAndLogin(page);

  await Promise.all([
    page.waitForURL("**/cases/new", { timeout: 60_000 }),
    page.getByRole("link", { name: "New case" }).first().click(),
  ]);

  await expect(page.getByRole("heading", { name: "Create prior auth case" })).toBeVisible();

  await page.getByLabel("Patient").selectOption({ index: 0 });
  await page.getByLabel("Payer").fill("Aetna Gold");
  await page.getByLabel("Service line template").selectOption("imaging-mri-lumbar-spine");

  await page.getByRole("button", { name: "Create case" }).click();

  await expect(page).toHaveURL(/\/case\/\d+$/);
  await expect(page.getByRole("heading", { name: /Case #\d+/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Requirements" })).toBeVisible();
});
