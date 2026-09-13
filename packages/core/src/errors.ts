import { BaseError, ExecutionRevertedError, decodeAbiParameters, size, slice, type Hex } from "viem";

/**
 * Revert selectors for the Solcore multisig.
 *
 * Solcore's `require(cond, Error(0x…))` / `revertWithError(Error(0x…))` revert
 * with the bare 4-byte selector and nothing else (see std.solc
 * `revertWithError`: `mstore(0, selector); revert_(28, 4)`), so there is no ABI
 * to decode against — the selector IS the whole payload. The names are the
 * ones spelled out in the comments next to each `Error(…)` literal in
 * contracts/solcore/src/Wallet.solc; keep the two in sync.
 */
export const WALLET_ERRORS = {
  "0x0dc149f0": "AlreadyInitialized",
  "0xf92d31f2": "MustBeInitializedViaProxy",
  "0xda0357f7": "NotASigner",
  "0x0e8fceb7": "CannotAddZeroAddressAsSigner",
  "0x82788a84": "CannotAddSelfAsSigner",
  "0x1779ab44": "ThresholdBelowMinimum",
  "0xf046c770": "OperationNotFound",
  "0x2acb3fbc": "SignerAlreadyApproved",
  "0xe12bcce7": "UnexpectedStatus",
  "0x14d686e3": "HashNotApprovedByTarget",
  "0x1dbcfbd8": "EIP1271VerificationRejected",
  "0x0afc4171": "IncorrectSequence",
  "0x24bcdbea": "NotEnoughApprovals",
  "0x2d14d20e": "IncorrectStatus",
  "0x4a3d5baa": "ThresholdExceedsSigners",
  "0x6747a288": "EtherTransferFailed",
  "0x3204506f": "CallFailed",
  "0xe2af0df0": "InvalidPayloadSupplied",
  "0x4e9268f6": "UnstoredCallFailed",
  "0xff80a9e5": "ApprovedSignedHashExist",
  "0xa465cdf7": "ApprovedSignedHashDoesNotExist",
  "0x9c0ebd3c": "UnexpectedEtherTransfer",
  "0x202643f6": "HashNotApproved",
  "0x10bbbc9b": "EmptySignatureExpected",
  "0x38615ecc": "SignerAlreadyExists",
  "0x82df8145": "CannotRemoveOnlySigner",
} as const satisfies Record<Hex, string>;

/** The names above, as a union. */
export type WalletErrorName = (typeof WALLET_ERRORS)[keyof typeof WALLET_ERRORS];

/** Human-readable gloss for the errors a user can actually run into. */
const WALLET_ERROR_HINTS: Partial<Record<WalletErrorName, string>> = {
  NotASigner: "your account is not a signer on this wallet",
  NotEnoughApprovals: "the operation does not have enough approvals yet",
  IncorrectSequence: "another operation was executed first — refresh and retry",
  IncorrectStatus: "the operation is no longer executable",
  UnexpectedStatus: "the operation is no longer open for voting",
  SignerAlreadyApproved: "you have already approved this operation",
  EtherTransferFailed: "the recipient rejected the ETH transfer",
  CallFailed: "the target contract reverted",
  UnstoredCallFailed: "the target contract reverted",
  InvalidPayloadSupplied: "the stored payload does not match the queued hash",
  ThresholdExceedsSigners: "the new threshold is higher than the signer count",
  CannotRemoveOnlySigner: "a wallet must keep at least one signer",
  SignerAlreadyExists: "that address is already a signer",
};

/** `Error(string)` — the standard Solidity revert string. */
const ERROR_STRING = "0x08c379a0";
/** `Panic(uint256)` — the standard Solidity panic. */
const PANIC = "0x4e487b71";

/**
 * Turn raw revert data into something worth showing a human.
 *
 * Handles the three shapes we can get back from the wallet: a bare Solcore
 * error selector, a standard `Error(string)` / `Panic(uint256)` bubbled up from
 * an inner call (WalletProxy re-reverts the callee's returndata verbatim), and
 * empty data (an out-of-gas or a bare `revert(0, 0)`). Returns `undefined` when
 * there is nothing intelligible to say, so callers can fall back to their own
 * wording.
 */
export function decodeWalletRevert(data?: Hex): string | undefined {
  if (!data || data === "0x") return undefined;
  if (size(data) < 4) return undefined;

  const selector = slice(data, 0, 4).toLowerCase() as Hex;

  const name = (WALLET_ERRORS as Record<string, WalletErrorName | undefined>)[selector];
  if (name) {
    const hint = WALLET_ERROR_HINTS[name];
    return hint ? `${name}() — ${hint}` : `${name}()`;
  }

  if (selector === ERROR_STRING) {
    try {
      const [reason] = decodeAbiParameters([{ type: "string" }], slice(data, 4));
      return reason;
    } catch {
      return undefined;
    }
  }

  if (selector === PANIC) {
    try {
      const [code] = decodeAbiParameters([{ type: "uint256" }], slice(data, 4));
      return `Panic(0x${code.toString(16)})`;
    } catch {
      return undefined;
    }
  }

  return `reverted with ${selector}`;
}

/**
 * Dig the raw revert data out of a viem error: it sits several layers down
 * (CallExecutionError → RawContractError), and the payload is either the hex
 * itself or `{ data: hex }` depending on the shape the node returned.
 */
export function revertDataFrom(err: unknown): Hex | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const raw = err.walk((e) => (e as { data?: unknown }).data !== undefined);
  const data = (raw as { data?: Hex | { data?: Hex } } | null)?.data;
  return typeof data === "string" ? data : data?.data;
}

/**
 * True when the node told us the call reverted, as opposed to failing to
 * answer at all. Callers use this to distinguish "this transaction cannot
 * succeed" from "the RPC is having a bad day".
 */
export function isRevert(err: unknown): boolean {
  if (revertDataFrom(err) !== undefined) return true;
  return err instanceof BaseError && err.walk((e) => e instanceof ExecutionRevertedError) !== null;
}

/** The contract's own error name where we can decode it, viem's summary otherwise. */
export function revertReason(err: unknown): string | undefined {
  return decodeWalletRevert(revertDataFrom(err)) ?? (err instanceof BaseError ? err.shortMessage : undefined);
}
