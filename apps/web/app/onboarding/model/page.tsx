import Link from "next/link";

import { Button, Card, StepShell } from "@packetpilot/ui";

export default function ModelPage() {
  return (
    <StepShell
      eyebrow="Step 3 of 4"
      title="Model environment"
      description="Select where PacketPilot inference runs for this clinic."
      footer={
        <div className="flex items-center justify-between">
          <Link href="/onboarding/deployment">
            <Button variant="ghost">Back</Button>
          </Link>
          <Link href="/onboarding/done">
            <Button>Continue</Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-3">
        <Card className="space-y-1 border-[var(--pp-color-primary)] bg-[var(--pp-color-primary-foreground)]">
          <h2 className="text-sm font-semibold">Run locally on this machine</h2>
          <p className="text-sm text-[var(--pp-color-muted)]">
            Best for privacy-first demos and edge hardware workflows.
          </p>
        </Card>
        <Card className="space-y-1">
          <h2 className="text-sm font-semibold">Run in clinic VPC</h2>
          <p className="text-sm text-[var(--pp-color-muted)]">
            Keep model service inside private network boundaries.
          </p>
        </Card>
      </div>
    </StepShell>
  );
}
