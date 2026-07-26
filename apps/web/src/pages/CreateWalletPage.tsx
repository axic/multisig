import { encodeInitialize, resolveCreationCode } from "@multisig/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAddress, isAddress } from "viem";
import { useAccount, useChainId, usePublicClient, useSendTransaction } from "wagmi";
import { Button, Card, Input, Toast } from "../components/index.js";
import { api } from "../lib/api.js";

/**
 * Deploy a new `Multisig`, or track an existing one.
 *
 * The Multisig uses the proxy pattern: deployment is two steps — send the
 * creation bytecode (from `VITE_MULTISIG_CREATION_CODE`, produced by the solcore
 * pipeline), then call `initialize(owner)` on the new address, which sets the
 * connected account as signer[0] with threshold 1. Additional signers and a
 * higher threshold are then added via queued AddSigner / ChangeSigRequired
 * operations. When no creation code is configured, deploy is disabled and you
 * can still track an existing address.
 */
export function CreateWalletPage() {
  const navigate = useNavigate();
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();

  const creationCode = resolveCreationCode(import.meta.env as Record<string, string | undefined>);

  const [label, setLabel] = useState("");
  const [existing, setExisting] = useState("");

  const deploy = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("connect a wallet first");
      if (!creationCode) throw new Error("no creation code configured (VITE_MULTISIG_CREATION_CODE)");
      if (!publicClient) throw new Error("no RPC client");
      // 1. Deploy the Multisig runtime.
      const hash = await sendTransactionAsync({ data: creationCode });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error("deploy tx produced no contract address");
      const wallet = getAddress(receipt.contractAddress);
      // 2. Initialize it — sets the connected account as signer[0], threshold 1.
      const initHash = await sendTransactionAsync({ to: wallet, data: encodeInitialize(account) });
      await publicClient.waitForTransactionReceipt({ hash: initHash });
      return api.registerWallet({
        chainId,
        address: wallet,
        deployer: account,
        label: label || undefined,
        deployTxHash: hash,
      });
    },
    onSuccess: (w) => navigate(`/wallet/${w.chainId}/${w.address}`),
  });

  const track = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("connect a wallet first");
      if (!isAddress(existing)) throw new Error("enter a valid Multisig address");
      // We can't read signers back from chain, so seed signer[0] as the
      // connected account. If you weren't the deployer, fix the set via a
      // queued AddSigner/RemoveSigner once you can act as a signer.
      return api.registerWallet({
        chainId,
        address: getAddress(existing),
        deployer: account,
        label: label || undefined,
      });
    },
    onSuccess: (w) => navigate(`/wallet/${w.chainId}/${w.address}`),
  });

  const busy = deploy.isPending || track.isPending;
  const err = deploy.error ?? track.error;

  return (
    <section className="max-w-[560px]">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Deploy a new wallet</h1>

      {!isConnected && (
        <div className="mb-5">
          <Toast state="unsigned" title="Connect a wallet" detail="You need an account to deploy or track a multisig." />
        </div>
      )}

      <Card title="Wallet">
        <div className="flex flex-col gap-5">
          <Input label="Label" placeholder="Treasury" className="font-sans" value={label} onChange={(e) => setLabel(e.target.value)} />
          <p className="text-sm leading-relaxed text-body">
            On deploy you become signer #0 with a threshold of 1. Add signers and raise the threshold
            afterwards through queued operations.
          </p>
        </div>
      </Card>

      {err && (
        <div className="mt-4">
          <Toast state="quorum" emphatic title="Something went wrong" detail={err.message} />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-6">
        <Card title="Deploy">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-body">
              {creationCode ? (
                <>Creation code loaded ({(creationCode.length - 2) / 2} bytes).</>
              ) : (
                <>No <span className="font-mono">VITE_MULTISIG_CREATION_CODE</span> — use “Track existing” below.</>
              )}
            </p>
            <Button disabled={!isConnected || !creationCode || busy} onClick={() => deploy.mutate()}>
              {deploy.isPending ? "Deploying…" : "Deploy wallet"}
            </Button>
          </div>
        </Card>

        <Card title="Track an existing wallet">
          <div className="flex flex-col gap-4">
            <Input label="Multisig address" placeholder="0x…" value={existing} onChange={(e) => setExisting(e.target.value)} />
            <div className="flex justify-end">
              <Button variant="secondary" disabled={!isConnected || busy} onClick={() => track.mutate()}>
                {track.isPending ? "Registering…" : "Track wallet"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
