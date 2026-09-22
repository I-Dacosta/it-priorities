import { isMicrosoftSignInConfigured } from "@/lib/auth";
import { SignInForm } from "@/components/sign-in-form";

// Read at request time, not build time, so adding the Azure env vars takes
// effect without a rebuild.
export const dynamic = "force-dynamic";

/**
 * Better Auth redirects a failed sign-in back here with ?error=<code>. Codes
 * are provider-agnostic and terse, so translate the ones worth acting on and
 * fall back to showing the raw code — an unfamiliar code on screen is far
 * easier to chase than a silent bounce back to this page.
 */
function describeSignInError(code: string): string {
  switch (code) {
    case "invalid_client":
    case "unauthorized_client":
      return "Microsoft rejected this app's credentials. The app registration is likely marked as a public client, or the client secret has expired.";
    case "access_denied":
      return "Sign-in was cancelled, or an administrator hasn't granted this app access.";
    case "state_mismatch":
    case "please_restart_the_process":
      return "That sign-in attempt expired. Try again.";
    case "signup_disabled":
    case "FORBIDDEN":
      return "That account isn't on the IT priorities allow-list yet. Ask a teammate to add you.";
    default:
      return `Sign-in didn't complete (${code}).`;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <SignInForm
      microsoftConfigured={isMicrosoftSignInConfigured}
      initialError={error ? describeSignInError(error) : null}
    />
  );
}
