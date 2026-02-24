import { expect, test } from "@playwright/test";

import { ensureAdminAndLogin } from "./helpers/auth";

test("login then save settings and show success toast", async ({ page }) => {
  await ensureAdminAndLogin(page, "/settings");

  await page.getByLabel("Deployment mode").selectOption("smart_on_fhir");
  await page.getByLabel("FHIR base URL").fill("https://fhir.sandbox.example");
  await page.getByLabel("FHIR auth type").fill("oauth2");
  await page.getByLabel("FHIR auth config (placeholder)").fill("scope=patient/*.read");
  await page.getByLabel("Model endpoint").fill("http://localhost:11434/medgemma");

  await page.getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByRole("status")).toHaveText("Settings saved successfully");
  await expect(page.getByText("settings_change · settings").first()).toBeVisible();
});
