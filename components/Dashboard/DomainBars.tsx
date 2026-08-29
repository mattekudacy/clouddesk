// components/Dashboard/DomainBars.tsx
"use client";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import { Card, CardContent } from "@/components/ui/card";
import { pickWeakestDomain } from "@/lib/userModel";
import type { CertProgress } from "@/lib/types";

// Same tiers as ScoreCard/SessionList — CLAUDE.md, Component Rules.
function scoreColor(score: number) {
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-warning";
  return "bg-destructive";
}

interface Props {
  certId: CertId;
  certProgress: CertProgress;
}

export function DomainBars({ certId, certProgress }: Props) {
  const domains = CERT_REGISTRY[certId].domains as readonly { id: string; name: string }[];
  const domainScores = certProgress.domainScores;

  const entries = domains.map((d) => ({
    id: d.id,
    name: d.name,
    score: domainScores[d.id] ?? 50,
  }));

  // Same weight-adjusted, unattempted-ranks-weakest algorithm the Scenario
  // Agent uses server-side — see lib/domainPriority.ts. Previously this was
  // a local, unweighted `reduce` that could silently disagree with what the
  // next session actually targets.
  const weakestId = pickWeakestDomain(certProgress, certId);
  const weakest = entries.find((e) => e.id === weakestId)!;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-accent border border-primary/20 px-4 py-3">
        <p className="text-xs font-medium text-primary mb-1">Adaptive targeting</p>
        <p className="text-foreground text-base font-semibold">{weakest.name}</p>
        <p className="text-muted-foreground text-sm mt-0.5">
          Score: {weakest.score}% — your next session will focus here
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4">
          {entries.map(({ id, name, score }) => (
            <div key={id}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">{name}</span>
                <span className="font-mono font-medium text-foreground tabular-nums">{score}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${scoreColor(score)}`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
