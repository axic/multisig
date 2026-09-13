import type { Operation as CoreOperation } from "@multisig/core";
import { formatUnits } from "viem";
import { formatWei, truncateAddress } from "./format.js";
import { getPreimage, getTokenMeta } from "./registry.js";

/**
 * One-line human summary of an operation from its on-chain fields.
 *
 * `chainId` is only needed to look up locally cached token metadata, which
 * turns a `TransferToken`'s raw base-unit amount into "1.5 USDC"; without it
 * (or on a cache miss) the base units are shown as-is.
 */
export function operationSummary(op: CoreOperation, chainId?: number): string {
  switch (op.tag) {
    case "TransferEth":
      return `Send ${formatWei(op.amount)} ETH to ${truncateAddress(op.target)}`;
    case "TransferToken": {
      const meta = chainId === undefined ? undefined : getTokenMeta(chainId, op.token);
      const value = meta
        ? `${formatUnits(op.amount, meta.decimals)} ${meta.symbol ?? truncateAddress(op.token)}`
        : `${op.amount} units of ${truncateAddress(op.token)}`;
      return `Send ${value} to ${truncateAddress(op.target)}`;
    }
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
