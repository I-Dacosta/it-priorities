"use client";

import { createAuthClient } from "better-auth/react";

// The Microsoft Entra ID provider is registered server-side via the
// genericOAuth plugin, but it behaves as a first-class social provider —
// sign-in goes through the standard signIn.social()/callback/:id endpoints,
// no client-side plugin needed.
export const authClient = createAuthClient();

export const { useSession, signOut } = authClient;

export function signInWithMicrosoft() {
  return authClient.signIn.social({
    provider: "microsoft-entra-id",
    callbackURL: "/",
    // Without this, anything that fails after Microsoft redirects back — a
    // rejected token exchange, a mismatched state — lands on Better Auth's own
    // /api/auth/error page and bounces to sign-in showing nothing, which is
    // indistinguishable from being signed out. Send failures to our own page
    // so the reason is actually visible.
    errorCallbackURL: "/sign-in",
  });
}
