// components/MeetingRoom/CallStage.tsx
// The call surface itself — no scrolling bubble history, no permanent
// caption track. Presence (a large speaking-state avatar) and the live
// mic/voice state are the whole picture while voice is actually working.
// Text (the caption, the typing fallback rendered by the parent) only
// appears when voice genuinely isn't the live channel — muted, TTS failed,
// or voice mode is off — matching CLAUDE.md's Failure Behavior: text is
// the fallback for when voice doesn't work, not a second channel that
// runs alongside it all the time.
//
// The full message history still lives in app/meeting/page.tsx's state and
// is sent to /api/debrief on "End Meeting" — nothing about scoring changes,
// only what's rendered and how a turn gets submitted.
"use client";
import { Mic, MicOff, Keyboard } from "lucide-react";
import type { Message } from "@/lib/types";

interface Props {
  clientName: string;
  clientTitle: string;
  companyName: string;
  isSpeaking: boolean;
  isThinking: boolean;
  messages: Message[];
  voiceSupported: boolean;
  voiceEnabled: boolean;
  listening: boolean;
  muted: boolean;
  audioUnavailable: boolean;
  onToggleVoice: () => void;
  onManualListen: () => void;
}

export function CallStage({
  clientName,
  clientTitle,
  companyName,
  isSpeaking,
  isThinking,
  messages,
  voiceSupported,
  voiceEnabled,
  listening,
  muted,
  audioUnavailable,
  onToggleVoice,
  onManualListen,
}: Props) {
  const initials = clientName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const latest = messages[messages.length - 1] as Message | undefined;
  const exchangeCount = messages.filter((m) => m.role === "user").length;

  const usersTurn = !isThinking && !isSpeaking;
  const voiceActive = voiceSupported && voiceEnabled;
  // Text only earns its place on screen when audio genuinely isn't
  // carrying the conversation right now.
  const needsText = muted || audioUnavailable || !voiceActive;

  let stateLabel = "Listening…";
  if (isThinking) stateLabel = `${clientName} is thinking…`;
  else if (isSpeaking) stateLabel = `${clientName} is speaking…`;
  else if (voiceActive && !listening) stateLabel = "Tap to talk";
  else if (!voiceActive) stateLabel = "Your turn — type below";

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-8 px-6 py-10">
      <div className="flex flex-col items-center gap-5">
        {/* Nested bezel ring — same double-bezel language as the rest of
            the app, applied at component scale. */}
        <div
          className={`relative rounded-full p-2.5 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isSpeaking ? "bg-primary/15 ring-1 ring-primary/25" : "bg-foreground/[0.04] ring-1 ring-foreground/[0.06]"
          }`}
        >
          <div
            className={`relative size-32 md:size-40 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-4xl font-medium font-display shadow-soft-primary transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isSpeaking ? "scale-105" : ""
            }`}
          >
            {initials}
            {isSpeaking && (
              <span className="absolute -bottom-1 -right-1 size-6 bg-success rounded-full border-4 border-card animate-pulse" />
            )}
          </div>
        </div>
        <div className="text-center">
          <p className="text-foreground font-medium">{clientName}</p>
          <p className="text-muted-foreground text-sm mt-0.5">
            {clientTitle} · {companyName}
          </p>
        </div>
      </div>

      {/* The mic is the only control on screen while voice is active — tap
          it if auto-listen hasn't (yet) started, or drop to typing. */}
      {usersTurn && voiceActive && (
        <button
          onClick={listening ? undefined : onManualListen}
          disabled={listening}
          aria-label={listening ? "Listening" : "Tap to talk"}
          className={`relative flex items-center justify-center rounded-full size-16 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            listening
              ? "bg-primary text-primary-foreground shadow-soft-primary scale-105"
              : "bg-primary/10 text-primary hover:bg-primary/15 hover:-translate-y-0.5"
          }`}
        >
          {listening && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
          )}
          <Mic className="relative size-6" strokeWidth={1.5} />
        </button>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground min-h-5">
        {(isThinking || isSpeaking) && (
          <span className="flex gap-1 items-center h-4">
            <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" />
          </span>
        )}
        {stateLabel}
      </div>

      {voiceSupported && (
        <button
          onClick={onToggleVoice}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {voiceEnabled ? (
            <>
              <Keyboard className="size-3.5" strokeWidth={1.5} /> Switch to typing
            </>
          ) : (
            <>
              <MicOff className="size-3.5" strokeWidth={1.5} /> Voice off — turn back on
            </>
          )}
        </button>
      )}

      {/* Caption — only rendered when audio isn't the live channel (muted,
          TTS failed, or voice mode off). The current line only, replaced
          on every new message (the `key` forces remount so the fade-in
          re-triggers), never a running history. */}
      {needsText && latest && (
        <div
          key={messages.length}
          className="w-full max-w-lg text-center animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <p className="text-xs text-muted-foreground mb-1.5">
            {latest.role === "user" ? "You said" : clientName}
          </p>
          <p className="text-foreground text-lg leading-relaxed text-balance">{latest.content}</p>
        </div>
      )}

      {exchangeCount > 0 && (
        <p className="text-xs text-muted-foreground/60 font-mono">Exchange {exchangeCount}</p>
      )}
    </div>
  );
}
