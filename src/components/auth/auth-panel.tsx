"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { signInAction, signUpAction } from "@/server/actions";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

/** Google's four-colour mark. Inline so it needs no network request. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function AuthPanel({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [googlePending, setGooglePending] = useState(false);

  const supabase = getSupabaseBrowserClient();

  // Surface whatever the OAuth callback bounced back with.
  useEffect(() => {
    if (initialError) toast.error(initialError);
  }, [initialError]);

  async function signInWithGoogle() {
    if (!supabase) return;
    setGooglePending(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser navigates away, so this only runs on failure.
    if (error) {
      const notEnabled = /provider is not enabled|unsupported provider/i.test(
        error.message,
      );
      toast.error(
        notEnabled ? "Google sign-in is not switched on yet" : error.message,
        notEnabled
          ? {
              description:
                "Enable the Google provider in your Supabase project, then try again.",
            }
          : undefined,
      );
      setGooglePending(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const payload = { email, password };
      const result =
        mode === "signin"
          ? await signInAction(payload)
          : await signUpAction(payload);

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      if (
        mode === "signup" &&
        "needsConfirmation" in result &&
        result.needsConfirmation
      ) {
        toast.success("Check your inbox 💌", {
          description: "Confirm your email, then come back and sign in.",
        });
        setMode("signin");
        return;
      }

      router.replace("/");
      router.refresh();
    });
  }

  const busy = pending || googlePending;

  return (
    <div className="sticker tint-violet w-full p-6 sm:p-7">
      {/* Google first — it is the one-tap path */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={signInWithGoogle}
        disabled={busy}
      >
        {googlePending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <GoogleMark className="size-[18px]" />
        )}
        Continue with Google
      </Button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-[2px] flex-1 rounded-full bg-[var(--track)]" />
        <span className="label-cute text-[0.55rem]">or with email</span>
        <span className="h-[2px] flex-1 rounded-full bg-[var(--track)]" />
      </div>

      <div className="mb-5 flex gap-1 rounded-full bg-[var(--muted)] p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErrors({});
            }}
            className={cn(
              "relative flex-1 rounded-full px-3 py-2.5 text-sm font-bold transition-colors",
              mode === m ? "text-white" : "text-[var(--ink-soft)]",
            )}
          >
            {mode === m && (
              <motion.span
                layoutId="auth-tab"
                className="absolute inset-0 rounded-full bg-[var(--violet)]"
                transition={SPRING.nav}
              />
            )}
            <span className="relative">
              {m === "signin" ? "Sign in" : "Create account"}
            </span>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email ? (
            <p className="text-xs font-semibold text-[#E0446A]">{errors.email}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password ? (
            <p className="text-xs font-semibold text-[#E0446A]">
              {errors.password}
            </p>
          ) : null}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "signin" ? "Let me in 🍓" : "Start with Momo 🚀"}
        </Button>
      </form>
    </div>
  );
}
