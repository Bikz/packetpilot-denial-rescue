"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Button, StepShell } from "@packetpilot/ui";

import { InstallPrompt } from "@/components/install-prompt";

const onboardingSteps = [
  {
    title: "Set deployment",
    description: "Choose standalone or SMART-on-FHIR startup mode.",
  },
  {
    title: "Pick model path",
    description: "Select local inference or clinic-hosted model flow.",
  },
  {
    title: "Create admin account",
    description: "Add clinic admin credentials and initial organization details.",
  },
  {
    title: "Start using workspace",
    description: "Open a queue and create your first prior-auth request.",
  },
];

export default function WelcomePage() {
  return (
    <StepShell
      eyebrow="Onboarding"
      title="Welcome to PacketPilot"
      description="Set up your local-first prior authorization workspace in minutes."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <motion.section
          className="space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <p className="pp-kicker">Clinical prior-authorization assistant</p>
          <h2 className="pp-card-title">Built for coordinator workflows and clinician review</h2>
          <p className="pp-body-sm text-[var(--pp-color-text)]">
            PacketPilot keeps sensitive cases local-first by default, gives coordinators AI-assisted drafting, and
            requires explicit review checkpoints before anything is submitted.
          </p>
          <div className="space-y-3">
            {onboardingSteps.map((step, index) => (
              <div
                key={step.title}
                className="flex items-start gap-3 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-background)] p-3"
              >
                <p className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--pp-color-primary)] px-2 text-xs font-bold text-white">
                  {index + 1}
                </p>
                <div>
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="pp-body-sm text-[var(--pp-color-text)]">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.06 }}
        >
          <div className="rounded-[var(--pp-radius-lg)] border border-[var(--pp-color-border)] bg-[var(--pp-color-background)] p-4 sm:p-5">
            <p className="pp-caption text-[var(--pp-color-text)]">Get started</p>
            <h2 className="pp-card-title mt-1">Set up in one flow</h2>
            <p className="pp-body-sm text-[var(--pp-color-text)]">
              Complete onboarding, create your first queue case, and validate your first draft workflow in a few minutes.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link href="/onboarding/deployment">
                <Button className="w-full">Start setup</Button>
              </Link>
              <div className="flex items-center justify-between gap-2">
                <p className="pp-caption text-[var(--pp-color-text)]">Already set up?</p>
                <InstallPrompt />
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </StepShell>
  );
}
