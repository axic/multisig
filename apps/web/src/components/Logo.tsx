import { LOGO_DARK, LOGO_LIGHT, Mark } from "./Mark.js";

/**
 * The wordmark lockups. Horizontal is the default; stacked for narrow contexts.
 * Below 24px the accent bar reads as a defect, so pass `tone="mono"` (single
 * ink weight) for tiny placements.
 */
export interface LogoProps {
  /** Mark size in px. The wordmark scales roughly 1:1 with it. */
  size?: number;
  layout?: "horizontal" | "stacked";
  /** `light` on paper, `dark` on ink, `mono` drops the accent (< 24px). */
  tone?: "light" | "dark" | "mono";
  className?: string;
}

const MONO: [string, string, string, string] = ["#191918", "#191918", "#191918", "#191918"];

export function Logo({ size = 22, layout = "horizontal", tone = "light", className }: LogoProps) {
  const colors = tone === "dark" ? LOGO_DARK : tone === "mono" ? MONO : LOGO_LIGHT;
  const wordColor = tone === "dark" ? "#F1EFE9" : "#191918";
  const stacked = layout === "stacked";
  // Wordmark tracks the mark size; 44px mark → 44px word in the design specimens.
  const wordSize = Math.round(size * (stacked ? 0.6 : 1));

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: stacked ? "column" : "row",
        alignItems: "center",
        gap: stacked ? 14 : Math.round(size * 0.45),
      }}
    >
      <Mark size={size} colors={colors} title="coram" />
      <span
        className="font-sans"
        style={{ fontSize: wordSize, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: wordColor }}
      >
        coram
      </span>
    </div>
  );
}
