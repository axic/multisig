import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAddress, isAddress, isHex, parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { readTokenMeta } from "../lib/erc20.js";
import type { WalletState } from "../lib/multisig.js";
import { saveTokenMeta } from "../lib/registry.js";
import { useQueueOperation, type QueueInput } from "../lib/useOperationActions.js";
import { Button } from "./Button.js";
import { ErrorNotice } from "./ErrorNotice.js";
import { Input } from "./Input.js";
import { Modal } from "./Modal.js";

/**
 * Queue a transaction. Three kinds, all native `Operation` variants the
 * contract executes itself:
 *
 *  - **Send ETH** — `TransferEth`.
 *  - **Transfer token** — `TransferToken`, which the wallet performs with its
 *    own `safe_erc20_transfer`; no calldata to hand-roll.
 *  - **Contract call** — an arbitrary call. The `Call` variant carries its
 *    payload on chain, but we queue an `UnstoredCall` instead: only the hash
 *    goes on chain, and the app stores the `[target][value][data]` preimage to
 *    supply at execute time.
 *
 * Signer-only: queue() reverts for non-signers.
 */
type Kind = "TransferEth" | "TransferToken" | "UnstoredCall";

const TABS: { key: Kind; label: string }[] = [
  { key: "TransferEth", label: "Send ETH" },
  { key: "TransferToken", label: "Transfer token" },
  { key: "UnstoredCall", label: "Contract call" },
];

/** A non-negative decimal, e.g. `1`, `0.25`, `.5` — what the amount fields take. */
const DECIMAL = /^(\d+(\.\d*)?|\.\d+)$/;

export function ProposeModal({
  wallet,
  open,
  onClose,
  onDone,
}: {
  wallet: WalletState;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<Kind>("TransferEth");
  const [to, setTo] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [data, setData] = useState("0x");

  const publicClient = usePublicClient({ chainId: wallet.chainId });

  // `TransferToken.amount` is in the token's base units, so we can't turn the
  // form's "1.5" into an operation until decimals() answers.
  const tokenQ = useQuery({
    queryKey: ["token", wallet.chainId, token.toLowerCase()],
    queryFn: async () => {
      if (!publicClient) throw new Error("no RPC client for this chain");
      const meta = await readTokenMeta(publicClient, token);
      saveTokenMeta(wallet.chainId, meta); // so the queued row can render the amount
      return meta;
    },
    enabled: kind === "TransferToken" && isAddress(token),
    retry: false,
    staleTime: Infinity,
  });
  const meta = tokenQ.data;

  const queue = useQueueOperation(wallet, () => {
    setTo("");
    setToken("");
    setAmount("");
    setData("0x");
    onDone();
    onClose();
  });

  const invalidTo = to.length > 0 && !isAddress(to);
  const invalidToken = token.length > 0 && !isAddress(token);
  const invalidAmount = amount.length > 0 && !DECIMAL.test(amount);
  const invalidData = kind === "UnstoredCall" && data.length > 0 && !isHex(data);

  // Everything the chosen kind needs, filled in and well-formed.
  const ready =
    isAddress(to) &&
    !invalidAmount &&
    !invalidData &&
    (kind !== "TransferToken" || (isAddress(token) && Boolean(meta) && amount.length > 0));

  const run = () => {
    if (!ready) return; // guarded by disabled below
    const target = getAddress(to);

    if (kind === "TransferToken") {
      if (!meta) return; // decimals not read yet — `ready` already requires them
      queue.mutate({ kind: "TransferToken", target, token: getAddress(token), amount: parseAmount(amount, meta.decimals) });
      return;
    }

    const value = parseAmount(amount, 18);
    const input: QueueInput =
      kind === "TransferEth"
        ? { kind: "TransferEth", target, amount: value }
        : { kind: "UnstoredCall", target, value, payload: isHex(data) ? data : "0x" };
    queue.mutate(input);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Queue a transaction"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={run} disabled={queue.isPending || !ready}>
            {queue.isPending ? "Queuing…" : "Queue on-chain"}
          </Button>
        </>
      }
    >
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setKind(t.key)}
            className={[
              "flex-1 border px-2 py-2 font-mono text-[11px] uppercase tracking-label transition-colors",
              kind === t.key ? "border-ink bg-ink text-paper" : "border-line text-body hover:border-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {kind === "TransferToken" && (
        <Input
          label="Token"
          placeholder="0x… (ERC-20)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          error={invalidToken ? "invalid address" : tokenQ.error ? (tokenQ.error as Error).message : undefined}
        />
      )}

      <Input
        label={kind === "TransferToken" ? "Recipient" : "To"}
        placeholder="0x…"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        error={invalidTo ? "invalid address" : undefined}
      />

      <Input
        label={kind === "UnstoredCall" ? "Value" : "Amount"}
        unit={kind === "TransferToken" ? (meta?.symbol ?? "token") : "ETH"}
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={invalidAmount ? "enter a decimal amount" : undefined}
      />

      {kind === "TransferToken" && isAddress(token) && !tokenQ.error && (
        <span className="-mt-2 text-xs text-muted">
          {meta
            ? `${meta.decimals} decimals — sends ${parseAmount(amount, meta.decimals)} base units.`
            : "Reading decimals…"}
        </span>
      )}

      {kind === "UnstoredCall" && (
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-body">Calldata</span>
          <textarea
            className="w-full min-w-0 border border-line bg-white px-3.5 py-3 font-mono text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink"
            rows={3}
            placeholder="0x…"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
          <span className="text-xs text-muted">Queued as an UnstoredCall — the preimage is stored in this browser and supplied at execute.</span>
        </label>
      )}

      <ErrorNotice error={queue.error} action="Queueing" />
    </Modal>
  );
}

/** Blank means zero; anything else is already validated against {@link DECIMAL}. */
function parseAmount(value: string, decimals: number): bigint {
  return DECIMAL.test(value.trim()) ? parseUnits(value.trim(), decimals) : 0n;
}
