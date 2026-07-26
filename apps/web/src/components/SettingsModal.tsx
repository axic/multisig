import { useState } from "react";
import { getAddress, isAddress } from "viem";
import type { Wallet } from "../lib/api.js";
import { useQueueOperation, type QueueInput } from "../lib/useOperationActions.js";
import { Address } from "./data.js";
import { Button } from "./Button.js";
import { Input } from "./Input.js";
import { Modal } from "./Modal.js";

/**
 * Signer / threshold management. Each change is a real on-chain operation
 * (AddSigner / RemoveSigner / ChangeSigRequired) that goes through the same
 * queue → approve → execute flow as a transfer. The cached signer set updates
 * when the op executes.
 */
export function SettingsModal({
  wallet,
  open,
  onClose,
  onDone,
}: {
  wallet: Wallet;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"AddSigner" | "RemoveSigner" | "ChangeSigRequired">("AddSigner");
  const [signer, setSigner] = useState("");
  const [threshold, setThreshold] = useState(String(wallet.signersRequired));
  const [removeAddr, setRemoveAddr] = useState("");
  const [localErr, setLocalErr] = useState<string>();

  const queue = useQueueOperation(wallet, () => {
    setSigner("");
    onDone();
    onClose();
  });

  const run = () => {
    setLocalErr(undefined);
    let input: QueueInput;
    if (tab === "AddSigner") {
      if (!isAddress(signer)) return setLocalErr("enter a valid address");
      input = { kind: "AddSigner", signer: getAddress(signer) };
    } else if (tab === "RemoveSigner") {
      if (!isAddress(removeAddr)) return setLocalErr("select a signer to remove");
      input = { kind: "RemoveSigner", signer: getAddress(removeAddr) };
    } else {
      const t = Number(threshold);
      if (!Number.isInteger(t) || t < 1 || t > wallet.signersCount) {
        return setLocalErr(`threshold must be 1…${wallet.signersCount}`);
      }
      input = { kind: "ChangeSigRequired", count: BigInt(t) };
    }
    queue.mutate(input);
  };

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "AddSigner", label: "Add signer" },
    { key: "RemoveSigner", label: "Remove signer" },
    { key: "ChangeSigRequired", label: "Threshold" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={run} disabled={queue.isPending}>
            {queue.isPending ? "Queuing…" : "Queue change"}
          </Button>
        </>
      }
    >
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "flex-1 border px-2 py-2 font-mono text-[11px] uppercase tracking-label transition-colors",
              tab === t.key ? "border-ink bg-ink text-paper" : "border-line text-body hover:border-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "AddSigner" && (
        <Input label="New signer" placeholder="0x…" value={signer} onChange={(e) => setSigner(e.target.value)} />
      )}

      {tab === "RemoveSigner" && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-body">Signer to remove</span>
          <div className="flex flex-col gap-px border border-line bg-line">
            {wallet.signers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setRemoveAddr(s.address)}
                className={[
                  "flex items-center justify-between bg-paper px-3.5 py-2.5 text-left transition-colors hover:bg-panel",
                  removeAddr === s.address ? "outline outline-1 outline-ink" : "",
                ].join(" ")}
              >
                <Address value={s.address} />
                {removeAddr === s.address && <span className="font-mono text-[11px] text-signal">selected</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "ChangeSigRequired" && (
        <Input label={`Threshold (1…${wallet.signersCount})`} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      )}

      {(localErr || queue.error) && <span className="text-xs text-signal">{localErr ?? queue.error?.message}</span>}
    </Modal>
  );
}
