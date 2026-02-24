"use client";

import { Button, Card } from "@packetpilot/ui";

export type Citation = {
  doc_id: number;
  page: number;
  start: number;
  end: number;
  excerpt: string;
};

export type AutofillFieldFill = {
  field_id: string;
  value: string;
  confidence: number;
  status: "autofilled" | "suggested" | "missing";
  citations: Citation[];
};

type CitationDrawerProps = {
  open: boolean;
  fieldLabel: string;
  fill: AutofillFieldFill | null;
  onClose: () => void;
  onOpenDocument: (docId: number) => void;
};

export function CitationDrawer({
  open,
  fieldLabel,
  fill,
  onClose,
  onOpenDocument,
}: CitationDrawerProps) {
  if (!open || !fill) {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-label="Citation drawer"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-3 sm:items-center"
    >
      <Card className="max-h-[80vh] w-full max-w-lg space-y-3 overflow-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Why this field was suggested</h3>
            <p className="text-sm text-[var(--pp-color-muted)]">{fieldLabel}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-3 py-2 text-sm">
          <p className="font-semibold">Model value</p>
          <p>{fill.value || "No value"}</p>
          <p className="text-xs text-[var(--pp-color-muted)]">
            Confidence: {(fill.confidence * 100).toFixed(0)}% ({fill.status})
          </p>
        </div>

        <div className="space-y-2" data-testid="citation-list">
          {fill.citations.length === 0 ? (
            <p className="text-sm text-[var(--pp-color-muted)]">No citations were returned.</p>
          ) : (
            fill.citations.map((citation, index) => (
              <div
                key={`${citation.doc_id}-${citation.start}-${index}`}
                className="space-y-2 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] p-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--pp-color-muted)]">
                  <span>
                    Doc #{citation.doc_id} · Page {citation.page}
                  </span>
                  <Button variant="ghost" onClick={() => onOpenDocument(citation.doc_id)}>
                    Open doc
                  </Button>
                </div>
                <p className="text-sm leading-relaxed">
                  <mark className="rounded bg-amber-100 px-1 py-0.5">{citation.excerpt}</mark>
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </aside>
  );
}
