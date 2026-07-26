import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Address, QuorumMark } from "../components/index.js";
import { api } from "../lib/api.js";
import { formatWei } from "../lib/format.js";

export function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["wallets"], queryFn: api.listWallets });

  return (
    <section>
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Your multisig wallets</h1>

      {isLoading && <p className="font-mono text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-signal">Failed to load — is the API running?</p>}

      {data && data.length === 0 && (
        <p className="border border-line bg-paper p-6 text-sm text-body">No wallets yet.</p>
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-px border border-line bg-line">
          {data.map((w) => (
            <Link
              key={w.id}
              to={`/wallet/${w.chainId}/${w.address}`}
              className="flex items-center justify-between gap-4 bg-paper p-[18px] transition-colors hover:bg-panel"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <QuorumMark signed={w.signersRequired} required={w.signersCount} size={28} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{w.label ?? "Wallet"}</span>
                  <Address value={w.address} className="text-muted" />
                </div>
              </div>
              <div className="flex-none text-right font-mono text-xs text-muted">
                <div>
                  {w.signersRequired} / {w.signersCount} signers
                </div>
                <div>
                  {formatWei(w.balanceWei)} ETH · chain {w.chainId} · nonce {w.nonce}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
