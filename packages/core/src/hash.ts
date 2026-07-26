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
import { OPERATION_KIND_TAGS, type Operation, type OperationKind } from "./operations.js";

/**
 * Operation signing-hash — the EIP-712 digest a relayed `Signature` must sign,
 * mirroring the on-chain `create_signature_hash(kind, operation)` exactly.
 *
 * The contract signs
 *   keccak256(0x1901 || domainSeparator || hashStruct(message))
 * with message type `MultisigOperation(uint256 kind,bytes operation)` where:
 *   - `kind`      is 0/1/2 for Queue/Approve/Reject;
 *   - `operation` is a FLAT `[tag word][field words...]` byte string — tag is
 *     the plain variant index 0..8 (NOT the nested-binary-sum used by queue()
 *     calldata), scalar fields as 32-byte words, and `Call`'s dynamic payload
 *     appended verbatim. Per EIP-712 the dynamic `bytes` member is hashed, so
 *     hashStruct binds `keccak256(operation)`.
 * Domain: `EIP712Domain(string name,string version,uint256 chainId,address
 * verifyingContract)` with name "Multisig", version "1".
 *
 * NOTE: faithful to the Solidity but not yet cross-checked against an on-chain
 * digest (no devnet here); the unit tests pin the sub-hashes to guard the shape.
 */
export interface SigningContext {
  chainId: number | bigint;
  /** The multisig contract address (EIP-712 verifyingContract). */
  verifyingContract: Address;
}

const w = (h: Hex): Hex => padHex(h, { size: 32 });
// Casing is irrelevant to keccak (it hashes bytes), but emit canonical lowercase.
const addrWord = (a: Address): Hex => padHex(getAddress(a).toLowerCase() as Hex, { size: 32 });

/** The flat `[tag][fields...]` preimage the struct hash binds via keccak256. */
export function operationPreimage(operation: Operation): Hex {
  const tag = (n: number): Hex => w(toHex(n));
  switch (operation.tag) {
    case "AddSigner":
      return concatHex([tag(0), addrWord(operation.signer)]);
    case "RemoveSigner":
      return concatHex([tag(1), addrWord(operation.signer)]);
    case "ChangeSigRequired":
      return concatHex([tag(2), w(toHex(operation.count))]);
    case "TransferEth":
      return concatHex([tag(3), addrWord(operation.target), w(toHex(operation.amount))]);
    case "TransferToken":
      return concatHex([tag(4), addrWord(operation.target), addrWord(operation.token), w(toHex(operation.amount))]);
    case "Call":
      // payload appended verbatim (unpadded), matching the contract.
      return concatHex([tag(5), addrWord(operation.target), w(toHex(operation.value)), operation.payload]);
    case "UnstoredCall":
      return concatHex([tag(6), operation.hash]);
    case "ApproveSignedHash":
      return concatHex([tag(7), operation.hash]);
    case "RevokeSignedHash":
      return concatHex([tag(8), operation.hash]);
  }
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
