"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { StepShell } from "@packetpilot/ui";

import { getSessionToken } from "@/lib/session";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const token = getSessionToken();

  useEffect(() => {
    if (!token) {
      const next = encodeURIComponent(pathname || "/settings");
      router.replace(`/login?next=${next}`);
    }
  }, [pathname, router, token]);

  if (!token) {
    return (
      <StepShell
        eyebrow="PacketPilot"
        title="Checking your session"
        description="Routing you to a secure destination..."
      >
        <p className="text-sm text-[var(--pp-color-muted)]">Please wait.</p>
      </StepShell>
    );
  }

  return <>{children}</>;
}
