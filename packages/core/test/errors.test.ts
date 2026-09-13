import { readFileSync } from "node:fs";
import {
  BaseError,
  CallExecutionError,
  ExecutionRevertedError,
  RawContractError,
  concatHex,
  encodeAbiParameters,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import { WALLET_ERRORS, decodeWalletRevert, isRevert, revertDataFrom, revertReason } from "../src/errors.js";

const errorString = (reason: string): Hex =>
  concatHex(["0x08c379a0", encodeAbiParameters([{ type: "string" }], [reason])]);

const panic = (code: bigint): Hex =>
  concatHex(["0x4e487b71", encodeAbiParameters([{ type: "uint256" }], [code])]);

describe("decodeWalletRevert", () => {
  it("names a bare Solcore error selector", () => {
    // std.solc's revertWithError reverts with the 4-byte selector and nothing else.
    expect(decodeWalletRevert("0x24bcdbea")).toMatch(/^NotEnoughApprovals\(\)/);
    expect(decodeWalletRevert("0xda0357f7")).toMatch(/^NotASigner\(\)/);
  });

  it("is case-insensitive about the selector", () => {
    expect(decodeWalletRevert("0x24BCDBEA")).toMatch(/^NotEnoughApprovals\(\)/);
  });

  it("names every pinned selector", () => {
    for (const [selector, name] of Object.entries(WALLET_ERRORS)) {
      expect(decodeWalletRevert(selector as Hex)).toContain(`${name}()`);
    }
  });

  it("decodes a bubbled-up Error(string)", () => {
    expect(decodeWalletRevert(errorString("ERC20: transfer failed"))).toBe("ERC20: transfer failed");
  });

  it("decodes a bubbled-up Panic(uint256)", () => {
    expect(decodeWalletRevert(panic(0x11n))).toBe("Panic(0x11)");
  });

  it("reports an unknown selector verbatim rather than inventing a reason", () => {
    expect(decodeWalletRevert("0xdeadbeef")).toBe("reverted with 0xdeadbeef");
  });

  it("gives up on empty or truncated data", () => {
    expect(decodeWalletRevert(undefined)).toBeUndefined();
    expect(decodeWalletRevert("0x")).toBeUndefined();
    expect(decodeWalletRevert("0xdead")).toBeUndefined();
  });

  it("has no duplicate selectors or names", () => {
    const names = Object.values(WALLET_ERRORS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers every Error(0x…) the contract can revert with", () => {
    // Each site in Wallet.solc spells its name in a trailing comment; the table
    // above is a hand-kept copy, so pin the two together.
    const source = readFileSync(new URL("../../../contracts/solcore/src/Wallet.solc", import.meta.url), "utf8");
    const sites = [...source.matchAll(/Error\((0x[0-9a-fA-F]{8})\)\);?\s*\/\/\s*(\w+)\(\)/g)];

    expect(sites.length).toBeGreaterThan(0);
    for (const [, selector, name] of sites) {
      expect(decodeWalletRevert(selector as Hex), `selector ${selector} (${name})`).toContain(`${name}()`);
    }
  });
});

/** How viem surfaces a reverting `eth_call`: the raw data buried under a wrapper. */
const callError = (cause: BaseError) =>
  new CallExecutionError(cause, { account: undefined, to: "0x0000000000000000000000000000000000000001" });

describe("revertDataFrom", () => {
  it("finds the revert data viem buries under CallExecutionError", () => {
    const err = callError(new RawContractError({ data: "0x24bcdbea" }));
    expect(revertDataFrom(err)).toBe("0x24bcdbea");
  });

  it("unwraps the `{ data }` shape some nodes return instead of bare hex", () => {
    const err = callError(new RawContractError({ data: { data: "0xda0357f7" } }));
    expect(revertDataFrom(err)).toBe("0xda0357f7");
  });

  it("has nothing to find in a non-viem error", () => {
    expect(revertDataFrom(new Error("boom"))).toBeUndefined();
    expect(revertDataFrom(undefined)).toBeUndefined();
  });
});

describe("isRevert", () => {
  it("recognises a revert carrying data", () => {
    expect(isRevert(callError(new RawContractError({ data: "0x24bcdbea" })))).toBe(true);
  });

  it("recognises a bare execution-reverted with no data", () => {
    expect(isRevert(callError(new ExecutionRevertedError({ message: "execution reverted" })))).toBe(true);
  });

  it("does not mistake an unreachable node for a revert", () => {
    // A transaction must still be sendable when the RPC is the thing that failed.
    expect(isRevert(new Error("fetch failed"))).toBe(false);
    expect(isRevert(new BaseError("HTTP request failed"))).toBe(false);
  });
});

describe("revertReason", () => {
  it("prefers the contract's own error name", () => {
    const err = callError(new RawContractError({ data: "0x24bcdbea" }));
    expect(revertReason(err)).toMatch(/^NotEnoughApprovals\(\)/);
  });

  it("falls back to viem's summary when there is no data to decode", () => {
    expect(revertReason(new BaseError("something broke"))).toBe("something broke");
  });

  it("has nothing to say about a plain error", () => {
    expect(revertReason(new Error("boom"))).toBeUndefined();
  });
});
