import { describeError } from "../lib/errors.js";
import { Toast } from "./Toast.js";

/**
 * The failure of one action, shown where that action lives.
 *
 * A rejection in the wallet is the user's own decision, so it stays quiet;
 * anything else is signal-bordered, the one place orange means "fix this". The
 * raw viem report — request arguments, docs link, version — is kept, but folded
 * away so it can be copied without burying the reason.
 */
export interface ErrorNoticeProps {
  error: unknown;
  /** Names what failed, as a noun: "Deployment", "Tracking". */
  action: string;
}

export function ErrorNotice({ error, action }: ErrorNoticeProps) {
  const described = describeError(error, action);
  if (!described) return null;
  const { title, detail, raw, rejected } = described;

  return (
    <Toast state={rejected ? "unsigned" : "quorum"} emphatic={!rejected} title={title} detail={detail}>
      {raw && (
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none font-mono text-[11px] uppercase tracking-label text-muted hover:text-ink">
            Details
          </summary>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words border border-line bg-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-body">
            {raw}
          </pre>
        </details>
      )}
    </Toast>
  );
}
