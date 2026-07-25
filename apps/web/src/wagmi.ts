import { resolveChains, viemChain } from "@multisig/core";
import { http, createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

// Resolve enabled chains from VITE_* env (see packages/core/chains.ts).
const chainConfigs = resolveChains(import.meta.env as Record<string, string | undefined>);
if (chainConfigs.length === 0) throw new Error("No chains configured (VITE_MULTISIG_CHAIN_IDS)");

const chains = chainConfigs.map(viemChain) as [ReturnType<typeof viemChain>, ...ReturnType<typeof viemChain>[]];
const transports = Object.fromEntries(chainConfigs.map((c) => [c.chainId, http(c.rpcUrl)]));

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

export const wagmiConfig = createConfig({
  chains,
  transports,
  connectors: [injected(), ...(projectId ? [walletConnect({ projectId })] : [])],
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
