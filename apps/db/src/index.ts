import { neonConfig, Pool } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import prismaPkg from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import ws from "ws";

// @prisma/client's generated client is CommonJS. Under ESM, Node's module
// lexer can't see its named exports, so `import { PrismaClient }` throws at
// runtime ("does not provide an export named 'PrismaClient'"). Default-import
// the CJS namespace and destructure the constructor from it instead.
const { PrismaClient: PrismaClientCtor } = prismaPkg as typeof import("@prisma/client");

// Re-export Prisma's generated types (models, enums, `Prisma` namespace) for
// consumers. Type-only so nothing is re-exported from the CJS module at runtime.
export type * from "@prisma/client";

// Neon's serverless driver needs a WebSocket impl in Node runtimes (Vercel
// Node functions, local dev). In edge runtimes a global WebSocket exists.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

let client: PrismaClient | undefined;

/**
 * Singleton PrismaClient backed by the Neon serverless driver adapter.
 * Reused across warm serverless invocations to avoid connection churn.
 */
export function getDb(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (client) return client;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaNeon(pool);
  client = new PrismaClientCtor({ adapter });
  return client;
}
