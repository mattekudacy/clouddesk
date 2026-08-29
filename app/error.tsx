"use client";
import { useEffect } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Every component in this app has a visible failure state per CLAUDE.md's
// "never degrade silently" rule — this is that rule applied at the root of
// the tree, where an unhandled render error would otherwise fall back to
// Next's default overlay instead of the app's own language.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled route error:", error);
  }, [error]);

  return (
    <main id="main-content" className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <span className="eyebrow mb-5">Something went wrong</span>
        <h1 className="font-display text-4xl font-medium text-foreground mb-3">
          That didn&apos;t load correctly
        </h1>
        <p className="text-muted-foreground mb-8">
          {error.message || "An unexpected error interrupted this page."}
        </p>
        <div className="flex items-center justify-center gap-4">
          <button onClick={reset} className={buttonVariants({ size: "lg" })}>
            Try again
          </button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
