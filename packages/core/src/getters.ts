import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  hexToBigInt,
  padHex,
  size,
  slice,
  type Address,
  type Hex,
} from "viem";
import { GETTER_SELECTORS } from "./selectors.js";
import { decodeOperation, OPERATION_WORDS } from "./operationCodec.js";
import type { Operation, OperationStatus, Vote } from "./operations.js";

/**
 * Read-side codec for the Multisig's on-chain getters.
 *
 * The whole point of the getters is to let the app render wallet state — the
 * signer set, threshold, nonce, and the full operation queue with statuses and
 * votes — straight from chain, with no off-chain index. Each getter is a plain
 * `staticcall`: build the calldata here, `eth_call` it, and decode the return.
 *
 * The scalar getters (uint256/address/bool) use standard ABI. The three that
 * return a Solcore sum (`Operation`, `OperationStatus`, `Vote`) come back in the
 * same right-nested binary-sum layout Solcore uses everywhere (tag word 0 = inl,
 * 1 = inr; fields inline; see ./operationCodec.ts and std/ABIGeneric.solc), with
 * NO leading offset word — `abi_encode` writes the head from byte 0. We decode
 * that layout by hand below.
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

/** getOperation(uint256 i) -> Operation */
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
 * The layout is identical to the `queue(Operation)` argument — the same generic
 * sum encoding produces both — so we reuse the golden-vector-validated
 * {@link decodeOperation}. That decoder wants the full fixed head width; the
 * getter always returns exactly that (`headSize` == OPERATION_WORDS words), but
 * we defensively right-pad in case a build returns a tighter head.
 */
export function decodeOperationReturn(data: Hex): Operation {
  const words = Math.floor(size(data) / WORD);
  const padded = words < OPERATION_WORDS ? padHex(data, { dir: "right", size: OPERATION_WORDS * WORD }) : data;
  return decodeOperation(padded);
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
