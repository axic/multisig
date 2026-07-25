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
pnpm install
cp .env.example .env            # set DATABASE_URL + RPC_URL_11155111
pnpm db:generate                # prisma client
pnpm db:push                    # apply schema to Neon
pnpm --filter @multisig/api dev # api on :8787
pnpm --filter @multisig/web dev # web on :5173
```

Root tasks (Turbo): `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Phased plan

- **Phase 0 (this scaffold)** — monorepo, DB schema, `packages/core` model +
  outer-ABI encoders + golden vectors, API skeleton (wallet register/list/get),
  web shell with wallet connect. ✅
- **Phase 1** — deploy wallet (constructor: deployer = signer[0], required=1),
  register it, read-through on-chain config (signers/required/nonce/balance).
- **Phase 2** — implement the sum-type `operationCodec`, index operations from
  chain, queue new operations.
- **Phase 3** — execute flow incl. `UnstoredCall` preimage lookup/assembly;
  indexer/cron to mark executed & advance nonce.
- **Phase 4** — reject sibling flow + config ops (add/remove signer, change
  threshold) surfaced in Settings.
- **Phase 5** — relay signatures (blocked on `create_signature_hash`), EIP-1271
  contract-signer support, multi-chain, batching.
