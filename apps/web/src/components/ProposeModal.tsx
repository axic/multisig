import { useState } from "react";
import { getAddress, isAddress, isHex, parseEther } from "viem";
import type { WalletState } from "../lib/multisig.js";
import { useQueueOperation, type QueueInput } from "../lib/useOperationActions.js";
import { Button } from "./Button.js";
import { Input } from "./Input.js";
import { Modal } from "./Modal.js";

/**
 * Queue a transaction. Two kinds: send ETH (the native `TransferEth` op) or an
 * arbitrary contract call. The static queue() codec can't encode the dynamic
 * `Call` variant, so a call is queued as an `UnstoredCall` — only its hash goes
 * on-chain; the app stores the `[target][value][data]` preimage and supplies it
 * at execute time. Signer-only: queue() reverts for non-signers.
 */
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
  const [kind, setKind] = useState<"TransferEth" | "UnstoredCall">("TransferEth");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [data, setData] = useState("0x");

  const queue = useQueueOperation(wallet, () => {
    setTo("");
    setAmount("");
    setData("0x");
    onDone();
    onClose();
  });

  const run = () => {
    if (!isAddress(to)) return; // guarded by disabled below
    const value = amount ? parseEther(amount) : 0n;
    const input: QueueInput =
      kind === "TransferEth"
        ? { kind: "TransferEth", target: getAddress(to), amount: value }
        : { kind: "UnstoredCall", target: getAddress(to), value, payload: isHex(data) ? data : "0x" };
    queue.mutate(input);
  };

  const invalidTo = to.length > 0 && !isAddress(to);
  const invalidData = kind === "UnstoredCall" && data.length > 0 && !isHex(data);

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
          <Button onClick={run} disabled={queue.isPending || !isAddress(to) || invalidData}>
            {queue.isPending ? "Queuing…" : "Queue on-chain"}
          </Button>
        </>
      }
    >
      <div className="flex gap-2">
        {(["TransferEth", "UnstoredCall"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={[
              "flex-1 border px-3 py-2 font-mono text-[11px] uppercase tracking-label transition-colors",
              kind === k ? "border-ink bg-ink text-paper" : "border-line text-body hover:border-ink",
            ].join(" ")}
          >
            {k === "TransferEth" ? "Send ETH" : "Contract call"}
          </button>
        ))}
      </div>

      <Input label="To" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} error={invalidTo ? "invalid address" : undefined} />
      <Input
        label={kind === "TransferEth" ? "Amount" : "Value"}
        unit="ETH"
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
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

      {queue.error && <span className="text-xs text-signal">{queue.error.message}</span>}
    </Modal>
  );
}
