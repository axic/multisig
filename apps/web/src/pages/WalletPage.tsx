import { makePublicClient, readWalletBalance, resolveChains } from "@multisig/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { formatEther, getAddress } from "viem";
import { Address, Amount, Card, Label, QuorumMark } from "../components/index.js";
import { api } from "../lib/api.js";

export function WalletPage() {
  const { chainId, address } = useParams();
  const queryClient = useQueryClient();
  const enabled = Boolean(chainId && address);

  // DB-cached config (fast, returned by GET incl. signers). This renders first.
  const walletQuery = useQuery({
    queryKey: ["wallet", chainId, address],
    queryFn: () => api.getWallet(Number(chainId), address!),
    enabled,
  });

  // Background read-through: reconcile the cache from on-chain, then refresh the
  // query above. Its failure is non-blocking — the RPC may be unreachable, or
  // the contract may predate the view getters — so we surface it as a notice and
  // keep showing whatever the DB has.
  const sync = useMutation({
    mutationFn: () => api.syncWallet(Number(chainId), address!),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["wallet", chainId, address], fresh);
    },
  });
  useEffect(() => {
    if (enabled) sync.mutate();
    // Re-sync when the target wallet changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, address]);

  // Balance is read client-side (cheap, no contract getter needed).
  const balanceQuery = useQuery({
    queryKey: ["balance", chainId, address],
    queryFn: async () => {
      const cfg = resolveChains(import.meta.env as Record<string, string | undefined>).find(
        (c) => c.chainId === Number(chainId),
      );
      if (!cfg) throw new Error(`chain ${chainId} not configured`);
      return readWalletBalance(makePublicClient(cfg), getAddress(address!));
    },
    enabled,
  });

  if (walletQuery.isLoading) return <p className="font-mono text-sm text-muted">Loading…</p>;
  if (walletQuery.error) return <p className="text-sm text-signal">Not found.</p>;
  const data = walletQuery.data;
  if (!data) return null;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex items-center gap-4">
        <QuorumMark signed={data.signersRequired} required={data.signersCount} size={44} />
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold leading-none tracking-tight">{data.label ?? "Wallet"}</h1>
          <Address value={data.address} full className="text-muted" />
        </div>
      </header>

      <Card title="Signer set">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label>Threshold</Label>
            <dd className="font-mono text-[13px]">
              {data.signersRequired} / {data.signersCount}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Next nonce</Label>
            <dd className="font-mono text-[13px]">{data.nonce}</dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Balance</Label>
            <dd className="font-mono text-[13px]">
              {balanceQuery.isLoading ? (
                "…"
              ) : balanceQuery.error ? (
                "—"
              ) : (
                <Amount value={formatEther(balanceQuery.data ?? 0n)} />
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Chain</Label>
            <dd className="font-mono text-[13px]">{data.chainId}</dd>
          </div>
        </dl>
      </Card>

      <Card title={`Signers${data.signers ? ` · ${data.signers.length}` : ""}`}>
        {data.signers && data.signers.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {data.signers.map((s) => (
              <li key={s.address} className="flex items-center gap-3">
                <span className="font-mono text-[13px] text-muted">#{s.index}</span>
                <Address value={s.address} full />
                {s.index === 0 && <span className="text-xs text-muted">deployer</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-body">
            No signers cached yet{sync.isPending ? " — syncing…" : ". Sync reads them from chain."}
          </p>
        )}
        {sync.error && (
          <p className="mt-3 text-xs text-signal">
            On-chain sync failed ({(sync.error as Error).message}). Showing cached data.
          </p>
        )}
      </Card>

      <p className="max-w-[70ch] text-sm leading-relaxed text-body">
        Queue, approve, reject, and execute arrive in Phases 2–4. When they land, each pending call
        renders with the signature-state vocabulary and the quorum gauge above.
      </p>
    </section>
  );
}
