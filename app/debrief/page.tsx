// app/debrief/page.tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreCard } from "@/components/Debrief/ScoreCard";
import { MomentReplay } from "@/components/Debrief/MomentReplay";
import { ExamIntel } from "@/components/Debrief/ExamIntel";
import { StudyNext } from "@/components/Debrief/StudyNext";
import { finishSession } from "@/agents/orchestrator";
import type { DebriefOutput, ScenarioOutput, Message } from "@/lib/types";

export default function DebriefPage() {
  const router = useRouter();
  const [debrief, setDebrief] = useState<DebriefOutput | null>(null);
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [transcript, setTranscript] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Kept in state (not re-read from sessionStorage) so a retry regrades the
  // exact transcript still in memory rather than whatever's on disk. See
  // CLAUDE.md, Failure Behavior — "Debrief fails."
  const runDebrief = useCallback((currentScenario: ScenarioOutput, currentTranscript: Message[]) => {
    setLoading(true);
    setError(null);
    finishSession(currentScenario, currentTranscript)
      .then((data) => {
        sessionStorage.setItem("clouddesk:debrief", JSON.stringify(data));
        setDebrief(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const rawScenario = sessionStorage.getItem("clouddesk:scenario");
    const rawTranscript = sessionStorage.getItem("clouddesk:transcript");

    if (!rawScenario || !rawTranscript) {
      router.replace("/setup");
      return;
    }

    let parsedScenario: ScenarioOutput;
    let parsedTranscript: Message[];
    try {
      parsedScenario = JSON.parse(rawScenario);
      parsedTranscript = JSON.parse(rawTranscript);
    } catch {
      router.replace("/setup");
      return;
    }

    setScenario(parsedScenario);
    setTranscript(parsedTranscript);

    // Guard against re-grading (and re-applying the EMA delta) on a genuine
    // remount — e.g. navigating to /dashboard and back via browser history.
    // The `initialized` ref only survives Strict Mode's synthetic double-fire,
    // not a real unmount/remount, so we also check for an already-graded
    // debrief cached by the successful run below before calling finishSession
    // again. See CLAUDE.md, Hard Invariant #3.
    const cachedRaw = sessionStorage.getItem("clouddesk:debrief");
    if (cachedRaw) {
      try {
        setDebrief(JSON.parse(cachedRaw));
        setLoading(false);
        return;
      } catch {
        // fall through to a fresh grade below
      }
    }

    runDebrief(parsedScenario, parsedTranscript);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNextSession() {
    sessionStorage.removeItem("clouddesk:scenario");
    sessionStorage.removeItem("clouddesk:transcript");
    sessionStorage.removeItem("clouddesk:debrief");
    sessionStorage.removeItem("clouddesk:targetContext");
    router.push("/setup");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-foreground font-medium text-sm">Grading your session…</p>
          <p className="text-muted-foreground text-sm">Analyzing transcript against exam domains</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive text-sm">{error}</p>
          {scenario && transcript && (
            <button
              onClick={() => runDebrief(scenario, transcript)}
              className="text-sm font-medium text-primary hover:underline"
            >
              Retry grading →
            </button>
          )}
        </div>
      </main>
    );
  }

  if (!debrief) return null;

  return (
    <main id="main-content" className="min-h-screen bg-background py-16 px-4 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 800px 420px at 50% -10%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="relative max-w-xl mx-auto space-y-6">
        <div className="text-center mb-10">
          <span className="eyebrow mb-4">Session complete</span>
          <h1 className="font-display text-4xl md:text-5xl font-medium text-foreground">Your debrief</h1>
        </div>
        <ScoreCard scores={debrief.scores} />
        <MomentReplay moments={debrief.moments} />
        <ExamIntel examIntel={debrief.examIntel} certId={scenario?.cert ?? "az-104"} />
        <div className="flex justify-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View your progress dashboard →
          </button>
        </div>
        <StudyNext studyNext={debrief.studyNext} onStartNext={startNextSession} />
      </div>
    </main>
  );
}
