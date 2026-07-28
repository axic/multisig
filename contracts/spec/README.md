# Wallet (`Multisig`) quorum-soundness spec (Lean 4)

A machine-checked model of the multisig's operation lifecycle, proving:

> A queued operation can be marked `Executed` only after it has reached quorum —
> its accumulated approval count meets the required threshold
> (`signers_required`).

The spec is in [`WalletSpec/Basic.lean`](./WalletSpec/Basic.lean). It has **no
Mathlib dependency** — only the Lean 4 core library — so it builds with a bare
toolchain.

## Source

`contracts/solcore/src/Wallet.solc` on the `wallet` branch — `contract Multisig`.
Its lifecycle, from the file's own header:

```
queue    : status → Approvals(0)                       (0 approvals)
approve  : Approvals(i) → Approvals(i+1)               (once per signer)
reject   : Approvals(i) → Rejected
execute  : Approvals(i) → Executed   iff  i ≥ signers_required
           Rejected     → skipped, advancing the nonce
```

Operations execute in strict `nonce` order; `execute` is permissionless (the
gate is the approval count, not the caller).

## The model

| Concept | On-chain | In the spec |
| ------- | -------- | ----------- |
| status  | `Approvals(count) \| Rejected \| Executed` | `phase : Absent/Pending/Rejected/Executed` + `approvals : Nat` |
| per-signer vote | `votes[nonce][signer] : Vote` | `voted : Addr → Vote` |
| threshold | `signers_required` (mutable) | `signersRequired : Nat`, changed via `setThreshold` |
| ordering | `nonce` | `nonce : OpId`, `execute` requires `i = nonce` |

Transitions return `Option State` (`none` = revert): `queue`, `approve`,
`reject`, `execute`, `setThreshold`.

**Abstractions** (none touch the execution gate): the operation *payload* is
dropped; the mutable threshold is modelled by a conservative `setThreshold`
(any value ≥ 1, at any time — a superset of the real `ChangeSigRequired` /
`remove_signer` triggers); the signer *set* is held fixed.

**Ghost witness.** Because `signers_required` is mutable, "executed ⇒ quorum"
must be stated against the threshold *in force at execution*. `OpInfo.execReq`
(set only by `execute`) records it — a specification ghost, not extra storage.

## The theorems

- `execute_executes_only_at_quorum` — if a step of `execute` newly marks op `i`
  `Executed`, then just before it was `Pending` with `signersRequired ≤ approvals`
  (the live gate).
- `execute_blocked_below_quorum` — a `Pending` op with `approvals < threshold`
  cannot be executed.
- `execute_requires_turn` / `execute_rejected_is_skip` — strict-order and
  reject-skip behaviour.
- `Inv` = "threshold ≥ 1, and every `Executed` op has `1 ≤ execReq ≤ approvals`",
  proved preserved by **every** transition (`*_preserves`).
- `soundness` — from any freshly initialised multisig, **every reachable state**
  satisfies `Inv`.
- `executed_implies_quorum` — the headline corollary: reachable + `Executed`
  ⇒ the op met the quorum in force at its execution (and had ≥ 1 approval).

## Building

```sh
cd contracts/spec
lake build            # requires the Lean toolchain pinned in ./lean-toolchain
```

A successful `lake build` = all proofs check.

> Note: this was authored without a local Lean toolchain to run `lake build`
> against, so treat a first compile as the verification step. The model is
> written in a proof-friendly style (single-`if` transitions, no Mathlib) to
> minimise the chance of breakage.
