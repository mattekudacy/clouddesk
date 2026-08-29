// app/brief/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefCard, type TargetContext } from "@/components/Brief/BriefCard";
import { JoinButton } from "@/components/Brief/JoinButton";
import type { ScenarioOutput } from "@/lib/types";

export default function BriefPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [targetContext, setTargetContext] = useState<TargetContext | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("clouddesk:scenario");
      if (raw) setScenario(JSON.parse(raw));
      const rawContext = sessionStorage.getItem("clouddesk:targetContext");
      if (rawContext) setTargetContext(JSON.parse(rawContext));
    } catch {
      // malformed storage — treat as missing
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading brief…</p>
      </main>
    );
  }

  if (!scenario) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground text-sm">No session found.</p>
          <button
            onClick={() => router.push("/setup")}
            className="text-sm text-primary hover:underline"
          >
            Start a new session →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center p-6 gap-9">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 800px 420px at 50% -10%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="relative text-center">
        <span className="eyebrow mb-4">Incoming meeting</span>
        <h1 className="font-display text-4xl font-medium text-foreground">Review the brief</h1>
      </div>
      <div className="relative w-full flex flex-col items-center gap-9">
        <BriefCard scenario={scenario} targetContext={targetContext} />
        <JoinButton />
      </div>
    </main>
  );
}
