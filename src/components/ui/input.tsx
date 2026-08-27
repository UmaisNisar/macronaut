import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-2xl border-2 border-[var(--border)] bg-[var(--inset)] px-4 py-2 text-base font-semibold text-[var(--ink)] transition-all outline-none hover:border-[color-mix(in_oklab,var(--violet)_35%,transparent)] placeholder:font-medium placeholder:text-[var(--ink-soft)]/70 focus-visible:border-[var(--violet)] focus-visible:ring-4 focus-visible:ring-[var(--violet)]/20 disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-[var(--destructive)] aria-invalid:ring-4 aria-invalid:ring-[var(--destructive)]/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
