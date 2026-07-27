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
  /** initialize(address owner) — the proxy-pattern "constructor" (sets signer[0]) */
  initialize: "0xc4d66de8",
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
 * Function selectors for the Multisig's public *getters* (added to
 * Wallet.solc so the app can read all state directly from chain instead of an
 * off-chain index).
 *
 * Solcore derives a method selector as `keccak256(name "(" argSig ")")[:4]`
 * (see std/dispatch.solc `Method:Selector` / `SigString`), where `argSig` is
 * the comma-joined ABI signature of the argument tuple. For scalar arguments
 * (`uint256`, `address`, `bytes32`) this is byte-for-byte the standard Solidity
 * selector — verified: the pinned `approve(uint256)` / `reject(uint256)` /
 * `execute(uint256,bytes)` / `initialize(address)` values above are exactly
 * `keccak256(sig)[:4]`. The getters below all take scalar args, so their
 * selectors are the standard ones and need no golden vector.
 */
export const GETTER_SELECTORS = {
  /** getSignersRequired() -> uint256 */
  getSignersRequired: "0x9bafbc3f",
  /** getSignersCount() -> uint256 */
  getSignersCount: "0xa0c1deb4",
  /** getSigner(uint256 i) -> address */
  getSigner: "0x3ffefe4e",
  /** getNonce() -> uint256 (next executable operation index) */
  getNonce: "0xd087d288",
  /** getOperationsCount() -> uint256 */
  getOperationsCount: "0xdd1033f8",
  /** getOperation(uint256 i) -> Operation (non-standard sum encoding) */
  getOperation: "0x202e3924",
  /** getStatus(uint256 i) -> OperationStatus (non-standard sum encoding) */
  getStatus: "0x5c622a0e",
  /** getVote(uint256 i, address signer) -> Vote (non-standard sum encoding) */
  getVote: "0xbc3f931f",
  /** isHashApproved(bytes32 hash) -> bool */
  isHashApproved: "0xb76eefe2",
  /** isSigner(address) -> bool */
  isSigner: "0x7df73e27",
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
