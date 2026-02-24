"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, StepShell } from "@packetpilot/ui";

import { apiRequest } from "@/lib/api";
import { saveSession, type SessionUser } from "@/lib/session";

type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  user: SessionUser;
};

export default function LoginPage() {
  const router = useRouter();
  const nextPath =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("next") ?? "/queue")
      : "/queue";

  const [email, setEmail] = useState("admin@northwind.com");
  const [password, setPassword] = useState("super-secret-123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
      });

      saveSession({ token: response.access_token, user: response.user });
      router.replace(nextPath);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepShell
      eyebrow="PacketPilot"
      title="Sign in"
      description="Authenticate with your clinic account to continue."
      footer={
        <div className="flex items-center justify-between">
          <Link href="/onboarding/admin">
            <Button variant="ghost">Need setup?</Button>
          </Link>
          <Button form="login-form" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      }
    >
      <form id="login-form" className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm font-medium">
          <span>Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </StepShell>
  );
}
