import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <span className="eyebrow mb-5">404</span>
        <h1 className="font-display text-4xl font-medium text-foreground mb-3">
          This page doesn&apos;t exist
        </h1>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for either moved or was never here.
        </p>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
