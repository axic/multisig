import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { encodeApprove, encodeExecute, encodeQueue, encodeReject } from "../src/abi.js";
import { decodeOperation, encodeOperation, variantTag } from "../src/operationCodec.js";
import { OPERATION_TAGS, type Operation } from "../src/operations.js";
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

describe("Operation ADT codec", () => {
  // Pin the wire discriminants. These are keccak256("Name(argSigs)"), so a
  // renamed constructor or a retyped field silently changes the wire — this
  // catches it against the vectors captured from the deployed runtime.
  it("computes the variant tags the contract uses", () => {
    for (const tag of OPERATION_TAGS) {
      expect(variantTag(tag)).toBe(vectors.variantTags[tag]);
    }
  });

  const cases = Object.values(vectors.sum) as {
    calldata: string;
    returndata: string;
    operation: Record<string, string>;
  }[];

  // JSON can't carry bigint, so the vectors store numeric fields as strings.
  const revive = (op: Record<string, string>): Operation => {
    const out: Record<string, unknown> = { ...op };
    for (const key of ["count", "amount", "value"]) {
      if (key in out) out[key] = BigInt(out[key] as string);
    }
    for (const key of ["signer", "target", "token"]) {
      if (key in out) out[key] = getAddress(out[key] as string);
    }
    return out as unknown as Operation;
  };

  it("covers every variant", () => {
    expect(cases.map((c) => c.operation.tag).sort()).toEqual([...OPERATION_TAGS].sort());
  });

  it.each(cases)("encodes queue($operation.tag) to the golden vector", (c) => {
    expect(encodeQueue(revive(c.operation))).toBe(c.calldata);
  });

  it.each(cases)("decodes the getOperation($operation.tag) return", (c) => {
    expect(decodeOperation(c.returndata as `0x${string}`)).toEqual(revive(c.operation));
  });

  it("encodes and decodes to the same bytes the contract returns", () => {
    // queue(Operation) calldata and getOperation returndata come from ONE
    // derived ABIEncode instance, so the argument and the return are identical.
    for (const c of cases) {
      expect(encodeOperation(revive(c.operation))).toBe(c.returndata);
    }
  });

  it("round-trips a Call with an empty payload", () => {
    const op: Operation = {
      tag: "Call",
      target: getAddress("0x00000000000000000000000000000000cafe0006"),
      value: 0n,
      payload: "0x",
    };
    expect(decodeOperation(encodeOperation(op))).toEqual(op);
  });

  it("rejects an unknown variant tag", () => {
    expect(() => decodeOperation(`0x${(32).toString(16).padStart(64, "0")}${"11".repeat(32)}`)).toThrow(
      /unknown Operation variant tag/,
    );
  });
});
