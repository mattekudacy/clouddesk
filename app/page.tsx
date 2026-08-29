"use client";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { buttonVariants } from "@/components/ui/button";
import { SiteNav } from "@/components/SiteNav";
import { IconTrail } from "@/components/IconTrail";
import { CERT_REGISTRY } from "@/data/domains";

gsap.registerPlugin(ScrollTrigger);

const CERT_IDS = Object.keys(CERT_REGISTRY) as (keyof typeof CERT_REGISTRY)[];

const STEPS = [
  {
    n: "01",
    title: "Pick a certification and a role",
    body: "Solutions Architect, Senior Developer, or Team Lead — at whatever difficulty you want to be challenged at.",
  },
  {
    n: "02",
    title: "Join a live conversation",
    body: "A counterpart persona — a business client, a skeptical engineer, someone with zero cloud background — pushes you on a real scenario, one question at a time.",
  },
  {
    n: "03",
    title: "Get graded, then do it again",
    body: "Each session is scored against the certification's actual domains, and the next scenario targets whatever you were weakest on.",
  },
];

const ROLES = [
  {
    n: "01",
    name: "Solutions Architect",
    body: "Design end-to-end systems under a business constraint. Trade-offs and failure modes only — no implementation detail expected.",
  },
  {
    n: "02",
    name: "Senior Developer",
    body: "Go deep on the how: APIs, SDKs, deployment paths, debugging a design that's already been decided.",
  },
  {
    n: "03",
    name: "Team Lead",
    body: "Hold both conversations at once — justify the same decision to an engineer who wants specifics and a stakeholder who wants outcomes.",
  },
];

const COUNTERPARTS = [
  {
    label: "Beginner difficulty",
    who: "A curious layperson",
    quote: "Can you explain that without the acronyms? I just need to know if it's safe.",
  },
  {
    label: "Intermediate difficulty",
    who: "A business stakeholder",
    quote: "I hear you, but what does this actually cost us if traffic doubles in Q3?",
  },
  {
    label: "Expert difficulty",
    who: "A senior engineer",
    quote: "Sure, but why not just do it the other way — what's actually wrong with that?",
  },
];

const LOOP_STEPS = [
  {
    n: "01",
    title: "You have the conversation",
    body: "One scenario, one counterpart, real back-and-forth — no multiple choice.",
  },
  {
    n: "02",
    title: "The debrief scores it",
    body: "Every exchange is graded independently, then mapped onto the certification's real domains — not a single vague number.",
  },
  {
    n: "03",
    title: "Your profile updates",
    body: "Domain scores blend into a rolling average, so one rough exchange doesn't overcorrect your whole profile.",
  },
  {
    n: "04",
    title: "The next scenario targets the gap",
    body: "Whichever domain you're weakest on gets built into your next session automatically. You never have to pick what to work on.",
  },
];

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      // Reveal each major section as it scrolls into view — a real
      // ScrollTrigger-driven fade + rise, not a CSS-only fake-out.
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 32, filter: "blur(6px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          },
        );
      });

      // Hover physics on every interactive card.
      gsap.utils.toArray<HTMLElement>("[data-hover-card]").forEach((el) => {
        const tween = gsap.to(el, { y: -6, duration: 0.4, ease: "power3.out", paused: true });
        el.addEventListener("mouseenter", () => tween.play());
        el.addEventListener("mouseleave", () => tween.reverse());
      });
    },
    { scope: root },
  );

  return (
    <main id="main-content" ref={root} className="min-h-screen bg-background overflow-x-hidden w-full max-w-full">
      <SiteNav />

      {/* Hero — cinematic center */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 900px 500px at 50% -10%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 flex flex-col items-center text-center">
          <span className="eyebrow mb-6">Azure certification prep</span>
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-medium text-foreground leading-[1.05] text-balance max-w-4xl">
            Practice the meeting before you take the exam
          </h1>
          <p className="text-lg text-muted-foreground mt-7 max-w-xl leading-relaxed">
            CloudDesk runs simulated client conversations calibrated to your role and the
            certification you're studying for, then grades what you actually said against
            real exam domains.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-5">
            <Link href="/setup" data-hover-card className={buttonVariants({ size: "lg" })}>
              Try it out
              <IconTrail>
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </IconTrail>
            </Link>
            <span className="text-sm text-muted-foreground">No account needed — your progress stays on this device.</span>
          </div>
        </div>
      </section>

      {/* How it works — dense 3-up bento, double-bezel shell */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
          <div data-reveal className="bezel-outer shadow-elevated">
            <div className="grid md:grid-cols-3 gap-px bg-border/60 bezel-inner overflow-hidden">
              {STEPS.map((step) => (
                <div
                  key={step.n}
                  data-hover-card
                  className="bg-card p-8 flex flex-col gap-4 transition-colors duration-300"
                >
                  <span className="font-mono text-sm text-primary/70">{step.n}</span>
                  <h3 className="font-heading text-xl font-medium text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Supporting preview — a static echo of the real debrief screen */}
          <div data-reveal className="mt-8 flex justify-center">
            <div data-hover-card className="w-full max-w-xs bezel-outer shadow-elevated">
              <div className="bezel-inner bg-card p-5">
                <p className="text-xs text-muted-foreground mb-1">Overall</p>
                <p className="font-display text-5xl font-medium text-success">84</p>
                <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                <div className="mt-4 pt-4 border-t border-border space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Technical accuracy</span>
                    <span className="font-mono text-success">88</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Domain coverage</span>
                    <span className="font-mono text-warning">71</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Communication clarity</span>
                    <span className="font-mono text-success">92</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roles — editorial numerals, no card chrome (variety against the bento above) */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
          <span className="eyebrow mb-5">Practice as whichever role you're studying for</span>
          <h2 className="font-display text-3xl md:text-4xl font-medium text-foreground max-w-2xl text-balance mb-16">
            The questions you get depend on the seat you're sitting in
          </h2>
          <div data-reveal className="grid md:grid-cols-3">
            {ROLES.map((role, i) => (
              <div
                key={role.name}
                className={`relative py-8 md:py-0 md:px-8 first:pl-0 last:pr-0 ${i > 0 ? "md:border-l border-border" : ""} ${i > 0 ? "border-t md:border-t-0 border-border" : ""}`}
              >
                <span className="font-display italic text-5xl text-primary/15 absolute -top-3 right-0 md:right-4 select-none" aria-hidden>
                  {role.n}
                </span>
                <h3 className="font-heading text-xl font-medium text-foreground mb-3">{role.name}</h3>
                <p className="text-muted-foreground leading-relaxed">{role.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Counterparts — quote cards, distinct treatment from the roles row above */}
      <section className="border-t border-border bg-secondary/40">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
          <span className="eyebrow mb-5">Difficulty changes who's across the table</span>
          <h2 className="font-display text-3xl md:text-4xl font-medium text-foreground max-w-2xl text-balance mb-16">
            Not everyone speaks in the same terms — your counterpart won't either
          </h2>
          <div data-reveal className="grid md:grid-cols-3 gap-5">
            {COUNTERPARTS.map((c) => (
              <div key={c.who} data-hover-card className="bezel-outer shadow-elevated">
                <div className="bezel-inner bg-card p-7 flex flex-col h-full">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{c.label}</span>
                  <p className="font-display text-lg text-foreground mt-4 mb-5 leading-snug">&ldquo;{c.quote}&rdquo;</p>
                  <span className="text-sm text-muted-foreground mt-auto pt-4 border-t border-border">— {c.who}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The loop — one connected mechanism, housed in a single bezel shell */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
          <span className="eyebrow mb-5">What actually happens between sessions</span>
          <h2 className="font-display text-3xl md:text-4xl font-medium text-foreground max-w-2xl text-balance mb-16">
            Three agents run the loop so you don't have to plan your own study path
          </h2>
          <div data-reveal className="bezel-outer shadow-elevated">
            <div className="bezel-inner bg-card grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
              {LOOP_STEPS.map((step) => (
                <div key={step.n} data-hover-card className="flex flex-col gap-3 p-7">
                  <span className="font-mono text-sm text-primary/70">{step.n}</span>
                  <h3 className="font-heading text-lg font-medium text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Certs supported — infinite marquee, typography-only */}
      <section data-reveal className="border-t border-border py-16 overflow-hidden">
        <p className="text-sm text-muted-foreground mb-6 max-w-5xl mx-auto px-6">
          Currently covers five Azure Associate certifications
        </p>
        <div className="relative flex overflow-hidden">
          <div className="flex shrink-0 animate-[marquee_28s_linear_infinite] gap-10 pr-10">
            {[...CERT_IDS, ...CERT_IDS].map((id, i) => (
              <span
                key={`${id}-${i}`}
                className="font-display text-2xl md:text-3xl text-muted-foreground/40 whitespace-nowrap shrink-0"
              >
                {id.toUpperCase()} — {CERT_REGISTRY[id].name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Action */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-32 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-medium text-foreground max-w-xl mx-auto text-balance">
            Your next session starts in under a minute
          </h2>
          <Link
            href="/setup"
            data-hover-card
            className={buttonVariants({ size: "lg", className: "mt-9" })}
          >
            Try it out
            <IconTrail>
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </IconTrail>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            CloudDesk — a personal exam-prep project. Built with Next.js and Ollama Cloud, no account or server-side storage.
          </p>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/setup" className="text-muted-foreground hover:text-foreground transition-colors">
              Start a session
            </Link>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
