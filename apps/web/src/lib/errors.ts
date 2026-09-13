import { decodeWalletRevert, revertDataFrom } from "@multisig/core";
import { BaseError, UserRejectedRequestError } from "viem";

/**
 * One failure, reduced to what a person can act on.
 *
 * Wallet and RPC failures arrive as viem `BaseError`s whose `message` is a whole
 * report: the reason, then the request arguments, a docs link, and a viem
 * version line. Printed raw that is a wall of mono text with unbreakable hex in
 * the middle of it — so only `shortMessage`, the sentence actually written for
 * the reader, is shown, and the report goes behind a disclosure.
 */
export interface DisplayError {
  /** What failed, in the app's words: "Deployment failed". */
  title: string;
  /** The one-line reason. */
  detail: string;
  /** The full report, when it says more than `detail` does. */
  raw?: string;
  /** Declining in the wallet is a choice, not a fault — it reads differently. */
  rejected: boolean;
}

/**
 * Describe `error` as the failure of `action` ("Deployment", "Tracking").
 * Returns `undefined` for no error, so callers can render it directly.
 */
export function describeError(error: unknown, action: string): DisplayError | undefined {
  if (error === null || error === undefined) return undefined;

  if (error instanceof BaseError) {
    // `walk` searches the cause chain: a rejection is usually wrapped a few
    // layers deep (TransactionExecutionError → RpcRequestError → …).
    const rejected = Boolean(error.walk((e) => e instanceof UserRejectedRequestError));
    if (rejected) {
      return {
        title: `${action} cancelled`,
        detail: "You rejected the request in your wallet.",
        rejected: true,
      };
    }
    // The wallet reverts with a bare 4-byte selector, which viem can only
    // report as "execution reverted" — name it where the data is there to read.
    const detail = decodeWalletRevert(revertDataFrom(error)) ?? error.shortMessage ?? error.message;
    const raw = error.message.trim();
    return { title: `${action} failed`, detail, raw: raw === detail.trim() ? undefined : raw, rejected: false };
  }

  if (error instanceof Error) return { title: `${action} failed`, detail: error.message, rejected: false };
  return { title: `${action} failed`, detail: String(error), rejected: false };
}
