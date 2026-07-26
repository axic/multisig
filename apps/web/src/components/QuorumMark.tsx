import { type BarColors, Mark } from "./Mark.js";

/**
 * The mark as a gauge — the system's only ornament, and it carries information.
 *
 * Bars fill clockwise from the top as signatures arrive. When the threshold is
 * met the leading bar turns signal: that orange is the moment of execution.
 * Below quorum everything stays ink-on-line; progress is not urgency.
 */
export interface QuorumMarkProps {
  /** Signatures collected so far. */
  signed: number;
  /** Signatures required to execute (the threshold). */
  required: number;
  size?: number;
  className?: string;
}

export function QuorumMark({ signed, required, size = 56, className }: QuorumMarkProps) {
  const clamped = Math.max(0, Math.min(signed, required));
  const reached = required > 0 && clamped >= required;
  // Map progress onto the four bars, rounding so 3/4 lights three bars.
  const filled = required > 0 ? Math.round((clamped / required) * 4) : 0;

  const colors = [0, 1, 2, 3].map((i) => {
    if (i >= filled) return "#DCD9D1"; // line — not yet a claim on anything
    if (reached && i === 0) return "#D9482A"; // signal — quorum / execution
    return "#191918"; // ink — a collected signature
  }) as BarColors;

  return <Mark size={size} colors={colors} className={className} title={`${signed} of ${required} signed`} />;
}
