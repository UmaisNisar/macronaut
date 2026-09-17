"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ClipboardPaste, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  removeAiKeyAction,
  saveAiKeyAction,
  type AiKeyStatus,
} from "@/server/actions";

const STUDIO_URL = "https://aistudio.google.com/apikey";

/**
 * Add, replace or remove the Gemini key this account's AI runs on.
 *
 * One component for onboarding and Profile, so the two cannot drift on what
 * they tell people about where the key goes. The key is only ever sent to the
 * server action, which checks it with Google before keeping it; it is never
 * put back into the page afterwards, only its last four characters.
 */
export function AiKeyForm({
  initial,
  onChange,
  compact = false,
}: {
  initial: AiKeyStatus;
  onChange?: (status: AiKeyStatus) => void;
  /** Profile already explains the why; onboarding needs the full walk-through. */
  compact?: boolean;
}) {
  const [status, setStatus] = useState(initial);
  const [editing, setEditing] = useState(initial.source === "none");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update(next: AiKeyStatus) {
    setStatus(next);
    onChange?.(next);
  }

  function save() {
    setError(null);
    start(async () => {
      const result = await saveAiKeyAction(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValue("");
      setEditing(false);
      update({ source: result.source, hint: result.hint });
      toast.success("Key saved — Momo's AI is on");
    });
  }

  function remove() {
    start(async () => {
      const result = await removeAiKeyAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      update({ source: result.source, hint: null });
      setEditing(result.source === "none");
      toast("Key removed");
    });
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setValue(text);
        setError(null);
      }
    } catch {
      // Refused or unsupported: the field is right there to paste into.
    }
  }

  return (
    <div className="space-y-3">
      {status.source === "own" && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--mint-soft)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--mint-solid)] text-white">
              <Check className="size-4" strokeWidth={3.5} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">Your key is saved</p>
              <p className="mt-0.5 text-xs font-medium text-[var(--ink-soft)]">
                Ending in{" "}
                <span className="font-mono font-bold">{status.hint}</span> ·
                stored encrypted
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove
            </Button>
          </div>
        </div>
      ) : null}

      {status.source === "server" && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--muted)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Using this server&rsquo;s key</p>
            <p className="mt-0.5 text-xs font-medium text-[var(--ink-soft)]">
              Add your own to spend your quota instead.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
          >
            Use my own
          </Button>
        </div>
      ) : null}

      {editing ? (
        <>
          {!compact ? (
            <ol className="space-y-2 text-sm font-medium">
              {[
                <>
                  Open{" "}
                  <a
                    href={STUDIO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-[var(--violet)] underline underline-offset-4"
                  >
                    Google AI Studio
                  </a>{" "}
                  and sign in with any Google account.
                </>,
                <>
                  Press <span className="font-bold">Create API key</span>. It is
                  free, with no card needed.
                </>,
                <>Copy the key and paste it below.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="numeral grid size-6 shrink-0 place-items-center rounded-full bg-[var(--violet-soft)] text-xs text-[var(--violet)]">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          ) : null}

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label htmlFor="gemini-key" className="sr-only">
              Gemini API key
            </label>
            <div className="flex gap-2">
              <Input
                id="gemini-key"
                type="password"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder="Paste your key"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "gemini-key-error" : undefined}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={paste}
                aria-label="Paste from clipboard"
                className="h-12 w-12"
              >
                <ClipboardPaste className="size-4" />
              </Button>
            </div>

            {error ? (
              <p
                id="gemini-key-error"
                role="alert"
                className="text-xs font-semibold text-[var(--destructive)]"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={pending || !value.trim()}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {pending ? "Checking with Google…" : "Check and save"}
              </Button>
              {compact ? (
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a href={STUDIO_URL} target="_blank" rel="noreferrer" />
                  }
                >
                  Get a free key
                  <ExternalLink className="size-3.5" />
                </Button>
              ) : null}
              {status.source !== "none" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setValue("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </>
      ) : null}

      {compact && !editing ? null : (
        <p className="text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
          Your key is checked with Google, stored encrypted, and used only for
          your own meals and notes. What you log is sent to Google to be read.{" "}
          <Link
            href="/privacy"
            className="font-bold text-[var(--violet)] underline underline-offset-4"
          >
            Privacy
          </Link>
        </p>
      )}
    </div>
  );
}
