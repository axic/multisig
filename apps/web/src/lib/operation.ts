import type { Operation as CoreOperation } from "@multisig/core";
import { formatWei, truncateAddress } from "./format.js";
import { getPreimage } from "./registry.js";

/** One-line human summary of an operation from its on-chain fields. */
export function operationSummary(op: CoreOperation): string {
  switch (op.tag) {
    case "TransferEth":
      return `Send ${formatWei(op.amount)} ETH to ${truncateAddress(op.target)}`;
    case "TransferToken":
      return `Send token ${truncateAddress(op.token)} → ${truncateAddress(op.target)}`;
    case "Call":
      return `Call ${truncateAddress(op.target)}${op.value ? ` with ${formatWei(op.value)} ETH` : ""}`;
    case "UnstoredCall": {
      // Only the hash is on chain; if we kept the preimage locally, describe it.
      const pre = getPreimage(op.hash);
      if (pre) {
        const value = BigInt(pre.value || "0");
        return `Call ${truncateAddress(pre.target)}${value ? ` with ${formatWei(value)} ETH` : ""}`;
      }
      return `Unstored call ${truncateAddress(op.hash)}`;
    }
    case "AddSigner":
      return `Add signer ${truncateAddress(op.signer)}`;
    case "RemoveSigner":
      return `Remove signer ${truncateAddress(op.signer)}`;
    case "ChangeSigRequired":
      return `Change threshold to ${op.count}`;
    case "ApproveSignedHash":
      return `Approve signed hash ${truncateAddress(op.hash)}`;
    case "RevokeSignedHash":
      return `Revoke signed hash ${truncateAddress(op.hash)}`;
    default:
      return (op as { tag: string }).tag;
  }
}

/** Does executing this op need the UnstoredCall preimage as the payload? */
export function needsPreimage(op: CoreOperation): boolean {
  return op.tag === "UnstoredCall";
}
