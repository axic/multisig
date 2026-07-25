import type { IncomingMessage, ServerResponse } from "node:http";

// Zero-dependency diagnostic probe. No hono, no adapter, no workspace imports —
// just a bare Vercel Node function. Reachable directly at /api/ping (the
// vercel.json catch-all rewrite is applied AFTER the filesystem, so a real
// function path wins over the rewrite).
//
// If /api/ping works but /health (-> /api/index) fails, the problem is in the
// hono app / adapter / bundling. If /api/ping ALSO fails, the problem is the
// project's build/runtime setup itself (not our code).
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ pong: true }));
}
