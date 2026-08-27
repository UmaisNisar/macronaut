import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Chunky candy button. Every filled variant has a solid "lip" underneath so
 * pressing it feels physical: it lifts on hover and sinks on tap.
 */
/*
 * The springy curve overshoots by design (1.56 > 1), which is what gives a
 * press its bounce. Applied to background-color it overshoots the colour too:
 * measured, the hover background shot to rgb 255 before settling at 241, which
 * reads as a blink every time you hover a button. Movement gets the bounce;
 * colour gets a plain ease.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none outline-none [transition:transform_150ms_cubic-bezier(0.34,1.56,0.64,1),box-shadow_150ms_cubic-bezier(0.34,1.56,0.64,1),background-color_150ms_ease-out,color_150ms_ease-out] focus-visible:ring-4 focus-visible:ring-[var(--violet)]/30 disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--violet)] text-white shadow-[0_4px_0_0_var(--primary-lip)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_var(--primary-lip)] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--primary-lip)]",
        mint:
          "bg-[var(--mint)] text-white shadow-[0_4px_0_0_#22A97F] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_#22A97F] active:translate-y-[2px] active:shadow-[0_1px_0_0_#22A97F]",
        outline:
          "bg-[var(--card)] text-[var(--ink)] shadow-[0_4px_0_0_var(--lip)] hover:-translate-y-0.5 hover:bg-[var(--muted)] hover:shadow-[0_6px_0_0_var(--lip)] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--lip)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--ink)] shadow-[0_4px_0_0_var(--lip)] hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--lip)]",
        ghost:
          "text-[var(--ink-soft)] hover:bg-[var(--muted)] hover:text-[var(--ink)] active:scale-95",
        destructive:
          "bg-[var(--card)] text-[var(--destructive)] shadow-[0_4px_0_0_var(--lip)] hover:-translate-y-0.5 hover:bg-[var(--muted)] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--lip)]",
        link: "text-[var(--violet)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 text-sm",
        sm: "h-9 px-4 text-[0.8rem]",
        xs: "h-7 px-3 text-xs",
        lg: "h-13 px-7 text-base",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-xs": "size-7",
        "icon-lg": "size-13",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
