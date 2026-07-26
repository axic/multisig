import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { applyExecuteEffect, recomputeWallet, type DecodedOp } from "./indexer.js";

/**
 * API surface (Phase 0 skeleton).
 *
 * Implemented now: health + wallet register/list/get (DB-backed).
 * Stubbed (501) for later phases: operations index, propose/queue, approve,
 * reject, execute-payload assembly, relay-signature pool. Each stub names the
 * phase and the contract entrypoint it maps to.
 */
export const app = new Hono();

// Load the DB (and thus @prisma/client) lazily, inside the handlers that need
// it — NOT at module top. On serverless a throw during module load (e.g. a
// missing generated Prisma client in the bundle) crashes EVERY route with an
// opaque FUNCTION_INVOCATION_FAILED, including /health. Deferring it keeps
// /health alive and lets onError surface the real message from DB routes.
const loadDb = async () => (await import("@multisig/db")).getDb();

// Surface real errors instead of an opaque 500. Without this a thrown error
// (bad DATABASE_URL, Prisma engine missing, …) reaches the client as a bare
// crash with no message.
app.onError((err, c) =>
  c.json({ error: { name: err.name, message: err.message } }, 500),
);

// CORS allowlist. The production frontend + local dev are allowed by default;
// add more origins via CORS_ORIGINS (comma-separated). Set
// CORS_ALLOW_VERCEL_PREVIEWS=true to also allow this project's rotating Vercel
// preview URLs (https://multisig-<hash>.vercel.app).
const DEFAULT_ORIGINS = ["https://multisig-gold.vercel.app", "http://localhost:5173"];
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ORIGINS,
  ...(process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);
const ALLOW_VERCEL_PREVIEWS = process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true";
const VERCEL_PREVIEW_RE = /^https:\/\/multisig-[a-z0-9-]+\.vercel\.app$/;

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*"; // non-browser / same-origin requests
      if (ALLOWED_ORIGINS.has(origin)) return origin;
      if (ALLOW_VERCEL_PREVIEWS && VERCEL_PREVIEW_RE.test(origin)) return origin;
      return null; // not allowed -> no Access-Control-Allow-Origin header
    },
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

const registerWalletSchema = z.object({
  chainId: z.number().int().positive(),
  address: z.string().refine(isAddress, "invalid address"),
  deployTxHash: z.string().optional(),
  label: z.string().max(100).optional(),
  // The deployer becomes signer[0] with threshold 1 (the contract's constructor
  // sets `signers[0] = caller()`), so we seed the genesis signer here.
  deployer: z.string().refine(isAddress, "invalid deployer").optional(),
});

// Register / track a deployed wallet.
app.post("/v1/wallets", async (c) => {
  const parsed = registerWalletSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { chainId, address, deployTxHash, label, deployer } = parsed.data;
  const db = await loadDb();
  const wallet = await db.wallet.upsert({
    where: { chainId_address: { chainId, address: getAddress(address) } },
    create: {
      chainId,
      address: getAddress(address),
      deployTxHash,
      label,
      signersCount: deployer ? 1 : 0,
      signersRequired: deployer ? 1 : 0,
    },
    update: { deployTxHash, label },
  });

  // Seed the genesis signer once (idempotent: unique on walletId+address).
  if (deployer) {
    await db.signer
      .create({ data: { walletId: wallet.id, address: getAddress(deployer), index: 0 } })
      .catch(() => undefined);
  }
  return c.json(wallet, 201);
});

app.get("/v1/wallets", async (c) => {
  const db = await loadDb();
  const wallets = await db.wallet.findMany({ orderBy: { createdAt: "desc" } });
  return c.json(wallets);
});

app.get("/v1/wallets/:chainId/:address", async (c) => {
  const chainId = Number(c.req.param("chainId"));
  const addressRaw = c.req.param("address");
  if (!Number.isInteger(chainId) || !isAddress(addressRaw)) {
    return c.json({ error: "bad chainId/address" }, 400);
  }
  const db = await loadDb();
  const wallet = await db.wallet.findUnique({
    where: { chainId_address: { chainId, address: getAddress(addressRaw) } },
    include: { signers: { orderBy: { index: "asc" } } },
  });
  if (!wallet) return c.json({ error: "not found" }, 404);
  return c.json(wallet);
});

// --- M1–M4: the on-chain-methods index --------------------------------------
//
// The web sends queue/approve/reject/execute transactions directly from the
// connected signer (no relay / batching), then reports each confirmed tx here so
// the index reflects chain state. Every write recomputes the wallet's cached
// scalars via the indexer so the cache is self-consistent.

// Resolve a wallet by chainId/address from the route, or return a 404 responder.
async function walletFromRoute(c: import("hono").Context) {
  const chainId = Number(c.req.param("chainId"));
  const addressRaw = c.req.param("address");
  if (!Number.isInteger(chainId) || typeof addressRaw !== "string" || !isAddress(addressRaw)) {
    return { error: c.json({ error: "bad chainId/address" }, 400) as Response };
  }
  const db = await loadDb();
  const wallet = await db.wallet.findUnique({
    where: { chainId_address: { chainId, address: getAddress(addressRaw) } },
  });
  if (!wallet) return { error: c.json({ error: "wallet not found" }, 404) as Response };
  return { db, wallet };
}

// M1/M3: recompute cached config from the indexed operation log and return the
// full wallet (signers + operations + votes). This is the "rebuildable index".
app.post("/v1/wallets/:chainId/:address/sync", async (c) => {
  const r = await walletFromRoute(c);
  if (r.error) return r.error;
  await recomputeWallet(r.db, r.wallet.id);
  const full = await r.db.wallet.findUnique({
    where: { id: r.wallet.id },
    include: {
      signers: { orderBy: { index: "asc" } },
      operations: { orderBy: { index: "asc" }, include: { votes: true } },
    },
  });
  return c.json(full);
});

// M2: list indexed operations (the queue + history) with votes.
app.get("/v1/wallets/:chainId/:address/operations", async (c) => {
  const r = await walletFromRoute(c);
  if (r.error) return r.error;
  const operations = await r.db.operation.findMany({
    where: { walletId: r.wallet.id },
    orderBy: { index: "asc" },
    include: { votes: true },
  });
  return c.json(operations);
});

const createOperationSchema = z.object({
  kind: z.string(),
  decoded: z.record(z.unknown()).default({}),
  proposer: z.string().refine(isAddress).optional(),
  createdTxHash: z.string().optional(),
  // Explicit index the queue tx landed at. Defaults to the current op count
  // (the contract appends at `operations_count`).
  index: z.number().int().nonnegative().optional(),
});

// M2: record a queued operation (the queue(op) tx already landed on-chain).
app.post("/v1/wallets/:chainId/:address/operations", async (c) => {
  const r = await walletFromRoute(c);
  if (r.error) return r.error;
  const parsed = createOperationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { kind, decoded, proposer, createdTxHash } = parsed.data;

  const count = await r.db.operation.count({ where: { walletId: r.wallet.id } });
  const index = parsed.data.index ?? count;
  const operation = await r.db.operation.create({
    data: {
      walletId: r.wallet.id,
      index,
      kind,
      decoded: decoded as object,
      status: "Approvals",
      approvals: 0,
      proposer: proposer ? getAddress(proposer) : undefined,
      createdTxHash,
    },
  });
  return c.json(operation, 201);
});

// Look up an operation by its DB id and load its wallet.
async function operationById(c: import("hono").Context) {
  const db = await loadDb();
  const operation = await db.operation.findUnique({ where: { id: c.req.param("id") } });
  if (!operation) return { error: c.json({ error: "operation not found" }, 404) as Response };
  return { db, operation };
}

const voteSchema = z.object({
  signer: z.string().refine(isAddress, "invalid signer"),
  txHash: z.string().optional(),
});

// M2: record an approve(nonce) from a signer.
app.post("/v1/operations/:id/approve", async (c) => {
  const r = await operationById(c);
  if (r.error) return r.error;
  const parsed = voteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (r.operation.status !== "Approvals") {
    return c.json({ error: "operation is not open for approval" }, 409);
  }
  const signer = getAddress(parsed.data.signer);
  await r.db.vote.upsert({
    where: { operationId_signer: { operationId: r.operation.id, signer } },
    create: { operationId: r.operation.id, signer, vote: "Approved" },
    update: { vote: "Approved" },
  });
  await recomputeWallet(r.db, r.operation.walletId);
  const updated = await r.db.operation.findUnique({
    where: { id: r.operation.id },
    include: { votes: true },
  });
  return c.json(updated);
});

// M4: record a reject(nonce) — flips the operation to Rejected (still executed
// as a no-op skip, per the contract).
app.post("/v1/operations/:id/reject", async (c) => {
  const r = await operationById(c);
  if (r.error) return r.error;
  const parsed = voteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (r.operation.status !== "Approvals") {
    return c.json({ error: "operation is not open for rejection" }, 409);
  }
  const signer = getAddress(parsed.data.signer);
  await r.db.$transaction([
    r.db.vote.upsert({
      where: { operationId_signer: { operationId: r.operation.id, signer } },
      create: { operationId: r.operation.id, signer, vote: "Rejected" },
      update: { vote: "Rejected" },
    }),
    r.db.operation.update({ where: { id: r.operation.id }, data: { status: "Rejected" } }),
  ]);
  await recomputeWallet(r.db, r.operation.walletId);
  const updated = await r.db.operation.findUnique({
    where: { id: r.operation.id },
    include: { votes: true },
  });
  return c.json(updated);
});

const executeSchema = z.object({ txHash: z.string().optional() });

// M3: record an execute(nonce, payload). Enforces strict sequential order
// (index == wallet.nonce), applies the config effect on an approved op, and
// advances the nonce. A Rejected op executes as a skip.
app.post("/v1/operations/:id/execute", async (c) => {
  const r = await operationById(c);
  if (r.error) return r.error;
  const parsed = executeSchema.safeParse((await c.req.json().catch(() => null)) ?? {});
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const wallet = await r.db.wallet.findUnique({ where: { id: r.operation.walletId } });
  if (!wallet) return c.json({ error: "wallet not found" }, 404);
  if (r.operation.index !== wallet.nonce) {
    return c.json({ error: `out of order: expected nonce ${wallet.nonce}` }, 409);
  }
  if (r.operation.status === "Executed") {
    return c.json({ error: "already executed" }, 409);
  }

  const skipped = r.operation.status === "Rejected";
  if (!skipped) {
    // An approved op applies its config effect, then is marked Executed.
    await applyExecuteEffect(r.db, wallet.id, r.operation.kind, r.operation.decoded as DecodedOp);
    await r.db.operation.update({
      where: { id: r.operation.id },
      data: { status: "Executed", executedTxHash: parsed.data.txHash, executedAt: new Date() },
    });
  } else {
    await r.db.operation.update({
      where: { id: r.operation.id },
      data: { executedTxHash: parsed.data.txHash, executedAt: new Date() },
    });
  }
  await recomputeWallet(r.db, wallet.id);
  const updated = await r.db.operation.findUnique({
    where: { id: r.operation.id },
    include: { votes: true },
  });
  return c.json({ operation: updated, skipped });
});

// Phase 5 (still out of scope): relay-signature pool + *WithSignature entrypoints,
// blocked on the contract's create_signature_hash. Kept as an explicit 501 seam.
app.post("/v1/wallets/:chainId/:address/signatures", (c) =>
  c.json({ error: "not_implemented", phase: "5", note: "relay signatures (blocked on create_signature_hash)" }, 501),
);
