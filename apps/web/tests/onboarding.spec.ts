import { expect, test } from "@playwright/test";

test("loads onboarding welcome route", async ({ page }) => {
  await page.goto("/onboarding/welcome");

  await expect(page.getByRole("heading", { name: "Welcome to PacketPilot" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Setup" })).toBeVisible();
});
