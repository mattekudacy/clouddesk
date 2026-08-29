// components/Debrief/ExamIntel.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDomainName } from "@/data/domains";
import type { CertId } from "@/data/domains";
import { Badge } from "@/components/ui/badge";
import type { DebriefOutput } from "@/lib/types";

interface Props {
  examIntel: DebriefOutput["examIntel"];
  certId: CertId;
}

export function ExamIntel({ examIntel, certId }: Props) {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Exam intelligence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Domains exercised</p>
          <div className="flex flex-wrap gap-2">
            {examIntel.domainsExercised.map((id) => (
              <Badge key={id} variant="secondary">
                {getDomainName(certId, id)}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Example exam question</p>
          <p className="text-foreground text-sm leading-relaxed bg-muted/60 rounded-lg p-3">
            {examIntel.examQuestionExample}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Key concepts tested</p>
          <ul className="space-y-1.5">
            {examIntel.keyConceptsTested.map((concept, i) => (
              <li key={i} className="text-muted-foreground text-sm flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {concept}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
