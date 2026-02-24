import Link from "next/link";

import { Button, StepShell } from "@packetpilot/ui";

export default function DonePage() {
  return (
    <StepShell
      eyebrow="Step 5 of 5"
      title="Setup complete"
      description="Your workspace is now initialized with tenant settings and audit logging."
      footer={
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <Link href="/onboarding/admin">
            <Button variant="ghost">Back</Button>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="secondary">Sign in</Button>
            </Link>
            <Link href="/queue">
              <Button>Open queue</Button>
            </Link>
          </div>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--pp-color-text)]">
        You can now sign in, create a case, and continue setup in settings.
      </p>
    </StepShell>
  );
}
