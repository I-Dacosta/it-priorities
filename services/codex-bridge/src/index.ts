import { createHash, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { stream } from "hono/streaming";

import {
  disconnect,
  invoke,
  isConnected,
  pollLogin,
  ReauthenticationRequiredError,
  shutdown,
  startLogin,
  type CodexChatMessage,
} from "./manager.js";

const apiKey = process.env.CODEX_BRIDGE_API_KEY?.trim();
if (!apiKey) {
  console.error("CODEX_BRIDGE_API_KEY is required.");
  process.exit(1);
}

// Hash both sides so timingSafeEqual never sees mismatched lengths.
const expectedKeyDigest = createHash("sha256").update(apiKey).digest();

function isAuthorized(presented: string | undefined): boolean {
  if (!presented) return false;
  const presentedDigest = createHash("sha256").update(presented).digest();
  return timingSafeEqual(presentedDigest, expectedKeyDigest);
}

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (!isAuthorized(c.req.header("x-internal-api-key"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Codex bridge request failed.";
}

app.post("/connect", async (c) => {
  const body = await c.req.json<{ userId?: string }>().catch(() => ({}) as { userId?: string });
  if (!body.userId) return c.json({ error: "userId is required" }, 400);

  try {
    return c.json(await startLogin(body.userId), 202);
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502);
  }
});

app.get("/connect/:loginId", async (c) => {
  try {
    return c.json(await pollLogin(c.req.param("loginId")));
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502);
  }
});

app.get("/connection/:userId", (c) => {
  try {
    return c.json({ connected: isConnected(c.req.param("userId")) });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  }
});

app.delete("/connection/:userId", async (c) => {
  try {
    await disconnect(c.req.param("userId"));
    return c.json({ connected: false });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502);
  }
});

type InferBody = {
  userId?: string;
  model?: string;
  messages?: CodexChatMessage[];
  effort?: "low" | "high";
  boardContext?: string;
};

app.post("/infer/stream", async (c) => {
  const body = await c.req.json<InferBody>().catch(() => ({}) as InferBody);
  if (!body.userId || !body.model || !body.messages?.length) {
    return c.json({ error: "userId, model, and messages are required" }, 400);
  }

  if (!isConnected(body.userId)) {
    return c.json({ error: "Codex subscription is not connected.", code: "not_connected" }, 409);
  }

  c.header("Content-Type", "application/x-ndjson");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {
    const send = (payload: Record<string, unknown>) => s.write(JSON.stringify(payload) + "\n");
    try {
      await invoke({
        userId: body.userId!,
        model: body.model!,
        messages: body.messages!,
        effort: body.effort,
        boardContext: body.boardContext,
        signal: c.req.raw.signal,
        onDelta: (delta) => {
          void send({ type: "delta", text: delta });
        },
      });
    } catch (error) {
      const code =
        error instanceof ReauthenticationRequiredError ? "reauthentication_required" : undefined;
      await send({ type: "error", message: errorMessage(error), ...(code ? { code } : {}) });
    }
  });
});

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`codex-bridge listening on ${info.address}:${info.port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    shutdown();
    server.close(() => process.exit(0));
  });
}
