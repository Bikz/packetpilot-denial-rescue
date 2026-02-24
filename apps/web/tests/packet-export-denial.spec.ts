import { expect, test } from "@playwright/test";

import {
  CLINICIAN_USER,
  ensureAdminAndLogin,
  ensureClinicianUser,
  signIn,
} from "./helpers/auth";

test.setTimeout(180_000);

async function createCaseAndRunAutofill(page: import("@playwright/test").Page): Promise<string> {
  await Promise.all([
    page.waitForURL("**/cases/new", { timeout: 60_000 }),
    page.getByRole("link", { name: "New case" }).first().click(),
  ]);

  await page.getByLabel("Patient").selectOption({ index: 0 });
  await page.getByLabel("Payer").fill("Aetna Gold");
  await page.getByRole("button", { name: "Create case" }).click();
  await expect(page).toHaveURL(/\/case\/\d+$/);
  const caseUrl = page.url();

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

  return caseUrl;
}

async function loginClinicianAndAttest(page: import("@playwright/test").Page, caseUrl: string) {
  await page.evaluate(() => window.localStorage.clear());
  await signIn(page, CLINICIAN_USER);
  await page.goto(caseUrl);

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Attest as clinician" }).click();
  await expect(page.getByRole("status")).toContainText("Case attested successfully");
}

test("journey A: generate initial packet export with metrics artifacts", async ({
  page,
  request,
}) => {
  await ensureAdminAndLogin(page);
  await ensureClinicianUser(request);

  const caseUrl = await createCaseAndRunAutofill(page);
  await loginClinicianAndAttest(page, caseUrl);

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: "Generate packet export" }).click();
  await expect(page.getByRole("status")).toContainText("Packet generated");

  await expect(page.getByText("Generated exports")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download packet.json" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download metrics.json" }).first()).toBeVisible();
});

test("journey B: denial upload to appeal packet export", async ({ page, request }) => {
  await ensureAdminAndLogin(page);
  await ensureClinicianUser(request);

  const caseUrl = await createCaseAndRunAutofill(page);

  await page.goto(caseUrl);
  await page.getByRole("button", { name: "Evidence" }).click();
  const denialText = [
    "Reference ID: DEN-2026-041",
    "Deadline: 2026-03-10",
    "Denial reason: Medical necessity was not established due to missing documentation.",
    "Please provide:",
    "- Updated clinical note",
    "- Prior imaging report",
    "- Conservative therapy documentation",
  ].join("\n");

  await page
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles({
      name: "denial-letter.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(denialText, "utf-8"),
    });
  await page.getByRole("button", { name: "Upload denial letter" }).click();
  await expect(page.getByRole("status")).toContainText("Denial letter parsed");
  await expect(page.getByRole("heading", { name: "Gap report" })).toBeVisible();

  await loginClinicianAndAttest(page, caseUrl);
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: "Generate appeal packet" }).click();
  await expect(page.getByRole("status")).toContainText("Appeal packet generated");
  await expect(page.getByText("Appeal packet").first()).toBeVisible();
});
