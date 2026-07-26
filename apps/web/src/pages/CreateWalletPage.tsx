import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Button, Card, Input, Toast } from "../components/index.js";
import { api } from "../lib/api.js";
import { deployWallet, walletCreationCode } from "../lib/contract.js";

/**
 * M1 — deploy a new multisig.
 *
 * The Solcore contract's constructor takes no args and sets `signers[0] =
 * caller()` with `signers_required = 1`, so the connected account becomes the
 * sole first signer on deploy. Additional signers and a higher threshold are
 * added later via queued AddSigner / ChangeSigRequired operations (M4).
 *
 * We deploy directly from the EOA (see lib/contract.ts for why not the factory)
 * and then register the wallet with the API so it appears in the index.
 */
export function CreateWalletPage() {
  const navigate = useNavigate();
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCode = Boolean(walletCreationCode());
  const canDeploy = isConnected && Boolean(walletClient) && Boolean(publicClient) && hasCode && !busy;

  async function onDeploy() {
    if (!walletClient || !publicClient || !chainId) return;
    setBusy(true);
    setError(null);
    try {
      const { address: walletAddress, txHash, deployer } = await deployWallet(walletClient, publicClient);
      await api.registerWallet({
        chainId,
        address: walletAddress,
        label: label.trim() || undefined,
        deployTxHash: txHash,
        deployer,
      });
      navigate(`/wallet/${chainId}/${walletAddress}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-[520px]">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Deploy a new wallet</h1>

      <Card title="Deployment">
        <div className="flex flex-col gap-5">
          <Input
            label="Label"
            placeholder="Treasury"
            className="font-sans"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Chain</span>
            <span className="font-mono text-[13px]">{chainId ?? "— connect a wallet"}</span>
          </div>
          <p className="text-sm leading-relaxed text-body">
            On deploy you become the sole signer with a threshold of 1. Add signers and raise the
            threshold afterwards through queued operations.
          </p>

          {!isConnected && (
            <Toast state="unsigned" title="Connect a wallet" detail="Deployment needs a signer." />
          )}
          {isConnected && !hasCode && (
            <Toast
              state="unsigned"
              title="No contract bytecode configured"
              detail="Build it (contracts/: make wallet) and set VITE_WALLET_CREATION_CODE."
            />
          )}
          {error && <Toast state="quorum" emphatic title="Deploy failed" detail={error} />}

          <div className="flex justify-end">
            <Button disabled={!canDeploy} onClick={onDeploy}>
              {busy ? "Deploying…" : "Deploy wallet"}
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
