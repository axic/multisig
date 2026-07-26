import type { PrismaClient } from "@multisig/db";

/**
 * The DB is an INDEX/CACHE of on-chain multisig state, not the source of truth
 * (see the monorepo README). The contract exposes no getters and emits no
 * events, so we reconstruct wallet config by replaying the operation log the
 * same way the contract's state machine does:
 *
 *   - genesis: signer[0] = deployer, signers_required = 1, nonce = 0
 *   - queue(op)         -> append operation, status Approvals(0)
 *   - approve(nonce)    -> Approvals(count+1)
 *   - reject(nonce)     -> Rejected
 *   - execute(nonce)    -> strict order; Rejected skips, approved applies the
 *                          config effect (add/remove signer, change threshold),
 *                          both advance nonce
 *
 * The web reports each confirmed transaction to the API (write-through), and
 * `recomputeWallet` re-derives the cached scalar fields from the operation rows
 * so the cache stays consistent and is rebuildable.
 */

/** Effect an EXECUTED operation has on the signer set / threshold. */
export interface DecodedOp {
  signer?: string;
  count?: string; // decimal string (threshold / uint256 fields are stringified)
}

/**
 * Recompute a wallet's cached scalar fields (nonce, signersRequired,
 * signersCount) from its indexed operations and current signer rows.
 *
 * `nonce` is the length of the finalized (Executed|Rejected) prefix — execution
 * is strictly sequential, so it is exactly how many operations the contract has
 * consumed. `approvals` on each operation is refreshed from its Approved votes.
 */
export async function recomputeWallet(db: PrismaClient, walletId: string): Promise<void> {
  const [operations, signersCount] = await Promise.all([
    db.operation.findMany({
      where: { walletId },
      orderBy: { index: "asc" },
      include: { votes: true },
    }),
    db.signer.count({ where: { walletId } }),
  ]);

  let nonce = 0;
  for (const op of operations) {
    if (op.index !== nonce) break; // gap — stop counting the finalized prefix
    if (op.status === "Executed" || op.status === "Rejected") nonce += 1;
    else break;
  }

  await db.$transaction([
    ...operations.map((op) =>
      db.operation.update({
        where: { id: op.id },
        data: { approvals: op.votes.filter((v) => v.vote === "Approved").length },
      }),
    ),
    db.wallet.update({ where: { id: walletId }, data: { nonce, signersCount } }),
  ]);
}

/**
 * Apply the config effect of a just-executed operation to the cached signer set
 * / threshold. Transfers and calls have no config effect. Mirrors the contract's
 * `add_signer` / `remove_signer` / `ChangeSigRequired` execute branches.
 */
export async function applyExecuteEffect(
  db: PrismaClient,
  walletId: string,
  kind: string,
  decoded: DecodedOp,
): Promise<void> {
  if (kind === "AddSigner" && decoded.signer) {
    const exists = await db.signer.findUnique({
      where: { walletId_address: { walletId, address: decoded.signer } },
    });
    if (!exists) {
      const count = await db.signer.count({ where: { walletId } });
      await db.signer.create({
        data: { walletId, address: decoded.signer, index: count },
      });
    }
  } else if (kind === "RemoveSigner" && decoded.signer) {
    await db.signer
      .delete({ where: { walletId_address: { walletId, address: decoded.signer } } })
      .catch(() => undefined); // idempotent: already gone
    // Lower the threshold if it now exceeds the signer count (contract does this).
    const [count, wallet] = await Promise.all([
      db.signer.count({ where: { walletId } }),
      db.wallet.findUnique({ where: { id: walletId } }),
    ]);
    if (wallet && wallet.signersRequired > count) {
      await db.wallet.update({ where: { id: walletId }, data: { signersRequired: count } });
    }
  } else if (kind === "ChangeSigRequired" && decoded.count !== undefined) {
    await db.wallet.update({
      where: { id: walletId },
      data: { signersRequired: Number(decoded.count) },
    });
  }
}
