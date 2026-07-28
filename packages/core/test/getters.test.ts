import { concatHex, encodeAbiParameters, getAddress, keccak256, padHex, toBytes, toHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  decodeAddress,
  decodeBool,
  decodeOperationReturn,
  decodeOperationStatus,
  decodeUint,
  decodeVote,
  encodeGetOperation,
  encodeGetSigner,
  encodeGetVote,
  encodeIsSigner,
} from "../src/getters.js";
import { operationPreimage } from "../src/hash.js";
import type { Operation } from "../src/operations.js";
import { GETTER_SELECTORS } from "../src/selectors.js";

/** Wrap a flat operation preimage as the ABI `bytes` value `getOperation` returns. */
const asBytesReturn = (preimage: Hex): Hex => encodeAbiParameters([{ type: "bytes" }], [preimage]);

const w = (h: Hex) => padHex(h, { size: 32 });
const standardSelector = (sig: string): Hex => keccak256(toBytes(sig)).slice(0, 10) as Hex;

describe("getter selectors", () => {
  // Solcore derives selectors as keccak256(name "(" argSig ")")[:4]; for scalar
  // args this is the standard Solidity selector.
  const CASES: [keyof typeof GETTER_SELECTORS, string][] = [
    ["getSignersRequired", "getSignersRequired()"],
    ["getSignersCount", "getSignersCount()"],
    ["getSigner", "getSigner(uint256)"],
    ["getNonce", "getNonce()"],
    ["getOperationsCount", "getOperationsCount()"],
    ["getOperation", "getOperation(uint256)"],
    ["getStatus", "getStatus(uint256)"],
    ["getVote", "getVote(uint256,address)"],
    ["isHashApproved", "isHashApproved(bytes32)"],
    ["isSigner", "isSigner(address)"],
  ];
  it.each(CASES)("%s == keccak256(%s)[:4]", (key, sig) => {
    expect(GETTER_SELECTORS[key]).toBe(standardSelector(sig));
  });
});

describe("getter calldata builders", () => {
  it("encodes getSigner(3)", () => {
    expect(encodeGetSigner(3n)).toBe(concatHex([GETTER_SELECTORS.getSigner, w("0x03")]));
  });

  it("encodes getOperation(0)", () => {
    expect(encodeGetOperation(0n)).toBe(concatHex([GETTER_SELECTORS.getOperation, w("0x00")]));
  });

  it("encodes getVote(1, signer)", () => {
    const signer = getAddress("0x00000000000000000000000000000000cafe0001");
    expect(encodeGetVote(1n, signer)).toBe(
      concatHex([GETTER_SELECTORS.getVote, w("0x01"), w(signer.toLowerCase() as Hex)]),
    );
  });

  it("encodes isSigner(addr)", () => {
    const signer = getAddress("0x00000000000000000000000000000000cafe0002");
    expect(encodeIsSigner(signer)).toBe(concatHex([GETTER_SELECTORS.isSigner, w(signer.toLowerCase() as Hex)]));
  });
});

describe("scalar return decoders", () => {
  it("decodes uint256", () => {
    expect(decodeUint(w(toHex(42n)))).toBe(42n);
  });
  it("decodes address (right-aligned)", () => {
    const a = getAddress("0x00000000000000000000000000000000cafe0003");
    expect(decodeAddress(w(a.toLowerCase() as Hex))).toBe(a);
  });
  it("decodes bool", () => {
    expect(decodeBool(w("0x01"))).toBe(true);
    expect(decodeBool(w("0x00"))).toBe(false);
  });
});

describe("Operation return decoder", () => {
  // `getOperation(i)` returns the flat `[tag][fields...]` operation encoding as
  // an ABI `bytes` value — the same bytes `operationPreimage` produces (the
  // contract can't return the dynamic `Operation` sum directly). So the decoder
  // is the inverse of `operationPreimage`, wrapped in a `bytes` return.
  it("round-trips every variant through the bytes return", () => {
    const cases: Operation[] = [
      { tag: "AddSigner", signer: getAddress("0x00000000000000000000000000000000cafe0001") },
      { tag: "RemoveSigner", signer: getAddress("0x00000000000000000000000000000000cafe0002") },
      { tag: "ChangeSigRequired", count: 3n },
      { tag: "TransferEth", target: getAddress("0x00000000000000000000000000000000cafe0003"), amount: 10n ** 18n },
      {
        tag: "TransferToken",
        target: getAddress("0x00000000000000000000000000000000cafe0004"),
        token: getAddress("0x00000000000000000000000000000000cafe0005"),
        amount: 42n,
      },
      { tag: "Call", target: getAddress("0x00000000000000000000000000000000cafe0006"), value: 7n, payload: "0xdeadbeef" },
      { tag: "UnstoredCall", hash: `0x${"ab".repeat(32)}` },
      { tag: "ApproveSignedHash", hash: `0x${"cd".repeat(32)}` },
      { tag: "RevokeSignedHash", hash: `0x${"ef".repeat(32)}` },
    ];
    for (const op of cases) {
      expect(decodeOperationReturn(asBytesReturn(operationPreimage(op)))).toEqual(op);
    }
  });
});

describe("OperationStatus return decoder", () => {
  it("decodes Approvals(n)", () => {
    expect(decodeOperationStatus(concatHex([w("0x00"), w(toHex(2n))]))).toEqual({ tag: "Approvals", count: 2n });
  });
  it("decodes Rejected", () => {
    expect(decodeOperationStatus(concatHex([w("0x01"), w("0x00")]))).toEqual({ tag: "Rejected" });
  });
  it("decodes Executed", () => {
    expect(decodeOperationStatus(concatHex([w("0x01"), w("0x01")]))).toEqual({ tag: "Executed" });
  });
});

describe("Vote return decoder", () => {
  it("decodes None / Approved / Rejected", () => {
    expect(decodeVote(concatHex([w("0x00"), w("0x00")]))).toBe("None");
    expect(decodeVote(concatHex([w("0x01"), w("0x00")]))).toBe("Approved");
    expect(decodeVote(concatHex([w("0x01"), w("0x01")]))).toBe("Rejected");
  });
});
