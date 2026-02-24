import { expect, test } from "@playwright/test";

import { ensureAdminAndLogin } from "./helpers/auth";

test.setTimeout(90_000);

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
