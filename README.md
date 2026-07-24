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
solcore/src/Wallet.solc          the actual wallet (owner-gated `execute`)
        │  sol-core → yule → solc --strict-assembly   (scripts/build-solcore.sh)
        ▼
solcore/out/Wallet.json          Foundry-shaped artifact { abi, bytecode.object }
        │  vm.getCode(...)
        ▼
Solidity frontend ──────────────▶ deploys + calls the wallet over the ABI
  ├─ src/WalletFactory.sol        Pattern A: CREATE2 factory (standalone wallets)
  └─ src/WalletProxy.sol          Pattern B: EIP-1967 delegatecall proxy
  interfaces/IWallet.sol          Solidity view of the solcore wallet's ABI
```

### The solcore wallet (`solcore/src/Wallet.solc`)

A minimal single-owner smart account:

- `initialize(address)` — one-shot; sets the owner (address(0) = uninitialized).
- `getOwner() → address`
- `execute(address to, uint256 value, bytes data) → bytes` — owner-only outbound
  call, forwarding `value` from the wallet's balance.

It is deliberately **initializer-based, not constructor-based**, so the exact
same compiled runtime works both standalone and behind a delegatecall proxy.
Its storage is the solcore default: sequential slots from 0, so `owner` is at
**slot 0**.

Custom-error selectors it reverts with:

| Error                  | Selector     |
| ---------------------- | ------------ |
| `AlreadyInitialized()` | `0x0dc149f0` |
| `ZeroOwner()`          | `0x9905827b` |
| `Unauthorized()`       | `0x82b42900` |
| `CallFailed()`         | `0x3204506f` |

### Two frontend patterns

**Pattern A — `WalletFactory` (CREATE2).** A Solidity factory holds the solcore
wallet's creation bytecode and `create2`s standalone wallet instances, then
`initialize`s each. Pure ABI interop; each wallet owns its own storage.

**Pattern B — `WalletProxy` (EIP-1967 delegatecall).** The Solidity proxy *is*
the account — it holds funds and delegatecalls the solcore wallet runtime, which
therefore executes in the **proxy's** storage. Two constraints make this sound,
both satisfied here:

- The wallet owns low slots (`owner` at slot 0); the proxy keeps its
  implementation pointer in the hashed **EIP-1967 slot**, which cannot collide.
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

## Extending the wallet toward a real multisig

The wallet is intentionally a small, correct core. A full m-of-n multisig is a
natural extension, all expressible in solcore today (its std exposes `ecrecover`,
`keccak256`, mappings, and the full opcode surface):

- store an owners set + threshold instead of a single `owner`;
- add an `execute(...)` variant that takes a bundle of signatures, `ecrecover`s
  each, and requires ≥ threshold distinct owner signatures over a nonce'd digest;
- keep the same factory / proxy frontends unchanged.

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
test/                      Foundry tests (Factory.t.sol, Proxy.t.sol)
lib/forge-std/             Foundry std library (submodule)
```

> solcore is a research prototype and explicitly not production-ready; this repo
> is experimental infrastructure for exploring the mixed-language workflow, not a
> production wallet.
