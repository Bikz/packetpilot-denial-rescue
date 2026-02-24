import Link from "next/link";

import { Button, StepShell } from "@packetpilot/ui";

export default function OfflinePage() {
  return (
    <StepShell
      eyebrow="Offline"
      title="You are offline"
      description="PacketPilot shell is still available. Reconnect to sync live data."
      footer={
        <Link href="/onboarding/welcome">
          <Button>Back to onboarding</Button>
        </Link>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--pp-color-muted)]">
        This fallback route is cached by the service worker for resilient clinic workflows.
      </p>
    </StepShell>
  );
}
