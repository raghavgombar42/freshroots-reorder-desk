/**
 * Button hierarchy, shared by server and client components:
 *  primary   – the one main action in a section (Freshroots green)
 *  secondary – supporting actions (white, bordered)
 *  ghost     – tertiary, low emphasis
 *  danger    – rejecting (red text, bordered)
 */
export const VARIANTS = {
  primary: "bg-rail text-white hover:bg-rail-hover shadow-[0_1px_0_rgba(0,0,0,0.04)]",
  secondary: "border border-line-strong bg-white text-ink hover:bg-sunk",
  ghost: "text-muted hover:bg-sunk hover:text-ink",
  danger: "border border-line-strong bg-white text-cut hover:border-cut/40 hover:bg-cut-soft",
} as const;

export const SIZES = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-3.5 text-[13.5px]" } as const;

export type Variant = keyof typeof VARIANTS;
export type Size = keyof typeof SIZES;

export function buttonClass(variant: Variant = "secondary", size: Size = "sm") {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors active:translate-y-px disabled:cursor-wait disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]}`;
}
