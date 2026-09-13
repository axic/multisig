import {
  concatHex,
  getAddress,
  hexToBigInt,
  keccak256,
  padHex,
  size,
  slice,
  toHex,
  type Hex,
} from "viem";
import { OPERATION_TAGS, type Operation, type OperationTag } from "./operations.js";

/**
 * Codec for Solcore ADTs on the ABI wire — the `Operation` sum as
 * `queue(Operation)` calldata and as the `getOperation` return.
 *
 * ## Wire format
 *
 * A multi-constructor ADT is discriminated by ONE 32-byte tag word,
 * `keccak256("Name(argSigs)")` — the same shape a method selector hashes, kept
 * at full width. (Solcore's *internal* representation is still a right-nested
 * `inl`/`inr` sum; only the ABI boundary carries the keccak tag. See
 * std/ABIGeneric.solc `encodeVariant` / `abiSumReader` and the per-type
 * instances DeriveGeneric emits.)
 *
 * Whether the tag+fields sit inline or behind an offset follows the ordinary
 * ABI static/dynamic rule, decided on the ADT's structural representation:
 *
 *   static ADT  (no variant carries a dynamic field)
 *       [tag][variant fields…]                         inline, `headSize` wide
 *
 *   dynamic ADT (some variant carries `bytes`)
 *       head: [offset]                                 one word
 *       body: [tag][variant fields…][dynamic tails…]   `BODY_SIZE` wide
 *
 * `Operation` is dynamic — `Call(address,uint256,bytes)` drags a dynamic field
 * in — so every operation on the wire is `[0x20][tag][fields…]`, the body
 * padded out to the widest variant. Offsets inside the body (the `Call`
 * payload) are relative to the body, not to the start of the data.
 *
 * Verified by executing the deployed runtime: see test/vectors/multisig.json,
 * whose `sum` entries are the calldata/returndata this contract actually
 * accepts and produces.
 */

const WORD = 32;

/** ABI signature of a field, in Solcore's `SigString` spelling. */
type FieldSig = "address" | "uint256" | "bytes32" | "bytes";

/**
 * Each variant's fields, in declaration order, paired with the Operation
 * property they map to. The signature string feeds the tag hash, so these
 * spellings are load-bearing: renaming a constructor or retyping a field
 * changes the tag and silently breaks the wire.
 */
const VARIANT_FIELDS: Record<OperationTag, readonly (readonly [string, FieldSig])[]> = {
  AddSigner: [["signer", "address"]],
  RemoveSigner: [["signer", "address"]],
  ChangeSigRequired: [["count", "uint256"]],
  TransferEth: [
    ["target", "address"],
    ["amount", "uint256"],
  ],
  TransferToken: [
    ["target", "address"],
    ["token", "address"],
    ["amount", "uint256"],
  ],
  Call: [
    ["target", "address"],
    ["value", "uint256"],
    ["payload", "bytes"],
  ],
  UnstoredCall: [["hash", "bytes32"]],
  ApproveSignedHash: [["hash", "bytes32"]],
  RevokeSignedHash: [["hash", "bytes32"]],
};

/** `keccak256("Name(argSigs)")` — the variant's wire discriminant. */
export function variantTag(tag: OperationTag): Hex {
  const args = VARIANT_FIELDS[tag].map(([, sig]) => sig).join(",");
  return keccak256(toHex(`${tag}(${args})`));
}

const TAG_OF = new Map<OperationTag, Hex>(OPERATION_TAGS.map((t) => [t, variantTag(t)]));
const TAG_TO_VARIANT = new Map<Hex, OperationTag>([...TAG_OF].map(([t, h]) => [h, t]));

/** Head width of one variant's field product (a dynamic field contributes its offset word). */
const variantHead = (tag: OperationTag): number => VARIANT_FIELDS[tag].length * WORD;

/**
 * Bytes the body occupies: the tag word plus the widest variant's head. Every
 * variant reserves the same width (shorter ones are zero-padded), which is what
 * makes the body's dynamic tails start at a variant-independent offset.
 */
export const OPERATION_BODY_SIZE =
  WORD + Math.max(...OPERATION_TAGS.map(variantHead));

// ─── encoding ────────────────────────────────────────────────────────────────

/** A byte buffer that grows on write and zero-fills the gaps. */
class Region {
  private bytes: number[] = [];

  write(at: number, hex: Hex): void {
    const raw = hex.slice(2);
    while (this.bytes.length < at + raw.length / 2) this.bytes.push(0);
    for (let i = 0; i < raw.length; i += 2) {
      this.bytes[at + i / 2] = parseInt(raw.slice(i, i + 2), 16);
    }
  }

  pad(to: number): void {
    while (this.bytes.length < to) this.bytes.push(0);
  }

  hex(): Hex {
    return `0x${this.bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
}

const uintWord = (n: bigint): Hex => padHex(toHex(n), { size: WORD });
const addrWord = (a: string): Hex => padHex(getAddress(a).toLowerCase() as Hex, { size: WORD });

function fieldWord(sig: Exclude<FieldSig, "bytes">, value: unknown): Hex {
  switch (sig) {
    case "address":
      return addrWord(value as string);
    case "uint256":
      return uintWord(value as bigint);
    case "bytes32": {
      const h = value as Hex;
      if (size(h) !== WORD) throw new Error(`expected bytes32, got ${size(h)} bytes`);
      return h;
    }
  }
}

/**
 * Encode an Operation as the `queue(Operation)` argument / `getOperation`
 * return (no selector): `[offset][tag][fields…]`.
 */
export function encodeOperation(op: Operation): Hex {
  const tag = TAG_OF.get(op.tag);
  if (!tag) throw new Error(`unknown Operation tag: ${op.tag}`);

  const out = new Region();
  const body = WORD; // the single head word is the offset to the body
  out.write(0, uintWord(BigInt(body)));
  out.write(body, tag);

  // Field heads sit inline after the tag; a `bytes` field puts an offset there
  // (relative to the body) and appends [length][data] after the reserved body.
  let offset = body + WORD;
  let tail = body + OPERATION_BODY_SIZE;
  for (const [key, sig] of VARIANT_FIELDS[op.tag]) {
    const value = (op as unknown as Record<string, unknown>)[key];
    if (sig === "bytes") {
      const data = (value ?? "0x") as Hex;
      out.write(offset, uintWord(BigInt(tail - body)));
      out.write(tail, uintWord(BigInt(size(data))));
      if (size(data) > 0) out.write(tail + WORD, data);
      tail += WORD + Math.ceil(size(data) / WORD) * WORD;
    } else {
      out.write(offset, fieldWord(sig, value));
    }
    offset += WORD;
  }

  out.pad(tail);
  return out.hex();
}

// ─── decoding ────────────────────────────────────────────────────────────────

const wordAt = (data: Hex, at: number): Hex => slice(data, at, at + WORD);
const uintAt = (data: Hex, at: number): bigint => hexToBigInt(wordAt(data, at));

/** Decode the inverse of {@link encodeOperation}. */
export function decodeOperation(data: Hex): Operation {
  if (size(data) < WORD) throw new Error(`operation data too short: ${size(data)} bytes`);

  const body = Number(uintAt(data, 0));
  if (size(data) < body + WORD) {
    throw new Error(`operation body offset ${body} is past the end (${size(data)} bytes)`);
  }

  const tag = TAG_TO_VARIANT.get(wordAt(data, body));
  if (!tag) {
    throw new Error(
      `unknown Operation variant tag ${wordAt(data, body)} — the contract's ABI wire ` +
        `format has changed, or this is not getOperation returndata`,
    );
  }

  const op: Record<string, unknown> = { tag };
  let offset = body + WORD;
  for (const [key, sig] of VARIANT_FIELDS[tag]) {
    if (sig === "bytes") {
      const at = body + Number(uintAt(data, offset));
      const len = Number(uintAt(data, at));
      op[key] = len === 0 ? "0x" : slice(data, at + WORD, at + WORD + len);
    } else if (sig === "address") {
      op[key] = getAddress(slice(data, offset + 12, offset + WORD));
    } else if (sig === "bytes32") {
      op[key] = wordAt(data, offset);
    } else {
      op[key] = uintAt(data, offset);
    }
    offset += WORD;
  }
  return op as unknown as Operation;
}

// ─── static ADTs (OperationStatus, Vote) ─────────────────────────────────────

/**
 * Read the tag of a STATIC ADT return — laid out inline as `[tag][fields…]`,
 * with no leading offset word. Returns the matching name from `names`.
 */
export function decodeStaticVariant<T extends string>(data: Hex, names: readonly T[]): T {
  const tag = wordAt(data, 0);
  for (const name of names) {
    if (keccak256(toHex(name)) === tag) return name;
  }
  throw new Error(`unknown variant tag ${tag} (expected one of ${names.join(", ")})`);
}

/** Field word of a static ADT (index 0 is the first field after the tag). */
export const staticVariantField = (data: Hex, i: number): Hex => wordAt(data, WORD + i * WORD);
