import type { Hex } from "viem";

/**
 * Creation (deploy) bytecode for the Solcore `Multisig` contract.
 *
 * ⚠️ NOT BUILT IN THIS ENVIRONMENT. Producing this hex requires the Solcore
 * toolchain (sol-core → yule → solc --strict-assembly), which lives only in the
 * `nix develop` shell of axic/solcore. It is intentionally left `null` so no
 * call site ships a bogus deploy: `CreateWalletPage` branches on the value and
 * renders a "bytecode not built yet" state instead of attempting a broken
 * deployment.
 *
 * TO FILL IN (reproducible — track the exact commit so redeploys match):
 *   1. Check out axic/solcore at MULTISIG_SOLCORE_COMMIT (branch
 *      claude/multisig-create-view-fold39 adds the Phase-1 view getters that
 *      ./abi.ts and ./read.ts depend on).
 *   2. Inside `nix develop`, adapting contracts/scripts/build-solcore.sh:
 *        sol-core -f test/examples/dispatch/multisig.solc -i std -o out
 *        yule out/output1.hull -o out/creation.yul
 *        solc --strict-assembly --bin --optimize out/creation.yul | tail -1
 *   3. Paste the resulting `0x…` creation hex below as MULTISIG_BYTECODE and set
 *      MULTISIG_SOLCORE_COMMIT to the built commit.
 */

/** Exact axic/solcore commit the bytecode below was built from (for reproducibility). */
export const MULTISIG_SOLCORE_COMMIT = "unbuilt" as const;

/** Creation bytecode, or `null` until built via the Solcore toolchain (see above). */
export const MULTISIG_BYTECODE: Hex | null = null;

/** True only once real creation bytecode is pinned. Gate deploy UI on this. */
export const MULTISIG_DEPLOYABLE: boolean = MULTISIG_BYTECODE !== null;
