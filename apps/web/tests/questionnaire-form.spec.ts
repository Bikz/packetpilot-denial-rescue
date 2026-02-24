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

test("render questionnaire form and persist manual answers", async ({ page }) => {
  await ensureAdminAndLogin(page);

  await Promise.all([
    page.waitForURL("**/cases/new", { timeout: 60_000 }),
    page.getByRole("link", { name: "New case" }).first().click(),
  ]);

  await page.getByLabel("Patient").selectOption({ index: 0 });
  await page.getByLabel("Payer").fill("Aetna Gold");
  await page.getByRole("button", { name: "Create case" }).click();

  await expect(page).toHaveURL(/\/case\/\d+$/);
  const caseUrl = page.url();

  await page.getByRole("button", { name: "Form" }).click();
  await expect(page.getByRole("heading", { name: "Questionnaire" })).toBeVisible();

  await page.getByLabel("Primary diagnosis *").fill("Lumbar radiculopathy");
  await page
    .getByLabel("Field state")
    .first()
    .selectOption("verified");
  await page.getByLabel("Field note").first().fill("Pulled from latest progress note");

  await page
    .getByRole("button", { name: "Save answers" })
    .evaluate((button) => (button as HTMLButtonElement).click());

  await page.goto(caseUrl);
  await page.getByRole("button", { name: "Form" }).click();
  await expect(page.getByLabel("Primary diagnosis *")).toHaveValue("Lumbar radiculopathy");
});
