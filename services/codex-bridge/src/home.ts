import path from "node:path";
import fs from "node:fs";

function root() {
  const configured = process.env.CODEX_SUBSCRIPTION_HOME?.trim();
  return path.resolve(configured && configured.length > 0 ? configured : "./.codex-subscriptions");
}

/**
 * Resolves the isolated CODEX_HOME directory for one user.
 *
 * The id arrives over HTTP, so it is validated as a strict opaque token
 * before it ever reaches the filesystem — the containment check below is a
 * second line of defense, not the only one.
 */
export function codexHomeFor(userId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
    throw new Error("Invalid user id.");
  }

  const base = root();
  const dir = path.join(base, userId);
  const rel = path.relative(base, dir);
  if (rel !== userId || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Resolved Codex home escapes the configured root.");
  }

  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function hasPersistedAuth(codeHome: string): boolean {
  try {
    const stat = fs.statSync(path.join(codeHome, "auth.json"));
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}
