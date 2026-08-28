"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/**
 * Class-based theming so every token flips at once via `.dark` on <html>.
 * Defaults to the system setting; the toggle stores an explicit override.
 *
 * The nonce is not optional in practice. next-themes writes an inline
 * script into the document to set the class before first paint — that is
 * the whole point of it, and it is also exactly what the Content Security
 * Policy refuses unless it is marked as ours. Without it the script is
 * blocked, the theme resolves a frame late, and React finds markup it did
 * not expect.
 */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: ReactNode;
  nonce?: string;
}) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      nonce={nonce}
    >
      {children}
    </NextThemes>
  );
}
