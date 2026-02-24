import Link from "next/link";

import { Button, StepShell } from "@packetpilot/ui";

import { InstallPrompt } from "@/components/install-prompt";

export default function WelcomePage() {
  return (
    <StepShell
      eyebrow="Onboarding"
      title="Welcome to PacketPilot"
      description="Set up your local-first prior authorization workspace in minutes."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <InstallPrompt />
          <Link href="/onboarding/deployment">
            <Button>Start Setup</Button>
          </Link>
        </div>
      }
    >
      <ul className="space-y-3 text-sm leading-relaxed text-[var(--pp-color-muted)]">
        <li>Local-first by default for sensitive clinical workflows.</li>
        <li>Built for coordinator and clinician handoffs.</li>
        <li>PWA installable shell with offline fallback support.</li>
      </ul>
    </StepShell>
  );
}
