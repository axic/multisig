import type { Hex } from "viem";
import { MULTISIG_CREATION_CODE } from "./generated/multisigBytecode.js";

/**
 * The `Multisig` uses the proxy pattern: no constructor, an `initialize(owner)`
 * that sets `owner` as signer[0] (threshold 1). So deployment is two steps —
 * send the creation bytecode, then call `initialize(owner)` on the new address
 * (see `encodeInitialize`).
 *
 * The bytecode is HARDCODED in `./generated/multisigBytecode.ts`, generated from
 * the solcore artifact (`contracts/solcore/out/Wallet.json`) by
 * `pnpm --filter @multisig/core gen:bytecode`. That is the source of truth, so
 * deploy works with zero config. `VITE_MULTISIG_CREATION_CODE` /
 * `MULTISIG_CREATION_CODE` remain as an OVERRIDE (e.g. deploying a custom or
 * pre-release build). When neither yields a value the deploy flow is disabled
 * and the UI falls back to tracking an already-deployed Multisig by address.
 */
type EnvBag = Record<string, string | undefined>;

function normalize(raw: string | undefined): Hex | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const hex = (v.startsWith("0x") ? v : `0x${v}`) as Hex;
  return /^0x[0-9a-fA-F]+$/.test(hex) && hex.length > 2 ? hex : undefined;
}

export function resolveCreationCode(env: EnvBag = {}): Hex | undefined {
  // Env override first (opt-in), then the hardcoded, generated constant.
  return (
    normalize(env.VITE_MULTISIG_CREATION_CODE) ??
    normalize(env.MULTISIG_CREATION_CODE) ??
    normalize(MULTISIG_CREATION_CODE)
  );
}
