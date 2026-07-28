/-
  Wallet.solc (the `Multisig` contract) — quorum soundness specification
  ======================================================================

  A Lean 4 model of the multisig's operation lifecycle, and a machine-checked
  proof of the soundness property requested:

      A queued operation can be marked `Executed` only after it has reached
      quorum — i.e. its accumulated approval count meets the required
      threshold (`signers_required`).

  ---------------------------------------------------------------------------
  What is modelled, and how faithfully
  ---------------------------------------------------------------------------
  Source: `contracts/solcore/src/Wallet.solc` on the `wallet` branch — the
  `contract Multisig`. Its operation state machine (from the file's own header):

      - `queue`    : status becomes `Approvals(0)`               (0 approvals)
      - `approve`  : `Approvals(i) → Approvals(i+1)`, once per signer
      - `reject`   : `Approvals(i) → Rejected`
      - `execute`  : `Approvals(i) → Executed`  iff  i ≥ signers_required
                     `Rejected     → (skipped)`, advancing the nonce
      Operations execute in strict nonce order; execute is permissionless
      (anyone may call it — the gate is the approval count, not the caller).

  This spec captures exactly that lifecycle: per-operation `phase`
  (`Absent/Pending/Rejected/Executed`, where `Pending` carries the running
  `approvals` count, mirroring `Approvals(count)`), the per-signer `voted` map
  (so a signer's approval is counted at most once), the strict-ordering
  `nonce`, and the quorum gate in `execute`.

  Deliberate abstractions (none affect the execution gate):
   * The operation *payload* (transfers / calls / signer-set edits) is dropped;
     soundness of "executed ⇒ had quorum" does not depend on what an op does.
   * `signers_required` is MUTABLE in the contract (an executed
     `ChangeSigRequired`, or `remove_signer`, can lower/raise it). We model this
     conservatively with a `setThreshold` transition that may change the
     threshold to any value ≥ 1 at any time — a strict over-approximation of
     the real triggers, which only makes the invariant harder to maintain. The
     signer *set* itself is held fixed (it gates who may `approve`, not the
     quorum arithmetic).

  Because the threshold is mutable, the honest soundness statement is about the
  quorum *in force at the moment of execution*. We record that witness with a
  ghost field `execReq` (set only by `execute`), and prove every executed op
  satisfies `execReq ≤ approvals` (and `1 ≤ execReq`, so at least one approval).
  This is stable under later threshold changes — see the note at the very end.
-/

namespace WalletSpec

/-- Abstract account address. Only equality matters here. -/
abbrev Addr : Type := Nat

/-- Operation identifier / queue index (the on-chain nonce key). -/
abbrev OpId : Type := Nat

/-- Lifecycle phase of an operation slot. `Absent` = "not queued". `Pending`
    corresponds to `OperationStatus.Approvals(count)` with the count carried in
    `OpInfo.approvals`; `Rejected`/`Executed` are the terminal states. -/
inductive Phase where
  | Absent
  | Pending
  | Rejected
  | Executed
  deriving DecidableEq, Repr

/-- Per-signer vote (mirrors `data Vote = None | Approved | Rejected`). -/
inductive Vote where
  | None
  | Approved
  | Rejected
  deriving DecidableEq, Repr

/-- Per-operation state.

    * `phase`     — `Absent / Pending / Rejected / Executed`.
    * `approvals` — running approval count while `Pending`; frozen at execution.
    * `voted`     — which signers have voted, so each approval counts once.
    * `execReq`   — GHOST: the `signersRequired` in force when this op executed
                    (`0` until it executes). Records the quorum that gated it. -/
structure OpInfo where
  phase     : Phase
  approvals : Nat
  voted     : Addr → Vote
  execReq   : Nat

/-- Multisig state. `signersRequired` is the quorum threshold (mutable, see
    header). `nonce` is the next executable index (strict ordering). -/
structure State where
  isSigner        : Addr → Bool
  signersRequired : Nat
  opsCount        : OpId
  op              : OpId → OpInfo
  nonce           : OpId

/-- Point-update one operation slot. -/
def State.setOp (s : State) (k : OpId) (o : OpInfo) : State :=
  { s with op := fun j => if j = k then o else s.op j }

@[simp] theorem State.setOp_same (s : State) (k : OpId) (o : OpInfo) :
    (s.setOp k o).op k = o := by simp [State.setOp]

theorem State.setOp_other (s : State) (k j : OpId) (o : OpInfo) (h : j ≠ k) :
    (s.setOp k o).op j = s.op j := by simp [State.setOp, h]

-- Projections of scalar-field updates leave the op-map / threshold untouched.
@[simp] theorem op_upd_opsCount (s : State) (n : OpId) : ({ s with opsCount := n }).op = s.op := rfl
@[simp] theorem op_upd_nonce (s : State) (n : OpId) : ({ s with nonce := n }).op = s.op := rfl

/- ------------------------------------------------------------------------ -/
/-  Transitions.  Each returns `Option State`: `none` models a revert.       -/
/- ------------------------------------------------------------------------ -/

/-- `queue`: a signer proposes a fresh op. It starts at `Approvals(0)` —
    `Pending` with zero approvals (the contract does NOT auto-approve). -/
def queue (s : State) (caller : Addr) : Option State :=
  if s.isSigner caller = true then
    some { (s.setOp s.opsCount
              { phase := Phase.Pending, approvals := 0, voted := fun _ => Vote.None, execReq := 0 })
           with opsCount := s.opsCount + 1 }
  else none

/-- `approve`: a signer who has not voted approves a pending op, `Approvals(i) →
    Approvals(i+1)`, recording the vote so it cannot be counted twice. -/
def approve (s : State) (caller : Addr) (i : OpId) : Option State :=
  if s.isSigner caller = true ∧ i < s.opsCount ∧ (s.op i).phase = Phase.Pending
       ∧ (s.op i).voted caller = Vote.None then
    some (s.setOp i
      { (s.op i) with
        approvals := (s.op i).approvals + 1
        voted     := fun a => if a = caller then Vote.Approved else (s.op i).voted a })
  else none

/-- `reject`: a signer moves a pending op to the terminal `Rejected` state. -/
def reject (s : State) (caller : Addr) (i : OpId) : Option State :=
  if s.isSigner caller = true ∧ i < s.opsCount ∧ (s.op i).phase = Phase.Pending then
    some (s.setOp i
      { (s.op i) with
        phase := Phase.Rejected
        voted := fun a => if a = caller then Vote.Rejected else (s.op i).voted a })
  else none

/-- `execute` (permissionless): only the op at the current `nonce` may run.
    A `Rejected` op is skipped (nonce advances, no execution). A `Pending` op
    executes iff `signersRequired ≤ approvals` — THE quorum gate — and records
    `execReq := signersRequired` as the witness of the quorum then in force. -/
def execute (s : State) (i : OpId) : Option State :=
  if i < s.opsCount ∧ i = s.nonce then
    if (s.op i).phase = Phase.Rejected then
      some { s with nonce := s.nonce + 1 }
    else if (s.op i).phase = Phase.Pending ∧ s.signersRequired ≤ (s.op i).approvals then
      some { (s.setOp i { (s.op i) with phase := Phase.Executed, execReq := s.signersRequired })
             with nonce := s.nonce + 1 }
    else none
  else none

/-- `setThreshold`: conservative over-approximation of `ChangeSigRequired` /
    `remove_signer` — set the quorum to any value ≥ 1 at any time. -/
def setThreshold (s : State) (t : Nat) : Option State :=
  if 1 ≤ t then some { s with signersRequired := t } else none

/- ------------------------------------------------------------------------ -/
/-  Headline: the execute transition can only mark `Executed` at quorum.     -/
/- ------------------------------------------------------------------------ -/

/-- Transition-level soundness. If a step of `execute` newly marks op `i`
    `Executed`, then just before that step it was `Pending` with its approval
    count meeting the threshold. -/
theorem execute_executes_only_at_quorum
    {s s' : State} {i : OpId}
    (h : execute s i = some s') (hnew : (s'.op i).phase = Phase.Executed) :
    (s.op i).phase = Phase.Pending ∧ s.signersRequired ≤ (s.op i).approvals := by
  unfold execute at h
  by_cases h1 : i < s.opsCount ∧ i = s.nonce
  · rw [if_pos h1] at h
    by_cases h2 : (s.op i).phase = Phase.Rejected
    · rw [if_pos h2] at h; injection h with h; subst h
      -- op `i` is unchanged by a skip, so `hnew` says it is Executed, but it is Rejected
      have hp : (s.op i).phase = Phase.Executed := hnew
      rw [h2] at hp; exact absurd hp (by decide)
    · rw [if_neg h2] at h
      by_cases h3 : (s.op i).phase = Phase.Pending ∧ s.signersRequired ≤ (s.op i).approvals
      · exact h3
      · rw [if_neg h3] at h; simp at h
  · rw [if_neg h1] at h; simp at h

/-- Dually, strictly below quorum a `Pending` op cannot be executed. -/
theorem execute_blocked_below_quorum
    {s : State} {i : OpId}
    (hp : (s.op i).phase = Phase.Pending) (hlt : (s.op i).approvals < s.signersRequired) :
    execute s i = none := by
  unfold execute
  by_cases h1 : i < s.opsCount ∧ i = s.nonce
  · rw [if_pos h1]
    have h2 : ¬ (s.op i).phase = Phase.Rejected := by rw [hp]; decide
    rw [if_neg h2]
    have h3 : ¬ ((s.op i).phase = Phase.Pending ∧ s.signersRequired ≤ (s.op i).approvals) := by
      rintro ⟨_, hle⟩; exact absurd hle (Nat.not_le.mpr hlt)
    rw [if_neg h3]
  · rw [if_neg h1]

/-- Strict ordering: only the op at the current `nonce` can be executed. -/
theorem execute_requires_turn {s s' : State} {i : OpId}
    (h : execute s i = some s') : i = s.nonce ∧ i < s.opsCount := by
  unfold execute at h
  by_cases h1 : i < s.opsCount ∧ i = s.nonce
  · exact ⟨h1.2, h1.1⟩
  · rw [if_neg h1] at h; simp at h

/-- A `Rejected` op is skipped, never executed: its slot is left untouched. -/
theorem execute_rejected_is_skip {s s' : State} {i : OpId}
    (hr : (s.op i).phase = Phase.Rejected) (h : execute s i = some s') :
    s'.op i = s.op i := by
  unfold execute at h
  by_cases h1 : i < s.opsCount ∧ i = s.nonce
  · rw [if_pos h1, if_pos hr] at h; injection h with h; subst h; rfl
  · rw [if_neg h1] at h; simp at h

/- ------------------------------------------------------------------------ -/
/-  The state invariant and its preservation by every transition.           -/
/- ------------------------------------------------------------------------ -/

/-- Soundness invariant: the threshold is always positive, and every `Executed`
    op reached quorum — it had at least one approval and met the threshold in
    force at its execution (`execReq`, frozen at execute time). -/
def Inv (s : State) : Prop :=
  (1 ≤ s.signersRequired) ∧
  (∀ i, (s.op i).phase = Phase.Executed → 1 ≤ (s.op i).execReq ∧ (s.op i).execReq ≤ (s.op i).approvals)

theorem queue_preserves {s s' : State} {c : Addr}
    (hI : Inv s) (h : queue s c = some s') : Inv s' := by
  unfold queue at h
  by_cases hg : s.isSigner c = true
  · rw [if_pos hg] at h; injection h with h; subst h
    refine ⟨hI.1, ?_⟩
    intro j hj
    by_cases hjk : j = s.opsCount
    · subst hjk
      rw [op_upd_opsCount, State.setOp_same] at hj
      exact absurd hj (by decide)                 -- fresh op is `Pending`, not `Executed`
    · rw [op_upd_opsCount, State.setOp_other _ _ _ _ hjk] at hj ⊢
      exact hI.2 j hj
  · rw [if_neg hg] at h; simp at h

theorem approve_preserves {s s' : State} {c : Addr} {i : OpId}
    (hI : Inv s) (h : approve s c i = some s') : Inv s' := by
  unfold approve at h
  by_cases hg : s.isSigner c = true ∧ i < s.opsCount ∧ (s.op i).phase = Phase.Pending
       ∧ (s.op i).voted c = Vote.None
  · rw [if_pos hg] at h; injection h with h; subst h
    refine ⟨hI.1, ?_⟩
    intro j hj
    by_cases hji : j = i
    · subst hji
      rw [State.setOp_same] at hj
      -- the updated op keeps its old phase, which was `Pending` (hg.2.2.1)
      have hp : (s.op i).phase = Phase.Executed := hj
      rw [hg.2.2.1] at hp; exact absurd hp (by decide)
    · rw [State.setOp_other _ _ _ _ hji] at hj ⊢
      exact hI.2 j hj
  · rw [if_neg hg] at h; simp at h

theorem reject_preserves {s s' : State} {c : Addr} {i : OpId}
    (hI : Inv s) (h : reject s c i = some s') : Inv s' := by
  unfold reject at h
  by_cases hg : s.isSigner c = true ∧ i < s.opsCount ∧ (s.op i).phase = Phase.Pending
  · rw [if_pos hg] at h; injection h with h; subst h
    refine ⟨hI.1, ?_⟩
    intro j hj
    by_cases hji : j = i
    · subst hji
      rw [State.setOp_same] at hj
      have hp : (Phase.Rejected) = Phase.Executed := hj    -- updated op is `Rejected`
      exact absurd hp (by decide)
    · rw [State.setOp_other _ _ _ _ hji] at hj ⊢
      exact hI.2 j hj
  · rw [if_neg hg] at h; simp at h

theorem execute_preserves {s s' : State} {i : OpId}
    (hI : Inv s) (h : execute s i = some s') : Inv s' := by
  unfold execute at h
  by_cases h1 : i < s.opsCount ∧ i = s.nonce
  · rw [if_pos h1] at h
    by_cases h2 : (s.op i).phase = Phase.Rejected
    · rw [if_pos h2] at h; injection h with h; subst h
      -- a skip changes only `nonce`; `Inv` mentions neither `nonce`
      exact ⟨hI.1, fun j hj => hI.2 j hj⟩
    · rw [if_neg h2] at h
      by_cases h3 : (s.op i).phase = Phase.Pending ∧ s.signersRequired ≤ (s.op i).approvals
      · rw [if_pos h3] at h; injection h with h; subst h
        refine ⟨hI.1, ?_⟩
        intro j hj
        by_cases hji : j = i
        · subst hji
          -- the executed op records `execReq = signersRequired`; the guard gives quorum
          rw [op_upd_nonce, State.setOp_same]
          exact ⟨hI.1, h3.2⟩
        · rw [op_upd_nonce, State.setOp_other _ _ _ _ hji] at hj ⊢
          exact hI.2 j hj
      · rw [if_neg h3] at h; simp at h
  · rw [if_neg h1] at h; simp at h

theorem setThreshold_preserves {s s' : State} {t : Nat}
    (hI : Inv s) (h : setThreshold s t = some s') : Inv s' := by
  unfold setThreshold at h
  by_cases hg : 1 ≤ t
  · rw [if_pos hg] at h; injection h with h; subst h
    -- only `signersRequired` changes (to `t ≥ 1`); the op-map is untouched
    exact ⟨hg, fun j hj => hI.2 j hj⟩
  · rw [if_neg hg] at h; simp at h

/- ------------------------------------------------------------------------ -/
/-  Reachability and the main soundness theorem.                            -/
/- ------------------------------------------------------------------------ -/

/-- One step of the multisig is any successful transition. -/
inductive Step : State → State → Prop where
  | queue        {s s' c}   : queue s c = some s'        → Step s s'
  | approve      {s s' c i} : approve s c i = some s'    → Step s s'
  | reject       {s s' c i} : reject s c i = some s'     → Step s s'
  | execute      {s s' i}   : execute s i = some s'      → Step s s'
  | setThreshold {s s' t}   : setThreshold s t = some s' → Step s s'

/-- Reachability from an initial state `s0`. -/
inductive Reachable (s0 : State) : State → Prop where
  | refl : Reachable s0 s0
  | step {s s'} : Reachable s0 s → Step s s' → Reachable s0 s'

/-- Every transition preserves the invariant. -/
theorem Step.preserves {s s' : State} (hI : Inv s) (hs : Step s s') : Inv s' := by
  cases hs with
  | queue h        => exact queue_preserves hI h
  | approve h      => exact approve_preserves hI h
  | reject h       => exact reject_preserves hI h
  | execute h      => exact execute_preserves hI h
  | setThreshold h => exact setThreshold_preserves hI h

/-- Initial condition of a freshly deployed multisig: threshold ≥ 1 and an empty
    queue (`initialize` sets `signers_required = 1`, `operations_count = 0`). -/
def Init (s : State) : Prop :=
  (1 ≤ s.signersRequired) ∧ (∀ i, (s.op i).phase = Phase.Absent)

theorem Inv.of_init {s : State} (h : Init s) : Inv s := by
  refine ⟨h.1, ?_⟩
  intro i hj
  rw [h.2 i] at hj
  exact absurd hj (by decide)

/-- **Soundness.** From any freshly initialised multisig, every reachable state
    satisfies the invariant: no operation is ever `Executed` without having
    reached quorum. -/
theorem soundness {s0 s : State}
    (hinit : Init s0) (hreach : Reachable s0 s) : Inv s := by
  induction hreach with
  | refl => exact Inv.of_init hinit
  | step _ hstep ih => exact hstep.preserves ih

/-- Corollary in the requested form: in any reachable state, an `Executed`
    operation had quorum — at least one approval, meeting the threshold in force
    at its execution. -/
theorem executed_implies_quorum {s0 s : State} {i : OpId}
    (hinit : Init s0) (hreach : Reachable s0 s)
    (hx : (s.op i).phase = Phase.Executed) :
    1 ≤ (s.op i).execReq ∧ (s.op i).execReq ≤ (s.op i).approvals :=
  (soundness hinit hreach).2 i hx

/- ------------------------------------------------------------------------ -/
/-  A concrete fresh multisig, exhibiting the initial condition.            -/
/- ------------------------------------------------------------------------ -/

/-- A freshly initialised single-owner multisig (`signers_required = 1`). -/
def freshMultisig (owner : Addr) : State :=
  { isSigner        := fun a => decide (a = owner)
    signersRequired := 1
    opsCount        := 0
    op              := fun _ => { phase := Phase.Absent, approvals := 0, voted := fun _ => Vote.None, execReq := 0 }
    nonce           := 0 }

theorem freshMultisig_init (owner : Addr) : Init (freshMultisig owner) :=
  ⟨Nat.le_refl 1, fun _ => rfl⟩

/-- Soundness specialised to a freshly deployed multisig. -/
theorem freshMultisig_soundness {owner : Addr} {s : State}
    (hreach : Reachable (freshMultisig owner) s) : Inv s :=
  soundness (freshMultisig_init owner) hreach

/-
  ---------------------------------------------------------------------------
  Why `execReq` (and not the live `signersRequired`)
  ---------------------------------------------------------------------------
  `signers_required` is mutable on-chain (an executed `ChangeSigRequired`, or
  `remove_signer` lowering it). So `status = Executed → signersRequired ≤ approvals`
  against the LIVE threshold is NOT an invariant: raise the threshold after an op
  executed and it would be falsified, even though the op executed validly at the
  time.

  The invariant above instead compares against `execReq`, the threshold captured
  at execution — a specification ghost, not extra contract storage. That makes
  the statement exactly "every executed op met the quorum that applied to it,"
  which is both true and stable under all later threshold changes. The
  transition-level `execute_executes_only_at_quorum` additionally pins the gate
  to the LIVE threshold at the instant of execution.
-/

end WalletSpec
