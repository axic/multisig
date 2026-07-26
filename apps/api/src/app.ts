import { OPERATION_TAGS, type OperationTag } from "@multisig/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAddress, isAddress, isHex, type Hex } from "viem";
import { z } from "zod";
import { readBalance } from "./chain.js";

/**
 * API for the on-chain Multisig. The contract has no getters, so this is a
 * write-through INDEX: the web app performs each queue/approve/reject/execute
 * on-chain and then POSTs the result here, and the API mirrors the resulting
 * state (seeded at deploy: signer[0] = creator, required = 1, nonce = 0). The
 * one thing read from chain is the balance (/sync).
 */
export const app = new Hono();

const loadDb = async () => (await import("@multisig/db")).getDb();

app.onError((err, c) => c.json({ error: { name: err.name, message: err.message } }, 500));

// CORS allowlist. The production frontends + local dev are allowed by default;
// add more origins via CORS_ORIGINS (comma-separated). Set
// CORS_ALLOW_VERCEL_PREVIEWS=true to also allow this project's rotating Vercel
// preview URLs (https://multisig-<hash>.vercel.app).
const DEFAULT_ORIGINS = [
  "https://multisig-gold.vercel.app",
  "http://localhost:5173",
  "https://coram.finance",
  "https://www.coram.finance",
];
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ORIGINS,
  ...(process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);
const ALLOW_VERCEL_PREVIEWS = process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true";
const VERCEL_PREVIEW_RE = /^https:\/\/multisig-[a-z0-9-]+\.vercel\.app$/;

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (ALLOWED_ORIGINS.has(origin)) return origin;
      if (ALLOW_VERCEL_PREVIEWS && VERCEL_PREVIEW_RE.test(origin)) return origin;
      return null;
    },
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

// --- helpers ---------------------------------------------------------------

const addr = z.string().refine(isAddress, "invalid address");
const hex = z.string().refine((s): s is Hex => isHex(s), "invalid hex");
const wei = z.string().regex(/^\d+$/, "expected a wei decimal string");
const KINDS = OPERATION_TAGS as readonly [OperationTag, ...OperationTag[]];

const walletInclude = {
  signers: { orderBy: { index: "asc" } },
} as const;

// --- wallets ---------------------------------------------------------------

const registerSchema = z.object({
  chainId: z.number().int().positive(),
  address: addr,
  deployer: addr, // becomes signer[0]
  deployTxHash: z.string().optional(),
  label: z.string().max(100).optional(),
});

// Register a deployed Multisig and seed its signer[0]/required/nonce.
app.post("/v1/wallets", async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { chainId, address, deployer, deployTxHash, label } = parsed.data;

  const db = await loadDb();
  const cAddr = getAddress(address);
  const wallet = await db.wallet.upsert({
    where: { chainId_address: { chainId, address: cAddr } },
    create: {
      chainId,
      address: cAddr,
      deployTxHash,
      label,
      signersCount: 1,
      signersRequired: 1,
      signers: { create: [{ address: getAddress(deployer), index: 0 }] },
    },
    update: { deployTxHash, label },
    include: walletInclude,
  });
  return c.json(wallet, 201);
});

app.get("/v1/wallets", async (c) => {
  const db = await loadDb();
  const wallets = await db.wallet.findMany({
    orderBy: { createdAt: "desc" },
    include: { signers: true, _count: { select: { operations: true } } },
  });
  return c.json(wallets);
});

async function findWallet(c: import("hono").Context) {
  const chainId = Number(c.req.param("chainId"));
  const address = c.req.param("address");
  if (!address || !Number.isInteger(chainId) || !isAddress(address)) return null;
  const db = await loadDb();
  return db.wallet.findUnique({
    where: { chainId_address: { chainId, address: getAddress(address) } },
    include: walletInclude,
  });
}

app.get("/v1/wallets/:chainId/:address", async (c) => {
  const wallet = await findWallet(c);
  if (!wallet) return c.json({ error: "not found" }, 404);
  return c.json(wallet);
});

app.post("/v1/wallets/:chainId/:address/sync", async (c) => {
  const wallet = await findWallet(c);
  if (!wallet) return c.json({ error: "not found" }, 404);
  const balanceWei = await readBalance(wallet.chainId, getAddress(wallet.address));
  const db = await loadDb();
  const updated = await db.wallet.update({
    where: { id: wallet.id },
    data: { balanceWei },
    include: walletInclude,
  });
  return c.json(updated);
});

// --- operations ------------------------------------------------------------

app.get("/v1/wallets/:chainId/:address/operations", async (c) => {
  const wallet = await findWallet(c);
  if (!wallet) return c.json({ error: "not found" }, 404);
  const db = await loadDb();
  const operations = await db.operation.findMany({
    where: { walletId: wallet.id },
    orderBy: { index: "asc" },
    include: { votes: true },
  });
  return c.json({ nonce: wallet.nonce, signersRequired: wallet.signersRequired, operations });
});

// Record a queued operation (the web app already sent queue() on-chain).
const recordQueueSchema = z.object({
  kind: z.enum(KINDS),
  decoded: z.record(z.string(), z.any()),
  txHash: z.string().optional(),
  proposer: addr.optional(),
  preimage: z
    .object({ hash: hex, target: addr, value: wei, payload: hex })
    .optional(),
});

app.post("/v1/wallets/:chainId/:address/operations", async (c) => {
  const wallet = await findWallet(c);
  if (!wallet) return c.json({ error: "not found" }, 404);
  const parsed = recordQueueSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { kind, decoded, txHash, proposer, preimage } = parsed.data;

  const db = await loadDb();
  const result = await db.$transaction(async (tx) => {
    const w = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const index = w.operationsCount;
    const operation = await tx.operation.create({
      data: {
        walletId: w.id,
        index,
        kind,
        decoded,
        status: "Approvals",
        approvals: 0,
        proposer: proposer ? getAddress(proposer) : undefined,
        createdTxHash: txHash,
      },
      include: { votes: true },
    });
    if (preimage) {
      await tx.unstoredCallPreimage.upsert({
        where: { walletId_hash: { walletId: w.id, hash: preimage.hash } },
        create: {
          walletId: w.id,
          hash: preimage.hash,
          target: getAddress(preimage.target),
          value: preimage.value,
          payload: preimage.payload,
          createdBy: proposer ? getAddress(proposer) : undefined,
        },
        update: {},
      });
    }
    await tx.wallet.update({ where: { id: w.id }, data: { operationsCount: { increment: 1 } } });
    return operation;
  });
  return c.json(result, 201);
});

async function loadOperation(id: string) {
  const db = await loadDb();
  return db.operation.findUnique({ where: { id }, include: { wallet: { include: { signers: true } }, votes: true } });
}

const signerVoteSchema = z.object({ signer: addr, txHash: z.string().optional() });

// Record an approval (signer already called approve() on-chain).
app.post("/v1/operations/:id/approve", async (c) => {
  const parsed = signerVoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const op = await loadOperation(c.req.param("id"));
  if (!op) return c.json({ error: "operation not found" }, 404);
  if (op.status !== "Approvals") return c.json({ error: `operation is ${op.status}` }, 409);

  const signer = getAddress(parsed.data.signer);
  if (!op.wallet.signers.some((s) => getAddress(s.address) === signer)) {
    return c.json({ error: "not a signer" }, 403);
  }
  if (op.votes.some((v) => getAddress(v.signer) === signer && v.vote !== "None")) {
    return c.json({ error: "signer already voted" }, 409);
  }

  const db = await loadDb();
  const updated = await db.$transaction(async (tx) => {
    await tx.vote.upsert({
      where: { operationId_signer: { operationId: op.id, signer } },
      create: { operationId: op.id, signer, vote: "Approved" },
      update: { vote: "Approved" },
    });
    return tx.operation.update({
      where: { id: op.id },
      data: { approvals: { increment: 1 } },
      include: { votes: true },
    });
  });
  return c.json(updated);
});

// Record a rejection (signer already called reject() on-chain).
app.post("/v1/operations/:id/reject", async (c) => {
  const parsed = signerVoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const op = await loadOperation(c.req.param("id"));
  if (!op) return c.json({ error: "operation not found" }, 404);
  if (op.status !== "Approvals") return c.json({ error: `operation is ${op.status}` }, 409);

  const signer = getAddress(parsed.data.signer);
  if (!op.wallet.signers.some((s) => getAddress(s.address) === signer)) {
    return c.json({ error: "not a signer" }, 403);
  }

  const db = await loadDb();
  const updated = await db.$transaction(async (tx) => {
    await tx.vote.upsert({
      where: { operationId_signer: { operationId: op.id, signer } },
      create: { operationId: op.id, signer, vote: "Rejected" },
      update: { vote: "Rejected" },
    });
    return tx.operation.update({ where: { id: op.id }, data: { status: "Rejected" }, include: { votes: true } });
  });
  return c.json(updated);
});

// Record an execution (anyone already called execute() on-chain). Advances the
// nonce and applies config effects (add/remove signer, change threshold).
app.post("/v1/operations/:id/execute", async (c) => {
  const body = z.object({ txHash: z.string().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const op = await loadOperation(c.req.param("id"));
  if (!op) return c.json({ error: "operation not found" }, 404);
  const wallet = op.wallet;

  if (op.index !== wallet.nonce) {
    return c.json({ error: `not the next executable op (nonce ${wallet.nonce}, op index ${op.index})` }, 409);
  }
  const wasRejected = op.status === "Rejected";
  if (!wasRejected && op.status !== "Approvals") {
    return c.json({ error: `operation is ${op.status}` }, 409);
  }
  if (!wasRejected && op.approvals < wallet.signersRequired) {
    return c.json({ error: `not enough approvals (${op.approvals}/${wallet.signersRequired})` }, 409);
  }

  const decoded = (op.decoded ?? {}) as Record<string, unknown>;
  const db = await loadDb();
  const result = await db.$transaction(async (tx) => {
    if (!wasRejected) {
      await tx.operation.update({
        where: { id: op.id },
        data: { status: "Executed", executedTxHash: body.data.txHash, executedAt: new Date() },
      });
      // Apply config effects to the cached signer set.
      if (op.kind === "AddSigner" && typeof decoded.signer === "string") {
        const a = getAddress(decoded.signer);
        const exists = await tx.signer.findUnique({ where: { walletId_address: { walletId: wallet.id, address: a } } });
        if (!exists) {
          await tx.signer.create({ data: { walletId: wallet.id, address: a, index: wallet.signersCount } });
          await tx.wallet.update({ where: { id: wallet.id }, data: { signersCount: { increment: 1 } } });
        }
      } else if (op.kind === "RemoveSigner" && typeof decoded.signer === "string") {
        const a = getAddress(decoded.signer);
        const { count } = await tx.signer.deleteMany({ where: { walletId: wallet.id, address: a } });
        if (count > 0) {
          const remaining = await tx.signer.count({ where: { walletId: wallet.id } });
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              signersCount: remaining,
              ...(wallet.signersRequired > remaining && remaining > 0 ? { signersRequired: remaining } : {}),
            },
          });
        }
      } else if (op.kind === "ChangeSigRequired" && decoded.count != null) {
        const count = Number(decoded.count);
        const owners = await tx.signer.count({ where: { walletId: wallet.id } });
        const clamped = Math.max(1, Math.min(count, owners || 1));
        await tx.wallet.update({ where: { id: wallet.id }, data: { signersRequired: clamped } });
      }
    }
    return tx.wallet.update({
      where: { id: wallet.id },
      data: { nonce: { increment: 1 } },
      include: walletInclude,
    });
  });

  return c.json({ wallet: result, skipped: wasRejected });
});
