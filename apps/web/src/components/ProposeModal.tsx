import { useState } from "react";
import type { Operation, OperationTag } from "@multisig/core";
import { isAddress, parseEther, type Address } from "viem";
import { Button } from "./Button.js";
import { Input } from "./Input.js";
import { Modal } from "./Modal.js";

/**
 * Propose (queue) a new operation. Covers the on-chain-method operations the
 * app drives: an ETH transfer (M2) plus the owner/threshold management ops (M4).
 * Token transfers and arbitrary calls are out of scope for this pass.
 */
type Kind = Extract<OperationTag, "TransferEth" | "AddSigner" | "RemoveSigner" | "ChangeSigRequired">;

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "TransferEth", label: "Transfer ETH" },
  { kind: "AddSigner", label: "Add signer" },
  { kind: "RemoveSigner", label: "Remove signer" },
  { kind: "ChangeSigRequired", label: "Change threshold" },
];

export interface ProposeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (op: Operation) => Promise<void> | void;
  busy?: boolean;
}

export function ProposeModal({ open, onClose, onSubmit, busy = false }: ProposeModalProps) {
  const [kind, setKind] = useState<Kind>("TransferEth");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [signer, setSigner] = useState("");
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function build(): Operation {
    switch (kind) {
      case "TransferEth": {
        if (!isAddress(target)) throw new Error("Enter a valid target address");
        return { tag: "TransferEth", target: target as Address, amount: parseEther(amount || "0") };
      }
      case "AddSigner":
        if (!isAddress(signer)) throw new Error("Enter a valid signer address");
        return { tag: "AddSigner", signer: signer as Address };
      case "RemoveSigner":
        if (!isAddress(signer)) throw new Error("Enter a valid signer address");
        return { tag: "RemoveSigner", signer: signer as Address };
      case "ChangeSigRequired": {
        const n = BigInt(count || "0");
        if (n < 1n) throw new Error("Threshold must be at least 1");
        return { tag: "ChangeSigRequired", count: n };
      }
    }
  }

  async function submit() {
    setError(null);
    let op: Operation;
    try {
      op = build();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    try {
      await onSubmit(op);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Propose operation"
      footer={
        <>
          <Button variant="tertiary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "Queuing…" : "Queue operation"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-body">Kind</span>
          <div className="grid grid-cols-2 gap-px border border-line bg-line">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                onClick={() => setKind(k.kind)}
                className={`px-3 py-2.5 text-left text-xs transition-colors ${
                  kind === k.kind ? "bg-ink text-paper" : "bg-paper text-body hover:bg-panel"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {kind === "TransferEth" && (
          <>
            <Input
              label="Target"
              placeholder="0x…"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <Input
              label="Amount"
              unit="ETH"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </>
        )}

        {(kind === "AddSigner" || kind === "RemoveSigner") && (
          <Input
            label="Signer address"
            placeholder="0x…"
            value={signer}
            onChange={(e) => setSigner(e.target.value)}
          />
        )}

        {kind === "ChangeSigRequired" && (
          <Input
            label="New threshold"
            placeholder="2"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        )}

        {error && <span className="text-xs text-signal">{error}</span>}
      </div>
    </Modal>
  );
}
