import {
  encodeApprove,
  encodeExecute,
  encodeQueue,
  encodeReject,
  resolveWalletCreationCode,
  type Operation,
} from "@multisig/core";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import type { CreateOperationBody } from "./api.js";

/**
 * On-chain interaction for the multisig, using ONLY the direct signer
 * entrypoints — queue / approve / reject / execute. The relay (*WithSignature)
 * and batching entrypoints are intentionally not used.
 *
 * Deployment is done DIRECTLY from the connected EOA: the contract's
 * constructor sets `signers[0] = caller()` and `signers_required = 1`, so the
 * deployer becomes the sole first signer (the M1 semantics). We do not route
 * through `contracts/src/WalletFactory` — its CREATE2 deploy would make the
 * factory the first signer, and its `initialize`/`getOwner` calls don't exist
 * on the multisig ABI.
 */

/** Creation bytecode from VITE_WALLET_CREATION_CODE (see @multisig/core artifact). */
export function walletCreationCode(): Hex | undefined {
  return resolveWalletCreationCode(import.meta.env as Record<string, string | undefined>);
}

function requireAccount(wallet: WalletClient): Address {
  if (!wallet.account) throw new Error("No connected account");
  return wallet.account.address;
}

/** Deploy a fresh multisig; the sender becomes signer[0], threshold 1. */
export async function deployWallet(
  wallet: WalletClient,
  pub: PublicClient,
): Promise<{ address: Address; txHash: Hex; deployer: Address }> {
  const code = walletCreationCode();
  if (!code) {
    throw new Error(
      "No wallet creation code configured. Build it in contracts/ with `make wallet` " +
        "and set VITE_WALLET_CREATION_CODE to solcore/out/Wallet.json's bytecode.object.",
    );
  }
  const deployer = requireAccount(wallet);
  const txHash = await wallet.sendTransaction({
    account: wallet.account!,
    chain: wallet.chain,
    data: code,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  if (!receipt.contractAddress) throw new Error("Deploy failed: no contract address in receipt");
  return { address: receipt.contractAddress, txHash, deployer };
}

/** Send calldata to the wallet and wait for the receipt; returns the tx hash. */
async function sendToWallet(
  wallet: WalletClient,
  pub: PublicClient,
  to: Address,
  data: Hex,
  value = 0n,
): Promise<Hex> {
  const txHash = await wallet.sendTransaction({
    account: wallet.account!,
    chain: wallet.chain,
    to,
    data,
    value,
  });
  await pub.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export const queueTx = (w: WalletClient, p: PublicClient, wallet: Address, op: Operation) =>
  sendToWallet(w, p, wallet, encodeQueue(op));

export const approveTx = (w: WalletClient, p: PublicClient, wallet: Address, nonce: bigint) =>
  sendToWallet(w, p, wallet, encodeApprove(nonce));

export const rejectTx = (w: WalletClient, p: PublicClient, wallet: Address, nonce: bigint) =>
  sendToWallet(w, p, wallet, encodeReject(nonce));

export const executeTx = (
  w: WalletClient,
  p: PublicClient,
  wallet: Address,
  nonce: bigint,
  payload: Hex = "0x",
) => sendToWallet(w, p, wallet, encodeExecute(nonce, payload));

/**
 * Serialize an `Operation` into the API's `{ kind, decoded }` shape. uint256
 * fields become decimal strings (JSON can't carry bigint).
 */
export function operationForApi(op: Operation): Pick<CreateOperationBody, "kind" | "decoded"> {
  switch (op.tag) {
    case "AddSigner":
    case "RemoveSigner":
      return { kind: op.tag, decoded: { signer: op.signer } };
    case "ChangeSigRequired":
      return { kind: op.tag, decoded: { count: op.count.toString() } };
    case "TransferEth":
      return { kind: op.tag, decoded: { target: op.target, amount: op.amount.toString() } };
    case "TransferToken":
      return {
        kind: op.tag,
        decoded: { target: op.target, token: op.token, amount: op.amount.toString() },
      };
    default:
      return { kind: op.tag, decoded: {} };
  }
}
