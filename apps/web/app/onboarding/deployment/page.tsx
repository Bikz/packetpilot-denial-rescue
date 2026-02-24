"use client";
import Link from "next/link";

import { useState } from "react";

import { Button, StepShell } from "@packetpilot/ui";

const deploymentOptions = [
  {
    id: "standalone",
    title: "Standalone (recommended)",
    description: "Manual uploads or local FHIR bundle import for quick setup.",
  },
  {
    id: "smart",
    title: "SMART-on-FHIR",
    description: "EHR launch context and OAuth wiring for integrated flows.",
  },
] as const;

type DeploymentOption = (typeof deploymentOptions)[number]["id"];

export default function DeploymentPage() {
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentOption>("standalone");

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
        {deploymentOptions.map((option) => (
          <label
            key={option.id}
            className={`flex items-start gap-3 rounded-[var(--pp-radius-md)] border p-3 transition-all ${
              selectedDeployment === option.id
                ? "border-[var(--pp-color-primary)] bg-[var(--pp-color-surface-strong)]"
                : "border-[var(--pp-color-border)] bg-[var(--pp-color-background)] hover:border-[var(--pp-color-ring)]"
            }`}
          >
            <input
              type="radio"
              name="deploymentMode"
              value={option.id}
              checked={selectedDeployment === option.id}
              onChange={(event) => setSelectedDeployment(event.target.value as DeploymentOption)}
              className="mt-1 h-4 w-4 border-[var(--pp-color-border)] text-[var(--pp-color-primary)]"
            />
            <div>
              <h2 className="text-sm font-semibold">{option.title}</h2>
              <p className="text-sm text-[var(--pp-color-text)]">{option.description}</p>
            </div>
          </label>
        ))}
      </div>
    </StepShell>
  );
}
