import Link from "next/link";

import { Button, Card, StepShell } from "@packetpilot/ui";

export default function DeploymentPage() {
  return (
    <StepShell
      eyebrow="Step 2 of 4"
      title="Choose deployment mode"
      description="Pick a mode now; you can adjust this later in settings."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/onboarding/welcome">
            <Button variant="ghost">Back</Button>
          </Link>
          <Link href="/onboarding/model">
            <Button>Continue</Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-3">
        <Card className="space-y-1 border-[var(--pp-color-primary)] bg-[var(--pp-color-primary-foreground)]">
          <h2 className="text-sm font-semibold">Standalone (recommended)</h2>
          <p className="text-sm text-[var(--pp-color-text)]">
            Manual uploads or local FHIR bundle import for quick setup.
          </p>
        </Card>
        <Card className="space-y-1">
          <h2 className="text-sm font-semibold">SMART-on-FHIR</h2>
          <p className="text-sm text-[var(--pp-color-text)]">
            EHR launch context and OAuth wiring for integrated flows.
          </p>
        </Card>
      </div>
    </StepShell>
  );
}
