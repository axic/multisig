import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  keccak256,
  padHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { encodeOperation } from "./operationCodec.js";
import { OPERATION_KIND_TAGS, type Operation, type OperationKind } from "./operations.js";

/**
 * Operation signing-hash — the EIP-712 digest a relayed `Signature` must sign,
 * mirroring the on-chain `create_signature_hash(kind, operation)` exactly.
 *
 * The contract signs
 *   keccak256(0x1901 || domainSeparator || hashStruct(message))
 * with message type `MultisigOperation(uint256 kind,bytes operation)` where:
 *   - `kind`      is 0/1/2 for Queue/Approve/Reject;
 *   - `operation` is `abi_encode(operation)` — the SAME ADT wire bytes that
 *     `queue(Operation)` takes as its argument (see ./operationCodec.ts). Per
 *     EIP-712 the dynamic `bytes` member is hashed, so hashStruct binds
 *     `keccak256(operation)`.
 * Domain: `EIP712Domain(string name,string version,uint256 chainId,address
 * verifyingContract)` with name "Multisig", version "1".
 *
 * Cross-checked against the contract's own `getSignatureHash(kind, operation)`
 * getter for every kind x variant — see test/vectors/multisig.json
 * `signatureHash`, captured by executing the deployed runtime.
 */
export interface SigningContext {
  chainId: number | bigint;
  /** The multisig contract address (EIP-712 verifyingContract). */
  verifyingContract: Address;
}

const w = (h: Hex): Hex => padHex(h, { size: 32 });

/**
 * The `bytes operation` member of the signed struct: `abi_encode(operation)`.
 *
 * The contract used to hand-roll a flat `[variant index][fields]` preimage here
 * because the generic encoder could not place a dynamic sum. It can now, so
 * `create_signature_hash` just calls `abi_encode(operation)` and this is the
 * identical byte string `queue(Operation)` carries — one encoder, one format.
 */
export function operationPreimage(operation: Operation): Hex {
  return encodeOperation(operation);
}

const DOMAIN_TYPEHASH = keccak256(
  toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);
const OPERATION_TYPEHASH = keccak256(toHex("MultisigOperation(uint256 kind,bytes operation)"));

/** EIP-712 domain separator for a Multisig deployment. */
export function domainSeparator(ctx: SigningContext): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        DOMAIN_TYPEHASH,
        keccak256(toHex("Multisig")),
        keccak256(toHex("1")),
        BigInt(ctx.chainId),
        getAddress(ctx.verifyingContract),
      ],
    ),
  );
}

function kindTag(kind: OperationKind): Hex {
  return w(toHex(OPERATION_KIND_TAGS.indexOf(kind)));
}

/** hashStruct(message) = keccak256(typeHash || kind || keccak256(operation)). */
export function operationStructHash(kind: OperationKind, operation: Operation): Hex {
  return keccak256(concatHex([OPERATION_TYPEHASH, kindTag(kind), keccak256(operationPreimage(operation))]));
}

/** The full 0x1901 EIP-712 digest. */
export function operationSigningHash(
  kind: OperationKind,
  operation: Operation,
  ctx: SigningContext,
): Hex {
  return keccak256(concatHex(["0x1901", domainSeparator(ctx), operationStructHash(kind, operation)]));
}
