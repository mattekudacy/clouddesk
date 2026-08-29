// components/Dashboard/SessionList.tsx
import type { SessionResult } from "@/lib/types";
import { Card } from "@/components/ui/card";

// Same tiers as ScoreCard/DomainBars — CLAUDE.md, Component Rules.
function scoreColor(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

interface Props {
  sessions: SessionResult[];
}

export function SessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-muted-foreground text-sm">No sessions yet.</p>;
  }

  return (
    <div className="space-y-2">
      {[...sessions].reverse().map((s) => (
        <Card key={s.sessionId} size="sm" className="flex-row items-center justify-between px-4">
          <div>
            <p className="text-foreground text-sm font-medium">{s.scenario.clientName} · {s.scenario.companyName}</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              {new Date(s.date).toLocaleDateString()} · {s.scenario.industry} · {s.scenario.difficulty}
            </p>
          </div>
          <p className={`font-mono text-xl font-bold tabular-nums ${scoreColor(s.scores.overall)}`}>
            {s.scores.overall}
          </p>
        </Card>
      ))}
    </div>
  );
}
