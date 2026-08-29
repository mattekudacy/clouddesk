// components/Brief/BriefCard.tsx
import { Card, CardContent } from "@/components/ui/card";
import { CERT_REGISTRY, getDomainName } from "@/data/domains";
import { Badge } from "@/components/ui/badge";
import type { ScenarioOutput } from "@/lib/types";

export type TargetContext = {
  domainName: string;
  priorScore: number | null;
  isFirstSession: boolean;
};

interface Props {
  scenario: ScenarioOutput;
  targetContext?: TargetContext | null;
}

export function BriefCard({ scenario, targetContext }: Props) {
  return (
    <Card className="w-full max-w-xl">
      <CardContent className="space-y-6">
        {targetContext && (
          <div className="rounded-xl bg-accent border border-primary/20 px-4 py-3">
            <p className="text-xs font-medium text-primary mb-1">Why this scenario</p>
            <p className="text-foreground text-sm">
              {targetContext.isFirstSession || targetContext.priorScore === null
                ? `Targeting ${targetContext.domainName} — your first session for this cert, so we're starting broad.`
                : `Targeting ${targetContext.domainName} — you scored ${targetContext.priorScore}% here last session.`}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {scenario.counterpartRole === "non-tech" && "You're explaining to"}
            {scenario.counterpartRole === "team-engineer" && "Your audience"}
            {(scenario.counterpartRole === "client" || !scenario.counterpartRole) && "Your client"}
          </p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">{scenario.clientName}</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{scenario.clientTitle}{scenario.companyName ? ` · ${scenario.companyName}` : ""}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Situation</p>
          <p className="text-foreground text-sm leading-relaxed">{scenario.problemStatement}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Constraint</p>
          <p className="text-foreground/80 text-sm">{scenario.constraint}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Cert</p>
          <p className="text-foreground/80 text-sm">{CERT_REGISTRY[scenario.cert].name}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Domains tested</p>
          <div className="flex flex-wrap gap-2">
            {scenario.targetDomains.map((id) => (
              <Badge key={id} variant="secondary">
                {getDomainName(scenario.cert, id)}
              </Badge>
            ))}
          </div>
        </div>

        {scenario.tip && (
          <div className="rounded-xl bg-warning/10 border border-warning/20 px-4 py-3">
            <p className="text-xs font-medium text-warning mb-1">Tip</p>
            <p className="text-foreground text-sm">{scenario.tip}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
