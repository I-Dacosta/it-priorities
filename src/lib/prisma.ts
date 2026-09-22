import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * `pg` currently treats sslmode=require as verify-full and warns, loudly and on
 * every cold start, that a future major will downgrade it to libpq semantics.
 * Vercel logs that stderr warning at error level, which buries real errors.
 *
 * Saying verify-full explicitly keeps exactly the behaviour we already get
 * today (and the stronger of the two options) while silencing the warning. It
 * is normalised here rather than in DATABASE_URL because that variable is
 * managed by the Neon integration and would be overwritten.
 */
function normalizeConnectionString(url: string | undefined) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get("sslmode") === "require") {
      parsed.searchParams.set("sslmode", "verify-full");
    }
    return parsed.toString();
  } catch {
    // Not a parseable URL — hand it to the driver untouched and let it complain.
    return url;
  }
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: normalizeConnectionString(process.env.DATABASE_URL),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
