import { EVM } from "@ethereumjs/evm";
import { Common, Hardfork, Chain } from "@ethereumjs/common";
import { Address, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { getAddress, type Address as Addr, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { MULTISIG_CREATION_CODE } from "../src/generated/multisigBytecode.js";
import { encodeInitialize, encodeQueue } from "../src/abi.js";
import { decodeOperationReturn, encodeGetOperation } from "../src/getters.js";
import type { Operation } from "../src/operations.js";

/**
 * End-to-end guard for `getOperation` — the ONE getter that returns the
 * `Operation` sum, and the one that kept reading back `0x000…0`.
 *
 * Every prior "fix" only checked `decodeOperationReturn(encodeOperation(op))`
 * — a pure roundtrip that encodes calldata-style and decodes it again, never
 * touching a single byte the contract actually emits. That test stayed green
 * while the UI stayed broken, because the real defect is on the WIRE: the
 * hardcoded creation bytecode returns the operation as a *dynamic* Solcore sum,
 * which Solcore can't ABI-encode, so the fields collapse to zero.
 *
 * This test closes that gap by DEPLOYING the actual `MULTISIG_CREATION_CODE` in
 * an EVM, queueing each operation through the real `queue()` calldata path, and
 * reading it straight back via `getOperation(i)` + `decodeOperationReturn`. If
 * the deployed bytecode still returns the sum, this fails loudly — which is the
 * correct signal that the contract source was changed but the bytecode was
 * never regenerated (`nix develop -c make -C contracts wallet` +
 * `pnpm --filter @multisig/core gen:bytecode`).
 */

const OWNER: Addr = getAddress("0x00000000000000000000000000000000000000aa");
const A: Addr = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
const B: Addr = getAddress("0x000000000000000000000000000000000000dEaD");
const HASH: Hex = `0x${"11".repeat(32)}`;

const CONTRACT = new Address(hexToBytes("0x00000000000000000000000000000000000000cc"));
const CALLER = new Address(hexToBytes(OWNER));

let evm: EVM;

async function call(data: Hex): Promise<{ err: unknown; ret: Hex }> {
  const r = await evm.runCall({
    to: CONTRACT,
    caller: CALLER,
    origin: CALLER,
    data: hexToBytes(data),
    gasLimit: 30_000_000n,
  });
  return { err: r.execResult.exceptionError, ret: bytesToHex(r.execResult.returnValue) };
}

beforeAll(async () => {
  const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun });
  evm = await EVM.create({ common });

  // Deploy: run the creation code, install the returned runtime at CONTRACT.
  const created = await evm.runCode({
    code: hexToBytes(MULTISIG_CREATION_CODE as Hex),
    gasLimit: 30_000_000n,
    caller: CALLER,
    to: CONTRACT,
    address: CONTRACT,
  });
  if (created.exceptionError) throw new Error(`creation reverted: ${JSON.stringify(created.exceptionError)}`);
  await evm.stateManager.putContractCode(CONTRACT, created.returnValue);

  const init = await call(encodeInitialize(OWNER));
  if (init.err) throw new Error(`initialize reverted: ${JSON.stringify(init.err)}`);
});

// Every variant that is queueable through the static queue(Operation) calldata
// codec (Call is intentionally excluded — it carries a dynamic payload and the
// app queues it as UnstoredCall instead; see operationCodec.ts).
const CASES: Operation[] = [
  { tag: "AddSigner", signer: A },
  { tag: "RemoveSigner", signer: A },
  { tag: "ChangeSigRequired", count: 7n },
  { tag: "TransferEth", target: B, amount: 100n },
  { tag: "TransferToken", target: B, token: A, amount: 200n },
  { tag: "UnstoredCall", hash: HASH },
  { tag: "ApproveSignedHash", hash: HASH },
  { tag: "RevokeSignedHash", hash: HASH },
];

describe("getOperation round-trips against the deployed bytecode", () => {
  it.each(CASES.map((op, i) => [i, op] as const))("queue+read %#: %o", async (i, op) => {
    const queued = await call(encodeQueue(op));
    expect(queued.err, `queue(${op.tag}) reverted`).toBeUndefined();

    const raw = await call(encodeGetOperation(BigInt(i)));
    expect(raw.err, `getOperation(${i}) reverted`).toBeUndefined();

    let decoded: Operation;
    try {
      decoded = decodeOperationReturn(raw.ret);
    } catch (e) {
      throw new Error(
        `getOperation(${i}) returned an un-decodable payload (${raw.ret.slice(0, 74)}…). ` +
          `The deployed bytecode is STALE: the contract source returns getOperation as bytes, ` +
          `but the hardcoded multisigBytecode.ts still returns the un-encodable dynamic Operation sum. ` +
          `Regenerate it: 'nix develop -c make -C contracts wallet' then ` +
          `'pnpm --filter @multisig/core gen:bytecode'. Underlying: ${(e as Error).message}`,
      );
    }
    expect(decoded).toEqual(op);
  });
});
