import type { Hex } from "viem";

/**
 * Function selectors for the Solcore multisig.
 *
 * These are taken directly from the golden test vectors in
 * axic/solcore test/examples/dispatch/multisig.json — Solcore computes
 * selectors itself, so we pin the observed 4-byte values rather than deriving
 * them from a Solidity-style signature string (the calldata layout for the sum
 * types is non-standard; see ./operationCodec.ts).
 */
export const SELECTORS = {
  /** queue(Operation) */
  queue: "0x4ae6f8ce",
  /** approve(uint256 nonce) */
  approve: "0xb759f954",
  /** reject(uint256 nonce) */
  reject: "0xb8adaa11",
  /** execute(uint256 nonce, bytes payload) */
  execute: "0x59efcb15",
  /** EIP-1271 isValidSignature(bytes32,bytes) — return magic is 0x1626ba7e */
  isValidSignature: "0x1626ba7e",
} as const satisfies Record<string, Hex>;

/**
 * Selectors for the relay entrypoints are not yet pinned — they depend on the
 * final `create_signature_hash` scheme, which is still a stub in the contract
 * (no domain/chainId; `abi.encode` noted as not working). Fill these in from
 * on-chain vectors once the signature layer lands. See ./hash.ts.
 */
export const RELAY_SELECTORS_TODO = [
  "queueWithSignature(Operation,Signature)",
  "approveWithSignature(uint256,Signature)",
  "rejectWithSignature(uint256,Signature)",
] as const;
