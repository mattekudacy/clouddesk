import { NextResponse } from "next/server";
import { debriefAgent } from "@/agents/debriefAgent";
import { DebriefApiRequestSchema } from "@/lib/requestSchemas";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = DebriefApiRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: `Invalid request body: ${parsed.error.message}` }, { status: 400 });
    }
    const { scenario, transcript } = parsed.data;
    const { debrief, delta } = await debriefAgent(transcript, scenario);
    return NextResponse.json({ debrief, delta });
  } catch (err) {
    console.error("debrief route error:", err);
    return NextResponse.json({ error: "Failed to generate debrief" }, { status: 500 });
  }
}
