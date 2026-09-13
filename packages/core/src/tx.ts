/**
 * Sending a transaction and finding out whether it actually did anything.
 *
 * Deliberately client-shaped rather than wagmi-shaped: the web app's hooks stay
 * thin, and these stay testable against a stub.
 */
import type { Address, Hex } from "viem";
import { isRevert, revertReason } from "./errors.js";

/** The transaction shape both helpers replay through `eth_call`. */
export interface CallArgs {
  account?: Address;
  to?: Address;
  data?: Hex;
  value?: bigint;
}

export interface MinedReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  contractAddress?: Address | null;
}

/**
 * Just the two client methods used here. wagmi's `usePublicClient` returns a
 * chain-parameterised client that viem's own `PublicClient` alias is not
 * assignable to, so name the surface structurally instead of fighting the
 * generics.
 */
export interface TxClient {
  call(args: CallArgs & { blockNumber?: bigint }): Promise<unknown>;
  waitForTransactionReceipt(args: { hash: Hex }): Promise<MinedReceipt>;
}

/**
 * A transaction that made it on-chain and reverted there.
 *
 * `waitForTransactionReceipt` resolves happily for a reverted transaction — it
 * only throws when no receipt ever arrives — so without an explicit status
 * check every failed execute/approve/queue looked like a success: the mutation
 * settled, the queries refetched, and the operation just sat there unchanged
 * with nothing on screen to say why.
 */
export class TransactionRevertedError extends Error {
  constructor(
    readonly hash: Hex,
    readonly reason?: string,
  ) {
    super(reason ? `Transaction reverted: ${reason}` : "Transaction reverted on-chain (no reason given)");
    this.name = "TransactionRevertedError";
  }
}

/**
 * Ask the node what a call would do before asking the user to sign it, so a
 * "not enough approvals" or "not the next nonce" surfaces for free instead of
 * costing a reverted transaction. Wallets estimate gas too, but plenty of them
 * offer to send anyway once estimation fails.
 *
 * Only a definite revert blocks the send: an RPC that is merely unreachable or
 * rate-limited must not stop a transaction that would have worked, and
 * `confirm` catches a genuine failure either way.
 */
export async function preflight(client: TxClient | undefined, args: CallArgs): Promise<void> {
  if (!client) return;
  try {
    await client.call(args);
  } catch (err) {
    if (!isRevert(err)) return;
    const reason = revertReason(err);
    throw new Error(reason ? `Transaction would fail: ${reason}` : "Transaction would fail on-chain");
  }
}

/**
 * Wait for the receipt and turn a reverted one into a thrown error, replaying
 * the call at the mined block to recover the revert reason the receipt itself
 * doesn't carry. Returns the receipt so callers can read the rest of it.
 */
export async function confirm(client: TxClient, hash: Hex, tx?: CallArgs): Promise<MinedReceipt> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status === "success") return receipt;

  let reason: string | undefined;
  if (tx) {
    try {
      await client.call({ ...tx, blockNumber: receipt.blockNumber });
    } catch (err) {
      reason = revertReason(err);
    }
  }
  throw new TransactionRevertedError(hash, reason);
}
