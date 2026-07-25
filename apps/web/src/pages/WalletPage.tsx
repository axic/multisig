import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

export function WalletPage() {
  const { chainId, address } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["wallet", chainId, address],
    queryFn: () => api.getWallet(Number(chainId), address!),
    enabled: Boolean(chainId && address),
  });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">Not found.</p>;
  if (!data) return null;

  return (
    <section>
      <h1 className="mb-1 text-xl font-semibold">{data.label ?? "Wallet"}</h1>
      <p className="mb-4 font-mono text-sm text-gray-600">{data.address}</p>
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">Threshold</dt>
          <dd>
            {data.signersRequired}/{data.signersCount}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Next nonce</dt>
          <dd>{data.nonce}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Chain</dt>
          <dd>{data.chainId}</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-gray-500">
        Queue / approve / reject / execute UI arrives in Phases 2–4.
      </p>
    </section>
  );
}
