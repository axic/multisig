import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Address, Card, Label, QuorumMark } from "../components/index.js";
import { api } from "../lib/api.js";

export function WalletPage() {
  const { chainId, address } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["wallet", chainId, address],
    queryFn: () => api.getWallet(Number(chainId), address!),
    enabled: Boolean(chainId && address),
  });

  if (isLoading) return <p className="font-mono text-sm text-muted">Loading…</p>;
  if (error) return <p className="text-sm text-signal">Not found.</p>;
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
        <dl className="grid grid-cols-3 gap-6">
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
            <Label>Chain</Label>
            <dd className="font-mono text-[13px]">{data.chainId}</dd>
          </div>
        </dl>
      </Card>

      <p className="max-w-[70ch] text-sm leading-relaxed text-body">
        Queue, approve, reject, and execute arrive in Phases 2–4. When they land, each pending call
        renders with the signature-state vocabulary and the quorum gauge above.
      </p>
    </section>
  );
}
