// components/SiteNav.tsx
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  ctaLabel?: string;
  ctaHref?: string;
  showCta?: boolean;
}

// Floating glass-pill nav, detached from the top edge — the "fluid island"
// pattern. Used on the pages a visitor sees before starting a session
// (landing, setup); in-session and post-session screens keep their own
// lightweight anchored headers since a floating overlay would compete with
// live controls (mute, timer, end meeting) rather than read as premium.
export function SiteNav({ ctaLabel = "Try it out", ctaHref = "/setup", showCta = true }: Props) {
  return (
    <header className="sticky top-4 z-30 mx-auto w-full max-w-2xl px-4">
      <div className="flex items-center justify-between gap-4 rounded-full border border-border/60 bg-card/80 backdrop-blur-xl px-5 py-2.5 shadow-elevated">
        <Link href="/" className="font-heading text-base font-semibold text-foreground tracking-tight">
          CloudDesk
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Progress
          </Link>
          {showCta && (
            <Link href={ctaHref} className={buttonVariants({ size: "sm" })}>
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
