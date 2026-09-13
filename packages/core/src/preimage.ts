import { concatHex, getAddress, keccak256, padHex, toHex, type Address, type Hex } from "viem";
import type { Operation } from "./operations.js";

/**
 * `UnstoredCall` preimage helpers.
 *
 * The on-chain `UnstoredCall(bytes32)` op stores only a hash; the preimage is
 * supplied at `execute(nonce, payload)` time and re-hashed by the contract.
 * Its execute-side assembly reads the payload as
 *   [32: target][32: value][.. inner calldata ..]   (length >= 64)
 * and calls `target` with `value` and the trailing calldata. So the preimage
 * is `pad32(target) || pad32(value) || innerData`, and the stored hash is its
 * keccak256. Losing the preimage makes the queued op un-executable — which is
 * why the app persists it (see apps/db UnstoredCallPreimage).
 *
 * This lets the app express an arbitrary contract call (the dynamic `Call`
 * variant) as an `UnstoredCall`, trading on-chain payload storage for a
 * preimage the caller must keep. `Call` is now encodable too (see
 * ./operationCodec.ts), so this is a storage-cost choice, not a limitation.
 */
export function unstoredCallPayload(target: Address, value: bigint, innerData: Hex): Hex {
  return concatHex([padHex(getAddress(target), { size: 32 }), padHex(toHex(value), { size: 32 }), innerData]);
}

export function unstoredCallHash(target: Address, value: bigint, innerData: Hex): Hex {
  return keccak256(unstoredCallPayload(target, value, innerData));
}

/** Build the `UnstoredCall` Operation for an arbitrary call. */
export function unstoredCallOperation(target: Address, value: bigint, innerData: Hex): Operation {
  return { tag: "UnstoredCall", hash: unstoredCallHash(target, value, innerData) };
}
