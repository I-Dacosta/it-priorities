"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

/**
 * Local-only escape hatch so the app is testable without a real Azure AD app
 * registration. `emailAndPassword` is disabled server-side in production
 * (see src/lib/auth.ts), so this renders but silently fails to sign in if
 * somehow shipped — defense in depth on top of the build-time strip below.
 */
export function DevSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("dev-password-123");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (process.env.NODE_ENV === "production") return null;

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const signIn = await authClient.signIn.email({ email, password });
    if (signIn.error) {
      const signUp = await authClient.signUp.email({ email, password, name: email.split("@")[0] });
      if (signUp.error) {
        setError(signUp.error.message ?? "Dev sign-in failed.");
        setPending(false);
        return;
      }
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-6 border-t pt-4">
      <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Dev only — no Azure AD needed
      </p>
      <div className="flex flex-col gap-2">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ima.dacosta@aquatiq.com"
          type="email"
        />
        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
        />
        <Button variant="secondary" onClick={handleSubmit} disabled={!email || pending}>
          {pending ? "Signing in…" : "Sign in / up (dev)"}
        </Button>
        {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
