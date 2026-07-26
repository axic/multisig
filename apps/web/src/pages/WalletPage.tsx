import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Operation } from "@multisig/core";
import { formatEther, getAddress } from "viem";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";
import {
  Address,
  Amount,
  Button,
  Card,
  Label,
  ProposeModal,
  QuorumMark,
  StateBadge,
  stateFromCount,
  Toast,
  type SignatureState,
} from "../components/index.js";
import { api, type OperationRow, type WalletDetail } from "../lib/api.js";
import { approveTx, executeTx, operationForApi, queueTx, rejectTx } from "../lib/contract.js";
import { truncateAddress } from "../lib/format.js";

/** Human summary of an operation from its decoded fields. */
function opSummary(op: OperationRow): string {
  const d = op.decoded ?? {};
  switch (op.kind) {
    case "TransferEth":
      return `Send ${d.amount ? formatEther(BigInt(d.amount)) : "0"} ETH → ${truncateAddress(String(d.target ?? ""))}`;
    case "TransferToken":
      return `Send token ${truncateAddress(String(d.token ?? ""))} → ${truncateAddress(String(d.target ?? ""))}`;
    case "AddSigner":
      return `Add signer ${truncateAddress(String(d.signer ?? ""))}`;
    case "RemoveSigner":
      return `Remove signer ${truncateAddress(String(d.signer ?? ""))}`;
    case "ChangeSigRequired":
      return `Change threshold → ${d.count ?? "?"}`;
    default:
      return op.kind;
  }
}

function operationState(op: OperationRow, required: number): SignatureState {
  if (op.status === "Executed") return "executed";
  if (op.status === "Rejected") return "quorum"; // terminal, awaiting skip-execute
  return stateFromCount(op.approvals, required);
}

export function WalletPage() {
  const { chainId: chainIdParam, address } = useParams();
  const chainId = Number(chainIdParam);
  const queryClient = useQueryClient();
  const { address: account } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId });

  const [proposeOpen, setProposeOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryKey = ["wallet-detail", chainId, address];
  const { data, isLoading, error } = useQuery({
    queryKey,
    // sync recomputes the index (nonce/approvals/config) and returns signers + operations.
    queryFn: () => api.syncWallet(chainId, address!),
    enabled: Boolean(chainId && address),
  });

  const { data: balance } = useBalance({ address: address as `0x${string}` | undefined, chainId });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const signers = data?.signers ?? [];
  const isSigner = Boolean(account && signers.some((s) => s.address.toLowerCase() === account.toLowerCase()));

  function requireClients() {
    if (!walletClient || !publicClient) throw new Error("Connect a wallet on this chain");
    return { walletClient, publicClient };
  }

  const propose = useMutation({
    mutationFn: async (op: Operation) => {
      const { walletClient: w, publicClient: p } = requireClients();
      const txHash = await queueTx(w, p, getAddress(address!), op);
      await api.createOperation(chainId, address!, {
        ...operationForApi(op),
        proposer: account,
        createdTxHash: txHash,
      });
    },
    onSuccess: () => {
      setProposeOpen(false);
      invalidate();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const vote = useMutation({
    mutationFn: async ({ op, kind }: { op: OperationRow; kind: "approve" | "reject" }) => {
      const { walletClient: w, publicClient: p } = requireClients();
      const wallet = getAddress(address!);
      const nonce = BigInt(op.index);
      if (kind === "approve") {
        const txHash = await approveTx(w, p, wallet, nonce);
        await api.approveOperation(op.id, { signer: account!, txHash });
      } else {
        const txHash = await rejectTx(w, p, wallet, nonce);
        await api.rejectOperation(op.id, { signer: account!, txHash });
      }
    },
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const execute = useMutation({
    mutationFn: async (op: OperationRow) => {
      const { walletClient: w, publicClient: p } = requireClients();
      const txHash = await executeTx(w, p, getAddress(address!), BigInt(op.index));
      await api.executeOperation(op.id, { txHash });
    },
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const busy = propose.isPending || vote.isPending || execute.isPending;

  if (isLoading) return <p className="font-mono text-sm text-muted">Loading…</p>;
  if (error) return <p className="text-sm text-signal">Failed to load — is the API running?</p>;
  if (!data) return null;

  const detail: WalletDetail = data;
  const required = detail.signersRequired;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <QuorumMark signed={detail.signersRequired} required={detail.signersCount} size={44} />
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">{detail.label ?? "Wallet"}</h1>
            <Address value={detail.address} full className="text-muted" />
          </div>
        </div>
        {isSigner && (
          <Button size="sm" onClick={() => setProposeOpen(true)} disabled={busy}>
            Propose
          </Button>
        )}
      </header>

      {/* M1: owners / threshold / balance */}
      <Card title="Overview">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label>Threshold</Label>
            <dd className="font-mono text-[13px]">
              {detail.signersRequired} / {detail.signersCount}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Balance</Label>
            <dd>
              <Amount value={balance ? formatEther(balance.value) : "0"} unit={balance?.symbol ?? "ETH"} />
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Next nonce</Label>
            <dd className="font-mono text-[13px]">{detail.nonce}</dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Chain</Label>
            <dd className="font-mono text-[13px]">{detail.chainId}</dd>
          </div>
        </dl>
      </Card>

      {/* M1: owners list */}
      <Card title={`Signers (${signers.length})`} flush>
        <div className="flex flex-col gap-px bg-line">
          {signers.map((s) => (
            <div key={s.address} className="flex items-center justify-between bg-paper px-6 py-3.5">
              <Address value={s.address} />
              {account && s.address.toLowerCase() === account.toLowerCase() && (
                <span className="font-mono text-[11px] uppercase tracking-label text-muted">you</span>
              )}
            </div>
          ))}
          {signers.length === 0 && <div className="bg-paper px-6 py-3.5 text-sm text-muted">No signers indexed.</div>}
        </div>
      </Card>

      {actionError && <Toast state="quorum" emphatic title="Action failed" detail={actionError} />}
      {account && !isSigner && (
        <Toast state="unsigned" title="You are not a signer" detail="Connect a signer account to queue, approve, or reject." />
      )}

      {/* M2–M4: queue + history */}
      <Card title="Operations" flush>
        <div className="flex flex-col gap-px bg-line">
          {detail.operations.length === 0 && (
            <div className="bg-paper px-6 py-4 text-sm text-muted">No operations queued yet.</div>
          )}
          {detail.operations.map((op) => {
            const isNext = op.index === detail.nonce;
            const open = op.status === "Approvals";
            const executable = isNext && (op.status === "Rejected" || op.approvals >= required);
            const alreadyVoted = Boolean(
              account && op.votes.some((v) => v.signer.toLowerCase() === account.toLowerCase()),
            );
            return (
              <div key={op.id} className="flex flex-col gap-3 bg-paper px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium">{opSummary(op)}</span>
                    <span className="font-mono text-[11px] text-muted">
                      #{op.index} · {op.kind} · {op.approvals}/{required} approvals
                    </span>
                  </div>
                  <StateBadge state={operationState(op, required)} align="right" />
                </div>
                {(isSigner || executable) && op.status !== "Executed" && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {isSigner && open && (
                      <>
                        <Button
                          variant="tertiary"
                          size="sm"
                          disabled={busy || alreadyVoted}
                          onClick={() => vote.mutate({ op, kind: "approve" })}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          disabled={busy || alreadyVoted}
                          onClick={() => vote.mutate({ op, kind: "reject" })}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      variant="signal"
                      size="sm"
                      disabled={busy || !executable}
                      title={!isNext ? `Execute in order — next is #${detail.nonce}` : undefined}
                      onClick={() => execute.mutate(op)}
                    >
                      {op.status === "Rejected" ? "Execute (skip)" : "Execute"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <ProposeModal
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        busy={propose.isPending}
        onSubmit={(op) => propose.mutateAsync(op)}
      />
    </section>
  );
}
