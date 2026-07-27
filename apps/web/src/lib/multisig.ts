import {
  decodeAddress,
  decodeOperationReturn,
  decodeOperationStatus,
  decodeUint,
  decodeVote,
  encodeGetNonce,
  encodeGetOperation,
  encodeGetOperationsCount,
  encodeGetSigner,
  encodeGetSignersCount,
  encodeGetSignersRequired,
  encodeGetStatus,
  encodeGetVote,
  type Operation as CoreOperation,
  type OperationStatus,
  type OperationTag,
  type Vote,
} from "@multisig/core";
import { getAddress, type Address, type Hex } from "viem";

/**
 * The slice of a viem `PublicClient` we need for reads. Kept structural (rather
 * than viem's full `PublicClient`) so any wagmi/viem client — whose exact
 * generic parametrisation varies — satisfies it without type gymnastics.
 */
export interface ReadClient {
  call: (args: { to: Address; data: Hex }) => Promise<{ data?: Hex }>;
  getBalance: (args: { address: Address }) => Promise<bigint>;
}

/**
 * On-chain read model.
 *
 * The `Multisig` now exposes getters for every piece of state (signers,
 * threshold, nonce, the operation queue, statuses, and per-signer votes), so
 * the app renders directly from chain — no off-chain index. Each read here is a
 * plain `eth_call` against a viem `PublicClient`; the calldata builders and
 * return decoders live in `@multisig/core`.
 */

/** Everything the UI needs about a wallet, read from chain. */
export interface WalletState {
  chainId: number;
  address: Address;
  label?: string;
  signersRequired: number;
  signersCount: number;
  signers: Address[];
  nonce: number;
  operationsCount: number;
  balanceWei: bigint;
}

/** A queued operation as read from chain. */
export interface OperationView {
  index: number;
  op: CoreOperation;
  kind: OperationTag;
  status: OperationStatus["tag"];
  /** Live approval count (only meaningful while status is `Approvals`). */
  approvals: number;
  /** The connected account's vote on this op, if an account is connected. */
  myVote?: Vote;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** One `eth_call`, returning the raw return bytes. */
async function staticcall(client: ReadClient, to: Address, data: Hex): Promise<Hex> {
  const { data: ret } = await client.call({ to, data });
  if (!ret) throw new Error(`empty return from ${to} (${data.slice(0, 10)})`);
  return ret;
}

/** Read the signer set, threshold, nonce, op count, and balance. */
export async function readWalletState(
  client: ReadClient,
  chainId: number,
  address: string,
  label?: string,
): Promise<WalletState> {
  const to = getAddress(address);
  const [signersRequired, signersCount, nonce, operationsCount, balanceWei] = await Promise.all([
    staticcall(client, to, encodeGetSignersRequired()).then(decodeUint),
    staticcall(client, to, encodeGetSignersCount()).then(decodeUint),
    staticcall(client, to, encodeGetNonce()).then(decodeUint),
    staticcall(client, to, encodeGetOperationsCount()).then(decodeUint),
    client.getBalance({ address: to }),
  ]);

  const signers = await Promise.all(
    range(Number(signersCount)).map((i) => staticcall(client, to, encodeGetSigner(BigInt(i))).then(decodeAddress)),
  );

  return {
    chainId,
    address: to,
    label,
    signersRequired: Number(signersRequired),
    signersCount: Number(signersCount),
    signers,
    nonce: Number(nonce),
    operationsCount: Number(operationsCount),
    balanceWei,
  };
}

/**
 * Read the full operation queue. For open (still-`Approvals`) operations we also
 * fetch the connected account's own vote, so the UI can tell whether "you"
 * already approved. Executed/Rejected ops no longer carry a live approval count
 * on chain, so `approvals` is 0 for them (the UI hides the count in those cases).
 */
export async function readOperations(
  client: ReadClient,
  address: string,
  operationsCount: number,
  account?: Address,
): Promise<OperationView[]> {
  const to = getAddress(address);
  return Promise.all(
    range(operationsCount).map(async (i) => {
      const idx = BigInt(i);
      const [op, status] = await Promise.all([
        staticcall(client, to, encodeGetOperation(idx)).then(decodeOperationReturn),
        staticcall(client, to, encodeGetStatus(idx)).then(decodeOperationStatus),
      ]);
      const open = status.tag === "Approvals";
      const myVote =
        open && account ? await staticcall(client, to, encodeGetVote(idx, account)).then(decodeVote) : undefined;
      return {
        index: i,
        op,
        kind: op.tag,
        status: status.tag,
        approvals: status.tag === "Approvals" ? Number(status.count) : 0,
        myVote,
      };
    }),
  );
}
