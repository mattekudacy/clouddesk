// components/Debrief/MomentReplay.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DebriefOutput } from "@/lib/types";

const TYPE_STYLES = {
  good: "border-l-success bg-success/5",
  incomplete: "border-l-warning bg-warning/5",
  missed: "border-l-destructive bg-destructive/5",
};

const TYPE_LABELS = {
  good: "Strong answer",
  incomplete: "Incomplete",
  missed: "Missed opportunity",
};

interface Props {
  moments: DebriefOutput["moments"];
}

export function MomentReplay({ moments }: Props) {
  if (moments.length === 0) return null;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Key moments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {moments.map((m, i) => (
          <div
            key={i}
            className={`border-l-4 pl-4 py-2.5 rounded-r-lg ${TYPE_STYLES[m.type]}`}
          >
            <p className="text-xs text-muted-foreground mb-1">
              Exchange {m.exchangeIndex + 1} · <span className="font-medium">{TYPE_LABELS[m.type]}</span>
            </p>
            <p className="text-foreground text-sm italic mb-2">&ldquo;{m.userMessage}&rdquo;</p>
            <p className="text-muted-foreground text-sm">{m.annotation}</p>
            {m.certRelevance && (
              <p className="text-muted-foreground/70 text-xs mt-1">{m.certRelevance}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
