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

## Contract-side gaps that block features (as of the referenced branch)

- **`create_signature_hash` is a stub** — it hashes a constant
  (`keccak256(bytes32(1))`), with `// TODO: include domain/chainId` and
  `abi.encode` noted as not working. Until it computes a real (ideally EIP-712)
  digest, the **signature-relay feature set cannot be built correctly.**
  `packages/core/src/hash.ts` throws on purpose so nothing fabricates a mismatched
  hash. Direct signer calls (`queue`/`approve`/`reject`/`execute`) are unaffected.
- **`Operation`/`Signature` use Solcore's non-standard sum-type ABI**
  (sum-wide-product / nested binary sum), not standard Solidity ABI. The golden
  vectors in `packages/core/test/vectors/multisig.json` are the source of truth
  for implementing `operationCodec.ts` (Phase 2). `encodeOperation` throws until
  then; the outer `approve`/`reject`/`execute` encoders are standard ABI, done,
  and covered by tests.

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

## Phased plan

- **Phase 0 (this scaffold)** — monorepo, DB schema, `packages/core` model +
  outer-ABI encoders + golden vectors, API skeleton (wallet register/list/get),
  web shell with wallet connect. ✅
- **M1 / Phase 1** — deploy wallet (constructor: deployer = signer[0],
  required=1), register it, view on-chain config (signers/threshold/nonce/
  balance). ✅
- **M2 / Phase 2** — sum-type `operationCodec` (verified against the golden
  vectors), index operations, queue new operations, approve. ✅
- **M3 / Phase 3** — execute (client-side, strict-order) + the DB indexer that
  marks executed/skipped and advances the nonce. ✅
- **M4 / Phase 4** — reject (terminal, executes as a skip) + config ops
  (add/remove signer, change threshold) surfaced in the propose flow. ✅
- **Phase 5 (not built)** — relay signatures (blocked on
  `create_signature_hash`), `*WithSignature` entrypoints, EIP-1271
  contract-signer support, batching.

### What this pass covers (M1–M4)

Only the **fully on-chain, direct-signer** entrypoints — `queue`, `approve`,
`reject`, `execute` — sent straight from the connected signer. The relay
(`*WithSignature`) and `batch` entrypoints are intentionally left for Phase 5.

- **Deploy** is done **directly from the EOA** (not via
  `contracts/src/WalletFactory`): the contract's constructor sets `signers[0] =
  caller()` / `signers_required = 1`, so the deployer is the first signer. The
  factory's CREATE2 deploy would instead make the factory the first signer, and
  its `initialize`/`getOwner` calls aren't part of the multisig ABI. Set
  `VITE_WALLET_CREATION_CODE` (from `contracts/` → `make wallet`) to enable it.
- **The contract has no getters or events**, so the DB is a write-through
  **index** of chain state: the web sends each `queue`/`approve`/`reject`/
  `execute` tx and reports it to the API, which folds the operation log the same
  way the contract's state machine does to derive owners / threshold / nonce /
  status (`apps/api/src/indexer.ts`). It is rebuildable via `POST …/sync`.
