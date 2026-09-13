import { BaseError, CallExecutionError, ExecutionRevertedError, RawContractError, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { TransactionRevertedError, confirm, preflight } from "../src/tx.js";

const TO = "0x0000000000000000000000000000000000000001" as const;
const HASH = "0xaaaa" as Hex;

/** How viem surfaces a reverting `eth_call`. */
const reverted = (data?: Hex) =>
  new CallExecutionError(data ? new RawContractError({ data }) : new ExecutionRevertedError({}), {
    account: undefined,
    to: TO,
  });

const client = (over: {
  call?: (args: { blockNumber?: bigint }) => Promise<unknown>;
  status?: "success" | "reverted";
}) => ({
  call: vi.fn(over.call ?? (async () => ({ data: "0x" }))),
  waitForTransactionReceipt: vi.fn(async () => ({
    status: over.status ?? ("success" as const),
    blockNumber: 42n,
    contractAddress: null,
  })),
});

describe("confirm", () => {
  it("returns the receipt of a successful transaction", async () => {
    const c = client({ status: "success" });
    await expect(confirm(c, HASH)).resolves.toMatchObject({ status: "success", blockNumber: 42n });
    expect(c.call).not.toHaveBeenCalled();
  });

  it("throws on a reverted receipt — the bug this exists for", async () => {
    // waitForTransactionReceipt resolves for a reverted tx, so a plain await
    // would have reported this failure as a success.
    const c = client({ status: "reverted" });
    await expect(confirm(c, HASH)).rejects.toBeInstanceOf(TransactionRevertedError);
  });

  it("replays the call at the mined block to name the contract's error", async () => {
    const c = client({
      status: "reverted",
      call: async () => {
        throw reverted("0x24bcdbea");
      },
    });
    await expect(confirm(c, HASH, { to: TO, data: "0xdead" })).rejects.toThrow(/NotEnoughApprovals\(\)/);
    expect(c.call).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 42n }));
  });

  it("still fails, with the hash, when the replay says nothing useful", async () => {
    const c = client({ status: "reverted", call: async () => ({ data: "0x" }) });
    const err = await confirm(c, HASH, { to: TO }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransactionRevertedError);
    expect((err as TransactionRevertedError).hash).toBe(HASH);
    expect((err as TransactionRevertedError).reason).toBeUndefined();
  });
});

describe("preflight", () => {
  it("passes a call that succeeds", async () => {
    await expect(preflight(client({}), { to: TO, data: "0xdead" })).resolves.toBeUndefined();
  });

  it("refuses to send a call that would revert, naming the error", async () => {
    const c = client({
      call: async () => {
        throw reverted("0xda0357f7");
      },
    });
    await expect(preflight(c, { to: TO, data: "0xdead" })).rejects.toThrow(/NotASigner\(\)/);
  });

  it("lets a flaky RPC through rather than blocking a valid transaction", async () => {
    const c = client({
      call: async () => {
        throw new BaseError("HTTP request failed");
      },
    });
    await expect(preflight(c, { to: TO, data: "0xdead" })).resolves.toBeUndefined();
  });

  it("is a no-op without a client", async () => {
    await expect(preflight(undefined, { to: TO })).resolves.toBeUndefined();
  });
});
