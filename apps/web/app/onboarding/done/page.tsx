import Link from "next/link";

import { Button, StepShell } from "@packetpilot/ui";

export default function DonePage() {
  return (
    <StepShell
      eyebrow="Step 4 of 4"
      title="Setup complete"
      description="Your workspace is ready. Next we will route into the live queue in Epic 2."
      footer={
        <div className="flex items-center justify-between">
          <Link href="/onboarding/model">
            <Button variant="ghost">Back</Button>
          </Link>
          <Button disabled>Go to Queue (Epic 2)</Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--pp-color-muted)]">
        For now, confirm install works and verify offline fallback behavior for demo readiness.
      </p>
    </StepShell>
  );
}
