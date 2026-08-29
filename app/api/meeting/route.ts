// app/api/meeting/route.ts
import { NextResponse } from "next/server";
import { meetingAgentReply } from "@/agents/meetingAgent";
import { MeetingApiRequestSchema } from "@/lib/requestSchemas";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = MeetingApiRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: `Invalid request body: ${parsed.error.message}` }, { status: 400 });
    }
    const { scenario, history } = parsed.data;
    const reply = await meetingAgentReply(scenario, history);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("meeting route error:", err);
    return NextResponse.json(
      { error: "Failed to get agent reply" },
      { status: 500 },
    );
  }
}
