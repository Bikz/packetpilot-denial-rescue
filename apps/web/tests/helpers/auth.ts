import { expect, type APIRequestContext, type Page } from "@playwright/test";

type UserCredentials = {
  email: string;
  password: string;
  fullName: string;
};

const DEFAULT_ORGANIZATION_NAME = "Northwind Clinic";

export const ADMIN_USER: UserCredentials = {
  email: "admin@northwind.com",
  password: "super-secret-123",
  fullName: "Alex Kim",
};

export const CLINICIAN_USER: UserCredentials = {
  email: "clinician@northwind.com",
  password: "clinician-secret-123",
  fullName: "Case Clinician",
};

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function signIn(page: Page, user: UserCredentials, nextPath = "/queue") {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${nextPath}`);
}

export async function ensureAdminAndLogin(page: Page, nextPath = "/queue") {
  await page.goto("/onboarding/admin");

  const bootstrapHeading = page.getByRole("heading", { name: "Create first admin account" });
  const initializedHeading = page.getByRole("heading", { name: "Workspace already initialized" });

  await expect(
    page
      .getByRole("heading")
      .filter({ hasText: /Create first admin account|Workspace already initialized/ }),
  ).toBeVisible();

  if (await bootstrapHeading.isVisible()) {
    await page.getByLabel("Organization name").fill(DEFAULT_ORGANIZATION_NAME);
    await page.getByLabel("Full name").fill(ADMIN_USER.fullName);
    await page.getByLabel("Email").fill(ADMIN_USER.email);
    await page.getByLabel("Password").fill(ADMIN_USER.password);
    await page.getByRole("button", { name: "Create admin" }).click();
    await page.waitForURL("**/onboarding/done");
  } else if (await initializedHeading.isVisible()) {
    await page.getByRole("link", { name: "Go to login" }).click();
  }

  await signIn(page, ADMIN_USER, nextPath);
}

export async function ensureClinicianUser(request: APIRequestContext) {
  const login = await request.post(`${API_BASE_URL}/auth/login`, {
    data: {
      email: ADMIN_USER.email,
      password: ADMIN_USER.password,
    },
  });
  expect(login.ok()).toBeTruthy();

  const adminToken = (await login.json()).access_token as string;
  const create = await request.post(`${API_BASE_URL}/auth/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      email: CLINICIAN_USER.email,
      full_name: CLINICIAN_USER.fullName,
      role: "clinician",
      password: CLINICIAN_USER.password,
    },
  });

  expect([201, 409]).toContain(create.status());
}
