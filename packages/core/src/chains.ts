import { defineChain } from "viem";
import { sepolia } from "viem/chains";

/**
 * Chain + RPC configuration, resolved from environment.
 *
 * v1 is single-chain (Sepolia by default) but `chainId` is a first-class key
 * throughout the schema and API so adding chains later is config-only.
 *
 * Reads work in two runtimes:
 *   - Node/serverless (apps/api): RPC_URL_<chainId>, MULTISIG_CHAIN_IDS
 *   - Vite/browser (apps/web): VITE_RPC_URL_<chainId>, VITE_MULTISIG_CHAIN_IDS
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
}

const KNOWN_CHAINS = {
  11155111: sepolia,
} as const;

type EnvBag = Record<string, string | undefined>;

function readEnv(key: string, env: EnvBag): string | undefined {
  return env[`VITE_${key}`] ?? env[key];
}

export function resolveChains(env: EnvBag): ChainConfig[] {
  const idsRaw = readEnv("MULTISIG_CHAIN_IDS", env) ?? "11155111";
  const ids = idsRaw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  return ids.map((chainId) => {
    const known = KNOWN_CHAINS[chainId as keyof typeof KNOWN_CHAINS];
    // Prefer a configured RPC; fall back to the known chain's public RPC so the
    // app renders out-of-the-box. Only a truly unknown chain with no RPC throws.
    const rpcUrl = readEnv(`RPC_URL_${chainId}`, env) ?? known?.rpcUrls.default.http[0];
    if (!rpcUrl) {
      throw new Error(`Missing RPC URL for chain ${chainId} (set RPC_URL_${chainId})`);
    }
    return { chainId, name: known?.name ?? `chain-${chainId}`, rpcUrl };
  });
}

/** viem Chain for a configured id, falling back to a minimal definition. */
export function viemChain(cfg: ChainConfig) {
  const known = KNOWN_CHAINS[cfg.chainId as keyof typeof KNOWN_CHAINS];
  if (known) return known;
  return defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
}
