import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AllowedUser } from "@/generated/prisma/client";

/**
 * Re-checks the allow-list on every call (not just at session creation), so
 * disabling someone in Settings -> Users takes effect on their very next
 * request even if their session cookie is still technically valid.
 */
export const getCurrentAllowedUser = cache(async (): Promise<AllowedUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) return null;

  const email = session.user.email.trim().toLowerCase();
  const allowed = await prisma.allowedUser.findUnique({ where: { email } });
  if (!allowed || allowed.disabledAt) return null;

  return allowed;
});

export async function requireUser(): Promise<AllowedUser> {
  const user = await getCurrentAllowedUser();
  if (!user) redirect("/sign-in");
  return user;
}
