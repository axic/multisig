import type { Hex } from "viem";
import type { Operation, OperationKind } from "./operations.js";

/**
 * Operation signing-hash — the digest a relayed Signature must sign.
 *
 * ⚠️ The on-chain `create_signature_hash(kind, operation)` is currently a STUB:
 *
 *     return keccak256_(to_bytes(bytes32(1)));   // domain/chainId TODO
 *
 * i.e. it hashes a constant, NOT the operation. `abi.encode` is noted as "not
 * working yet" in the contract. Until that is implemented (with EIP-712 domain
 * + chainId, per the contract's TODO), the entire signature-relay feature set
 * — queueWithSignature / approveWithSignature / rejectWithSignature and
 * off-chain signature collection — cannot be built correctly.
 *
 * This function is intentionally unimplemented so the app never fabricates a
 * hash that disagrees with the contract. Direct signer calls (queue / approve /
 * reject / execute) do NOT need it and are fully usable today.
 */
export function operationSigningHash(_kind: OperationKind, _operation: Operation): Hex {
  throw new Error(
    "operationSigningHash: blocked on the contract's create_signature_hash (still a stub; " +
      "no domain/chainId, abi.encode unimplemented). Signature-relay is a later phase.",
  );
}
