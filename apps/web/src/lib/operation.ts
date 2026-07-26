import type { Operation } from "./api.js";
import { formatWei, truncateAddress } from "./format.js";

/** One-line human summary of an operation from its decoded fields. */
export function operationSummary(op: Operation): string {
  const d = op.decoded ?? {};
  switch (op.kind) {
    case "TransferEth":
      return `Send ${formatWei(d.amount ?? "0")} ETH to ${truncateAddress(d.target ?? "")}`;
    case "TransferToken":
      return `Send token ${truncateAddress(d.token ?? "")} → ${truncateAddress(d.target ?? "")}`;
    case "UnstoredCall":
      return d.target
        ? `Call ${truncateAddress(d.target)}${d.value && d.value !== "0" ? ` with ${formatWei(d.value)} ETH` : ""}`
        : `Unstored call ${truncateAddress(d.hash ?? "")}`;
    case "AddSigner":
      return `Add signer ${truncateAddress(d.signer ?? "")}`;
    case "RemoveSigner":
      return `Remove signer ${truncateAddress(d.signer ?? "")}`;
    case "ChangeSigRequired":
      return `Change threshold to ${d.count ?? "?"}`;
    case "ApproveSignedHash":
      return `Approve signed hash ${truncateAddress(d.hash ?? "")}`;
    case "RevokeSignedHash":
      return `Revoke signed hash ${truncateAddress(d.hash ?? "")}`;
    default:
      return op.kind;
  }
}

/** Does executing this op need the UnstoredCall preimage as the payload? */
export function needsPreimage(op: Operation): boolean {
  return op.kind === "UnstoredCall";
}
