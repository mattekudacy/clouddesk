"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiteNav } from "@/components/SiteNav";
import { IconTrail } from "@/components/IconTrail";
import { GeneratingOverlay } from "@/components/GeneratingOverlay";
import { CERT_REGISTRY, getDomainName, type CertId } from "@/data/domains";
import { getUserId, readUserModel, getCertProgress, pickWeakestDomain } from "@/lib/userModel";
import { startSession as generateScenario } from "@/agents/orchestrator";
import type { SessionConfig } from "@/lib/types";

// Derived from CERT_REGISTRY rather than hand-listed — adding a 6th cert
// (one data file + one registry entry, per CLAUDE.md) means it shows up
// here automatically. No separate list to remember to update.
const CERTS: { value: CertId; label: string; desc: string }[] = (
  Object.keys(CERT_REGISTRY) as CertId[]
).map((id) => ({
  value: id,
  label: id.toUpperCase(),
  desc: CERT_REGISTRY[id].name,
}));

const ROLES: { value: SessionConfig["role"]; label: string; desc: string }[] = [
  { value: "solutions-architect", label: "Solutions Architect", desc: "End-to-end cloud system design" },
  { value: "senior-developer", label: "Senior Developer", desc: "Implementation depth, APIs, and debugging" },
  { value: "team-lead", label: "Team Lead", desc: "Architectural decisions and technical communication" },
];

const DIFFICULTY_COUNTERPART: Record<SessionConfig["difficulty"], SessionConfig["counterpartRole"]> = {
  beginner: "non-tech",
  intermediate: "client",
  expert: "team-engineer",
};

const DIFFICULTIES: { value: SessionConfig["difficulty"]; label: string; desc: string }[] = [
  { value: "beginner", label: "Beginner", desc: "Tips enabled — explaining to a non-technical person" },
  { value: "intermediate", label: "Intermediate", desc: "No tips — a business client pushing on outcomes" },
  { value: "expert", label: "Expert", desc: "No tips — a senior engineer challenging your decisions" },
];

// Mirrors the Scenario Agent's real tool-calling order (see
// prompts/scenarioAgent.ts) — not decorative busywork text.
const GENERATING_STEPS = [
  "Reading your domain scores…",
  "Checking past scenarios…",
  "Targeting your weakest domain…",
  "Writing the scenario…",
];

export default function SetupPage() {
  const router = useRouter();
  const [cert, setCert] = useState<CertId>("az-104");
  const [role, setRole] = useState<SessionConfig["role"]>("solutions-architect");
  const [difficulty, setDifficulty] = useState<SessionConfig["difficulty"]>("intermediate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession() {
    setLoading(true);
    setError(null);
    const userId = getUserId();
    const config: SessionConfig = {
      userId,
      cert,
      role,
      counterpartRole: DIFFICULTY_COUNTERPART[difficulty],
      difficulty,
    };

    sessionStorage.setItem("clouddesk:config", JSON.stringify(config));

    const userModel = readUserModel(userId);
    const certProgressBefore = getCertProgress(userModel, cert);
    const isFirstSession = certProgressBefore.sessions.length === 0;

    try {
      const scenario = await generateScenario(config, userModel);
      sessionStorage.setItem("clouddesk:scenario", JSON.stringify(scenario));
      sessionStorage.removeItem("clouddesk:debrief");

      // Loop transparency: state why this scenario was chosen. Derived from
      // our own data (the domain we asked the agent to target), not trusted
      // from the model's targetDomains array order. See CLAUDE.md, Component
      // Rules — "Brief, loop transparency."
      const targetDomainId = pickWeakestDomain(certProgressBefore, cert);
      sessionStorage.setItem(
        "clouddesk:targetContext",
        JSON.stringify({
          domainName: getDomainName(cert, targetDomainId),
          priorScore: certProgressBefore.domainScores[targetDomainId] ?? null,
          isFirstSession,
        }),
      );

      router.push("/brief");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function SelectorGroup<T extends string>({
    label,
    options,
    value,
    onChange,
  }: {
    label: string;
    options: { value: T; label: string; desc: string }[];
    value: T;
    onChange: (v: T) => void;
  }) {
    return (
      <div>
        <p className="text-sm font-medium text-foreground mb-3">{label}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`rounded-full border px-4 py-3 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                value === o.value
                  ? "border-primary bg-accent text-primary shadow-soft-primary -translate-y-px"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:bg-muted/50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          {options.find((o) => o.value === value)?.desc}
        </p>
      </div>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-background relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 800px 420px at 50% -10%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)",
        }}
      />
      <SiteNav showCta={false} />
      {loading && <GeneratingOverlay title="Setting up your session" steps={GENERATING_STEPS} />}

      <div className="relative max-w-3xl mx-auto px-6 pt-16 pb-24">
        <div className="mb-10">
          <span className="eyebrow mb-5">Session setup</span>
          <h1 className="font-display text-4xl md:text-5xl font-medium text-foreground">Set up your session</h1>
          <p className="text-muted-foreground mt-3 text-lg">
            Pick a certification, the role you're practicing as, and how hard you want it to be.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-9 py-3">
            <SelectorGroup
              label="Certification"
              options={CERTS}
              value={cert}
              onChange={setCert}
            />
            <SelectorGroup
              label="Your role"
              options={ROLES}
              value={role}
              onChange={setRole}
            />
            <SelectorGroup
              label="Difficulty"
              options={DIFFICULTIES}
              value={difficulty}
              onChange={setDifficulty}
            />
            <div className="pt-2">
              <Button
                onClick={startSession}
                disabled={loading}
                size="lg"
                className="w-full sm:w-auto sm:px-8"
              >
                {loading ? "Generating scenario…" : "Start Session"}
                {!loading && (
                  <IconTrail>
                    <ArrowRight className="size-3.5" strokeWidth={2} />
                  </IconTrail>
                )}
              </Button>
              {error && (
                <p className="text-sm text-destructive mt-3">{error}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
