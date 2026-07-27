import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPublicClient } from "wagmi/actions";
import { Address, QuorumMark } from "../components/index.js";
import { formatWei } from "../lib/format.js";
import { readWalletState, type WalletState } from "../lib/multisig.js";
import { listTrackedWallets } from "../lib/registry.js";
import { wagmiConfig } from "../wagmi.js";

export function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["wallets", "tracked"],
    queryFn: async (): Promise<WalletState[]> => {
      const tracked = listTrackedWallets();
      const results = await Promise.all(
        tracked.map(async (w) => {
          const client = getPublicClient(wagmiConfig, { chainId: w.chainId });
          if (!client) return null;
          try {
            return await readWalletState(client, w.chainId, w.address, w.label);
          } catch {
            // Skip wallets we can't read (wrong chain / not a Multisig / RPC down).
            return null;
          }
        }),
      );
      return results.filter((w): w is WalletState => w !== null);
    },
  });

  return (
    <section>
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Your multisig wallets</h1>

      {isLoading && <p className="font-mono text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-signal">Failed to read wallets from chain.</p>}

      {data && data.length === 0 && (
        <p className="border border-line bg-paper p-6 text-sm text-body">
          No wallets yet — deploy or track one under “New wallet”.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-px border border-line bg-line">
          {data.map((w) => (
            <Link
              key={`${w.chainId}:${w.address}`}
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
