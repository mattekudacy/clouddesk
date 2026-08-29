// components/Debrief/ScoreCard.tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { DebriefOutput } from "@/lib/types";

// CLAUDE.md, Component Rules — Debrief ScoreCard: >=80 green, 60-79 yellow, <60 red.
function scoreColor(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

function AnimatedScore({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const step = target / 40;
    let current = 0;
    const id = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplay(Math.round(current));
      if (current >= target) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, [target]);

  return <span className={scoreColor(target)}>{display}</span>;
}

const SCORE_LABELS: Record<string, string> = {
  technicalAccuracy: "Technical accuracy",
  depthOfExplanation: "Depth of explanation",
  domainCoverage: "Domain coverage",
  communicationClarity: "Communication clarity",
};

interface Props {
  scores: DebriefOutput["scores"];
}

export function ScoreCard({ scores }: Props) {
  return (
    <Card className="w-full max-w-xl">
      <CardContent className="space-y-5">
        <div className="text-center pb-6 border-b border-border">
          <p className="text-sm text-muted-foreground mb-1">Overall</p>
          <p className="font-display text-8xl font-medium">
            <AnimatedScore target={scores.overall} />
          </p>
          <p className="text-sm text-muted-foreground mt-1">out of 100</p>
        </div>
        <div className="space-y-3">
          {Object.entries(SCORE_LABELS).map(([key, label]) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">{label}</span>
              <span className="font-mono font-semibold text-base tabular-nums">
                <AnimatedScore target={scores[key as keyof typeof scores]} />
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
