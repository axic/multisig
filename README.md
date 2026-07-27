# multisig

A Safe-style multisig app for the **Solcore** multisig contract
(`axic/solcore @ multisig-ethglobal-rebase`,
`test/examples/dispatch/multisig.solc`).

The contract now exposes getters for all of its state, so **the web app runs
standalone against an RPC** — it reads signers, threshold, nonce, balance and
the whole operation queue (statuses + votes) directly from chain. The API +
database are no longer required to use the app; they remain in the repo as an
optional index and for the (deferred) relay layer.

> This app targets that specific contract, **not** Safe. The on-chain model is
> different, and those differences drive the whole design — read
> [How this differs from Safe](#how-this-differs-from-safe) first.

## Monorepo layout

```
apps/
  web/     React 18 + Vite + Tailwind + wagmi/viem + React Router + TanStack Query
  api/     Hono on Vercel Functions — Zod validation, viem chain reads
  db/      Prisma schema + client (Neon Postgres, serverless driver adapter)
packages/
  core/    Shared contract model: Operation/Signature types, selectors,
           calldata encoders, chain config. Owns the golden test vectors.
contracts/ Pointer + notes for the Solcore contract (built out of this repo).
```

`apps/db` is a shared library (named `apps/db` by request); it is not deployed.

## How this differs from Safe

Safe keeps a transaction off-chain until execution and coordinates signatures in
a database. **This contract keeps queued operations, votes, and status
on-chain.** Consequences:

- **`queue(op)` stores the full operation on-chain.** The DB is mostly an
  **index/cache** of chain state (rebuildable), not the source of truth.
- **Strict sequential execution by `nonce`.** Operations execute in queue order;
  a rejected op is still "executed" as a skip (`nonce += 1`).
- **Approve/reject are on-chain signer calls** (`approve(nonce)` /
  `reject(nonce)`), plus a relay layer (`*WithSignature`) taking EIP-2098 /
  approved-hash / EIP-1271 signatures.

### The two things that genuinely live off-chain

1. **`UnstoredCall(bytes32)` preimages.** The chain stores only a hash; the
   preimage `[address target][uint256 value][bytes payload]` must be supplied at
   `execute(nonce, payload)` time and is re-hashed on-chain. Lose it → the op can
   never execute. **This is the "signed-by-hash only" requirement.** The web app
   keeps these in the browser (`localStorage`); the API keeps them in
   `UnstoredCallPreimage`.
2. **Relayed signatures** collected for `*WithSignature` before submission
   (deferred; stored in `RelaySignature`).

## Contract ABI notes

- **`create_signature_hash` is a real EIP-712 digest** on the `wallet` branch:
  domain `Multisig`/`1`/chainId/verifyingContract, message
  `MultisigOperation(uint256 kind,bytes operation)` with a flat `[tag][fields]`
  operation preimage. Implemented in `packages/core/src/hash.ts` (mirrors the
  contract; used by the relay layer, a later phase).
- **`Operation` uses Solcore's non-standard sum-type ABI** — a right-nested
  binary sum ("sum-wide-product"): variant *k* is *k* `inr` (`1`) tag words then
  an `inl` (`0`), the field words, zero-padded to a fixed 10-word width.
  Implemented + validated against `packages/core/test/vectors/multisig.json` in
  `operationCodec.ts`. The dynamic `Call(address,uint256,bytes)` variant isn't
  representable by the static encoder, so arbitrary calls are queued as
  `UnstoredCall` (hash on-chain + preimage in the DB). `approve`/`reject`/
  `execute` are standard ABI.

## Getting started

The web app is self-contained — all it needs is an RPC:

```bash
pnpm install                    # generates the Prisma client (apps/db postinstall)
cp .env.example .env            # set VITE_MULTISIG_CHAIN_IDS + VITE_RPC_URL_<id>
pnpm --filter @multisig/web dev # web on :5173 — deploy/track, read + drive on-chain
```

Deployed wallets are remembered in the browser (`localStorage`); everything they
show is read live from chain via the contract getters (`packages/core`
`getters.ts`).

The API + database are optional (an index / the deferred relay layer):

```bash
cp .env.example .env            # also set DATABASE_URL
pnpm db:push                    # apply schema to Neon (needed for the DB-backed routes)
pnpm --filter @multisig/api dev # api on :8787  (/health works without a DB)
```

> The Prisma client is generated automatically on `pnpm install` via the
> `apps/db` postinstall. If you ever see `Cannot find module '.prisma/client/*'`,
> run `pnpm db:generate` (or just `pnpm install` again).

Root tasks (Turbo): `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Shipped model — on-chain Multisig (M1–M4)

The app drives the real on-chain **`Multisig`** contract
(`contracts/solcore/src/Wallet.solc`, the `Multisig` contract): signers, the
operation queue, votes, status and the nonce all live on-chain. It uses the
proxy pattern — deploy the runtime, then `initialize(owner)` sets the caller as
signer #0 with threshold 1; more signers and a higher threshold are added via
queued `AddSigner` / `ChangeSigRequired` operations.

The contract exposes **getters** for all of its state (`getSignersCount` /
`getSigner` / `getSignersRequired` / `getNonce` / `getOperationsCount` /
`getOperation` / `getStatus` / `getVote` / `isHashApproved` / `isSigner`), so
the web app reads everything straight from chain — no index required. The
calldata builders and return decoders (including the non-standard sum-typed
`Operation` / `OperationStatus` / `Vote` returns) live in `packages/core`
`getters.ts`; the web read layer is `apps/web/src/lib/multisig.ts`. Only
`UnstoredCall` preimages (and, later, relayed signatures) live off-chain — the
web app keeps preimages in `localStorage`.

The API's write-through DB index remains available for server-side consumers,
but the web app no longer depends on it.

Calldata is built in `packages/core` and sent as raw transactions:

- `queue(Operation)` — sum-type codec (`operationCodec.ts`, 10-word nested
  binary sum), validated against the golden vectors. Send-ETH uses the native
  `TransferEth` op; an arbitrary call is queued as `UnstoredCall` (hash on-chain,
  `[target][value][data]` preimage stored in the DB and supplied at execute).
- `approve(nonce)` / `reject(nonce)` / `execute(nonce, payload)` — standard ABI.
- Strict sequential execution: only the op at `nonce` can execute; a rejected op
  executes as a skip that advances the nonce.

### Deploy bytecode

The `Multisig` creation bytecode is **hardcoded** in
`packages/core/src/generated/multisigBytecode.ts`, so deploy works with zero
config. It is generated from the solcore artifact — never hand-edited:

```bash
nix develop -c make -C contracts wallet    # solcore -> contracts/solcore/out/Wallet.json
pnpm --filter @multisig/core gen:bytecode  # artifact -> the generated constant
```

`VITE_MULTISIG_CREATION_CODE` remains only as an override (custom/pre-release
build). CI keeps the constant honest — the artifact is already built in `ci.yml`,
so add `pnpm --filter @multisig/core check:bytecode` (regenerates and
`git diff --exit-code`s) to fail when the contract changed but the constant
wasn't regenerated. The committed constant is empty until the pipeline first runs.

### Milestones

- **Phase 0** — monorepo, DB, `packages/core` skeleton, API + web shell. ✅
- **M1** — connect, deploy the `Multisig` (bytecode + `initialize`) or track an
  existing address, view
  signers / threshold / nonce / balance. ✅
- **M2** — queue a tx (`TransferEth` or `UnstoredCall` + preimage), approve
  (on-chain signer call), queue list. ✅
- **M3** — execute (anyone, supplying the `UnstoredCall` preimage as payload),
  advance the nonce; status + history. ✅
- **M4** — reject (marks the op, executed as a skip), plus signer/threshold
  management ops surfaced in Settings. ✅
- **M5** *(deferred)* — the relay layer (`queue/approve/rejectWithSignature`,
  EIP-2098 / approved-hash / EIP-1271 signatures) and `batch`. The EIP-712
  signing digest they need is already implemented in `packages/core/src/hash.ts`.
