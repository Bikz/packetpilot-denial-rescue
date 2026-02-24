import { expect, test } from "@playwright/test";

test("onboarding is mobile-first layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/onboarding/welcome");

  const heading = page.getByRole("heading", { name: "Welcome to PacketPilot" });
  await expect(heading).toBeVisible();

  const box = await heading.boundingBox();
  expect(box?.x ?? 0).toBeLessThan(80);
});
