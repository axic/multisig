import {
  concatHex,
  getAddress,
  hexToBigInt,
  padHex,
  size,
  slice,
  toHex,
  type Hex,
} from "viem";
import { OPERATION_TAGS, type Operation } from "./operations.js";

/**
 * Codec for the Solcore `Operation` sum type as `queue(Operation)` calldata.
 *
 * Solcore encodes a sum as a RIGHT-NESTED BINARY SUM ("sum-wide-product"):
 *
 *   - The variant is selected by a run of one-word tags: `1` = inr (go deeper),
 *     terminated by a single `0` = inl (take this branch). So variant index k
 *     is `k` ones followed by a `0` — except the LAST variant (index 8), which
 *     is 8 ones with no trailing `0` (it is the terminal inr).
 *   - The variant's product fields follow inline, one 32-byte word per scalar.
 *   - The whole thing is zero-padded to a fixed width — the widest variant —
 *     which the golden vectors pin at 10 words (see ../test/vectors).
 *
 * Verified against test/vectors/multisig.json for AddSigner + ChangeSigRequired.
 * `Call(address,uint256,bytes)` carries a DYNAMIC `bytes` payload that this
 * static encoder can't place; queue it as an `UnstoredCall` instead (hash
 * on-chain, preimage `[address][value][payload]` supplied at execute time).
 */

/** Fixed encoded width, in 32-byte words (the widest variant). */
export const OPERATION_WORDS = 10;
const WORD = 32;
const ZERO = padHex("0x", { size: WORD });

function variantIndex(tag: Operation["tag"]): number {
  const i = OPERATION_TAGS.indexOf(tag);
  if (i < 0) throw new Error(`unknown Operation tag: ${tag}`);
  return i;
}

/** The tag-word prefix selecting variant `k` (k ones, then inl unless last). */
function tagWords(k: number): Hex[] {
  const words: Hex[] = [];
  for (let i = 0; i < k; i++) words.push(padHex("0x01", { size: WORD }));
  if (k < OPERATION_TAGS.length - 1) words.push(ZERO); // terminating inl
  return words;
}

// Lowercase the (validated) address: calldata is raw bytes, and the golden
// vectors carry the un-checksummed form.
const addrWord = (a: string): Hex => padHex(getAddress(a).toLowerCase() as Hex, { size: WORD });
const uintWord = (n: bigint): Hex => padHex(toHex(n), { size: WORD });
function b32Word(h: Hex): Hex {
  if (size(h) !== WORD) throw new Error(`expected bytes32, got ${size(h)} bytes`);
  return h;
}

/** Field words for a variant (Call is rejected — use UnstoredCall). */
function fieldWords(op: Operation): Hex[] {
  switch (op.tag) {
    case "AddSigner":
    case "RemoveSigner":
      return [addrWord(op.signer)];
    case "ChangeSigRequired":
      return [uintWord(op.count)];
    case "TransferEth":
      return [addrWord(op.target), uintWord(op.amount)];
    case "TransferToken":
      return [addrWord(op.target), addrWord(op.token), uintWord(op.amount)];
    case "UnstoredCall":
    case "ApproveSignedHash":
    case "RevokeSignedHash":
      return [b32Word(op.hash)];
    case "Call":
      throw new Error(
        "encodeOperation: Call carries a dynamic bytes payload not representable by the " +
          "static sum encoder. Queue it as UnstoredCall (hash + off-chain preimage) instead.",
      );
  }
}

/** Encode an Operation as the 10-word `queue(Operation)` argument (no selector). */
export function encodeOperation(op: Operation): Hex {
  const words = [...tagWords(variantIndex(op.tag)), ...fieldWords(op)];
  if (words.length > OPERATION_WORDS) {
    throw new Error(`operation ${op.tag} exceeds ${OPERATION_WORDS} words`);
  }
  while (words.length < OPERATION_WORDS) words.push(ZERO);
  return concatHex(words);
}

/** Decode the inverse of `encodeOperation`. */
export function decodeOperation(data: Hex): Operation {
  const total = size(data);
  if (total < OPERATION_WORDS * WORD) {
    throw new Error(`operation calldata too short: ${total} bytes`);
  }
  const word = (i: number): Hex => slice(data, i * WORD, (i + 1) * WORD);
  const isOne = (h: Hex) => hexToBigInt(h) === 1n;

  // Count leading `1` tag words (capped at the last variant's depth).
  let k = 0;
  const last = OPERATION_TAGS.length - 1;
  while (k < last && isOne(word(k))) k++;
  // For k < last the current word is the terminating inl (0); fields follow it.
  const fieldStart = k < last ? k + 1 : k;
  const tag = OPERATION_TAGS[k];
  const f = (i: number) => word(fieldStart + i);
  const addr = (i: number) => getAddress(slice(f(i), 12, 32));
  const uint = (i: number) => hexToBigInt(f(i));

  switch (tag) {
    case "AddSigner":
      return { tag, signer: addr(0) };
    case "RemoveSigner":
      return { tag, signer: addr(0) };
    case "ChangeSigRequired":
      return { tag, count: uint(0) };
    case "TransferEth":
      return { tag, target: addr(0), amount: uint(1) };
    case "TransferToken":
      return { tag, target: addr(0), token: addr(1), amount: uint(2) };
    case "UnstoredCall":
      return { tag, hash: f(0) };
    case "ApproveSignedHash":
      return { tag, hash: f(0) };
    case "RevokeSignedHash":
      return { tag, hash: f(0) };
    case "Call":
      throw new Error("decodeOperation: Call is not produced by this static codec");
    default:
      throw new Error(`decodeOperation: unhandled tag ${tag}`);
  }
}
