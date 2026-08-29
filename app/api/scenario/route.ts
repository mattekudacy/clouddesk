import { NextResponse } from "next/server";
import { scenarioAgent } from "@/agents/scenarioAgent";
import { ScenarioApiRequestSchema } from "@/lib/requestSchemas";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = ScenarioApiRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: `Invalid request body: ${parsed.error.message}` }, { status: 400 });
    }
    const { config, context } = parsed.data;
    const scenario = await scenarioAgent(config, context);
    return NextResponse.json(scenario);
  } catch (err) {
    console.error("scenario route error:", err);
    return NextResponse.json({ error: "Failed to generate scenario" }, { status: 500 });
  }
}
