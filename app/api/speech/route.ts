// app/api/speech/route.ts
// Server-side proxy for ElevenLabs text-to-speech. ELEVENLABS_API_KEY never
// reaches the client bundle — lib/speech.ts's speak() calls this route
// instead of ElevenLabs directly, same discipline as OLLAMA_API_KEY. See
// CLAUDE.md Hard Invariant #1 and Stack and Environment.
import { NextResponse } from "next/server";
import { SpeechApiRequestSchema } from "@/lib/requestSchemas";
import { resolveVoiceId, VoiceNotConfiguredError } from "@/lib/ttsVoices";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
// Turbo v2.5 — ElevenLabs' lowest-latency model. Matters here specifically
// because the mic re-arms the instant playback ends (see CLAUDE.md,
// MeetingRoom); a slower model would eat into the pacing delay that's
// already budgeted for the round trip.
const MODEL_ID = "eleven_turbo_v2_5";

// A 501 here is not a runtime failure — it means this deployment hasn't
// configured TTS. speak() (lib/speech.ts) treats it the same as
// window.speechSynthesis being absent: resolve silently and stay
// text-only, rather than surfacing a per-turn "audio unavailable" banner
// for what is actually a permanent, one-time-fixable condition. See
// CLAUDE.md, Failure Behavior.
function notConfigured(detail: string) {
  console.error(`speech route not configured: ${detail}`);
  return NextResponse.json({ error: "not_configured" }, { status: 501 });
}

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return notConfigured("ELEVENLABS_API_KEY is not set");

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = SpeechApiRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: `Invalid request body: ${parsed.error.message}` }, { status: 400 });
  }
  const { text, voiceId } = parsed.data;

  let elevenLabsVoiceId: string;
  try {
    elevenLabsVoiceId = resolveVoiceId(voiceId);
  } catch (err) {
    if (err instanceof VoiceNotConfiguredError) return notConfigured(err.message);
    throw err;
  }

  try {
    const upstream = await fetch(`${ELEVENLABS_TTS_URL}/${elevenLabsVoiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: MODEL_ID }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error(`ElevenLabs TTS error: ${upstream.status} ${detail}`);
      return NextResponse.json({ error: "TTS request failed" }, { status: 502 });
    }

    // Proxy the audio straight through — full message at once, not
    // streamed/chunked into playback. See CLAUDE.md, MeetingRoom
    // ("never token-by-token — there's no model to preload").
    return new NextResponse(upstream.body, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    console.error("speech route error:", err);
    return NextResponse.json({ error: "TTS request failed" }, { status: 502 });
  }
}
