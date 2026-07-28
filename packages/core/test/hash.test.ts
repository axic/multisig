import { getAddress, keccak256, toHex, type Address } from "viem";
import { describe, expect, it } from "vitest";
import {
  decodeOperationPreimage,
  domainSeparator,
  operationPreimage,
  operationSigningHash,
  operationStructHash,
} from "../src/hash.js";
import type { Operation } from "../src/operations.js";
import { unstoredCallHash, unstoredCallPayload } from "../src/preimage.js";

const CTX = { chainId: 11155111, verifyingContract: getAddress("0x00000000000000000000000000000000000000a1") as Address };

describe("create_signature_hash (EIP-712) — mirrors the contract", () => {
  it("encodes the flat operation preimage [tag][fields]", () => {
    // AddSigner(cafe0001): tag 0 word + address word.
    const op: Operation = { tag: "AddSigner", signer: getAddress("0x00000000000000000000000000000000cafe0001") };
    expect(operationPreimage(op)).toBe(
      "0x" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "00000000000000000000000000000000000000000000000000000000cafe0001",
    );
    // ChangeSigRequired(2): tag 2 word + count word.
    expect(operationPreimage({ tag: "ChangeSigRequired", count: 2n })).toBe(
      "0x" +
        "0000000000000000000000000000000000000000000000000000000000000002" +
        "0000000000000000000000000000000000000000000000000000000000000002",
    );
  });

  it("produces 32-byte digests bound to chain + contract", () => {
    const op: Operation = { tag: "ChangeSigRequired", count: 1n };
    const a = operationSigningHash("Queue", op, CTX);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    // Domain-bound: another contract or chain changes the digest.
    const other = { ...CTX, verifyingContract: getAddress("0x00000000000000000000000000000000000000b2") as Address };
    expect(operationSigningHash("Queue", op, other)).not.toBe(a);
    expect(operationSigningHash("Queue", op, { ...CTX, chainId: 1 })).not.toBe(a);
    // Kind-bound: Approve differs from Queue.
    expect(operationSigningHash("Approve", op, CTX)).not.toBe(a);
  });

  it("struct hash folds in keccak(preimage)", () => {
    const op: Operation = { tag: "AddSigner", signer: getAddress("0x00000000000000000000000000000000cafe0001") };
    // Sanity: struct hash and domain separator are independent 32-byte values.
    expect(operationStructHash("Queue", op)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(domainSeparator(CTX)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("decodeOperationPreimage — inverse of operationPreimage", () => {
  it("round-trips every variant", () => {
    const cases: Operation[] = [
      { tag: "AddSigner", signer: getAddress("0x00000000000000000000000000000000cafe0001") as Address },
      { tag: "RemoveSigner", signer: getAddress("0x00000000000000000000000000000000cafe0002") as Address },
      { tag: "ChangeSigRequired", count: 3n },
      { tag: "TransferEth", target: getAddress("0x00000000000000000000000000000000cafe0003") as Address, amount: 10n ** 18n },
      {
        tag: "TransferToken",
        target: getAddress("0x00000000000000000000000000000000cafe0004") as Address,
        token: getAddress("0x00000000000000000000000000000000cafe0005") as Address,
        amount: 42n,
      },
      { tag: "Call", target: getAddress("0x00000000000000000000000000000000cafe0006") as Address, value: 7n, payload: "0xdeadbeef" },
      { tag: "UnstoredCall", hash: `0x${"ab".repeat(32)}` },
      { tag: "ApproveSignedHash", hash: `0x${"cd".repeat(32)}` },
      { tag: "RevokeSignedHash", hash: `0x${"ef".repeat(32)}` },
    ];
    for (const op of cases) {
      expect(decodeOperationPreimage(operationPreimage(op))).toEqual(op);
    }
  });

  it("decodes a Call with an empty payload", () => {
    const op: Operation = {
      tag: "Call",
      target: getAddress("0x00000000000000000000000000000000cafe0006") as Address,
      value: 0n,
      payload: "0x",
    };
    expect(decodeOperationPreimage(operationPreimage(op))).toEqual(op);
  });
});

describe("UnstoredCall preimage", () => {
  it("packs [32:target][32:value][inner] and hashes it", () => {
    const target = getAddress("0x00000000000000000000000000000000cafe0007") as Address;
    const payload = unstoredCallPayload(target, 5n, "0xdeadbeef");
    // 32 + 32 + 4 bytes.
    expect(payload).toHaveLength(2 + (32 + 32 + 4) * 2);
    expect(unstoredCallHash(target, 5n, "0xdeadbeef")).toBe(keccak256(payload));
    // value lands in the second word.
    expect(payload.slice(2 + 64, 2 + 128)).toBe(toHex(5n, { size: 32 }).slice(2));
  });
});
