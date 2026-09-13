import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  hexToBigInt,
  size,
  slice,
  type Address,
  type Hex,
} from "viem";
import { GETTER_SELECTORS } from "./selectors.js";
import { decodeOperation, decodeStaticVariant, staticVariantField } from "./operationCodec.js";
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
 * return a Solcore ADT (`Operation`, `OperationStatus`, `Vote`) come back in
 * the ABI sum layout: a single `keccak256("Name(argSigs)")` tag word, inline
 * for a static ADT and behind an offset word for a dynamic one. See
 * ./operationCodec.ts for the format and std/ABIGeneric.solc for the source.
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
 * Byte-for-byte the same layout as the `queue(Operation)` argument — one
 * derived ABIEncode instance produces both — so this is just
 * {@link decodeOperation}.
 */
export const decodeOperationReturn = decodeOperation;

/**
 * Decode an `OperationStatus` return: a static ADT, so `[tag][fields…]` inline.
 *
 *   Approvals(count) -> [keccak256("Approvals(uint256)")][count]
 *   Rejected         -> [keccak256("Rejected()")][padding]
 *   Executed         -> [keccak256("Executed()")][padding]
 */
export function decodeOperationStatus(data: Hex): OperationStatus {
  const tag = decodeStaticVariant(data, ["Approvals(uint256)", "Rejected()", "Executed()"] as const);
  if (tag === "Approvals(uint256)") {
    return { tag: "Approvals", count: hexToBigInt(staticVariantField(data, 0)) };
  }
  return { tag: tag === "Rejected()" ? "Rejected" : "Executed" };
}

/**
 * Decode a `Vote` return: a static ADT with only nullary variants, so the tag
 * word is the whole payload (one padding word follows).
 */
export function decodeVote(data: Hex): Vote {
  const tag = decodeStaticVariant(data, ["None()", "Approved()", "Rejected()"] as const);
  return tag.slice(0, -2) as Vote;
}
