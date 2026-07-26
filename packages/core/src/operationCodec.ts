import { concatHex, pad, toHex, type Hex } from "viem";
import { OPERATION_TAGS, type Operation, type OperationTag } from "./operations.js";

/**
 * Codec for the `Operation` sum type as Solcore encodes it on the wire.
 *
 * ⚠️ NOT standard Solidity ABI. Solcore lowers a `data` declaration to its
 * Scrap-Your-Boilerplate representation (`DeriveGeneric.hs`):
 *
 *   - an N-constructor `data` becomes a RIGHT-NESTED binary sum
 *       sum(c0, sum(c1, sum(c2, … sum(c_{n-2}, c_{n-1}))))
 *   - each `sum(f, g)` is `[32-byte tag][branch]`, tag 0 = inl (left/f),
 *     tag 1 = inr (right/g)  (std/ABIGeneric.solc `sum(f,g):ABIEncode`)
 *   - a constructor's fields become a right-nested product; each scalar field
 *     is one 32-byte word.
 *
 * So constructor index `i` is reached by `i` inr tags (a `1` word each) followed
 * — for every constructor except the last — by a single inl tag (`0` word).
 * After the tag path come the field words. The whole value is padded to the
 * sum's fixed head width (`OPERATION_HEAD_WORDS`): Solcore lays sums out
 * "sum-wide" — every branch is padded to the widest one — so `queue(op)` is a
 * constant-width, fully static blob regardless of which variant it carries.
 *
 * Verified byte-for-byte against the golden vectors in
 * ../test/vectors/multisig.json (queue(AddSigner), queue(ChangeSigRequired)).
 *
 * SCOPE: only the fully static variants are supported — AddSigner, RemoveSigner,
 * ChangeSigRequired, TransferEth, TransferToken, and the bytes32-carrying
 * UnstoredCall / ApproveSignedHash / RevokeSignedHash. `Call(address, uint256,
 * memory(bytes))` drags a dynamic field into the sum; its encoding needs the
 * dynamic-sum tail handling that std's `sum:ABIEncode` explicitly does not do
 * yet ("static sums only"), so we throw rather than emit a wrong blob. None of
 * the on-chain flows the app drives (queue/approve/reject/execute for signer &
 * config ops, ETH/token transfers) need it.
 */

/**
 * Fixed head width, in 32-byte words, of the encoded `Operation` sum.
 *
 * The naive per-level `32 + max(headSize(left), headSize(right))` recurrence
 * over the static field widths lands one word short of what the compiled
 * contract emits — the dynamic `bytes` in the `Call` branch widens the sum by a
 * word. Rather than model that, we pin the value the golden vectors prove and
 * let `abi.test.ts` guard it: if a contract rebuild changes the width, the
 * vector tests fail loudly instead of shipping a mis-sized blob.
 */
export const OPERATION_HEAD_WORDS = 10;

const ZERO_WORD: Hex = `0x${"00".repeat(32)}`;

function wordFromBigInt(value: bigint): Hex {
  return pad(toHex(value), { size: 32 });
}

/** Left-pad an address/bytes-ish hex to a 32-byte word. */
function wordFromHex(value: Hex): Hex {
  return pad(value, { size: 32 });
}

/**
 * inr-tag path to constructor `i`: `i` ones, then (unless `i` is the last
 * constructor) a single zero for the final inl. The last constructor is the
 * bare inr tail, so it gets no trailing inl word.
 */
function tagPath(index: number): Hex[] {
  const words: Hex[] = [];
  for (let k = 0; k < index; k++) words.push(wordFromBigInt(1n));
  if (index < OPERATION_TAGS.length - 1) words.push(ZERO_WORD);
  return words;
}

/** Field words for a static operation, in declaration order. */
function fieldWords(op: Operation): Hex[] {
  switch (op.tag) {
    case "AddSigner":
    case "RemoveSigner":
      return [wordFromHex(op.signer)];
    case "ChangeSigRequired":
      return [wordFromBigInt(op.count)];
    case "TransferEth":
      return [wordFromHex(op.target), wordFromBigInt(op.amount)];
    case "TransferToken":
      return [wordFromHex(op.target), wordFromHex(op.token), wordFromBigInt(op.amount)];
    case "UnstoredCall":
    case "ApproveSignedHash":
    case "RevokeSignedHash":
      return [wordFromHex(op.hash)];
    case "Call":
      throw new Error(
        "encodeOperation: Call(address,uint256,bytes) is a dynamic sum branch; " +
          "Solcore's std sum:ABIEncode is static-sums-only, so this variant is not encodable yet.",
      );
  }
}

/** Encode an `Operation` into the calldata tail of `queue(op)` (no selector). */
export function encodeOperation(op: Operation): Hex {
  const words = [...tagPath(OPERATION_TAGS.indexOf(op.tag)), ...fieldWords(op)];
  if (words.length > OPERATION_HEAD_WORDS) {
    throw new Error(`encodeOperation: ${op.tag} exceeds fixed head width`);
  }
  while (words.length < OPERATION_HEAD_WORDS) words.push(ZERO_WORD);
  return concatHex(words);
}

function readWord(data: Hex, wordIndex: number): Hex {
  const start = 2 + wordIndex * 64;
  return `0x${data.slice(start, start + 64)}`;
}

function addressFromWord(word: Hex): Hex {
  return `0x${word.slice(-40)}`;
}

function bigintFromWord(word: Hex): bigint {
  return BigInt(word);
}

/**
 * Decode the `Operation` blob (calldata after the `queue` selector, or any
 * fixed-width sum region). Inverse of {@link encodeOperation} for static
 * variants; throws on the dynamic `Call` branch.
 */
export function decodeOperation(data: Hex): Operation {
  // Count the leading inr (`1`) tag words; stop at the first inl (`0`) or once
  // we've consumed the maximum path length (the last constructor).
  let ones = 0;
  while (ones < OPERATION_TAGS.length - 1 && bigintFromWord(readWord(data, ones)) === 1n) {
    ones += 1;
  }
  const isLast = ones === OPERATION_TAGS.length - 1;
  const index = ones;
  const fieldStart = isLast ? ones : ones + 1; // skip the inl word for non-last
  const tag = OPERATION_TAGS[index] as OperationTag;

  const at = (k: number) => readWord(data, fieldStart + k);
  switch (tag) {
    case "AddSigner":
      return { tag, signer: addressFromWord(at(0)) };
    case "RemoveSigner":
      return { tag, signer: addressFromWord(at(0)) };
    case "ChangeSigRequired":
      return { tag, count: bigintFromWord(at(0)) };
    case "TransferEth":
      return { tag, target: addressFromWord(at(0)), amount: bigintFromWord(at(1)) };
    case "TransferToken":
      return {
        tag,
        target: addressFromWord(at(0)),
        token: addressFromWord(at(1)),
        amount: bigintFromWord(at(2)),
      };
    case "UnstoredCall":
      return { tag, hash: at(0) };
    case "ApproveSignedHash":
      return { tag, hash: at(0) };
    case "RevokeSignedHash":
      return { tag, hash: at(0) };
    case "Call":
      throw new Error("decodeOperation: dynamic Call branch not supported (see encodeOperation).");
  }
}
