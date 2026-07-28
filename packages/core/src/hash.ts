import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  hexToBigInt,
  keccak256,
  padHex,
  size,
  slice,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { OPERATION_KIND_TAGS, OPERATION_TAGS, type Operation, type OperationKind } from "./operations.js";

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

/**
 * Inverse of {@link operationPreimage}: decode the flat `[tag word][field
 * words...]` byte string back into an `Operation`.
 *
 * This is the exact wire format the on-chain `getOperation(i)` getter returns
 * (as a `bytes`) — the contract builds it with the very same match that
 * `create_signature_hash` hashes. The tag is the plain variant index 0..8 (NOT
 * the nested binary-sum tags that `queue()` calldata uses — see
 * ./operationCodec.ts), each scalar field is a 32-byte word, and `Call`'s
 * dynamic payload is the verbatim trailing bytes.
 */
export function decodeOperationPreimage(payload: Hex): Operation {
  if (size(payload) < 32) throw new Error(`operation preimage too short: ${size(payload)} bytes`);
  const wordAt = (i: number): Hex => slice(payload, i * 32, (i + 1) * 32);
  const uint = (i: number): bigint => hexToBigInt(wordAt(i));
  const addr = (i: number): Address => getAddress(slice(wordAt(i), 12, 32));
  const tag = Number(uint(0));
  const name = OPERATION_TAGS[tag];
  switch (name) {
    case "AddSigner":
      return { tag: name, signer: addr(1) };
    case "RemoveSigner":
      return { tag: name, signer: addr(1) };
    case "ChangeSigRequired":
      return { tag: name, count: uint(1) };
    case "TransferEth":
      return { tag: name, target: addr(1), amount: uint(2) };
    case "TransferToken":
      return { tag: name, target: addr(1), token: addr(2), amount: uint(3) };
    case "Call":
      // Everything after [tag][target][value] is the verbatim call payload.
      return { tag: name, target: addr(1), value: uint(2), payload: size(payload) > 96 ? slice(payload, 96) : "0x" };
    case "UnstoredCall":
      return { tag: name, hash: wordAt(1) };
    case "ApproveSignedHash":
      return { tag: name, hash: wordAt(1) };
    case "RevokeSignedHash":
      return { tag: name, hash: wordAt(1) };
    default:
      throw new Error(`decodeOperationPreimage: unknown operation tag ${tag}`);
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
