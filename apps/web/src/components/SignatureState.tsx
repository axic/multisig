/**
 * Signature states — the semantic heart of the system.
 *
 *   unsigned  line   proposed, no signatures — not yet a claim on anything
 *   partial   muted  below threshold — progress is not urgency
 *   quorum    signal threshold met — the only place orange appears (strategy A)
 *   executed  ink    on chain, immutable — no celebration
 *
 * An 8px square dot (zero radius, like everything) plus the mono uppercase tag.
 */
export type SignatureState = "unsigned" | "partial" | "quorum" | "executed";

const DOT: Record<SignatureState, string> = {
  unsigned: "bg-line",
  partial: "bg-muted",
  quorum: "bg-signal",
  executed: "bg-ink",
};

/** Derive the state from a signature count against its threshold. */
export function stateFromCount(signed: number, required: number, executed = false): SignatureState {
  if (executed) return "executed";
  if (required > 0 && signed >= required) return "quorum";
  if (signed > 0) return "partial";
  return "unsigned";
}

export function StatusDot({ state, className = "" }: { state: SignatureState; className?: string }) {
  return <div className={`h-2 w-2 flex-none ${DOT[state]} ${className}`} aria-hidden />;
}

export interface StateBadgeProps {
  state: SignatureState;
  /** Align the dot + label to the right (table `state` column). */
  align?: "left" | "right";
}

export function StateBadge({ state, align = "left" }: StateBadgeProps) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
      <StatusDot state={state} />
      <span className="font-mono text-[11px] uppercase tracking-[0.06em]">{state}</span>
    </div>
  );
}
