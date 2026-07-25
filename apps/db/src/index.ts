import { neonConfig, Pool } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

// Neon's serverless driver needs a WebSocket impl in Node runtimes (Vercel
// Node functions, local dev). In edge runtimes a global WebSocket exists.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export * from "@prisma/client";

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
  client = new PrismaClient({ adapter });
  return client;
}
