import { describe, expect, it } from "vitest";
import { resolveCreationCode } from "../src/deploy.js";
import { MULTISIG_CREATION_CODE } from "../src/generated/multisigBytecode.js";

describe("resolveCreationCode", () => {
  it("prefers an env override over the hardcoded constant", () => {
    const code = `0x60${"00".repeat(20)}`;
    expect(resolveCreationCode({ VITE_MULTISIG_CREATION_CODE: code })).toBe(code);
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: code })).toBe(code);
  });

  it("adds a 0x prefix to a valid override", () => {
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: "6001" })).toBe("0x6001");
  });

  it("falls back to the hardcoded constant when the override is junk or empty", () => {
    // The constant is now populated (generated from the solcore artifact), so an
    // unusable override falls through to it rather than disabling deploy.
    const constant = resolveCreationCode({});
    expect(constant).toBe(MULTISIG_CREATION_CODE);
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: "nothex" })).toBe(constant);
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: "0x" })).toBe(constant);
  });
});
