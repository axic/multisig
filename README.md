# multisig

A Safe-style multisig app — web + API + database — for the **Solcore** multisig
contract (`axic/solcore @ multisig-ethglobal-rebase`,
`test/examples/dispatch/multisig.solc`).

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

### The two things that genuinely live off-chain (why we need a DB)

1. **`UnstoredCall(bytes32)` preimages.** The chain stores only a hash; the
   preimage `[address target][uint256 value][bytes payload]` must be supplied at
   `execute(nonce, payload)` time and is re-hashed on-chain. Lose it → the op can
   never execute. Stored in `UnstoredCallPreimage`. **This is the "signed-by-hash
   only" requirement.**
2. **Relayed signatures** collected for `*WithSignature` before submission.
   Stored in `RelaySignature`.

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

```bash
pnpm install                    # generates the Prisma client (apps/db postinstall)
cp .env.example .env            # set DATABASE_URL + RPC_URL_11155111
pnpm db:push                    # apply schema to Neon (needed for the DB-backed routes)
pnpm --filter @multisig/api dev # api on :8787  (/health works without a DB)
pnpm --filter @multisig/web dev # web on :5173
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

Because the contract exposes **no getters and emits no events yet**, the
frontend can't read that state back. So the DB is a **write-through index**:
seeded at deploy, then updated on each successful queue/approve/reject/execute
the web app performs. The one fact read straight from chain is the balance
(`/sync`). Two things live only off-chain: `UnstoredCall` preimages and (later)
relayed signatures.

Calldata is built in `packages/core` and sent as raw transactions:

- `queue(Operation)` — sum-type codec (`operationCodec.ts`, 10-word nested
  binary sum), validated against the golden vectors. Send-ETH uses the native
  `TransferEth` op; an arbitrary call is queued as `UnstoredCall` (hash on-chain,
  `[target][value][data]` preimage stored in the DB and supplied at execute).
- `approve(nonce)` / `reject(nonce)` / `execute(nonce, payload)` — standard ABI.
- Strict sequential execution: only the op at `nonce` can execute; a rejected op
  executes as a skip that advances the nonce.

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
