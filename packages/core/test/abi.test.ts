import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { encodeApprove, encodeExecute, encodeQueue, encodeReject } from "../src/abi.js";
import { decodeOperation, encodeOperation } from "../src/operationCodec.js";
import type { Operation } from "../src/operations.js";
import vectors from "./vectors/multisig.json" with { type: "json" };

describe("outer entrypoint calldata (standard ABI)", () => {
  it("encodes approve(0)", () => {
    expect(encodeApprove(0n)).toBe(vectors.outer.approve_0.calldata);
  });

  it("encodes reject(0)", () => {
    expect(encodeReject(0n)).toBe(vectors.outer.reject_0.calldata);
  });

  it("encodes execute(0, 0x)", () => {
    expect(encodeExecute(0n, "0x")).toBe(vectors.outer.execute_0_empty.calldata);
  });
});

describe("Operation sum-type codec (Solcore nested-binary-sum ABI)", () => {
  // The `queue(...)` entries in the golden vectors carry the full selector +
  // encoded Operation. Strip the 4-byte selector to get the operation blob.
  const opBlob = (calldata: string): Hex => `0x${calldata.slice(10)}`;

  it("encodes queue(AddSigner) to the golden vector", () => {
    const { operation, calldata } = vectors.sum.queue_addSigner_cafe0001;
    expect(encodeOperation(operation as Operation)).toBe(opBlob(calldata));
    expect(encodeQueue(operation as Operation)).toBe(calldata);
  });

  it("encodes queue(ChangeSigRequired) to the golden vector", () => {
    const { operation, calldata } = vectors.sum.queue_changeSigRequired_0;
    const op: Operation = { tag: "ChangeSigRequired", count: BigInt(operation.count) };
    expect(encodeOperation(op)).toBe(opBlob(calldata));
    expect(encodeQueue(op)).toBe(calldata);
  });

  it("round-trips every static variant through encode/decode", () => {
    const addr = "0x00000000000000000000000000000000cafe0001" as const;
    const token = "0x000000000000000000000000000000000000da0a" as const;
    const hash = `0x${"ab".repeat(32)}` as Hex;
    const samples: Operation[] = [
      { tag: "AddSigner", signer: addr },
      { tag: "RemoveSigner", signer: addr },
      { tag: "ChangeSigRequired", count: 3n },
      { tag: "TransferEth", target: addr, amount: 10n ** 18n },
      { tag: "TransferToken", target: addr, token, amount: 42n },
      { tag: "UnstoredCall", hash },
      { tag: "ApproveSignedHash", hash },
      { tag: "RevokeSignedHash", hash },
    ];
    for (const op of samples) {
      const decoded = decodeOperation(encodeOperation(op));
      expect(decoded.tag).toBe(op.tag);
      expect(decoded).toMatchObject(op as Record<string, unknown>);
    }
  });

  it("still refuses the dynamic Call branch (needs dynamic-sum tail handling)", () => {
    expect(() => encodeOperation({ tag: "Call", target: "0x", value: 0n, payload: "0x" })).toThrow();
  });
});
