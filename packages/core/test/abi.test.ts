import { describe, expect, it } from "vitest";
import { encodeApprove, encodeExecute, encodeReject } from "../src/abi";
import { encodeOperation } from "../src/operationCodec";
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

describe("Operation sum-type codec (Phase 2 — pending)", () => {
  // These golden vectors are the target for operationCodec. Until it is
  // implemented the encoder must fail loudly rather than emit wrong calldata.
  it("throws until the Solcore sum ABI is implemented", () => {
    expect(() => encodeOperation({ tag: "AddSigner", signer: "0x00000000000000000000000000000000cafe0001" })).toThrow();
  });

  it.todo("encodes queue(AddSigner) to the golden vector");
  it.todo("encodes queue(ChangeSigRequired) to the golden vector");
});
