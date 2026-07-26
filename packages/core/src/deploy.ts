import type { Hex } from "viem";

/**
 * The `Multisig` uses the proxy pattern: no constructor, an `initialize(owner)`
 * that sets `owner` as signer[0] (threshold 1). So deployment is two steps —
 * send the creation bytecode, then call `initialize(owner)` on the new address
 * (see `encodeInitialize`). That bytecode is produced by the Solcore pipeline
 * (`contracts/scripts/build-solcore.sh` -> `contracts/solcore/out/Wallet.json`,
 * `.bytecode.object`) and can't be compiled in the browser, so the app takes it
 * from config. When it's absent the deploy flow is disabled and the UI falls
 * back to tracking an already-deployed Multisig by address.
 */
type EnvBag = Record<string, string | undefined>;

export function resolveCreationCode(env: EnvBag): Hex | undefined {
  const raw = (env.VITE_MULTISIG_CREATION_CODE ?? env.MULTISIG_CREATION_CODE)?.trim();
  if (!raw) return undefined;
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  return /^0x[0-9a-fA-F]+$/.test(hex) && hex.length > 2 ? hex : undefined;
}
