/**
 * Deploy a new multisig (Phase 1).
 *
 * The Solcore contract's constructor takes no args — the deployer becomes the
 * sole signer with required=1. Additional signers and a higher threshold are
 * added later via queued AddSigner / ChangeSigRequired operations (Phase 2+).
 *
 * Flow: connect → ensure the target chain → deployContract(MULTISIG_BYTECODE) →
 * wait for the receipt → read receipt.contractAddress → register it with the API
 * → navigate to /wallet/:chainId/:address. There is no factory and no address
 * prediction; the address comes from the deploy receipt.
 *
 * Deploy is GATED on MULTISIG_BYTECODE: until the Solcore toolchain produces the
 * creation hex (see packages/core/src/contract/bytecode.ts) this renders a
 * "bytecode not built" notice instead of a broken deploy. All the wiring below
 * goes live automatically once the hex is pinned.
 */
import { MULTISIG_ABI, MULTISIG_BYTECODE, resolveChains } from "@multisig/core";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAccount,
  useChainId,
  useConnect,
  useDeployContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Button, Card, Input } from "../components/index.js";
import { api } from "../lib/api.js";

const TARGET_CHAIN_ID =
  resolveChains(import.meta.env as Record<string, string | undefined>)[0]?.chainId ?? 11155111;

export function CreateWalletPage() {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const {
    deployContract,
    data: txHash,
    isPending: deploying,
    error: deployError,
  } = useDeployContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const [label, setLabel] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: (contractAddress: string) =>
      api.registerWallet({
        chainId: TARGET_CHAIN_ID,
        address: contractAddress,
        deployTxHash: txHash,
        label: label || undefined,
      }),
    onSuccess: (w) => navigate(`/wallet/${w.chainId}/${w.address}`),
    onError: (e) => setRegisterError((e as Error).message),
  });

  // Once the deploy receipt lands, register the address and navigate to it.
  useEffect(() => {
    const addr = receipt.data?.contractAddress;
    if (addr && register.isIdle) register.mutate(addr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.data?.contractAddress]);

  const injected = connectors[0];
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID;
  const busy = deploying || receipt.isLoading || register.isPending;

  const onDeploy = () => {
    setRegisterError(null);
    if (!MULTISIG_BYTECODE) return;
    deployContract({ abi: MULTISIG_ABI, bytecode: MULTISIG_BYTECODE });
  };

  const deployLabel = deploying
    ? "Confirm in wallet…"
    : receipt.isLoading
      ? "Deploying…"
      : register.isPending
        ? "Registering…"
        : "Deploy wallet";

  return (
    <section className="max-w-[520px]">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Deploy a new wallet</h1>

      <Card title="Deployment">
        <div className="flex flex-col gap-5">
          <Input
            label="Label"
            placeholder="Treasury"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="font-sans"
          />
          <Input label="Chain" value={String(TARGET_CHAIN_ID)} readOnly />
          <p className="text-sm leading-relaxed text-body">
            On deploy you become the sole signer with a threshold of 1. Add signers and raise the
            threshold afterwards through queued operations.
          </p>

          {!MULTISIG_BYTECODE && (
            <p className="border border-line bg-paper p-3 text-sm text-body">
              <span className="font-semibold">Creation bytecode not built yet.</span> The deploy
              button stays disabled until the Solcore toolchain produces the creation hex — see{" "}
              <code>packages/core/src/contract/bytecode.ts</code> for the reproducible{" "}
              <code>sol-core → yule → solc</code> steps. Paste the hex there and this flow goes live.
            </p>
          )}

          {txHash && (
            <p className="font-mono text-xs text-muted">
              tx: {txHash.slice(0, 10)}…{txHash.slice(-8)}
            </p>
          )}
          {(deployError || receipt.error || registerError) && (
            <p className="text-sm text-signal">
              {deployError?.message ?? receipt.error?.message ?? registerError}
            </p>
          )}

          <div className="flex justify-end">
            {!isConnected ? (
              <Button disabled={!injected} onClick={() => injected && connect({ connector: injected })}>
                Connect wallet
              </Button>
            ) : wrongChain ? (
              <Button disabled={switching} onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>
                {switching ? "Switching…" : `Switch to chain ${TARGET_CHAIN_ID}`}
              </Button>
            ) : (
              <Button disabled={busy || !MULTISIG_BYTECODE} onClick={onDeploy}>
                {deployLabel}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
