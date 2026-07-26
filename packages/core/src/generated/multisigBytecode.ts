// GENERATED FILE — do not edit by hand.
//
// The `Multisig` creation bytecode, hardcoded into the source so the web app can
// deploy with zero config. Regenerate whenever the contract changes:
//
//   nix develop -c make -C contracts wallet   # compiles solcore/out/Wallet.json
//   pnpm --filter @multisig/core gen:bytecode  # reads it -> this file
//
// CI enforces this is up to date (regenerate + `git diff --exit-code`). It is
// EMPTY until the solcore pipeline has been run in an environment that has the
// toolchain (this repo's dev shell / CI); an empty value simply disables the
// in-app "Deploy" button (track an existing address instead).
export const MULTISIG_CREATION_CODE = "";
