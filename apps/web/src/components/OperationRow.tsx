import type { OperationView, WalletState } from "../lib/multisig.js";
import { operationSummary } from "../lib/operation.js";
import type { useOperationActions } from "../lib/useOperationActions.js";
import { Button } from "./Button.js";
import { QuorumMark } from "./QuorumMark.js";
import { StateBadge, StatusDot, stateFromCount, type SignatureState } from "./SignatureState.js";
import { ErrorNotice } from "./ErrorNotice.js";

type Actions = ReturnType<typeof useOperationActions>;
type Action = Actions[keyof Actions];

const eq = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * The three mutations are shared by every row, so a result only belongs to the
 * row it was fired from — `variables` is the operation that was passed to
 * `mutate`. Without this a failure would have to be reported page-wide, far
 * from the button that caused it.
 */
const isMine = (action: Action, op: OperationView) => action.variables?.index === op.index;

export function OperationRow({
  op,
  wallet,
  isNext,
  account,
  actions,
}: {
  op: OperationView;
  wallet: WalletState;
  isNext: boolean;
  account?: string;
  actions: Actions;
}) {
  const required = wallet.signersRequired;
  const isSigner = wallet.signers.some((s) => eq(s, account));
  const open = op.status === "Approvals";
  const rejected = op.status === "Rejected";

  // Anyone can execute; it's live once it's the next op and either has enough
  // approvals or has been rejected (rejection executes as a skip).
  const canExecute = isNext && (rejected || (open && op.approvals >= required));
  const busy = actions.approve.isPending || actions.reject.isPending || actions.execute.isPending;
  const executing = actions.execute.isPending && isMine(actions.execute, op);
  const approving = actions.approve.isPending && isMine(actions.approve, op);

  // Surface a failed approve/reject/execute on the row that fired it. A revert
  // leaves the operation exactly as it was, so without this the click simply
  // appears to do nothing.
  // "Execution" for the skip button too: it is the same execute() call, and
  // the row it renders under says which operation it belongs to.
  const failed = (
    [
      [actions.execute, "Execution"],
      [actions.approve, "Approval"],
      [actions.reject, "Rejection"],
    ] as const
  ).find(([action]) => action.error && isMine(action, op));

  const badgeState: SignatureState =
    op.status === "Executed" ? "executed" : stateFromCount(op.approvals, required);

  return (
    <div className={`flex flex-col gap-3 bg-paper p-[18px] ${op.status === "Executed" ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <QuorumMark signed={op.approvals} required={required} size={30} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-label text-muted">#{op.index}</span>
              <span className="text-sm font-medium">{op.kind}</span>
            </div>
            <span className="truncate text-[13px] text-body">{operationSummary(op.op)}</span>
          </div>
        </div>
        <div className="flex-none text-right">
          {rejected ? (
            <div className="flex items-center justify-end gap-2">
              <StatusDot state="unsigned" />
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">rejected</span>
            </div>
          ) : (
            <StateBadge state={badgeState} align="right" />
          )}
          {open && (
            <div className="mt-1 font-mono text-[11px] text-muted">
              {op.approvals} / {required} approvals
            </div>
          )}
        </div>
      </div>

      {op.status !== "Executed" && (
        <div className="flex flex-wrap justify-end gap-2">
          {open && (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={!isSigner || op.myVote === "Approved" || busy}
                onClick={() => actions.approve.mutate(op)}
              >
                {op.myVote === "Approved" ? "Approved" : approving ? "Signing…" : "Approve"}
              </Button>
              <Button size="sm" variant="tertiary" disabled={!isSigner || busy} onClick={() => actions.reject.mutate(op)}>
                Reject
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="signal"
            disabled={!canExecute || busy}
            title={
              !isNext
                ? `not the next op (waiting on #${wallet.nonce})`
                : rejected
                  ? "execute to skip this rejected op"
                  : op.approvals < required
                    ? "not enough approvals"
                    : "execute on-chain"
            }
            onClick={() => actions.execute.mutate(op)}
          >
            {executing ? "Executing…" : rejected ? "Skip" : "Execute"}
          </Button>
        </div>
      )}

      {failed && <ErrorNotice error={failed[0].error} action={failed[1]} />}
    </div>
  );
}
