import { makePublicClient, readWalletConfig, resolveChains } from "@multisig/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

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
});

// Register / track a deployed wallet.
app.post("/v1/wallets", async (c) => {
  const parsed = registerWalletSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { chainId, address, deployTxHash, label } = parsed.data;
  const db = await loadDb();
  const wallet = await db.wallet.upsert({
    where: { chainId_address: { chainId, address: getAddress(address) } },
    create: { chainId, address: getAddress(address), deployTxHash, label },
    update: { deployTxHash, label },
  });
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
    include: { signers: true },
  });
  if (!wallet) return c.json({ error: "not found" }, 404);
  return c.json(wallet);
});

// --- Later-phase stubs (documented seams) ---------------------------------
const later = (phase: string, note: string) => (c: import("hono").Context) =>
  c.json({ error: "not_implemented", phase, note }, 501);

// Phase 1: read-through of on-chain config (signers/required/nonce).
//
// Builds a SERVER-SIDE public client (keeps RPC_URL_<id> off the browser),
// reads the contract's view getters, and reconciles the DB cache that
// GET /v1/wallets/:chainId/:address already returns. The chain is the source of
// truth; Signer rows are fully replaced from on-chain each sync.
app.post("/v1/wallets/:chainId/:address/sync", async (c) => {
  const chainId = Number(c.req.param("chainId"));
  const addressRaw = c.req.param("address");
  if (!Number.isInteger(chainId) || !isAddress(addressRaw)) {
    return c.json({ error: "bad chainId/address" }, 400);
  }
  const address = getAddress(addressRaw);

  const chain = resolveChains(process.env).find((ch) => ch.chainId === chainId);
  if (!chain) return c.json({ error: `chain ${chainId} not configured` }, 400);

  const config = await readWalletConfig(makePublicClient(chain), address);

  const db = await loadDb();
  const wallet = await db.wallet.upsert({
    where: { chainId_address: { chainId, address } },
    create: {
      chainId,
      address,
      signersCount: config.signersCount,
      signersRequired: config.signersRequired,
      nonce: config.nonce,
    },
    update: {
      signersCount: config.signersCount,
      signersRequired: config.signersRequired,
      nonce: config.nonce,
    },
  });

  // Replace the cached signer set (on-chain is authoritative).
  await db.signer.deleteMany({ where: { walletId: wallet.id } });
  if (config.signers.length > 0) {
    await db.signer.createMany({
      data: config.signers.map((signer, index) => ({ walletId: wallet.id, address: signer, index })),
    });
  }

  const synced = await db.wallet.findUnique({
    where: { id: wallet.id },
    include: { signers: { orderBy: { index: "asc" } } },
  });
  return c.json(synced);
});
// Phase 2: index + propose. queue(Operation) needs the sum-type codec.
app.get("/v1/wallets/:chainId/:address/operations", later("2", "index of on-chain operations + votes"));
app.post("/v1/wallets/:chainId/:address/operations", later("2", "build queue(Operation) calldata"));
// Phase 3: execute-payload assembly (UnstoredCall preimage lookup).
app.post("/v1/operations/:id/execute", later("3", "assemble execute(nonce,payload) using stored preimage"));
// Phase 4: reject sibling flow surfaced in UI (reject(nonce) is standard ABI).
// Phase 5: relay-signature pool (blocked on create_signature_hash).
app.post("/v1/wallets/:chainId/:address/signatures", later("5", "off-chain relay signature collection"));
