"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, StepShell } from "@packetpilot/ui";

import { apiRequest } from "@/lib/api";
import { saveSession, type SessionUser } from "@/lib/session";

type BootstrapStatus = { needs_bootstrap: boolean };

type BootstrapResponse = {
  access_token: string;
  token_type: "bearer";
  user: SessionUser;
};

export default function OnboardingAdminPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [organizationName, setOrganizationName] = useState("Northwind Clinic");
  const [fullName, setFullName] = useState("Alex Kim");
  const [email, setEmail] = useState("admin@northwind.com");
  const [password, setPassword] = useState("super-secret-123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiRequest<BootstrapStatus>("/auth/bootstrap-status")
      .then(setStatus)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load status");
      });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await apiRequest<BootstrapResponse>("/auth/bootstrap", {
        method: "POST",
        body: {
          organization_name: organizationName,
          full_name: fullName,
          email,
          password,
        },
      });

      saveSession({ token: response.access_token, user: response.user });
      router.push("/onboarding/done");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Bootstrap failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === null) {
    return (
      <StepShell
        eyebrow="Step 4 of 5"
        title="Checking bootstrap status"
        description="Preparing admin setup form..."
      >
        <p className="text-sm text-[var(--pp-color-text)]">Please wait.</p>
      </StepShell>
    );
  }

  if (!status.needs_bootstrap) {
    return (
      <StepShell
        eyebrow="Step 4 of 5"
        title="Workspace already initialized"
        description="An admin account already exists for this installation."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/onboarding/model">
              <Button variant="ghost">Back</Button>
            </Link>
            <Link href="/login">
              <Button>Go to login</Button>
            </Link>
          </div>
        }
      >
        <p className="text-sm text-[var(--pp-color-text)]">
          Continue by signing in with your existing clinic admin account.
        </p>
      </StepShell>
    );
  }

  return (
    <StepShell
      eyebrow="Step 4 of 5"
      title="Create first admin account"
      description="Set up your clinic tenant and the first admin user."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/onboarding/model">
            <Button variant="ghost">Back</Button>
          </Link>
          <Button form="bootstrap-form" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create admin"}
          </Button>
        </div>
      }
    >
      <form id="bootstrap-form" className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm font-medium">
          <span>Organization name</span>
          <input
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            required
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-background)] px-3"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Full name</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-background)] px-3"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-background)] px-3"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-background)] px-3"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </StepShell>
  );
}
