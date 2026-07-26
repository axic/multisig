import { createPublicClient, getAddress, http, type Address, type PublicClient } from "viem";
import { viemChain, type ChainConfig } from "../chains.js";
import { MULTISIG_ABI } from "./abi.js";

/**
 * Pure viem read helpers for a deployed multisig.
 *
 * These are runtime-agnostic (no env, no wagmi): pass a resolved ChainConfig and
 * an address. Used server-side by apps/api `/sync` (which hides the RPC key) and
 * client-side by apps/web for balance.
 */

/** Build a public client for a resolved chain config. */
export function makePublicClient(cfg: ChainConfig): PublicClient {
  return createPublicClient({ chain: viemChain(cfg), transport: http(cfg.rpcUrl) });
}

/** On-chain wallet configuration, read via the Phase-1 view getters. */
export interface WalletConfig {
  signersRequired: number;
  signersCount: number;
  /** Checksummed signer addresses, in on-chain slot order (signerAt(0..count-1)). */
  signers: Address[];
  /** Next executable operation index. */
  nonce: number;
}

/**
 * Read signers/threshold/nonce from the contract's view getters.
 *
 * `signersCount` is small (single-digit in practice), so iterating
 * `signerAt(0..count-1)` is fine. All calls fan out concurrently.
 */
export async function readWalletConfig(
  client: PublicClient,
  address: Address,
): Promise<WalletConfig> {
  const [required, count, nonce] = await Promise.all([
    client.readContract({ address, abi: MULTISIG_ABI, functionName: "signersRequired" }),
    client.readContract({ address, abi: MULTISIG_ABI, functionName: "signersCount" }),
    client.readContract({ address, abi: MULTISIG_ABI, functionName: "getNonce" }),
  ]);

  const signersCount = Number(count);
  const signers = await Promise.all(
    Array.from({ length: signersCount }, (_, i) =>
      client.readContract({
        address,
        abi: MULTISIG_ABI,
        functionName: "signerAt",
        args: [BigInt(i)],
      }),
    ),
  );

  return {
    signersRequired: Number(required),
    signersCount,
    signers: signers.map((s) => getAddress(s)),
    nonce: Number(nonce),
  };
}

/** Native ETH balance (wei) of the wallet. */
export async function readWalletBalance(client: PublicClient, address: Address): Promise<bigint> {
  return client.getBalance({ address });
}
