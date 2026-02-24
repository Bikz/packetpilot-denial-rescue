import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

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

test("upload evidence, autofill fields, and inspect citation drawer", async ({ page }) => {
  await ensureAdminAndLogin(page);

  await Promise.all([
    page.waitForURL("**/cases/new", { timeout: 60_000 }),
    page.getByRole("link", { name: "New case" }).first().click(),
  ]);

  await page.getByLabel("Patient").selectOption({ index: 0 });
  await page.getByLabel("Payer").fill("Aetna Gold");
  await page.getByRole("button", { name: "Create case" }).click();

  await expect(page).toHaveURL(/\/case\/\d+$/);

  await page.getByRole("button", { name: "Evidence" }).click();

  const evidenceText = [
    "Primary diagnosis: Lumbar radiculopathy",
    "Symptom duration (weeks): 12",
    "Neurologic deficit present: yes",
    "Conservative therapy duration (weeks): 8",
    "Physical therapy trial documented: yes",
    "Date of prior imaging: 2025-10-22",
    "Clinical rationale: Persistent neurologic deficits and failed conservative treatment justify MRI authorization.",
  ].join("\n");

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "evidence-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(evidenceText, "utf-8"),
    });

  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Document uploaded");

  await page.getByRole("button", { name: "Form" }).click();
  await page.getByRole("button", { name: "Autofill from evidence" }).click();
  await expect(page.getByRole("status")).toContainText("Autofill complete");

  await expect(page.getByText("Autofilled").first()).toBeVisible();

  await page.getByRole("button", { name: "Why?" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Citation drawer" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Lumbar radiculopathy");
  const drawerSnapshot = {
    title: await drawer.getByRole("heading", { name: "Why this field was suggested" }).textContent(),
    fieldLabel: await drawer.getByText("Primary diagnosis").first().textContent(),
    openDocButtons: await drawer.getByRole("button", { name: "Open doc" }).count(),
  };
  expect(JSON.stringify(drawerSnapshot, null, 2)).toBe(
    [
      "{",
      '  "title": "Why this field was suggested",',
      '  "fieldLabel": "Primary diagnosis",',
      '  "openDocButtons": 1',
      "}",
    ].join("\n"),
  );

  await drawer.getByRole("button", { name: "Open doc" }).first().click();
  await expect(page.getByText("Active tab: Evidence")).toBeVisible();
  await expect(page.getByText("evidence-note.txt").first()).toBeVisible();
  await expect(page.getByText("Lumbar radiculopathy").first()).toBeVisible();
});
