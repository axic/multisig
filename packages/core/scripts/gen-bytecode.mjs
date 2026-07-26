#!/usr/bin/env node
// Regenerate src/generated/multisigBytecode.ts from the solcore artifact.
//
// Reads contracts/solcore/out/Wallet.json (`.bytecode.object`, produced by
// contracts/scripts/build-solcore.sh) and writes the hardcoded creation-code
// constant used by resolveCreationCode(). Run after `make -C contracts wallet`.
//
// Exit codes: 0 = wrote/updated; 2 = artifact missing or malformed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = resolve(here, "../../../contracts/solcore/out/Wallet.json");
const outFile = resolve(here, "../src/generated/multisigBytecode.ts");

if (!existsSync(artifact)) {
  console.error(`gen-bytecode: artifact not found at ${artifact}`);
  console.error("  build it first:  nix develop -c make -C contracts wallet");
  process.exit(2);
}

let object;
try {
  object = JSON.parse(readFileSync(artifact, "utf8"))?.bytecode?.object;
} catch (e) {
  console.error(`gen-bytecode: could not parse ${artifact}: ${e.message}`);
  process.exit(2);
}
if (typeof object !== "string" || !/^0x[0-9a-fA-F]*$/.test(object) || object.length <= 2) {
  console.error("gen-bytecode: artifact has no usable bytecode.object");
  process.exit(2);
}

const header = `// GENERATED FILE — do not edit by hand.
//
// The \`Multisig\` creation bytecode, hardcoded into the source so the web app can
// deploy with zero config. Regenerate whenever the contract changes:
//
//   nix develop -c make -C contracts wallet   # compiles solcore/out/Wallet.json
//   pnpm --filter @multisig/core gen:bytecode  // reads it -> this file
//
// CI enforces this is up to date (regenerate + \`git diff --exit-code\`).
`;
writeFileSync(outFile, `${header}export const MULTISIG_CREATION_CODE = "${object}";\n`);
console.log(`gen-bytecode: wrote ${object.length - 2} hex chars to ${outFile}`);
