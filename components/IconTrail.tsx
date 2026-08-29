// components/IconTrail.tsx
import type { ReactNode } from "react";

// A trailing icon never sits naked next to button text — it's nested in its
// own circular wrapper and drifts on hover via the parent's `group/button`
// state (set by the Button primitive and replicated here for plain `<Link>`
// CTAs styled with buttonVariants). Spacing from the label comes entirely
// from the button's own `gap` — no margin here — so edge padding stays
// symmetric and the pill doesn't read as lopsided.
export function IconTrail({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/button:translate-x-0.5 group-hover/button:-translate-y-px">
      {children}
    </span>
  );
}
