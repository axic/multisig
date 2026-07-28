import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  hexToBigInt,
  slice,
  type Address,
  type Hex,
} from "viem";
import { GETTER_SELECTORS } from "./selectors.js";
import { decodeOperationPreimage } from "./hash.js";
import type { Operation, OperationStatus, Vote } from "./operations.js";

/**
 * Read-side codec for the Multisig's on-chain getters.
 *
 * The whole point of the getters is to let the app render wallet state — the
 * signer set, threshold, nonce, and the full operation queue with statuses and
 * votes — straight from chain, with no off-chain index. Each getter is a plain
 * `staticcall`: build the calldata here, `eth_call` it, and decode the return.
 *
 * The scalar getters (uint256/address/bool) use standard ABI. `OperationStatus`
 * and `Vote` are *static* Solcore sums, returned inline in the right-nested
 * binary-sum layout (tag word 0 = inl, 1 = inr; fields inline; see
 * ./operationCodec.ts and std/ABIGeneric.solc), with NO leading offset word. We
 * decode those by hand below.
 *
 * `Operation` is different: it is a *dynamic* sum (its `Call` variant carries a
 * dynamic `bytes`), and Solcore can't yet ABI-encode a dynamic sum as a return
 * value — it emits only the head tag word, so the whole operation would come
 * back as a single `0x00…0`. So `getOperation(i)` returns the operation as a
 * plain `bytes`: the flat `[tag][fields...]` encoding (the same bytes
 * `create_signature_hash` hashes), which we decode via `decodeOperationReturn`.
 */

const WORD = 32;

// ─── calldata builders ───────────────────────────────────────────────────────

/** getSignersRequired() -> uint256 */
export const encodeGetSignersRequired = (): Hex => GETTER_SELECTORS.getSignersRequired;

/** getSignersCount() -> uint256 */
export const encodeGetSignersCount = (): Hex => GETTER_SELECTORS.getSignersCount;

/** getNonce() -> uint256 */
export const encodeGetNonce = (): Hex => GETTER_SELECTORS.getNonce;

/** getOperationsCount() -> uint256 */
export const encodeGetOperationsCount = (): Hex => GETTER_SELECTORS.getOperationsCount;

const withUint = (selector: Hex, i: bigint): Hex =>
  concatHex([selector, encodeAbiParameters([{ type: "uint256" }], [i])]);

/** getSigner(uint256 i) -> address */
export const encodeGetSigner = (i: bigint): Hex => withUint(GETTER_SELECTORS.getSigner, i);

/** getOperation(uint256 i) -> bytes (flat `[tag][fields...]` operation encoding) */
export const encodeGetOperation = (i: bigint): Hex => withUint(GETTER_SELECTORS.getOperation, i);

/** getStatus(uint256 i) -> OperationStatus */
export const encodeGetStatus = (i: bigint): Hex => withUint(GETTER_SELECTORS.getStatus, i);

/** getVote(uint256 i, address signer) -> Vote */
export const encodeGetVote = (i: bigint, signer: Address): Hex =>
  concatHex([
    GETTER_SELECTORS.getVote,
    encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [i, getAddress(signer)]),
  ]);

/** isHashApproved(bytes32 hash) -> bool */
export const encodeIsHashApproved = (hash: Hex): Hex =>
  concatHex([GETTER_SELECTORS.isHashApproved, encodeAbiParameters([{ type: "bytes32" }], [hash])]);

/** isSigner(address) -> bool */
export const encodeIsSigner = (signer: Address): Hex =>
  concatHex([GETTER_SELECTORS.isSigner, encodeAbiParameters([{ type: "address" }], [getAddress(signer)])]);

// ─── return decoders ─────────────────────────────────────────────────────────

const word = (data: Hex, i: number): Hex => slice(data, i * WORD, (i + 1) * WORD);
const wordUint = (data: Hex, i: number): bigint => hexToBigInt(word(data, i));

/** Decode a single `uint256` return. */
export const decodeUint = (data: Hex): bigint => wordUint(data, 0);

/** Decode a single `address` return (right-aligned in the first word). */
export const decodeAddress = (data: Hex): Address => getAddress(slice(data, 12, WORD));

/** Decode a single `bool` return. */
export const decodeBool = (data: Hex): boolean => wordUint(data, 0) !== 0n;

/**
 * Decode an `Operation` return.
 *
 * `getOperation(i)` returns the operation as a plain ABI `bytes` value (head =
 * a 32-byte offset, then `[length][data]` in the tail). We can't return the
 * `Operation` sum directly: it is a *dynamic* sum (the `Call` variant carries a
 * dynamic `bytes`), and Solcore's generic ABI encoder can't yet return a
 * dynamic sum as a value — it emits only the head word, collapsing the whole
 * operation to a single `0x00…0`. So the getter hands back the flat
 * `[tag][fields...]` byte encoding instead (the same bytes
 * `create_signature_hash` builds; see {@link decodeOperationPreimage}), which
 * rides the well-exercised `bytes` return path.
 */
export function decodeOperationReturn(data: Hex): Operation {
  const [payload] = decodeAbiParameters([{ type: "bytes" }], data);
  return decodeOperationPreimage(payload);
}

/**
 * Decode an `OperationStatus` return.
 *
 *   Approvals(count) -> [0][count]     (inl)
 *   Rejected         -> [1][0]         (inr, inl)
 *   Executed         -> [1][1]         (inr, inr)
 */
export function decodeOperationStatus(data: Hex): OperationStatus {
  if (wordUint(data, 0) === 0n) return { tag: "Approvals", count: wordUint(data, 1) };
  return wordUint(data, 1) === 0n ? { tag: "Rejected" } : { tag: "Executed" };
}

/**
 * Decode a `Vote` return.
 *
 *   None     -> [0]         (inl)
 *   Approved -> [1][0]      (inr, inl)
 *   Rejected -> [1][1]      (inr, inr)
 */
export function decodeVote(data: Hex): Vote {
  if (wordUint(data, 0) === 0n) return "None";
  return wordUint(data, 1) === 0n ? "Approved" : "Rejected";
}
