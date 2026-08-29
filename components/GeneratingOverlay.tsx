// components/GeneratingOverlay.tsx
"use client";
import { useEffect, useState } from "react";

interface Props {
  title: string;
  steps: string[];
}

// Full-screen blocking loader for waits long enough that a button's own
// "Generating…" label isn't enough signal on its own — the Scenario Agent's
// tool-calling loop can run 5-15s. Blocking here is correct (see CLAUDE.md,
// Failure Behavior — "Scenario generation fails: block on the brief screen
// with a retry"); this just makes the blocking wait legible instead of
// silent, cycling through what the agent is actually doing rather than a
// single static "loading" message.
export function GeneratingOverlay({ title, steps }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStepIndex((i) => (i + 1) % steps.length), 1800);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 backdrop-blur-md animate-in fade-in duration-300"
    >
      <div className="bezel-outer shadow-elevated">
        <div className="bezel-inner bg-card px-10 py-9 flex flex-col items-center gap-5 max-w-xs text-center">
          <div className="relative size-14 flex items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
            <span className="relative inline-flex size-10 rounded-full bg-primary" />
          </div>
          <div>
            <p className="font-heading text-base font-medium text-foreground mb-1.5">{title}</p>
            <p key={stepIndex} className="text-sm text-muted-foreground animate-in fade-in duration-300">
              {steps[stepIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
