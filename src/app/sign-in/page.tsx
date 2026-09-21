"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { signInWithMicrosoft } from "@/lib/auth-client";
import { DevSignIn } from "@/components/dev-sign-in";

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function SignInPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithMicrosoft();
    } catch {
      setError("Couldn't start sign-in. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-secondary/40 px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold">
            IT
          </div>
          <h1 className="text-xl font-semibold text-foreground">IT Priorities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aquatiq&apos;s shared board for what&apos;s being worked on next.
          </p>
        </div>

        <motion.div whileTap={{ scale: 0.98 }}>
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleSignIn}
            disabled={pending}
          >
            <MicrosoftMark />
            {pending ? "Redirecting…" : "Sign in with Microsoft"}
          </Button>
        </motion.div>

        {error ? (
          <p className="mt-4 text-center text-sm text-destructive">{error}</p>
        ) : (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Not on the list yet? Ask a teammate to add your @aquatiq.com email.
          </p>
        )}

        <DevSignIn />
      </motion.div>
    </div>
  );
}
