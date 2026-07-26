import { concatHex, encodeAbiParameters, getAddress, type Address, type Hex } from "viem";
import { SELECTORS } from "./selectors.js";
import type { Operation } from "./operations.js";
import { encodeOperation } from "./operationCodec.js";

/**
 * Calldata builders for the multisig's outer entrypoints.
 *
 * The OUTER layer (nonce / bytes args) is standard Solidity ABI and is fully
 * implemented + covered by the golden vectors. The `Operation` argument of
 * queue() uses Solcore's non-standard sum encoding and is delegated to
 * ./operationCodec.ts.
 */

/**
 * initialize(address owner) — the proxy-pattern "constructor". Must be called
 * once after deploying the Multisig runtime; it sets `owner` as signer[0] with
 * threshold 1 (reverts if already initialized).
 */
export function encodeInitialize(owner: Address): Hex {
  return concatHex([SELECTORS.initialize, encodeAbiParameters([{ type: "address" }], [getAddress(owner)])]);
}

/** approve(uint256 nonce) */
export function encodeApprove(nonce: bigint): Hex {
  return concatHex([SELECTORS.approve, encodeAbiParameters([{ type: "uint256" }], [nonce])]);
}

/** reject(uint256 nonce) */
export function encodeReject(nonce: bigint): Hex {
  return concatHex([SELECTORS.reject, encodeAbiParameters([{ type: "uint256" }], [nonce])]);
}

/**
 * execute(uint256 nonce, bytes payload)
 * `payload` is only meaningful for UnstoredCall operations (the preimage); pass
 * "0x" for every other op kind.
 */
export function encodeExecute(nonce: bigint, payload: Hex = "0x"): Hex {
  return concatHex([
    SELECTORS.execute,
    encodeAbiParameters([{ type: "uint256" }, { type: "bytes" }], [nonce, payload]),
  ]);
}

/** queue(Operation) — depends on the sum-type codec (Phase 2). */
export function encodeQueue(op: Operation): Hex {
  return concatHex([SELECTORS.queue, encodeOperation(op)]);
}
