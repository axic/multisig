import type { Address, Hex } from "viem";

/**
 * TypeScript model of the Solcore multisig's on-chain sum types.
 *
 * Source of truth: axic/solcore @ multisig-ethglobal-rebase
 *   test/examples/dispatch/multisig.solc
 *
 * These mirror the `data Operation | Signature | OperationStatus | Vote`
 * declarations in the contract. On the ABI wire each variant is discriminated
 * by `keccak256("Name(argSigs)")` (see ./operationCodec.ts), so the NAMES and
 * FIELD TYPES are load-bearing, not the declaration order. Renaming a
 * constructor or retyping a field changes the tag — update the codec and
 * regenerate the golden vectors.
 */

/** Variant names, in the order the Solcore `data Operation` declares them. */
export type OperationTag =
  | "AddSigner"
  | "RemoveSigner"
  | "ChangeSigRequired"
  | "TransferEth"
  | "TransferToken"
  | "Call"
  | "UnstoredCall"
  | "ApproveSignedHash"
  | "RevokeSignedHash";

export const OPERATION_TAGS: readonly OperationTag[] = [
  "AddSigner",
  "RemoveSigner",
  "ChangeSigRequired",
  "TransferEth",
  "TransferToken",
  "Call",
  "UnstoredCall",
  "ApproveSignedHash",
  "RevokeSignedHash",
] as const;

export type Operation =
  | { tag: "AddSigner"; signer: Address }
  | { tag: "RemoveSigner"; signer: Address }
  | { tag: "ChangeSigRequired"; count: bigint }
  | { tag: "TransferEth"; target: Address; amount: bigint }
  | { tag: "TransferToken"; target: Address; token: Address; amount: bigint }
  | { tag: "Call"; target: Address; value: bigint; payload: Hex }
  /**
   * UnstoredCall stores ONLY the keccak256 hash on-chain. The preimage
   * (encoded as `[address target][uint256 value][bytes payload]`) is supplied
   * at execute() time and re-hashed by the contract, so the preimage has to be
   * kept off-chain (the web app keeps it in localStorage; see apps/db
   * `UnstoredCallPreimage` for the server-side index). `Call` stores its
   * payload on-chain instead and needs no preimage.
   */
  | { tag: "UnstoredCall"; hash: Hex }
  | { tag: "ApproveSignedHash"; hash: Hex }
  | { tag: "RevokeSignedHash"; hash: Hex };

/** Off-chain signature accepted by the *WithSignature relay entrypoints. */
export type Signature =
  | { tag: "ECDSA"; r: Hex; s: Hex } // EIP-2098 compact (r, vs-packed s)
  | { tag: "Contract"; contract: Address } // hash pre-approved by a signer contract
  | { tag: "EIP1271"; contract: Address; signature: Hex };

/** Which entrypoint a relayed signature authorises. */
export type OperationKind = "Queue" | "Approve" | "Reject";

export const OPERATION_KIND_TAGS: readonly OperationKind[] = [
  "Queue",
  "Approve",
  "Reject",
] as const;

/** On-chain lifecycle of a queued operation (mirrors `data OperationStatus`). */
export type OperationStatus =
  | { tag: "Approvals"; count: bigint }
  | { tag: "Rejected" }
  | { tag: "Executed" };

/** Per-signer vote on an operation (mirrors `data Vote`). */
export type Vote = "None" | "Approved" | "Rejected";

/** Config-changing operations (surfaced as "Settings" actions in the UI). */
export const CONFIG_OPERATION_TAGS: readonly OperationTag[] = [
  "AddSigner",
  "RemoveSigner",
  "ChangeSigRequired",
] as const;

export function isConfigOperation(op: Operation): boolean {
  return (CONFIG_OPERATION_TAGS as readonly string[]).includes(op.tag);
}
