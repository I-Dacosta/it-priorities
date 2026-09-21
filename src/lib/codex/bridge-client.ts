import "server-only";

/**
 * HTTP client for the codex-bridge companion service (services/codex-bridge).
 *
 * The bridge owns the `codex` CLI subprocesses and each user's credential
 * directory, so it has to run on a persistent host with a disk. This app —
 * which can run serverless — only ever talks to it over HTTP.
 */

export class BridgeNotConfiguredError extends Error {
  constructor() {
    super(
      "The assistant isn't configured on this deployment. Set CODEX_BRIDGE_URL and CODEX_BRIDGE_API_KEY."
    );
  }
}

function config() {
  const url = process.env.CODEX_BRIDGE_URL?.trim();
  const apiKey = process.env.CODEX_BRIDGE_API_KEY?.trim();
  if (!url || !apiKey) throw new BridgeNotConfiguredError();
  return { url: url.replace(/\/$/, ""), apiKey };
}

export function isBridgeConfigured() {
  return Boolean(process.env.CODEX_BRIDGE_URL?.trim() && process.env.CODEX_BRIDGE_API_KEY?.trim());
}

async function call(
  path: string,
  init: { method: string; body?: unknown; signal?: AbortSignal }
): Promise<Response> {
  const { url, apiKey } = config();
  return fetch(`${url}${path}`, {
    method: init.method,
    headers: {
      "X-Internal-API-Key": apiKey,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: init.signal,
    cache: "no-store",
  });
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "The assistant service could not complete the request.");
  }
  if (!body) throw new Error("The assistant service returned an empty response.");
  return body;
}

export type DeviceLogin = {
  loginId: string;
  verificationUrl: string;
  userCode: string;
  expiresAt: number;
};

export function startLogin(userId: string) {
  return call("/connect", { method: "POST", body: { userId } }).then(json<DeviceLogin>);
}

export type LoginPollResult = {
  status: "pending" | "connected" | "failed" | "expired" | "not_found";
  message?: string;
};

export function pollLogin(loginId: string) {
  return call(`/connect/${encodeURIComponent(loginId)}`, { method: "GET" }).then(
    json<LoginPollResult>
  );
}

export async function isConnected(userId: string): Promise<boolean> {
  const result = await call(`/connection/${encodeURIComponent(userId)}`, { method: "GET" }).then(
    json<{ connected: boolean }>
  );
  return result.connected;
}

export function disconnect(userId: string) {
  return call(`/connection/${encodeURIComponent(userId)}`, { method: "DELETE" }).then(
    json<{ connected: boolean }>
  );
}

export type CodexChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** Returns the raw streaming response so the route can pipe NDJSON straight through. */
export function inferStream(
  body: {
    userId: string;
    model: string;
    messages: CodexChatMessage[];
    effort?: "low" | "high";
    boardContext?: string;
  },
  signal?: AbortSignal
) {
  return call("/infer/stream", { method: "POST", body, signal });
}
