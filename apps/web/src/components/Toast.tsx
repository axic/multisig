import type { ReactNode } from "react";
import { StatusDot, type SignatureState } from "./SignatureState.js";

/**
 * A toast. Same dot vocabulary as everything else: the leading square states
 * the kind. A `title` a human wrote (sans) over a mono `detail` line. The
 * `emphatic` border (ink) marks the one you must not miss.
 */
export interface ToastProps {
  /** Reuses the signature-state palette for the leading dot. */
  state?: SignatureState;
  title: ReactNode;
  detail?: ReactNode;
  /** Draw the ink border instead of the quiet line border. */
  emphatic?: boolean;
}

export function Toast({ state = "partial", title, detail, emphatic = false }: ToastProps) {
  return (
    <div className={`flex items-start gap-3.5 bg-paper px-[18px] py-4 ${emphatic ? "border border-ink" : "border border-line"}`}>
      <StatusDot state={state} className="mt-[5px]" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        {detail && <span className="font-mono text-xs text-muted">{detail}</span>}
      </div>
    </div>
  );
}
