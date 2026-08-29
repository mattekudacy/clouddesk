import type { ScenarioOutput } from "@/lib/types";

const COUNTERPART_PERSONA: Record<NonNullable<ScenarioOutput["counterpartRole"]>, string> = {
  client:
    "You are a business stakeholder. You care about outcomes, timelines, costs, and risk — not technical implementation. Push back if something sounds too expensive or risky. Ask for business justification.",
  "non-tech":
    "You have no technical background. When the user uses jargon or cloud service names, ask what they mean in plain terms. Say things like 'I don't know what that means — can you explain it differently?' Challenge them to explain without buzzwords. Be curious and engaged but genuinely confused by technical terms.",
  "team-engineer":
    "You are a capable senior engineer. Challenge design decisions technically. Suggest alternatives — 'couldn't we just use X instead?' Push back if something sounds over-engineered or if there's a simpler path. Don't accept vague answers.",
};

const OPENING_STYLE: Record<NonNullable<ScenarioOutput["counterpartRole"]>, string> = {
  client: `Start mid-thought, human, no greeting formalities. Example: "Hey, thanks for jumping on — I'm [name]. We've been going back and forth on this for weeks and honestly just need a fresh perspective..."`,
  "non-tech": `Start with casual curiosity, slightly self-deprecating. Example: "Hey, I hope this isn't too basic a question — I've been trying to understand how all this cloud stuff actually works and someone said you'd be the right person to ask..."`,
  "team-engineer": `Start with a direct technical challenge. Example: "Before we lock in this design, I want to push back on [X] a bit — have we seriously considered just doing [Y] instead?"`,
};

// A generic, deterministic sign-off per counterpart type, used to force a
// meeting closed once it hits MAX_EXCHANGES without another LLM call — see
// agents/meetingAgent.ts. This is the actual guarantee that a transcript
// never grows past MAX_EXCHANGES; the wrap-up instructions in
// buildMeetingPrompt are the model doing it "naturally" before that point
// is ever reached.
const CLOSING_LINE: Record<NonNullable<ScenarioOutput["counterpartRole"]>, string> = {
  client:
    "This has been really helpful — I think we've got enough to work with for now. Let's regroup once you've had a chance to put together next steps. Thanks for your time.",
  "non-tech":
    "Okay, I think I actually understand this a lot better now — thank you for being so patient with all my questions! I'll let you get back to it.",
  "team-engineer":
    "Alright, I think we've covered the important stuff. Let's sync again once you've had time to firm up the design — appreciate you walking me through it.",
};

export function closingLine(scenario: ScenarioOutput): string {
  return CLOSING_LINE[scenario.counterpartRole ?? "client"];
}

// Meetings target 10-15 exchanges (see rule 6 below); MAX_EXCHANGES is the
// hard ceiling agents/meetingAgent.ts enforces regardless of whether the
// model complies. Without a code-enforced cap, a non-compliant model could
// let a meeting run indefinitely — and agents/debriefAgent.ts scores every
// exchange in parallel (Promise.all), so an unbounded transcript reopens
// the exact serverless-timeout problem that parallelism was added to fix,
// just at a higher exchange count. See CLAUDE.md, Agent Contracts.
export const MAX_EXCHANGES = 15;
const WRAP_UP_FROM = MAX_EXCHANGES - 5; // 10 — lower end of the target range
const FINAL_TURN_AT = MAX_EXCHANGES - 1; // 14 — the last turn the model itself generates

// Deterministic per-scenario hash so the curveball lands on exactly one
// turn within exchange 5-8 (per CLAUDE.md), varying by scenario rather
// than always landing on the same exchange. Exchange-count equality (not a
// range) is what makes this fire exactly once per meeting, rather than the
// previous range check re-injecting the same instruction on every turn
// from 5 through 8.
function curveballTurn(scenario: ScenarioOutput): number {
  let hash = 0;
  for (let i = 0; i < scenario.curveball.length; i++) {
    hash = (hash * 31 + scenario.curveball.charCodeAt(i)) | 0;
  }
  return 5 + (Math.abs(hash) % 4); // 5, 6, 7, or 8
}

export function buildMeetingPrompt(scenario: ScenarioOutput, exchangeCount: number): string {
  const injectCurveball = exchangeCount === curveballTurn(scenario);
  const counterpart = scenario.counterpartRole ?? "client";

  let paceInstruction = "";
  if (exchangeCount >= FINAL_TURN_AT) {
    paceInstruction = `\nTHIS IS YOUR FINAL MESSAGE — the meeting must end here. Wrap up naturally in character: thank the user for their time, note any agreed next step, and close the conversation. Do not ask another question.\n`;
  } else if (exchangeCount >= WRAP_UP_FROM) {
    paceInstruction = `\nThe meeting is approaching its natural end (this will be exchange ${exchangeCount + 1} of roughly ${MAX_EXCHANGES}) — start steering toward a close over your next couple of messages rather than opening new threads.\n`;
  }

  return `You are ${scenario.clientName}, ${scenario.clientTitle}${scenario.companyName ? ` at ${scenario.companyName}` : ""}.

PERSONA: ${COUNTERPART_PERSONA[counterpart]}

BACKGROUND: ${scenario.problemStatement}
CONSTRAINT: ${scenario.constraint}
${injectCurveball ? `\nCURVEBALL TO INJECT THIS TURN (naturally, mid-conversation): ${scenario.curveball}\n` : ""}${paceInstruction}
RULES — follow these exactly:
1. Stay fully in character — never break character, never say you are an AI
2. Ask EXACTLY ONE question per message — never stack questions
3. Base each follow-up on the user's previous answer
4. If the user's answer is vague or buzzword-heavy, push back in character
5. Never correct the user's technical mistakes — defer everything to after the meeting
6. Wrap up naturally after 10–15 total exchanges, or when the user signals they're done

OPENING MESSAGE STYLE (first turn only):
${OPENING_STYLE[counterpart]}

Keep messages concise: 2–4 sentences max.`;
}
