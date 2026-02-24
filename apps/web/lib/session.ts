export type UserRole = "coordinator" | "clinician" | "admin";

export type SessionUser = {
  id: number;
  org_id: number;
  email: string;
  full_name: string;
  role: UserRole;
};

export type AuthSession = {
  token: string;
  user: SessionUser;
};

const TOKEN_KEY = "packetpilot.auth.token";
const USER_KEY = "packetpilot.auth.user";

function inBrowser() {
  return typeof window !== "undefined";
}

export function saveSession(session: AuthSession) {
  if (!inBrowser()) return;
  window.localStorage.setItem(TOKEN_KEY, session.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  if (!inBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getSessionToken(): string | null {
  if (!inBrowser()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (!inBrowser()) return null;

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    clearSession();
    return null;
  }
}
