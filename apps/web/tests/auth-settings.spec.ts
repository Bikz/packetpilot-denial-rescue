import { expect, test } from "@playwright/test";

test("login then save settings and show success toast", async ({ page }) => {
  await page.goto("/onboarding/admin");

  const bootstrapHeading = page.getByRole("heading", { name: "Create first admin account" });
  const initializedHeading = page.getByRole("heading", { name: "Workspace already initialized" });

  await expect(
    page.getByRole("heading").filter({ hasText: /Create first admin account|Workspace already initialized/ }),
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

  await page.goto("/login?next=%2Fsettings");
  await page.getByLabel("Email").fill("admin@northwind.com");
  await page.getByLabel("Password").fill("super-secret-123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/settings");

  await page.getByLabel("Deployment mode").selectOption("smart_on_fhir");
  await page.getByLabel("FHIR base URL").fill("https://fhir.sandbox.example");
  await page.getByLabel("FHIR auth type").fill("oauth2");
  await page.getByLabel("FHIR auth config (placeholder)").fill("scope=patient/*.read");
  await page.getByLabel("Model endpoint").fill("http://localhost:11434/medgemma");

  await page.getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByRole("status")).toHaveText("Settings saved successfully");
  await expect(page.getByText("settings_change · settings").first()).toBeVisible();
});
