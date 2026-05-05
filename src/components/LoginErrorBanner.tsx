"use client";

/**
 * Inline banner shown above the login form when the user is bounced back
 * to home with `?error=...` from the OAuth callback.
 *
 * Public interface: <LoginErrorBanner />. Reads useSearchParams so it must
 * be wrapped in a Suspense boundary by the parent page.
 * Owner context: home page.
 *
 * Distinguishes between user cancellation (?error=cancelled — friendly,
 * pink, no alarm) and a real failure (?error=auth_failed — louder, red).
 */
import { useSearchParams, useRouter } from "next/navigation";

export default function LoginErrorBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");
  if (!error) return null;

  function dismiss() {
    router.replace("/");
  }

  if (error === "cancelled") {
    return (
      <Banner
        tone="info"
        onDismiss={dismiss}
        title="You cancelled the authorization."
        body="No worries — sign in again whenever you're ready."
      />
    );
  }

  if (error === "auth_failed") {
    return (
      <Banner
        tone="error"
        onDismiss={dismiss}
        title="Sign-in didn't complete."
        body="Something went wrong on the way back from your provider. Please try again."
      />
    );
  }

  return null;
}

interface BannerProps {
  tone: "info" | "error";
  title: string;
  body: string;
  onDismiss: () => void;
}

function Banner({ tone, title, body, onDismiss }: BannerProps) {
  const wrapperClass =
    tone === "info"
      ? "border-[#9b4f96]/30 bg-gradient-to-r from-[#d60270]/10 to-[#9b4f96]/10 text-pink-100"
      : "border-red-500/40 bg-red-500/10 text-red-100";

  return (
    <div
      role="status"
      className={`max-w-md mx-auto mb-4 px-4 py-3 rounded-lg border text-sm flex items-start gap-3 ${wrapperClass}`}
    >
      <div className="flex-1 text-left">
        <div className="font-medium">{title}</div>
        <div className="text-xs opacity-80 mt-0.5">{body}</div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-xs opacity-60 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}
