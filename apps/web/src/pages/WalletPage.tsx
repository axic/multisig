import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { getAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  Address,
  Amount,
  Button,
  Card,
  Label,
  OperationRow,
  ProposeModal,
  QuorumMark,
  SettingsModal,
} from "../components/index.js";
import { formatWei } from "../lib/format.js";
import { readOperations, readWalletState, type WalletState } from "../lib/multisig.js";
import { getTrackedWallet } from "../lib/registry.js";
import { useOperationActions } from "../lib/useOperationActions.js";

export function WalletPage() {
  const { chainId: chainIdParam, address } = useParams();
  const chainId = Number(chainIdParam);
  const publicClient = usePublicClient({ chainId });

  const walletQ = useQuery({
    queryKey: ["wallet", chainId, address],
    queryFn: () => {
      if (!publicClient) throw new Error("no RPC client for this chain");
      const label = getTrackedWallet(chainId, address!)?.label;
      return readWalletState(publicClient, chainId, address!, label);
    },
    enabled: Boolean(chainId && address && publicClient),
  });

  if (walletQ.isLoading) return <p className="font-mono text-sm text-muted">Loading…</p>;
  if (walletQ.error || !walletQ.data)
    return <p className="text-sm text-signal">{(walletQ.error as Error)?.message ?? "Not found."}</p>;

  return <WalletView key={walletQ.data.address} wallet={walletQ.data} />;
}

function WalletView({ wallet }: { wallet: WalletState }) {
  const { chainId, address } = wallet;
  const qc = useQueryClient();
  const publicClient = usePublicClient({ chainId });
  const { address: account } = useAccount();
  const [proposeOpen, setProposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const opsQ = useQuery({
    queryKey: ["operations", chainId, address, wallet.operationsCount, account],
    queryFn: () => {
      if (!publicClient) throw new Error("no RPC client for this chain");
      return readOperations(publicClient, address, wallet.operationsCount, account ? getAddress(account) : undefined);
    },
    enabled: Boolean(publicClient),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["wallet", chainId, address] });
    qc.invalidateQueries({ queryKey: ["operations", chainId, address] });
  };

  const actions = useOperationActions(wallet, refresh);

  const operations = opsQ.data ?? [];
  const active = operations.filter((o) => o.status !== "Executed");
  const history = operations.filter((o) => o.status === "Executed");

  return (
    <section className="flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <QuorumMark signed={wallet.signersRequired} required={wallet.signersCount} size={44} />
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">{wallet.label ?? "Wallet"}</h1>
            <Address value={wallet.address} full className="text-muted" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="tertiary" size="sm" onClick={refresh} disabled={opsQ.isFetching}>
            {opsQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button size="sm" onClick={() => setProposeOpen(true)}>
            Queue transaction
          </Button>
        </div>
      </header>

      <Card
        title="Overview"
        action={
          <Button variant="tertiary" size="sm" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        }
      >
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label>Balance</Label>
            <dd>
              <Amount value={formatWei(wallet.balanceWei)} />
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Threshold</Label>
            <dd className="font-mono text-[13px]">
              {wallet.signersRequired} / {wallet.signersCount}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Next nonce</Label>
            <dd className="font-mono text-[13px]">{wallet.nonce}</dd>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Chain</Label>
            <dd className="font-mono text-[13px]">{wallet.chainId}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Signers" flush>
        <div className="flex flex-col gap-px bg-line">
          {wallet.signers.map((s, i) => (
            <div key={s} className="flex items-center justify-between bg-paper px-6 py-3.5">
              <Address value={s} />
              <span className="font-mono text-[11px] uppercase tracking-label text-muted">#{i}</span>
            </div>
          ))}
          {wallet.signers.length === 0 && <div className="bg-paper px-6 py-4 text-sm text-muted">No signers.</div>}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-label text-muted">Queue</h2>
        {active.length === 0 ? (
          <p className="border border-line bg-paper p-6 text-sm text-body">Nothing queued.</p>
        ) : (
          <div className="flex flex-col gap-px border border-line bg-line">
            {active.map((o) => (
              <OperationRow key={o.index} op={o} wallet={wallet} isNext={o.index === wallet.nonce} account={account} actions={actions} />
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-label text-muted">History</h2>
          <div className="flex flex-col gap-px border border-line bg-line">
            {history.map((o) => (
              <OperationRow key={o.index} op={o} wallet={wallet} isNext={false} account={account} actions={actions} />
            ))}
          </div>
        </div>
      )}

      {(actions.approve.error || actions.execute.error || actions.reject.error) && (
        <p className="text-sm text-signal">
          {(actions.approve.error ?? actions.execute.error ?? actions.reject.error)?.message}
        </p>
      )}

      <ProposeModal wallet={wallet} open={proposeOpen} onClose={() => setProposeOpen(false)} onDone={refresh} />
      <SettingsModal wallet={wallet} open={settingsOpen} onClose={() => setSettingsOpen(false)} onDone={refresh} />
    </section>
  );
}
