import { betterAuth, APIError } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, microsoftEntraId } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Dev-only escape hatch so the app is testable without a real Azure AD app
  // registration. Excluded from production builds — Microsoft is the only
  // sign-in method that ships.
  emailAndPassword: {
    enabled: process.env.NODE_ENV !== "production",
  },
  plugins: [
    genericOAuth({
      config: [
        microsoftEntraId({
          clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
          tenantId: process.env.MICROSOFT_TENANT_ID ?? "",
        }),
      ],
    }),
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
