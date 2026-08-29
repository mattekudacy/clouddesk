// scripts/generate-domain-data.ts
//
// One-off authoring aid for adding a new cert's domain data
// (data/domains/<cert>.ts) — NOT part of the running app. Domain data
// drives everything the Scenario Agent can generate for a cert (see
// CLAUDE.md, "Certs, Roles, Counterparts"), so this is deliberately split
// so that anything precision-sensitive is computed in code, never guessed
// by a model:
//
//   - domain names and exam weights: parsed deterministically from the
//     official "Skills measured" text. Microsoft publishes weights as
//     ranges (e.g. "25-30%") — resolved to a midpoint, then normalized so
//     the full set sums to exactly 1.0, matching
//     data/domains/domains.test.ts's assertion. Weights are written out
//     at full float precision rather than rounded, specifically so that
//     sum stays within that test's tight tolerance — rounding each one to
//     a "clean" 2-4 decimal number independently is exactly what could
//     push the total a few 1e-4s away from 1.0.
//   - domain ids: slugified from the domain name, mechanically.
//   - keyServices / concepts: the one part an LLM actually helps with —
//     condensing each domain's exam-guide bullets into short vocabulary
//     arrays. Grounded (the prompt includes only that domain's own real
//     bullets) and schema-validated like every other LLM output in this
//     app (see CLAUDE.md, "The LLM Boundary").
//
// Input: the "Skills measured" section of a Microsoft Learn study guide
// (e.g. https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/<cert>),
// saved as plain markdown/text. Fetching and converting that page to clean
// markdown is something Claude Code already does well (WebFetch) — this
// script deliberately doesn't reimplement an HTML scraper (a new
// dependency, and a fragile one) for a tool that runs maybe once per new
// cert. Ask Claude Code to fetch the page and save the "Skills measured"
// section to a file, then run this against that file.
//
// Output is always a DRAFT — data/domains/<cert>.draft.ts — never
// registered automatically. Review it (especially keyServices/concepts —
// spot-check them against the real exam guide, don't assume the model got
// every bullet's intent right), then rename to <cert>.ts and add one line
// to data/domains/index.ts's CERT_REGISTRY. data/domains/domains.test.ts
// is the final automated gate once it's registered.
//
// Usage:
//   npm run generate-domain-data -- <cert-slug> <path-to-skills-measured.md>
// Example:
//   npm run generate-domain-data -- ai-103 scripts/input/ai-103.md
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";

// Next.js loads .env.local automatically at runtime; a standalone script
// run via `tsx` doesn't, so do it ourselves. Only lib/llm.ts needs
// OLLAMA_API_KEY, and it reads process.env at module-load time — this must
// run and populate process.env before that module is ever imported, which
// is why the import below is dynamic (inside main()) rather than a normal
// top-of-file import.
function loadEnvLocal(): void {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

type ParsedDomain = {
  name: string;
  weightRange: [number, number];
  bullets: string[];
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Normalizes to lowercase/space-separated words, then checks `term`
// appears as a whole phrase (word-boundary, not naive substring) inside
// `blob`. Used to catch a keyService the model named but never actually
// grounded in the domain's own bullets — e.g. a first run of this script
// against DP-300 produced "Azure Synapse Analytics" as a keyService for a
// domain whose real bullets never mention Synapse anywhere. Word-boundary
// matching (not plain .includes()) matters here specifically because many
// real keyServices are short acronyms (AKS, ACR, TDE, SAS, ...) that could
// otherwise spuriously "match" as a substring inside an unrelated word.
// Only applied to keyServices, never concepts — concepts are meant to be
// paraphrased summaries, not verbatim quotes, so grounding-checking them
// the same way would just produce false alarms.
//
// Also tries the term with a leading "Azure "/"Microsoft " vendor prefix
// stripped before giving up — Microsoft's own exam bullets very often drop
// the vendor prefix once a service is established in context (e.g. a
// bullet reading "Plan and implement Private Link services" for a
// keyService the model reasonably writes out in full as "Azure Private
// Link"). Without this, that extremely common phrasing pattern produced
// more false "ungrounded" flags than real ones in practice.
function isGrounded(term: string, blob: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedBlob = normalize(blob);
  const matches = (needle: string) => {
    if (!needle) return true;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(normalizedBlob);
  };
  const stripped = term.replace(/^(azure|microsoft)\s+/i, "");
  return matches(normalize(term)) || matches(normalize(stripped));
}

// Microsoft's "Skills measured" format is rigid across every cert study
// guide: each domain gets its own "### Domain Name (NN-NN%)" (or "##")
// heading, containing one or more "#### "-headed bullet groups, ending at
// the next level-2/3 heading (domain or not) or end of document.
//
// This deliberately does NOT cross-reference the "Skills at a glance"
// summary list by name, even though every guide has one — because that
// list can genuinely drift from the section headings within the same
// Microsoft-authored document. AZ-204's glance list says "Monitor,
// troubleshoot, and optimize Azure solutions"; its actual section is
// titled "Monitor and troubleshoot Azure solutions" — same domain,
// different wording, same page. Matching headers directly (which also
// carry their own weight range) sidesteps that class of drift instead of
// throwing on it.
function parseSkillsMeasured(markdown: string): ParsedDomain[] {
  const domainPattern = /^#{2,3}\s*(.+?)\s*\((\d+)[–-](\d+)%\)\s*$/gm;
  const headers = [...markdown.matchAll(domainPattern)];
  if (headers.length === 0) {
    throw new Error(
      'Found no "### Domain Name (NN-NN%)" headings — this doesn\'t look like a Microsoft Learn study guide export.',
    );
  }

  return headers.map((match, i) => {
    const [, rawName, low, high] = match;
    const name = rawName.trim();
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = headers[i + 1]?.index ?? markdown.length;
    const body = markdown.slice(bodyStart, bodyEnd);
    // "#### Sub-heading" lines carry real content too — often the most
    // direct service name in the whole section (e.g. "#### Develop
    // solutions that use Azure Blob Storage" names the service in the
    // heading itself, not in any of the "-" bullets under it). Missing
    // these was actively hurting both the LLM's grounding (it never saw
    // the heading) and this parser's own isGrounded() check (the service
    // name was right there, just not in `bullets`). Captured in document
    // order alongside the "-" lines via one alternation, not two separate
    // passes concatenated, so ordering stays natural.
    const bullets = [...body.matchAll(/^(?:####\s+(.+)|-\s+(.+))$/gm)].map((m) => (m[1] ?? m[2]).trim());
    if (bullets.length === 0) {
      throw new Error(`"${name}"'s section has no bullet points to summarize.`);
    }
    return { name, weightRange: [Number(low), Number(high)] as [number, number], bullets };
  });
}

// Resolve each published range to its midpoint, then rescale the whole set
// so it sums to exactly 1.0. Left at full float precision on purpose — see
// the file header on why rounding here is the wrong place to make numbers
// "clean".
function resolveWeights(domains: ParsedDomain[]): number[] {
  const midpoints = domains.map((d) => (d.weightRange[0] + d.weightRange[1]) / 2);
  const sum = midpoints.reduce((a, b) => a + b, 0);
  return midpoints.map((m) => m / sum);
}

// Real ids from this project's own hand-authored files (data/domains/
// az-104.ts, az-500.ts, dp-300.ts) — given to the model as style examples
// so its shortId proposal matches house style (short, 1-2 words) instead
// of a full-sentence slug. slugify(name) is still available as a fallback,
// but "invent a short, recognizable abbreviation" is a naming/taste call
// closer to keyServices/concepts condensation than to the purely
// mechanical weight/id-uniqueness work — worth asking the model for,
// schema-validated and deduped the same defensive way as any other id.
const ID_STYLE_EXAMPLES = "identities, storage, compute, networking, hybrid-connectivity, query-performance, secure-compliance";
const SHORT_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+){0,2}$/;

const VocabSchema = z.object({
  shortId: z
    .string()
    .max(30)
    .regex(SHORT_ID_PATTERN, "must be short kebab-case, e.g. \"identities\" or \"hybrid-connectivity\""),
  keyServices: z.array(z.string().min(1)).min(2).max(8),
  concepts: z.array(z.string().min(1)).min(2).max(8),
});

async function summarizeDomain(
  callLLMJSON: typeof import("../lib/llm").callLLMJSON,
  certLabel: string,
  domain: ParsedDomain,
): Promise<z.infer<typeof VocabSchema>> {
  const prompt = `You are condensing an official Microsoft exam guide section into a short id and two vocabulary lists for "${domain.name}", part of the ${certLabel} certification.

RAW EXAM GUIDE BULLETS FOR THIS DOMAIN:
${domain.bullets.map((b) => `- ${b}`).join("\n")}

TASK: Produce three fields, using ONLY content grounded in the bullets above for keyServices/concepts — never invent a service or concept that isn't reflected in them:
- shortId: a short kebab-case identifier for this domain, 1-2 words if at all possible (3 only if truly necessary for clarity). Match the style of these real examples from this app's other certs: ${ID_STYLE_EXAMPLES}. Do NOT just slugify the full domain name — abbreviate it the way those examples do.
- keyServices: 3-6 concrete Azure service/tool/product names mentioned or clearly implied by the bullets (e.g. "Azure AI Search", "Content Understanding")
- concepts: 3-6 short conceptual/topic phrases a study scenario about this domain should be able to touch on (e.g. "retrieval-augmented generation", "responsible AI guardrails")

Return ONLY this JSON — no markdown, no commentary:
{ "shortId": "string", "keyServices": ["string"], "concepts": ["string"] }`;

  return callLLMJSON(VocabSchema, prompt, [{ role: "user", content: "Summarize this domain." }], {
    temperature: 0.2,
  });
}

async function main() {
  const [certSlug, inputPath] = process.argv.slice(2);
  if (!certSlug || !inputPath) {
    console.error("Usage: npm run generate-domain-data -- <cert-slug> <path-to-skills-measured.md>");
    process.exit(1);
  }

  loadEnvLocal();
  if (!process.env.OLLAMA_API_KEY) {
    console.error(
      "OLLAMA_API_KEY is not set (checked .env.local and the environment) — required to summarize domain vocabulary.",
    );
    process.exit(1);
  }

  const markdown = readFileSync(inputPath, "utf8");
  const parsed = parseSkillsMeasured(markdown);
  const weights = resolveWeights(parsed);

  console.log(`Parsed ${parsed.length} domains from ${inputPath}:\n`);
  parsed.forEach((d, i) => {
    console.log(
      `  ${d.name} — published ${d.weightRange[0]}-${d.weightRange[1]}% -> resolved weight ${weights[i].toFixed(4)} (${d.bullets.length} bullets)`,
    );
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  console.log(`\nWeight sum: ${weightSum} (must be ~1.0 — written at full precision in the output, not rounded)`);

  // Dynamic import: must happen after loadEnvLocal() populates
  // process.env, since lib/llm.ts reads OLLAMA_API_KEY at module-load time.
  const { callLLMJSON } = await import("../lib/llm");

  console.log("\nSummarizing each domain's keyServices/concepts via the LLM (grounded in its own bullets only)...");
  const ids = new Set<string>();
  type Domain = {
    id: string;
    name: string;
    weight: number;
    keyServices: string[];
    keyServicesGrounded: boolean[];
    concepts: string[];
  };
  const domains: Domain[] = [];
  let ungroundedCount = 0;
  for (let i = 0; i < parsed.length; i++) {
    const d = parsed[i];
    const vocab = await summarizeDomain(callLLMJSON, certSlug.toUpperCase(), d);

    let id = vocab.shortId || slugify(d.name); // schema already guarantees non-empty; fallback is defensive only
    while (ids.has(id)) id = `${id}-2`; // defensive de-dupe; shouldn't trigger on a real exam guide
    ids.add(id);

    const bulletsBlob = d.bullets.join(" ");
    const keyServicesGrounded = vocab.keyServices.map((s) => isGrounded(s, bulletsBlob));
    const flagged = vocab.keyServices.filter((_, j) => !keyServicesGrounded[j]);
    ungroundedCount += flagged.length;

    console.log(`  done: ${d.name} (id: ${id})${flagged.length > 0 ? `  ⚠ unverified: ${flagged.join(", ")}` : ""}`);
    domains.push({ id, name: d.name, weight: weights[i], keyServices: vocab.keyServices, keyServicesGrounded, concepts: vocab.concepts });
  }

  if (ungroundedCount > 0) {
    console.log(
      `\n⚠ ${ungroundedCount} keyServices entr${ungroundedCount === 1 ? "y was" : "ies were"} not found verbatim in their domain's source bullets — flagged inline in the output file. This doesn't necessarily mean they're wrong (naming can vary), but verify each one against the real exam guide before trusting it.`,
    );
  }

  const constName = `${certSlug.toUpperCase().replace(/-/g, "")}_DOMAINS`;
  const formatKeyServices = (d: Domain) =>
    `[${d.keyServices
      .map((s, j) => (d.keyServicesGrounded[j] ? JSON.stringify(s) : `${JSON.stringify(s)} /* ⚠ not found verbatim in source bullets — verify */`))
      .join(", ")}]`;

  const fileBody = `// AUTO-GENERATED DRAFT — see scripts/generate-domain-data.ts.
// Review before renaming to ${certSlug}.ts and registering in
// data/domains/index.ts. Weights are already normalized to sum to 1.0 —
// don't round them without re-checking the sum against
// data/domains/domains.test.ts's tolerance. keyServices/concepts were
// condensed by an LLM from the official exam guide bullets and should be
// spot-checked, not assumed correct — entries marked with an inline ⚠
// comment could not be verified against the source bullets at all.
export const ${constName} = [
${domains
  .map(
    (d) => `  {
    id: "${d.id}",
    name: ${JSON.stringify(d.name)},
    weight: ${d.weight},
    keyServices: ${formatKeyServices(d)},
    concepts: ${JSON.stringify(d.concepts)},
  },`,
  )
  .join("\n")}
] as const;
`;

  const outPath = `data/domains/${certSlug}.draft.ts`;
  writeFileSync(outPath, fileBody);
  console.log(`\nWrote ${outPath}`);
  console.log(
    `\nNext steps:\n  1. Review keyServices/concepts against the real exam guide (check any ⚠ flags first)\n  2. Rename to data/domains/${certSlug}.ts\n  3. Add one line to data/domains/index.ts's CERT_REGISTRY\n  4. npx vitest run data/domains/domains.test.ts`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
