"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StepShell } from "@packetpilot/ui";

import { getSessionToken } from "@/lib/session";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const currentToken = getSessionToken();
    setToken(currentToken);
    setChecked(true);

    if (!currentToken) {
      const next = encodeURIComponent(pathname || "/queue");
      router.replace(`/login?next=${next}`);
    }
  }, [pathname, router]);

  if (!checked) {
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
