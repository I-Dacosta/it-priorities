import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

export type RpcNotification = { method: string; params: unknown };

type PendingCall = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

/**
 * Minimal JSON-RPC 2.0-over-stdio client for the official Codex app-server
 * (`codex app-server`). One process per login attempt or per inference call
 * — never shared across users, never kept alive longer than needed.
 */
export class AppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private readonly listeners = new Set<(event: RpcNotification) => void>();
  private closed = false;
  private closeError: Error | null = null;

  constructor(command: string, args: string[], codeHome: string) {
    const env = { ...process.env };
    delete env.CODEX_HOME;
    env.CODEX_HOME = codeHome;

    this.child = spawn(command, args, { env });

    // A missing binary (ENOENT) or other spawn failure surfaces as an async
    // 'error' event. Without a listener this crashes the whole process, not
    // just the request that triggered it.
    this.child.on("error", (error) => {
      const isMissingBinary = (error as NodeJS.ErrnoException)?.code === "ENOENT";
      const wrapped = isMissingBinary
        ? new Error(
            `The codex CLI wasn't found (tried "${command}"). Install it with \`npm i -g @openai/codex\` or set CODEX_APP_SERVER_COMMAND to its path.`
          )
        : error instanceof Error
          ? error
          : new Error(String(error));
      this.closeError = wrapped;
      this.closed = true;
      this.failAllPending(wrapped);
    });

    this.child.stderr.resume(); // never surface provider stderr in logs or to clients

    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.handleLine(line));

    this.child.on("close", () => {
      this.closed = true;
      rl.close();
      this.failAllPending(this.closeError ?? new Error("codex app-server closed"));
    });
  }

  private handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let envelope: {
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { message?: string };
    };
    try {
      envelope = JSON.parse(trimmed);
    } catch {
      return; // Not our wire format to enforce — skip anything unparseable.
    }

    if (typeof envelope.id === "number") {
      const pending = this.pending.get(envelope.id);
      if (!pending) return;
      this.pending.delete(envelope.id);
      if (envelope.error) {
        pending.reject(new Error(envelope.error.message ?? "codex app-server error"));
      } else {
        pending.resolve(envelope.result);
      }
      return;
    }

    if (envelope.method) {
      for (const listener of this.listeners) {
        listener({ method: envelope.method, params: envelope.params });
      }
    }
  }

  private failAllPending(error: Error) {
    for (const [, pending] of this.pending) pending.reject(error);
    this.pending.clear();
  }

  onNotification(listener: (event: RpcNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  call<T = unknown>(method: string, params: unknown, timeoutMs = 30_000): Promise<T> {
    if (this.closed) {
      return Promise.reject(this.closeError ?? new Error("codex app-server is closed"));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`codex app-server timed out waiting for ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.child.stdin.write(payload + "\n", (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  notify(method: string, params: unknown) {
    if (this.closed) return;
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.child.kill();
  }
}

export async function startAppServer(command: string, codeHome: string): Promise<AppServerClient> {
  const client = new AppServerClient(
    command,
    ["app-server", "-c", 'cli_auth_credentials_store="file"'],
    codeHome
  );
  await client.call(
    "initialize",
    { clientInfo: { name: "it_priorities_codex_bridge", title: "IT Priorities Codex Bridge", version: "1" } },
    15_000
  );
  client.notify("initialized", {});
  return client;
}
