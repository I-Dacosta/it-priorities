import { betterAuth, APIError } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, microsoftEntraId } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() ?? "";

/**
 * microsoftEntraId() throws on a missing/invalid tenant GUID, which would fail
 * the whole build when the Azure app registration isn't wired up yet. Register
 * it only when all three values are actually present, so a deployment without
 * them still builds and runs — the sign-in page just reports it as
 * unconfigured instead of the app refusing to start.
 */
export const isMicrosoftSignInConfigured = Boolean(
  clientId && clientSecret && TENANT_GUID.test(tenantId)
);

// Fall back to the domain Vercel already knows so a deploy works without
// BETTER_AUTH_URL being set by hand. Preview deployments resolve to the
// production domain rather than their own URL, which is the safe direction —
// accepting an arbitrary request host would need trustedProxyHeaders.
const baseURL =
  process.env.BETTER_AUTH_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);

export const auth = betterAuth({
  ...(baseURL ? { baseURL } : {}),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Dev-only escape hatch so the app is testable without a real Azure AD app
  // registration. Excluded from production builds — Microsoft is the only
  // sign-in method that ships.
  emailAndPassword: {
    enabled: process.env.NODE_ENV !== "production",
  },
  plugins: [
    ...(isMicrosoftSignInConfigured
      ? [genericOAuth({ config: [microsoftEntraId({ clientId, clientSecret, tenantId })] })]
      : []),
    // Must be last: lets Server Actions/Components set auth cookies directly.
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          const email = normalizeEmail(user.email);
          const allowed = await prisma.allowedUser.findUnique({ where: { email } });
          if (!allowed || allowed.disabledAt) {
            throw new APIError("FORBIDDEN", {
              message:
                "This email isn't on the IT priorities allow-list yet. Ask a teammate to add you in Settings → Users.",
            });
          }
          return { data: { ...user, email, name: user.name || allowed.name || email } };
        },
      },
    },
    session: {
      create: {
        async before(session) {
          const user = await prisma.user.findUnique({ where: { id: session.userId } });
          const email = user ? normalizeEmail(user.email) : null;
          const allowed = email
            ? await prisma.allowedUser.findUnique({ where: { email } })
            : null;
          if (!allowed || allowed.disabledAt) {
            throw new APIError("FORBIDDEN", {
              message: "Your access has been removed. Ask a teammate to re-add you.",
            });
          }
          return true;
        },
        async after(session) {
          const user = await prisma.user.findUnique({ where: { id: session.userId } });
          if (!user) return;
          await prisma.allowedUser
            .update({
              where: { email: normalizeEmail(user.email) },
              data: { lastSignInAt: new Date() },
            })
            .catch(() => {
              // Best-effort: a race with disabling the user shouldn't fail sign-in.
            });
        },
      },
    },
  },
});
