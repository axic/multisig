import type { ReactNode } from "react";
import { StatusDot, type SignatureState } from "./SignatureState.js";

/**
 * A toast. Same dot vocabulary as everything else: the leading square states
 * the kind. A `title` a human wrote (sans) over a mono `detail` line. The
 * `emphatic` border (ink) marks the one you must not miss.
 *
 * The text column is allowed to wrap — details are often machine-written
 * (addresses, calldata, RPC reasons) and must break rather than push the toast
 * past its container.
 */
export interface ToastProps {
  /** Reuses the signature-state palette for the leading dot. */
  state?: SignatureState;
  title: ReactNode;
  detail?: ReactNode;
  /** Draw the ink border instead of the quiet line border. */
  emphatic?: boolean;
  /** Extra room under the detail line — a disclosure, an action. */
  children?: ReactNode;
}

export function Toast({ state = "partial", title, detail, emphatic = false, children }: ToastProps) {
  return (
    <div className={`flex items-start gap-3.5 bg-paper px-[18px] py-4 ${emphatic ? "border border-ink" : "border border-line"}`}>
      <StatusDot state={state} className="mt-[5px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        {detail && (
          <span className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted">{detail}</span>
        )}
        {children}
      </div>
    </div>
  );
}
