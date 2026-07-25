# contracts

The multisig contract is written in **Solcore** and lives in the compiler repo:

- Source: `axic/solcore @ multisig-ethglobal-rebase`
  → `test/examples/dispatch/multisig.solc`
- Golden calldata vectors: same repo → `test/examples/dispatch/multisig.json`
  (mirrored for the app at `packages/core/test/vectors/multisig.json`).

This directory is a placeholder for how the app consumes the contract:

- **ABI / selectors** — pinned in `packages/core/src/selectors.ts` from the
  golden vectors (Solcore computes selectors itself; do not derive them from
  Solidity-style signatures).
- **Bytecode** — needed for the Phase 1 deploy flow. Produce it via the Solcore
  pipeline (`sol-core` → `yule` → `solc`) and drop the runtime/deploy artifacts
  here (or fetch from a build step). Track the exact solcore commit alongside the
  bytecode so redeploys are reproducible.

## Key contract facts the app relies on

- `constructor()` takes no args: the deployer becomes `signers[0]`,
  `signers_required = 1`.
- Entrypoints: `queue(Operation)`, `approve(uint256)`, `reject(uint256)`,
  `execute(uint256, bytes)`, plus `*WithSignature` relay variants and
  `isValidSignature(bytes32,bytes)` (EIP-1271 magic `0x1626ba7e`).
- Operations execute in strict `nonce` order; `execute` on a `Rejected` op is a
  no-op that advances the nonce.
- `Operation` / `Signature` are sum types encoded with Solcore's non-standard
  ABI — see `packages/core/src/operationCodec.ts`.

## Open contract TODOs that gate app features

- `create_signature_hash` must include domain/chainId and real `abi.encode`
  (currently hashes a constant) before signature relay can ship.
- `emit log` events are TODO throughout — the indexer (Phase 3) will be simpler
  and cheaper once operations/votes/execution emit events instead of requiring
  storage scans.
