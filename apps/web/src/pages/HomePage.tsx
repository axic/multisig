import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

export function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["wallets"], queryFn: api.listWallets });

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Your multisig wallets</h1>
      {isLoading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">Failed to load (is the API running?)</p>}
      <ul className="space-y-2">
        {data?.map((w) => (
          <li key={w.id} className="rounded border p-3">
            <Link to={`/wallet/${w.chainId}/${w.address}`} className="font-mono text-sm">
              {w.label ? `${w.label} — ` : ""}
              {w.address}
            </Link>
            <div className="text-xs text-gray-500">
              chain {w.chainId} · {w.signersRequired}/{w.signersCount} signers · nonce {w.nonce}
            </div>
          </li>
        ))}
        {data?.length === 0 && <li className="text-gray-500">No wallets yet.</li>}
      </ul>
    </section>
  );
}
