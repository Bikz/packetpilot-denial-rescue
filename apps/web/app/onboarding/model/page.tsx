"use client";

import Link from "next/link";

import { useState } from "react";

import { Button, StepShell } from "@packetpilot/ui";

const modelOptions = [
  {
    id: "local",
    title: "Run locally on this machine",
    description: "Best for privacy-first demos and edge hardware workflows.",
  },
  {
    id: "clinic",
    title: "Run in clinic VPC",
    description: "Keep model service inside private network boundaries.",
  },
] as const;

type ModelOption = (typeof modelOptions)[number]["id"];

export default function ModelPage() {
  const [selectedModelOption, setSelectedModelOption] = useState<ModelOption>("local");

  return (
    <StepShell
      eyebrow="Step 3 of 5"
      title="Model environment"
      description="Select where PacketPilot inference runs for this clinic."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/onboarding/deployment">
            <Button variant="ghost">Back</Button>
          </Link>
          <Link href="/onboarding/admin">
            <Button>Continue</Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-3">
        {modelOptions.map((option) => (
          <label
            key={option.id}
            className={`flex items-start gap-3 rounded-[var(--pp-radius-md)] border p-3 transition-all ${
              selectedModelOption === option.id
                ? "border-[var(--pp-color-primary)] bg-[var(--pp-color-surface-strong)]"
                : "border-[var(--pp-color-border)] bg-[var(--pp-color-card)] hover:border-[var(--pp-color-ring)]"
            }`}
          >
            <input
              type="radio"
              name="modelMode"
              value={option.id}
              checked={selectedModelOption === option.id}
              onChange={(event) => setSelectedModelOption(event.target.value as ModelOption)}
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
