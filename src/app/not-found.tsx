import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Momo } from "@/components/mascot/momo";
import { CandyBackground } from "@/components/shell/candy-background";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-5">
      <CandyBackground />
      <div className="sticker tint-violet max-w-md p-8 text-center">
        <Momo mood="curious" size={110} className="mx-auto" />
        <h1 className="mt-3 text-xl font-bold">Nothing here!</h1>
        <p className="mt-2 text-sm leading-relaxed font-medium text-[var(--ink-soft)]">
          Momo looked everywhere. This page doesn&rsquo;t exist.
        </p>
        <Button
          className="mt-5"
          nativeButton={false}
          render={<Link href="/today" />}
        >
          Take me home 🍓
        </Button>
      </div>
    </div>
  );
}
