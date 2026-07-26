import type { Hex } from "viem";

/**
 * Access to the compiled multisig creation bytecode.
 *
 * The wallet is written in Solcore (`contracts/solcore/src/Wallet.solc`) and
 * compiled by `contracts/scripts/build-solcore.sh` into a Foundry-shaped
 * artifact at `contracts/solcore/out/Wallet.json` (`{ bytecode: { object } }`).
 * That toolchain (sol-core → yule → solc) only runs inside the contracts Nix
 * dev shell, so the browser can't build it — it must be handed the creation
 * code out-of-band.
 *
 * We deploy the multisig DIRECTLY from the connected EOA (not via
 * `WalletFactory`): the contract's constructor sets `signers[0] = caller()` and
 * `signers_required = 1`, so whoever sends the creation transaction becomes the
 * sole first signer — exactly the M1 semantics. Routing it through the CREATE2
 * factory would instead make the factory the first signer (and the factory's
 * `initialize`/`getOwner` calls don't even exist on the multisig ABI).
 *
 * Resolution order for the creation code:
 *   1. an explicit value passed in (tests / server),
 *   2. `WALLET_CREATION_CODE` / `VITE_WALLET_CREATION_CODE` in the environment,
 *      set to the `bytecode.object` from the built artifact.
 */

export interface WalletArtifact {
  /** Creation (init) bytecode — what an EOA deploy transaction carries. */
  creationCode: Hex;
}

type EnvBag = Record<string, string | undefined>;

function readEnv(key: string, env: EnvBag): string | undefined {
  return env[`VITE_${key}`] ?? env[key];
}

function normalizeCode(raw: string): Hex {
  const hex = raw.trim();
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as Hex;
}

/**
 * Resolve the wallet creation bytecode, or `undefined` if none is configured.
 * Callers surface a "compile the contract (`make wallet`) and set
 * WALLET_CREATION_CODE" message when this is missing rather than deploying junk.
 */
export function resolveWalletCreationCode(env: EnvBag = {}, explicit?: string): Hex | undefined {
  const raw = explicit ?? readEnv("WALLET_CREATION_CODE", env);
  if (!raw || raw.length < 4) return undefined;
  return normalizeCode(raw);
}
