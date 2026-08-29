"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Momo } from "@/components/mascot/momo";
import { reportBoundaryError } from "@/components/shell/error-reporter";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /*
   * retry(), not reset().
   *
   * Next 16 added retry() and the two are not interchangeable: retry()
   * re-fetches and re-renders the boundary's children, while reset() — which
   * this used — clears the error state and re-renders *without* re-fetching.
   * So when a page failed on a shaky connection, "Try again" re-rendered the
   * same dead payload and appeared to do nothing at all, even once the
   * connection was back. The docs now say to prefer retry() in most cases.
   */
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Macronaut route error:", error);
    // Without this a render crash exists only in a console nobody opens.
    reportBoundaryError(error, error.digest);
  }, [error]);

  return (
    <div className="sticker tint-violet mx-auto max-w-md p-8 text-center">
      <Momo mood="caring" size={104} className="mx-auto" />
      <h1 className="mt-3 text-xl font-bold">Oops, that bit fell over</h1>
      <p className="mt-2 text-sm leading-relaxed font-medium text-[var(--ink-soft)]">
        Nothing you logged is lost — this was just a rendering hiccup. Give it
        another go?
      </p>
      {error.digest ? (
        <p className="label-cute mt-3 text-[0.55rem]">ref {error.digest}</p>
      ) : null}
      <Button onClick={() => retry()} className="mt-5">
        <RotateCw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
