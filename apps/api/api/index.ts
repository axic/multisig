import { handle } from "@hono/node-server/vercel";
import { app } from "../src/app";

// Vercel Functions entrypoint (Node.js runtime). vercel.json rewrites all
// paths here. We MUST use the @hono/node-server Vercel adapter (not
// hono/vercel): this function runs on the Node runtime — required because
// Prisma's query engine can't run on Edge — so Vercel invokes it with Node's
// (req, res). hono/vercel's handle expects a Web Request and crashes here
// (FUNCTION_INVOCATION_FAILED). This adapter bridges IncomingMessage -> fetch.
export const config = { runtime: "nodejs" };

export default handle(app);
