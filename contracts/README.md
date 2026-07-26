# multisig

A **mixed Solidity + [solcore](https://github.com/argotorg/solcore) (Core Solidity)** wallet setup, built on Foundry.

The underlying wallet logic is written in **solcore**; the deployment / frontend
layer is written in **Solidity**. The two languages never link at the source
level — they interoperate over the ordinary Solidity ABI, exactly as two
separately-deployed contracts would. This works because solcore emits standard
4-byte selector dispatch and ABI-encoded args/returns, so a Solidity `interface`
can call a solcore contract (and vice-versa) with no glue.

## How the pieces fit

```
solcore/src/Wallet.solc          the actual wallet (m-of-n multisig)
        │  sol-core → yule → solc --strict-assembly   (scripts/build-solcore.sh)
        ▼
solcore/out/Wallet.json          Foundry-shaped artifact { abi, bytecode.object }
        │  vm.getCode(...)
        ▼
Solidity frontend ──────────────▶ deploys + calls the wallet over the ABI
  ├─ src/WalletFactory.sol        Pattern A: CREATE2 factory (standalone wallets)
  └─ src/WalletProxy.sol          Pattern B: EIP-1967 delegatecall proxy
  interfaces/IWallet.sol          Solidity view of the solcore wallet's ABI
  test/MultisigOps.sol            calldata builder for the sum-typed entrypoints
```

### The solcore wallet (`solcore/src/Wallet.solc`)

An m-of-n multisig smart account. Operations (`AddSigner`, `RemoveSigner`,
`ChangeSigRequired`, `TransferEth`, `TransferToken`, `Call`, …) are `queue`d,
`approve`d by enough signers, then `execute`d in strict nonce order:

- `initialize(address owner)` — one-shot "constructor for the factory"; registers
  `owner` as the sole signer with a 1-of-1 threshold. Reverts once a signer exists.
- `queue(Operation)` / `approve(uint256)` / `reject(uint256)` — signer-gated.
- `execute(uint256 nonce, bytes payload)` — anyone, once approvals ≥ threshold.
- `queueWithSignature` / `approveWithSignature` / `rejectWithSignature` /
  `batch` — signature-relayed and batched variants.
- `isValidSignature(bytes32,bytes) → bytes4` — ERC-1271 receiver.
- payable `fallback` — accepts bare ETH transfers (empty calldata).

It is deliberately **initializer-based, not constructor-based**, so the exact
same compiled runtime works both standalone and behind a delegatecall proxy.
Its storage is the solcore default: sequential slots from 0, so `signers` (a
mapping) is at **slot 0**, `signers_count` at **slot 1**, `signers_required` at
**slot 2**.

**Selectors and errors.** `initialize`, `approve`, `reject`, `execute`, and
`isValidSignature` take value types, so solcore's selector coincides with
Solidity's and a plain `interface` calls them (see `interfaces/IWallet.sol`).
`queue` and the `*WithSignature` variants take solcore *sum types* with no
Solidity spelling and structural, non-standard selectors — `test/MultisigOps.sol`
pins those selectors and assembles the nested-sum calldata. This research
prototype reverts **every** error with the same 4-byte code `0x12345678`
(`NotASigner`, `OperationNotFound`, `AlreadyInitialized`, …, are not yet
distinguished), so tests assert against that single `MultisigOps.ERROR`.

### Two frontend patterns

**Pattern A — `WalletFactory` (CREATE2).** A Solidity factory holds the solcore
wallet's creation bytecode and `create2`s standalone wallet instances, then
`initialize`s each. Pure ABI interop; each wallet owns its own storage.

**Pattern B — `WalletProxy` (EIP-1967 delegatecall).** The Solidity proxy *is*
the account — it holds funds and delegatecalls the solcore wallet runtime, which
therefore executes in the **proxy's** storage. Two constraints make this sound,
both satisfied here:

- The wallet owns low slots (`signers` mapping at slot 0, `signers_count` at 1,
  `signers_required` at 2); the proxy keeps its implementation pointer in the
  hashed **EIP-1967 slot**, which cannot collide.
- Setup must go through `initialize()` (a delegatecalled function), never a
  constructor — a constructor would write the implementation's storage at deploy
  time, not the proxy's.

`msg.sender` / `msg.value` / `address(this)` seen by the wallet resolve to the
proxy context automatically (CALLER / CALLVALUE / ADDRESS opcodes) — correct for
a wallet. `test/Proxy.t.sol` asserts the no-collision layout directly with
`vm.load`.

## Toolchain

Everything is provided by a Nix dev shell that layers the solcore compiler on
top of Foundry (`flake.nix` pins solcore as a flake input and re-exposes its
`sol-core` + `yule` binaries alongside `foundry-bin`, `solc`, and `jq`):

```sh
nix develop            # sol-core, yule, forge, cast, solc, jq, make
```

The shell exports `SOLCORE_STD` (solcore's std library path) so the build script
can find `import std.{*}`.

## Build & test

```sh
# inside `nix develop` (or prefix each with `nix develop --command`)
make wallet    # compile solcore/src/*.solc  -> solcore/out/*.json
make build     # wallet + forge build
make test      # wallet + forge test
make fmt       # forge fmt
make clean     # remove out/ and solcore/out/
```

`make test` always rebuilds the solcore artifacts first — `forge` has no native
`.solc` hook, so bare `forge test` would run against stale/absent artifacts.
`solcore/out/` is git-ignored (regenerated on demand).

### Adding another solcore contract

Drop `solcore/src/<Name>.solc` (one contract per file — sol-core names its Core
IR output `output1.hull` per compile), run `make wallet`, and load it in tests
with `SolcoreArtifact.deploy(vm, "<Name>")` /
`SolcoreArtifact.creationCode(vm, "<Name>")`. Add a matching Solidity
`interface` (selectors are standard; `cast interface solcore/out/<Name>.json`
can generate one from the emitted ABI).

## The multisig itself

The wallet is a full m-of-n multisig (queue → approve → execute over a stored
operation set, with signature-relayed and batched variants and an ERC-1271
receiver). It reuses the same factory / proxy frontends unchanged, because it
kept the `initialize(address owner)` lifecycle: a fresh wallet is a 1-of-1
multisig owned by `owner`, which then grows its signer set / raises its threshold
through queued `AddSigner` / `ChangeSigRequired` operations. The signature and
batching layers (`*WithSignature`, `batch`) exercise `ecrecover`, EIP-712
digests, approved-hash and EIP-1271 signer checks.

## Layout

```
flake.nix                  Nix dev shell (solcore compiler + Foundry)
foundry.toml               Foundry config (+ fs_permissions for solcore/out)
Makefile                   build orchestration
scripts/build-solcore.sh   .solc -> Foundry artifact pipeline
solcore/src/Wallet.solc    the solcore wallet
solcore/out/               generated artifacts (git-ignored)
src/                       Solidity frontend (factory, proxy)
interfaces/IWallet.sol     ABI view of the wallet
test/                      Foundry tests (Factory.t.sol, Proxy.t.sol, MultisigOps.sol)
lib/forge-std/             Foundry std library (submodule)
```

> solcore is a research prototype and explicitly not production-ready; this repo
> is experimental infrastructure for exploring the mixed-language workflow, not a
> production wallet.

## App integration (monorepo)

This directory holds the on-chain half of the [`multisig`](../README.md) monorepo
(`apps/`, `packages/`). The app consumes the compiled contract as follows:

- **ABI / selectors** — solcore computes selectors itself; pin them in
  `packages/core/src/selectors.ts` from the emitted ABI / golden vectors rather
  than deriving them from Solidity-style signatures.
- **Bytecode** — produced by the solcore pipeline here
  (`sol-core` → `yule` → `solc`, via `make wallet` → `solcore/out/*.json`). Track
  the exact solcore commit alongside any deployed bytecode so redeploys are
  reproducible.

> Note: the wallet in `solcore/src/Wallet.solc` is the full m-of-n multisig,
> imported from `axic/solcore` → `test/examples/dispatch/multisig.solc` and
> adapted with an `initialize(address)` lifecycle so the factory / proxy
> frontends deploy it. Pin its structural selectors from the emitted ABI (or
> from `test/MultisigOps.sol`) rather than deriving them Solidity-style, since
> the sum-typed entrypoints do not use standard signatures.
