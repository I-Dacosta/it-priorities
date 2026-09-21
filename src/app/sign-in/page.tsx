import { isMicrosoftSignInConfigured } from "@/lib/auth";
import { SignInForm } from "@/components/sign-in-form";

// Read at request time, not build time, so adding the Azure env vars takes
// effect without a rebuild.
export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <SignInForm microsoftConfigured={isMicrosoftSignInConfigured} />;
}
