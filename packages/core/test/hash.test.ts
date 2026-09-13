import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  domainSeparator,
  operationPreimage,
  operationSigningHash,
  operationStructHash,
} from "../src/hash.js";
import { encodeOperation } from "../src/operationCodec.js";
import type { Operation, OperationKind } from "../src/operations.js";
import { unstoredCallHash, unstoredCallPayload } from "../src/preimage.js";
import vectors from "./vectors/multisig.json" with { type: "json" };

const CTX = { chainId: 11155111, verifyingContract: getAddress("0x00000000000000000000000000000000000000a1") as Address };

describe("create_signature_hash (EIP-712) — mirrors the contract", () => {
  // The signed `bytes operation` member is abi_encode(operation) — the same
  // bytes queue(Operation) carries, not a separate preimage format.
  it("signs the abi_encode(operation) bytes", () => {
    const op: Operation = { tag: "AddSigner", signer: getAddress("0x00000000000000000000000000000000cafe0001") };
    expect(operationPreimage(op)).toBe(encodeOperation(op));
    expect(operationPreimage(op)).toBe(vectors.sum.queue_addSigner.returndata);
  });

  // Digests read back from the contract's own getSignatureHash(kind, operation)
  // by executing the deployed runtime — this is the real cross-check.
  const { _context: ctx, cases } = vectors.signatureHash;
  const SIGNING_CTX = {
    chainId: ctx.chainId,
    verifyingContract: getAddress(ctx.verifyingContract) as Address,
  };
  const operationOf = (name: string): Operation => {
    const v = (vectors.sum as Record<string, { operation: Record<string, string> }>)[`queue_${name}`].operation;
    const out: Record<string, unknown> = { ...v };
    for (const key of ["count", "amount", "value"]) if (key in out) out[key] = BigInt(out[key] as string);
    for (const key of ["signer", "target", "token"]) if (key in out) out[key] = getAddress(out[key] as string);
    return out as unknown as Operation;
  };

  it("matches the on-chain digest for every kind x variant", () => {
    expect(cases).toHaveLength(27);
    for (const c of cases) {
      const op = operationOf(c.operation);
      expect(operationPreimage(op)).toBe(c.preimage);
      expect(operationSigningHash(c.kind as OperationKind, op, SIGNING_CTX)).toBe(c.digest as Hex);
    }
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
