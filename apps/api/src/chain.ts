import { resolveChains, viemChain, type ChainConfig } from "@multisig/core";
import { createPublicClient, http, type Address, type PublicClient } from "viem";

/**
 * Read-only chain access for the API. The `Multisig` contract exposes no
 * getters, so the only fact we read back from chain is the wallet balance
 * (used by /sync). Everything else is the write-through index in the DB.
 */
const chains = new Map<number, ChainConfig>();
for (const c of resolveChains(process.env as Record<string, string | undefined>)) {
  chains.set(c.chainId, c);
}

const clients = new Map<number, PublicClient>();

export function publicClientFor(chainId: number): PublicClient | undefined {
  const cfg = chains.get(chainId);
  if (!cfg) return undefined;
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({ chain: viemChain(cfg), transport: http(cfg.rpcUrl) }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}

export async function readBalance(chainId: number, address: Address): Promise<string> {
  const client = publicClientFor(chainId);
  if (!client) throw new Error(`chain ${chainId} not configured (set RPC_URL_${chainId})`);
  const balance = await client.getBalance({ address });
  return balance.toString();
}
