// components/Debrief/StudyNext.tsx
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconTrail } from "@/components/IconTrail";
import type { DebriefOutput } from "@/lib/types";

interface Props {
  studyNext: DebriefOutput["studyNext"];
  onStartNext: () => void;
}

export function StudyNext({ studyNext, onStartNext }: Props) {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Study next</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Weak areas</p>
          <ul className="space-y-1.5">
            {studyNext.weakAreas.map((area, i) => (
              <li key={i} className="text-destructive text-sm flex items-start gap-2">
                <span className="mt-0.5">⚠</span> {area}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Suggested topics</p>
          <ul className="space-y-1.5">
            {studyNext.suggestedTopics.map((topic, i) => (
              <li key={i} className="text-muted-foreground text-sm flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span> {topic}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground mb-2">Next scenario</p>
          <p className="text-foreground text-sm italic mb-4">&ldquo;{studyNext.suggestedNextScenario}&rdquo;</p>
          <Button onClick={onStartNext} className="w-full justify-between">
            Start Next Session
            <IconTrail>
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </IconTrail>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
