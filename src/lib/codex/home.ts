import "server-only";

import path from "node:path";
import fs from "node:fs";

function root() {
  const configured = process.env.CODEX_SUBSCRIPTION_HOME?.trim();
  return path.resolve(configured && configured.length > 0 ? configured : "./.codex-subscriptions");
}

/**
 * Resolves the isolated CODEX_HOME directory for one allowed user. The
 * directory name is always a trusted Prisma cuid (never user input), but the
 * containment check is kept anyway as defense in depth.
 */
export function codexHomeFor(allowedUserId: string): string {
  const base = root();
  const dir = path.join(base, allowedUserId);
  const rel = path.relative(base, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
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
