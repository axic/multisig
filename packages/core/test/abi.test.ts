import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
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

describe("Operation sum-type codec (queue)", () => {
  const addSigner: Operation = {
    tag: "AddSigner",
    signer: getAddress("0x00000000000000000000000000000000cafe0001"),
  };
  const changeSig: Operation = { tag: "ChangeSigRequired", count: 0n };

  it("encodes queue(AddSigner) to the golden vector", () => {
    expect(encodeQueue(addSigner)).toBe(vectors.sum.queue_addSigner_cafe0001.calldata);
  });

  it("encodes queue(ChangeSigRequired) to the golden vector", () => {
    expect(encodeQueue(changeSig)).toBe(vectors.sum.queue_changeSigRequired_0.calldata);
  });

  it("round-trips every static variant through encode/decode", () => {
    const cases: Operation[] = [
      addSigner,
      { tag: "RemoveSigner", signer: getAddress("0x00000000000000000000000000000000cafe0002") },
      changeSig,
      { tag: "ChangeSigRequired", count: 3n },
      { tag: "TransferEth", target: getAddress("0x00000000000000000000000000000000cafe0003"), amount: 10n ** 18n },
      {
        tag: "TransferToken",
        target: getAddress("0x00000000000000000000000000000000cafe0004"),
        token: getAddress("0x00000000000000000000000000000000cafe0005"),
        amount: 42n,
      },
      { tag: "UnstoredCall", hash: `0x${"ab".repeat(32)}` },
      { tag: "ApproveSignedHash", hash: `0x${"cd".repeat(32)}` },
      { tag: "RevokeSignedHash", hash: `0x${"ef".repeat(32)}` },
    ];
    for (const op of cases) {
      const encoded = encodeOperation(op);
      expect(encoded).toHaveLength(2 + 10 * 64); // 10 words, no selector
      expect(decodeOperation(encoded)).toEqual(op);
    }
  });

  it("rejects the dynamic Call variant (use UnstoredCall)", () => {
    expect(() =>
      encodeOperation({
        tag: "Call",
        target: getAddress("0x00000000000000000000000000000000cafe0006"),
        value: 0n,
        payload: "0x1234",
      }),
    ).toThrow(/UnstoredCall/);
  });
});
