import { describe, expect, it } from "vitest";
import { resolveCreationCode } from "../src/deploy.js";

describe("resolveCreationCode", () => {
  it("prefers an env override over the hardcoded constant", () => {
    const code = `0x60${"00".repeat(20)}`;
    expect(resolveCreationCode({ VITE_MULTISIG_CREATION_CODE: code })).toBe(code);
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: code })).toBe(code);
  });

  it("adds a 0x prefix and rejects junk", () => {
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: "6001" })).toBe("0x6001");
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: "nothex" })).toBeUndefined();
    expect(resolveCreationCode({ MULTISIG_CREATION_CODE: "0x" })).toBeUndefined();
  });

  it("returns undefined when nothing is configured and the constant is empty", () => {
    // The committed constant is empty until the solcore pipeline populates it,
    // so with no override the deploy flow is disabled (UI falls back to track).
    expect(resolveCreationCode({})).toBeUndefined();
  });
});
